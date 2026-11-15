import { SpirographAuth } from './spirograph-auth.mjs';
import { RtcConnection } from './vpn-transport.mjs';
import { validRtcDescription } from './vpn-description.mjs';
import { b64, random, hash, sign, checkSignature } from './core.mjs';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
export async function readSignal(text, type) {
  if (typeof text !== 'string' || text.length > 65000) throw new Error('Connection code is too large.');
  let packet; try { packet = JSON.parse(text); } catch { throw new Error('Paste a complete Doodleverse connection code.'); }
  const r = packet.record;
  if (!r || r.format !== 'doodletick-arcade-signal-v3' || r.type !== type || !['host', 'guest'].includes(r.role) || !/^[A-Za-z0-9_-]{8,40}$/.test(r.room) || !/^[A-Za-z0-9_-]{22}$/.test(r.session) || !Number.isFinite(r.expires) || r.expires < Date.now() || r.expires > Date.now() + 70 * 60000 || !validRtcDescription(r.transport, type, 'doodleverse-v1') || !/^[a-zA-Z0-9_-]{3,24}$/.test(r.username) || !await checkSignature(r, packet.signature, r.publicKey)) throw new Error('The connection code is expired, changed, or unsupported. Create a new direct invitation.');
  return packet;
}
export class ArcadeLink {
  constructor({ identity, role, room, onOpen = () => {}, onPacket = () => {}, onClose = () => {}, onError = () => {} }) {
    Object.assign(this, { identity, role, room, onOpen, onPacket, onClose, onError });
    this.id = b64(random(16)); this.closed = false; this.pending = 0; this.jobs = 0; this.rtt = null; this.sent = 0; this.received = 0; this.queue = Promise.resolve(); this.sendQueue = Promise.resolve();
    this.pc = new RtcConnection();
    this.pc.ondatachannel = e => this.attach(e.channel);
    this.pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(this.pc.connectionState)) this.close(this.pc.error || 'Peer disconnected.'); };
    this.timeout = setTimeout(() => this.close('Pairing timed out. Try a new invitation or a different network.'), 120000);
  }
  async code(type, replyTo = null) {
    if (this.closed) throw new Error('This link is closed.');
    const record = { format: 'doodletick-arcade-signal-v3', type, role: this.role, room: this.room, session: this.id, expires: Date.now() + 3600000, username: this.identity.username, publicKey: this.identity.publicKey, transport: this.pc.localDescription, replyTo };
    return { record, signature: await sign(record, this.identity.privateKey) };
  }
  async offer() { this.attach(this.pc.createDataChannel('doodleverse-v1')); await this.pc.setLocalDescription(await this.pc.createOffer()); this.offerPacket = await this.code('offer'); return JSON.stringify(this.offerPacket); }
  async accept(code) {
    const packet = await readSignal(code, 'offer');
    if (packet.record.role === this.role || packet.record.room !== this.room) throw new Error('That invitation belongs to a different room or role.');
    await this.remoteFrom(packet); await this.pc.setRemoteDescription(packet.record.transport); await this.pc.setLocalDescription(await this.pc.createAnswer()); const answer = await this.code('answer', await hash(packet)); await this.authenticate(packet, answer); return JSON.stringify(answer);
  }
  async finish(code) {
    const packet = await readSignal(code, 'answer');
    if (!this.offerPacket || packet.record.role === this.role || packet.record.room !== this.room || packet.record.replyTo !== await hash(this.offerPacket)) throw new Error('That answer does not match your invitation.');
    await this.remoteFrom(packet); await this.authenticate(this.offerPacket, packet); await this.pc.setRemoteDescription(packet.record.transport);
  }
  async authenticate(offer, answer) { this.auth = await SpirographAuth.create(offer, answer, { peer: this.remote, purpose: 'game room', onVerified: () => { if (this.closed) return; this.onOpen(this); this.pingTimer = setInterval(() => { this.pingAt = Date.now(); this.send({ type: 'ping', at: this.pingAt }); }, 3000); }, onReject: reason => this.close(reason) }); }
  async remoteFrom(packet) { this.remote = { id: await hash(packet.record.publicKey), username: packet.record.username, publicKey: packet.record.publicKey, role: packet.record.role }; }
  attach(channel) {
    if (this.channel && this.channel !== channel || channel.label !== 'doodleverse-v1') { channel.close(); return; }
    this.channel = channel; channel.binaryType = 'arraybuffer'; channel.bufferedAmountLowThreshold = 64000;
    channel.onopen = () => { clearTimeout(this.timeout); if (!this.remote || !this.auth) { this.close('Unverified peer.'); return; } this.auth.begin(channel); };
    if (channel.readyState === 'open') queueMicrotask(() => channel.onopen());
    channel.onclose = () => this.close('Peer disconnected.'); channel.onerror = () => this.close(this.pc.error || 'The direct connection failed.');
    channel.onmessage = e => {
      if (++this.jobs > 160) { this.close('Too many pending peer messages.'); return; }
      this.queue = this.queue.then(() => { if (!this.auth) throw new Error('Peer sent data before authentication.'); if (!this.auth.receive(e.data)) return this.wire(e.data); }).catch(error => { this.onError(error.message); this.close('Invalid peer data.'); }).finally(() => this.jobs--);
    };
  }
  async wire(raw) {
    if (this.closed) return;
    if (raw instanceof ArrayBuffer) {
      if (!this.assembly || raw.byteLength > 16384 || this.assembly.at + raw.byteLength > this.assembly.bytes.length) throw new Error('Invalid packet fragment.');
      this.assembly.bytes.set(new Uint8Array(raw), this.assembly.at); this.assembly.at += raw.byteLength; this.received += raw.byteLength; return;
    }
    if (typeof raw !== 'string' || raw.length > 50000) throw new Error('Invalid packet size.');
    this.received += raw.length;
    const packet = JSON.parse(raw);
    if (packet.wire === 'start') { if (this.assembly || !Number.isInteger(packet.size) || packet.size < 0 || packet.size > 1600000) throw new Error('Invalid large packet.'); this.assembly = { bytes: new Uint8Array(packet.size), at: 0 }; return; }
    if (packet.wire === 'end') { if (!this.assembly || this.assembly.at !== this.assembly.bytes.length) throw new Error('Incomplete peer packet.'); const data = JSON.parse(dec.decode(this.assembly.bytes)); this.assembly = null; return this.packet(data); }
    if (this.assembly) throw new Error('Interleaved packet.');
    await this.packet(packet);
  }
  async packet(packet) {
    if (!packet || typeof packet !== 'object' || typeof packet.type !== 'string') throw new Error('Invalid game message.');
    if (packet.type === 'ping') { if (Number.isFinite(packet.at)) this.send({ type: 'pong', at: packet.at }); return; }
    if (packet.type === 'pong') { if (packet.at === this.pingAt) this.rtt = Math.max(0, Date.now() - packet.at); return; }
    await this.onPacket(packet, this);
  }
  send(packet, droppable = false) {
    if (this.closed || !this.auth?.verified || this.channel?.readyState !== 'open') return Promise.resolve(false);
    if (droppable && (this.pending > 1 || this.channel.bufferedAmount > 128000)) return Promise.resolve(false);
    if (++this.pending > 40) { this.close('Connection too slow.'); return Promise.resolve(false); }
    const text = JSON.stringify(packet);
    const bytes = enc.encode(text);
    if (text.length > 1600000) { this.pending--; return Promise.resolve(false); }
    const job = this.sendQueue.then(async () => {
      if (this.closed) return false;
      if (bytes.length < 45000) { await this.drain(); this.channel.send(text); this.sent += bytes.length; }
      else { const data = bytes; if (data.length > 1600000) return false; this.channel.send(JSON.stringify({ wire: 'start', size: data.length })); for (let at = 0; at < data.length; at += 16384) { await this.drain(); const chunk = data.slice(at, at + 16384); this.channel.send(chunk); this.sent += chunk.length; } this.channel.send('{"wire":"end"}'); }
      return true;
    }).catch(() => { this.close('Connection interrupted.'); return false; }).finally(() => this.pending--);
    this.sendQueue = job; return job;
  }
  async drain() {
    if (this.closed || this.channel?.readyState !== 'open') throw new Error('Closed link.');
    if (this.channel.bufferedAmount < 128000) return;
    await new Promise((resolve, reject) => {
      const done = error => { clearTimeout(timer); this.channel.removeEventListener('bufferedamountlow', ready); this.channel.removeEventListener('close', fail); error ? reject(error) : resolve(); };
      const ready = () => done(), fail = () => done(new Error('Disconnected.'));
      const timer = setTimeout(() => done(new Error('Slow peer.')), 10000); this.channel.addEventListener('bufferedamountlow', ready, { once: true }); this.channel.addEventListener('close', fail, { once: true });
    });
  }
  close(reason = 'Disconnected.') {
    if (this.closed) return; this.closed = true; clearTimeout(this.timeout); clearInterval(this.pingTimer); this.assembly = null; this.auth?.close(); this.channel?.close(); this.pc.close(); this.identity = null; this.onClose(reason, this);
  }
}
