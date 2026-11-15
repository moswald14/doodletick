import { pairingSeal } from './spirograph.mjs';
const pending = []; let showing = false;
function showNext() {
  if (showing || !pending.length) return;
  const item = pending.shift(); if (item.signal.aborted) { item.resolve(false); showNext(); return; }
  showing = true;
  const dialog = document.createElement('dialog'); dialog.className = 'spiro-dialog'; dialog.setAttribute('aria-labelledby', 'spiro-title');
  dialog.innerHTML = `<span class="eyebrow">SPIROGRAPH AUTHENTICATION</span><h2 id="spiro-title">Do your patterns match?</h2><p class="spiro-peer"></p><div class="spiro-art"></div><p class="spiro-code" aria-label="Verification code"></p><p>Compare this drawing <strong>and every group of the code</strong> with your friend over a trusted call or in person. Both of you need to confirm.</p><p class="fine-print">This pattern is unique to this pairing. The signed keys behind it establish the connection; the drawing does not replace your vault password.</p><div class="arc-actions"><button class="button primary" data-spiro-confirm>Our patterns match</button><button class="button quiet" data-spiro-reject>Reject connection</button></div>`;
  dialog.querySelector('.spiro-peer').textContent = `Pairing with ${item.peer.username} · ${item.purpose}`;
  dialog.querySelector('.spiro-art').innerHTML = item.seal.svg;
  dialog.querySelector('.spiro-code').textContent = item.seal.code;
  function done(value) { item.signal.removeEventListener('abort', abort); dialog.close(); dialog.remove(); showing = false; item.resolve(value); queueMicrotask(showNext); }
  const abort = () => done(false);
  dialog.querySelector('[data-spiro-confirm]').onclick = () => done(true); dialog.querySelector('[data-spiro-reject]').onclick = () => done(false);
  dialog.oncancel = event => { event.preventDefault(); done(false); };
  item.signal.addEventListener('abort', abort, { once: true }); document.body.append(dialog); dialog.showModal();
}
export function confirmSpirograph(info) { return new Promise(resolve => { pending.push({ ...info, resolve }); showNext(); }); }
export class SpirographAuth {
  static async create(offer, answer, options) { return new SpirographAuth(await pairingSeal(offer, answer), options); }
  constructor(seal, { peer, purpose, confirm = confirmSpirograph, onVerified, onReject }) {
    Object.assign(this, { seal, peer, purpose, confirm, onVerified, onReject }); this.controller = new AbortController(); this.verified = false; this.closed = false;
  }
  begin(channel) {
    if (this.channel || this.closed) return; this.channel = channel;
    this.timer = setTimeout(() => this.reject('Spirograph comparison timed out. Make a new invitation.'), 120000);
    this.send('hello');
    Promise.resolve(this.confirm({ seal: this.seal, peer: this.peer, purpose: this.purpose, signal: this.controller.signal })).then(value => {
      if (this.closed) return;
      if (value !== true) { this.reject('Spirograph connection rejected.'); return; }
      this.localConfirmed = true; this.send('confirm'); this.finish();
    }).catch(() => this.reject('Spirograph comparison could not be completed.'));
  }
  send(type) { try { this.channel.send(JSON.stringify({ auth: 'doodletick-spirograph-v1', type, digest: this.seal.digest })); } catch { this.reject('Connection closed during spirograph comparison.'); } }
  receive(raw) {
    let data;
    if (typeof raw === 'string' && raw.length <= 1000) { try { data = JSON.parse(raw); } catch {} }
    if (data?.auth === 'doodletick-spirograph-v1') {
      if (data.digest !== this.seal.digest || !['hello', 'confirm'].includes(data.type)) throw new Error('The spirographs do not match. Connection refused.');
      if (data.type === 'confirm') { this.remoteConfirmed = true; this.finish(); } return true;
    }
    if (!this.verified) throw new Error('Peer sent data before spirograph authentication.');
    return false;
  }
  finish() { if (!this.closed && !this.verified && this.localConfirmed && this.remoteConfirmed) { this.verified = true; clearTimeout(this.timer); this.onVerified(); } }
  reject(reason) { if (this.closed) return; this.close(); this.onReject(reason); }
  close() { if (this.closed) return; this.closed = true; clearTimeout(this.timer); this.controller.abort(); }
}
