import { validVpnDescription } from './vpn-description.mjs';
export async function request(route, { method = 'GET', body, token, signal, retry = method === 'GET', fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      const deadline = AbortSignal.timeout(20000);
      const res = await fetcher('/vpn-api/' + route, { method, cache: 'no-store', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
      const data = await res.json().catch(() => { throw Object.assign(new Error('Keeper returned an incomplete response.'), { status: res.ok ? 502 : res.status }); });
      if (!res.ok) throw Object.assign(new Error(data.error || 'Private VPN unavailable.'), { status: res.status });
      return data;
    } catch (error) {
      const pollingOverlap = method === 'GET' && route.includes('/events?') && error.status === 409;
      if (signal?.aborted || !retry || attempt >= 2 || (error.status && ![429, 502, 503, 504].includes(error.status) && !pollingOverlap)) throw error;
      await pause(250 * 2 ** attempt + Math.random() * 100);
    }
  }
}
export const vpnStatus = () => request('status');
function base64(data) { let text = ''; for (const n of data) text += String.fromCharCode(n); return btoa(text); }
function unbase64(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)).buffer; }
// Small ordered channel adapter: existing file checks and game framing are
// shared with the previous edition, but this transport has no WebRTC fallback.
class VpnChannel extends EventTarget {
  constructor(owner, label) { super(); this.owner = owner; this.label = label; this.readyState = 'connecting'; this.bufferedAmount = 0; this.bufferedAmountLowThreshold = 64000; }
  emit(type, data) { const event = new Event(type); if (data !== undefined) event.data = data; this['on' + type]?.(event); this.dispatchEvent(event); }
  open() { if (this.readyState !== 'connecting') return; this.readyState = 'open'; this.emit('open'); }
  send(value) {
    if (this.readyState !== 'open') throw new Error('VPN peer disconnected.');
    let message, size;
    if (typeof value === 'string') { size = new TextEncoder().encode(value).length; if (size > 200000) throw new Error('VPN message too large.'); message = { kind: 'text', data: value }; }
    else { const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength); size = bytes.length; if (size > 16384) throw new Error('VPN chunk too large.'); message = { kind: 'binary', data: base64(bytes) }; }
    if (this.bufferedAmount + size > 2000000) throw new Error('VPN peer is too slow.');
    this.bufferedAmount += size; this.owner.enqueue(message, size);
  }
  close() { this.owner.close(); }
}
export class VpnConnection {
  constructor() { this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.closed = false; this.outgoing = []; this.cursor = 0; this.clientSeq = 0; this.controller = new AbortController(); }
  createDataChannel(label) { if (this.channel) throw new Error('Only one private channel is supported.'); this.offerer = true; this.channel = new VpnChannel(this, label); return this.channel; }
  async prepare(label) {
    if (this.localDescription) return;
    const row = await request('channels', { method: 'POST', body: { label }, signal: this.controller.signal });
    this.localDescription = row.description; this.token = row.localToken; this.route = 'channels/' + row.description.channel; this.reliable = row.reliableDelivery === true;
    if (this.closed) { request(this.route, { method: 'DELETE', token: this.token }).catch(() => {}); throw new Error('Connection closed.'); }
    if (!validVpnDescription(row.description)) throw new Error('The local Keeper returned an unsupported VPN connection.');
    this.poll().catch(error => this.fail(error));
    this.timeout = setTimeout(() => this.fail(new Error('Private pairing timed out. Make a new invitation.')), 120000);
  }
  async createOffer() { await this.prepare(this.channel.label); return this.localDescription; }
  async createAnswer() {
    if (!this.remoteDescription) throw new Error('Invitation required.');
    this.channel = new VpnChannel(this, this.remoteDescription.label); this.ondatachannel?.({ channel: this.channel });
    await this.prepare(this.channel.label); await this.bind(); return this.localDescription;
  }
  async setLocalDescription(description) { if (description !== this.localDescription) throw new Error('Invalid local VPN description.'); }
  async setRemoteDescription(description) {
    if (!validVpnDescription(description)) throw new Error('Use a private VPN invitation from Keeper 0.4 or later.');
    if (this.remoteDescription) throw new Error('This invitation is already paired.'); this.remoteDescription = structuredClone(description);
    if (this.offerer) { await this.bind(); this.enqueue({ kind: 'open' }); }
  }
  async bind() { await request(this.route + '/bind', { method: 'POST', body: this.remoteDescription, token: this.token, signal: this.controller.signal }); }
  connected() {
    if (this.closed || this.connectionState === 'connected') return;
    this.connectionState = 'connected'; clearTimeout(this.timeout); this.onconnectionstatechange?.(); this.channel.open();
    this.heartbeat = setInterval(() => this.enqueue({ kind: 'ready' }), 5000);
    this.watchdog = setInterval(() => { if (Date.now() - this.lastReceived > 45000) this.fail(new Error('The peer stopped responding. Reconnect with a new invitation.')); }, 5000);
  }
  enqueue(message, size = 0) {
    if (this.closed) return;
    if (this.outgoing.length >= 512) { this.fail(new Error('Private connection is too slow.')); return; }
    this.outgoing.push({ message, size });
    if (!this.flushing) { this.flushing = true; queueMicrotask(() => this.flush().catch(error => this.fail(error))); }
  }
  async flush() {
    try {
      while (!this.closed && this.outgoing.length) {
        const batch = []; let bytes = 0;
        while (this.outgoing.length && batch.length < 32 && bytes < 200000) { const item = this.outgoing.shift(); batch.push(item); bytes += JSON.stringify(item.message).length; }
        await request(this.route + '/send', { method: 'POST', token: this.token, body: { messages: batch.map(v => v.message), ...(this.reliable ? { clientSeq: this.clientSeq + 1 } : {}) }, signal: this.controller.signal, retry: this.reliable });
        this.clientSeq++;
        this.channel.bufferedAmount = Math.max(0, this.channel.bufferedAmount - batch.reduce((n, v) => n + v.size, 0));
        if (this.channel.bufferedAmount <= this.channel.bufferedAmountLowThreshold) this.channel.emit('bufferedamountlow');
      }
    } finally { this.flushing = false; }
  }
  async poll() {
    while (!this.closed) {
      const { events } = await request(this.route + '/events?after=' + this.cursor, { token: this.token, signal: this.controller.signal });
      for (const { cursor, message } of events) {
        if (this.closed) return;
        if (cursor !== this.cursor + 1) throw new Error('VPN message order changed. Reconnect.'); this.cursor = cursor; this.lastReceived = Date.now();
        if (message.kind === 'open') { if (this.offerer || !this.remoteDescription) throw new Error('Unexpected connection.'); this.enqueue({ kind: 'ready' }); this.connected(); }
        else if (message.kind === 'ready') { if (!this.remoteDescription) throw new Error('Unpaired connection.'); this.connected(); }
        else if (message.kind === 'close') { this.close(); return; }
        else { if (this.channel.readyState !== 'open') throw new Error('Message before pairing.'); this.channel.emit('message', message.kind === 'binary' ? unbase64(message.data) : message.data); }
      }
    }
  }
  fail(error) { if (this.closed) return; this.error = error.message; this.channel?.emit('error'); this.close(); }
  close() {
    if (this.closed) return; this.closed = true; clearTimeout(this.timeout); clearInterval(this.heartbeat); clearInterval(this.watchdog); this.controller.abort(); this.outgoing = [];
    // Deletion releases buffers even if the peer has vanished. Peer watchdogs
    // close the other side; no close signal can race an in-flight ordered batch.
    if (this.route) request(this.route, { method: 'DELETE', token: this.token }).catch(() => {});
    if (this.channel) { this.channel.readyState = 'closed'; this.channel.bufferedAmount = 0; this.channel.emit('close'); }
    this.connectionState = 'closed'; this.onconnectionstatechange?.();
  }
}
