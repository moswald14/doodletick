import { RTC_FORMAT, RTC_LABELS, validRtcDescription } from './vpn-description.mjs';
export async function request(route, { method = 'GET', body, token, signal, retry = method === 'GET', fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      const deadline = AbortSignal.timeout(20000);
      const res = await fetcher('./vpn-api/' + route, { method, cache: 'no-store', headers: { 'X-Keeper-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
      const data = await res.json().catch(() => { throw Object.assign(new Error('Keeper returned an incomplete response.'), { status: res.ok ? 502 : res.status }); });
      if (!res.ok) throw Object.assign(new Error(data.error || 'Local Keeper unavailable.'), { status: res.status });
      return data;
    } catch (error) {
      if (signal?.aborted || !retry || attempt >= 2 || error.status && ![429, 502, 503, 504].includes(error.status)) throw error;
      await pause(250 * 2 ** attempt + Math.random() * 100);
    }
  }
}
export const networkStatus = () => request('status');
// The old export name is retained for external local clients only.
export const vpnStatus = networkStatus;

export function waitForIce(pc, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let timer;
    const done = error => {
      clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed);
      pc.removeEventListener('connectionstatechange', changed);
      error ? reject(error) : resolve();
    };
    const changed = () => {
      if (['closed', 'failed'].includes(pc.connectionState)) done(new Error('Connection closed while preparing the invitation.'));
      else if (pc.iceGatheringState === 'complete') done();
    };
    pc.addEventListener('icegatheringstatechange', changed);
    pc.addEventListener('connectionstatechange', changed);
    timer = setTimeout(() => done(new Error('Connection addresses did not finish preparing. Try a new invitation on a reachable network.')), timeoutMs);
    changed();
  });
}

// Native WebRTC handles DTLS certificate verification and reliable SCTP delivery.
// No STUN/TURN service or public relay is configured. The signed descriptions
// include the complete host candidates; both players still confirm a spirograph.
export class RtcConnection extends EventTarget {
  constructor({ PeerConnection = globalThis.RTCPeerConnection, gatherTimeoutMs = 15000 } = {}) {
    super();
    if (typeof PeerConnection !== 'function') throw new Error('This browser does not support direct WebRTC connections. Open a current browser over HTTPS or localhost.');
    this.closed = false; this.gatherTimeoutMs = gatherTimeoutMs;
    this.pc = new PeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
    this.pc.addEventListener('icegatheringstatechange', () => this.emit('icegatheringstatechange'));
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.pc.connectionState === 'failed') this.error = 'Direct connection failed. These browsers need a reachable route; no Internet relay is configured.';
      this.emit('connectionstatechange');
    });
    this.pc.addEventListener('datachannel', event => {
      if (this.closed || this.channel || event.channel.label !== this.label || event.channel.ordered !== true ||
          event.channel.maxRetransmits != null || event.channel.maxPacketLifeTime != null) { event.channel.close(); this.close(); return; }
      this.channel = event.channel; this.emit('datachannel', { channel: event.channel });
    });
  }
  emit(type, properties = {}) { const event = Object.assign(new Event(type), properties); this['on' + type]?.(event); this.dispatchEvent(event); }
  get connectionState() { return this.closed ? 'closed' : this.pc.connectionState; }
  get iceGatheringState() { return this.pc.iceGatheringState; }
  get localDescription() {
    const native = this.pc.localDescription;
    if (!native || this.closed || this.iceGatheringState !== 'complete') return null;
    const description = { format: RTC_FORMAT, type: native.type, label: this.label, iceComplete: true, sdp: native.sdp };
    return validRtcDescription(description) ? description : null;
  }
  createDataChannel(label) {
    if (this.closed || this.channel || !RTC_LABELS.includes(label)) throw new Error('Only one supported reliable channel is allowed per pairing.');
    this.label = label; this.channel = this.pc.createDataChannel(label, { ordered: true }); return this.channel;
  }
  async createOffer() {
    if (this.closed || !this.channel) throw new Error('Create a channel before its invitation.');
    return this.pc.createOffer();
  }
  async createAnswer() {
    if (this.closed || !this.remoteDescription || this.remoteDescription.type !== 'offer') throw new Error('A signed invitation is required.');
    return this.pc.createAnswer();
  }
  async setLocalDescription(description) {
    if (this.closed || this.pc.localDescription) throw new Error('Create a new connection for a new invitation.');
    try {
      await this.pc.setLocalDescription(description);
      await waitForIce(this, this.gatherTimeoutMs);
      if (!this.localDescription) throw new Error('No complete direct connection address is available. Try a reachable local network.');
    } catch (error) { this.error = error.message; this.close(); throw error; }
  }
  async setRemoteDescription(description) {
    if (this.closed || this.remoteDescription) throw new Error('This invitation is already paired or closed.');
    const expected = this.channel ? 'answer' : 'offer';
    if (!validRtcDescription(description, expected, this.label)) throw new Error('Use a complete signed direct-connection code from this release.');
    this.label = description.label; this.remoteDescription = structuredClone(description);
    try { await this.pc.setRemoteDescription({ type: description.type, sdp: description.sdp }); }
    catch (error) { this.error = 'The direct connection description was rejected.'; this.close(); throw error; }
  }
  close() { if (this.closed) return; this.closed = true; this.pc.close(); this.emit('connectionstatechange'); }
}
