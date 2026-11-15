import { SpirographAuth } from './spirograph-auth.mjs';
import { VpnConnection } from './vpn-transport.mjs';
import { validVpnDescription } from './vpn-description.mjs';
import { b64, random, sign, checkSignature, hash } from './core.mjs';
import { verifyManifest, verifyFile, canUse, MAX_FILE, MAX_MANIFEST } from './licenses.mjs';
const CHUNK = 16384;
const MAX_CONTROL = 32000;
export async function parsePeerCode(text, expectedType) {
  if (typeof text !== 'string' || text.length > 60000) throw new Error('That connection code is too large.');
  let packet; try { packet = JSON.parse(text); } catch { throw new Error('Paste the complete connection code.'); }
  const r = packet.record;
  if (!r || r.format !== 'doodletick-peer-v2' || r.type !== expectedType || !/^[A-Za-z0-9_-]{22}$/.test(r.session) || !/^[a-zA-Z0-9_-]{3,24}$/.test(r.username) || !Number.isFinite(r.expires) || r.expires < Date.now() || r.expires > Date.now() + 90 * 60000 || !validVpnDescription(r.vpn) || r.vpn.label !== 'doodletick-files-v1' || !await checkSignature(r, packet.signature, r.publicKey)) throw new Error('The connection code is expired, changed, or unsupported. Ask for a new code.');
  return packet;
}
async function gather(pc) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise(resolve => {
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); resolve(); };
    const changed = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, 9000); pc.addEventListener('icegatheringstatechange', changed);
  });
}
export class PeerLink {
  constructor({ identity, store, useStun = true, onChange = () => {}, onError = () => {}, onBytes = () => {}, onStored = () => {}, onActivity = () => {} }) {
    this.identity = identity; this.store = store; this.onChange = onChange; this.onError = onError; this.onBytes = onBytes; this.onStored = onStored; this.onActivity = onActivity;
    this.id = b64(random(16)); this.state = 'Preparing connection'; this.catalog = new Map(); this.copies = new Set(); this.closed = false; this.waiting = null; this.incoming = null; this.uploading = false; this.jobs = 0; this.queue = Promise.resolve();
    this.pc = new VpnConnection();
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const state = this.pc.connectionState;
      if (state === 'failed') { this.onError('The private connection failed. Check that both Keepers are on the same VPN.'); this.close(); }
      else { this.state = state === 'connected' ? 'Compare your spirographs' : 'Connection: ' + state; this.onChange(this); }
    };
    this.pc.ondatachannel = event => this.attach(event.channel);
    this.connectionTimer = setTimeout(() => { if (this.channel?.readyState !== 'open') { this.onError('Connection expired. Both peers need to exchange the complete codes while their Keepers stay open.'); this.close(); } }, 10 * 60000);
  }
  async packet(type, replyTo = null) {
    if (this.closed) throw new Error('This connection was closed.');
    const record = { format: 'doodletick-peer-v2', type, session: this.id, replyTo, expires: Date.now() + 60 * 60000, username: this.identity.username, publicKey: this.identity.publicKey, vpn: this.pc.localDescription };
    return { record, signature: await sign(record, this.identity.privateKey) };
  }
  async offer() {
    this.attach(this.pc.createDataChannel('doodletick-files-v1', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer()); await gather(this.pc);
    this.offerPacket = await this.packet('offer'); this.state = 'Waiting for answer code'; this.onChange(this);
    return JSON.stringify(this.offerPacket);
  }
  async answer(text) {
    const packet = await parsePeerCode(text, 'offer'); this.remote = { username: packet.record.username, fingerprint: await hash(packet.record.publicKey) };
    await this.pc.setRemoteDescription(packet.record.vpn); await this.pc.setLocalDescription(await this.pc.createAnswer()); await gather(this.pc);
    const answer = await this.packet('answer', await hash(packet)); await this.authenticate(packet, answer); this.state = 'Send your answer code back'; this.onChange(this); return JSON.stringify(answer);
  }
  async finish(text) {
    const packet = await parsePeerCode(text, 'answer');
    if (!this.offerPacket || packet.record.replyTo !== await hash(this.offerPacket)) throw new Error('That answer belongs to another invitation.');
    this.remote = { username: packet.record.username, fingerprint: await hash(packet.record.publicKey) };
    await this.authenticate(this.offerPacket, packet); await this.pc.setRemoteDescription(packet.record.vpn); this.state = 'Connecting through your private VPN…'; this.onChange(this);
  }
  async authenticate(offer, answer) { this.auth = await SpirographAuth.create(offer, answer, { peer: this.remote, purpose: 'shared files', onVerified: () => { if (this.closed) return; this.state = 'Private VPN peer connected'; this.onChange(this); this.broadcast().catch(e => this.onError(e.message)); }, onReject: reason => { this.onError(reason); this.close(); } }); }
  attach(channel) {
    if (this.channel && this.channel !== channel) { channel.close(); return; }
    if (channel.label !== 'doodletick-files-v1') { channel.close(); return; }
    this.channel = channel; channel.binaryType = 'arraybuffer'; channel.bufferedAmountLowThreshold = 128 * 1024;
    channel.onopen = () => { clearTimeout(this.connectionTimer); if (!this.auth) { this.close(); return; } this.auth.begin(channel); };
    channel.onclose = () => this.close(); channel.onerror = () => { this.onError(this.pc.error || 'The private connection was interrupted. Retry the file after reconnecting.'); this.close(); };
    channel.onmessage = event => {
      if (++this.jobs > 128) { this.close(); this.onError('Peer sent too many pending messages.'); return; }
      this.queue = this.queue.then(() => { if (!this.auth?.receive(event.data)) return this.message(event.data); }).catch(error => { this.onError(error.message); this.close(); }).finally(() => { this.jobs--; });
    };
  }
  send(value) {
    if (this.closed || !this.auth?.verified || this.channel?.readyState !== 'open') throw new Error('The peer is disconnected.');
    const text = JSON.stringify(value); if (text.length > MAX_CONTROL) throw new Error('The file record is too large.'); this.channel.send(text);
  }
  async broadcast() {
    if (this.closed || !this.auth?.verified || this.channel?.readyState !== 'open') return;
    const entries = (await this.store.list()).filter(e => e.shared);
    if (this.closed) return;
    this.send({ type: 'catalog-start' });
    for (const entry of entries) { await this.drain(); this.send({ type: 'catalog-file', manifest: entry.manifest }); }
    this.send({ type: 'catalog-end' });
  }
  request(id, purpose, helpShare = false) {
    if (this.waiting) throw new Error('Finish the current incoming file first.');
    const manifest = this.catalog.get(id); if (!manifest || !canUse(manifest, purpose)) throw new Error('This license does not permit the selected commercial use.');
    this.waiting = { id, request: b64(random(16)), purpose, helpShare };
    this.send({ type: 'get', id, request: this.waiting.request, purpose }); this.touchTransfer(); this.onChange(this);
  }
  touchTransfer() {
    clearTimeout(this.transferTimer); this.onActivity();
    this.transferTimer = setTimeout(() => { this.onError('File transfer timed out. Incomplete bytes were discarded; reconnect and retry.'); this.close(); }, 120000);
  }
  async drain() {
    const channel = this.channel;
    if (this.closed || channel?.readyState !== 'open') throw new Error('Peer disconnected.');
    if (channel.bufferedAmount < 256 * 1024) return;
    await new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); channel.removeEventListener('bufferedamountlow', ready); channel.removeEventListener('close', ended); error ? reject(error) : resolve(); };
      const ready = () => finish(), ended = () => finish(new Error('Peer disconnected.'));
      const timer = setTimeout(() => finish(new Error('The peer is too slow. Reconnect to retry.')), 30000);
      channel.addEventListener('bufferedamountlow', ready, { once: true }); channel.addEventListener('close', ended, { once: true });
    });
  }
  async sendFile(message) {
    if (this.uploading) { this.send({ type: 'error', request: message.request, error: 'This peer is sending another file. Try again shortly.' }); return; }
    this.uploading = true;
    try {
      const entry = await this.store.get(message.id);
      if (!entry.shared) throw new Error('The owner stopped sharing this copy.');
      if (!canUse(entry.manifest, message.purpose)) throw new Error('NonCommercial license: the selected use is not permitted.');
      this.send({ type: 'file-start', request: message.request, manifest: entry.manifest });
      const data = new Uint8Array(entry.data);
      for (let offset = 0; offset < data.length; offset += CHUNK) {
        await this.drain(); const chunk = data.slice(offset, offset + CHUNK); this.channel.send(chunk); this.onBytes('sent', chunk.length); this.onActivity();
      }
      await this.drain(); this.send({ type: 'file-end', request: message.request });
    } catch (error) { if (!this.closed) this.send({ type: 'error', request: message.request, error: error.message }); }
    finally { this.uploading = false; }
  }
  async message(raw) {
    if (this.closed) return;
    if (raw instanceof ArrayBuffer) {
      if (!this.incoming || !this.waiting || raw.byteLength > CHUNK || this.incoming.received + raw.byteLength > this.incoming.manifest.record.file.size) throw new Error('Unexpected or oversized file data.');
      this.incoming.parts.push(new Uint8Array(raw)); this.incoming.received += raw.byteLength;
      this.onBytes('received', raw.byteLength); this.touchTransfer(); this.onChange(this); return;
    }
    if (typeof raw !== 'string' || raw.length > MAX_CONTROL) throw new Error('Invalid peer message.');
    const message = JSON.parse(raw);
    if (message.type === 'catalog-start') { this.catalog.clear(); this.onChange(this); }
    else if (message.type === 'catalog-file') {
      if (this.catalog.size >= 100 || JSON.stringify(message.manifest).length > MAX_MANIFEST || !await verifyManifest(message.manifest)) throw new Error('The peer offered an invalid license record.');
      this.catalog.set(message.manifest.id, message.manifest); this.onChange(this);
    } else if (message.type === 'catalog-end') this.onChange(this);
    else if (message.type === 'get') {
      if (!/^[A-Za-z0-9_-]{43}$/.test(message.id) || !/^[A-Za-z0-9_-]{22}$/.test(message.request)) throw new Error('Invalid file request.');
      this.sendFile(message).catch(error => { this.onError(error.message); this.close(); });
    } else if (message.type === 'file-start') {
      if (!this.waiting || this.incoming || message.request !== this.waiting.request || message.manifest?.id !== this.waiting.id || !await verifyManifest(message.manifest) || !canUse(message.manifest, this.waiting.purpose)) throw new Error('Unrequested or invalid file.');
      this.incoming = { manifest: message.manifest, parts: [], received: 0 }; this.touchTransfer();
    } else if (message.type === 'file-end') {
      if (!this.incoming || !this.waiting || message.request !== this.waiting.request || this.incoming.received !== this.incoming.manifest.record.file.size) throw new Error('Incomplete file. Nothing was stored.');
      const { manifest, parts, received } = this.incoming;
      if (received > MAX_FILE) throw new Error('File is too large.');
      const data = new Uint8Array(received); let at = 0; for (const part of parts) { data.set(part, at); at += part.length; }
      if (!await verifyFile(manifest, data)) throw new Error('File hash or license signature mismatch. Nothing was stored.');
      try {
        await this.store.put(manifest, data, this.waiting.helpShare);
        if (this.closed) return;
        this.send({ type: 'stored', id: manifest.id }); this.onStored(manifest); await this.broadcast();
      } catch (error) { this.onError(error.message); if (!this.closed) this.send({ type: 'error', request: this.waiting?.request, error: 'This peer could not store the file.' }); }
      finally { clearTimeout(this.transferTimer); this.waiting = null; this.incoming = null; this.onChange(this); }
    } else if (message.type === 'stored') { if (/^[A-Za-z0-9_-]{43}$/.test(message.id)) this.copies.add(message.id); this.onChange(this); }
    else if (message.type === 'error') {
      if (this.waiting?.request === message.request) { this.waiting = null; this.incoming = null; clearTimeout(this.transferTimer); }
      this.onError(typeof message.error === 'string' ? message.error.slice(0, 250) : 'The peer could not complete this request.'); this.onChange(this);
    } else throw new Error('Unsupported peer message.');
  }
  close() {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.connectionTimer); clearTimeout(this.transferTimer); this.waiting = null; this.incoming = null; this.catalog.clear(); this.copies.clear();
    this.auth?.close(); this.channel?.close(); this.pc.close(); this.identity = null; this.state = 'Disconnected'; this.onChange(this);
  }
}
