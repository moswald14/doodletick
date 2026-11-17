// SPDX-License-Identifier: GPL-3.0-only
// Publish only a supplied, locally synthesized audio stream. No device capture.
export const JAZZ_CAST_HOST = 'wss://apibackup.vdo.ninja';
const randomHex = count => Array.from(crypto.getRandomValues(new Uint8Array(count)), byte => byte.toString(16).padStart(2, '0')).join('');
export function jazzCastInvitation() {
  const streamID = 'DoodleJazz' + randomHex(16), password = randomHex(16);
  const url = new URL('https://vdo.ninja/alpha/');
  url.search = new URLSearchParams({ view: streamID, password: encodeURIComponent(password),
    wss2: 'apibackup.vdo.ninja', novideo: '1', stereo: '1', proaudio: '1', audiobitrate: '128', label: 'Doodle Jazz' }).toString();
  return { streamID, password, url: url.href };
}
async function defaultSDK(options) {
  await import('./vdoninja-sdk.js');
  return new globalThis.VDONinjaSDK(options);
}
function releaseSource(source) {
  for (const track of source?.stream?.getTracks?.() || []) try { track.stop(); } catch {}
  try { source?.release?.(); } catch {}
}

export class JazzCaster {
  constructor({ createSDK = defaultSDK, invitation = jazzCastInvitation, onChange = () => {}, timeoutMs = 20000 } = {}) {
    this.createSDK = createSDK; this.invitation = invitation; this.onChange = onChange; this.timeoutMs = timeoutMs;
    this.generation = 0; this.active = null;
    this.value = { state: 'idle', listeners: 0, bytes: 0, packets: 0, url: '', message: 'Cast just the Jazz audio to a free VDO.Ninja listener page.' };
  }
  update(patch) { this.value = { ...this.value, ...patch }; this.onChange({ ...this.value }); }
  async start(source) {
    if (this.active) { if (source !== this.active.source) releaseSource(source); throw new Error('A cast is already active.'); }
    const stream = source?.stream, tracks = stream?.getTracks?.();
    if (!Array.isArray(tracks) || tracks.length !== 1 || tracks[0].kind !== 'audio' || tracks[0].readyState === 'ended') {
      releaseSource(source); throw new Error('Play Jazz before starting its audio cast.');
    }
    const token = ++this.generation;
    const active = { token, source, sdk: null, listeners: new Set(), handlers: [], released: false, statsTimer: null, cancel: null };
    this.active = active;
    this.update({ state: 'connecting', listeners: 0, bytes: 0, packets: 0, url: '', message: 'Connecting Doodle Jazz to VDO.Ninja…' });
    const current = () => this.active === active && token === this.generation;
    let timeout;
    const canceled = new Promise((_, reject) => {
      active.cancel = () => reject(new Error('Cast canceled.'));
      timeout = setTimeout(() => reject(new Error('VDO.Ninja did not connect in time. Try casting again.')), this.timeoutMs);
    });
    const work = (async () => {
      const link = this.invitation();
      const sdk = await this.createSDK({ host: JAZZ_CAST_HOST, salt: 'vdo.ninja', password: link.password, label: 'Doodle Jazz', debug: false,
        maxReconnectAttempts: 3, autoRecover: true, autoRelay: true,
        info: { allowdrawing: false, allowmidi: false, allowresources: false, allowchunked: false } });
      if (!current()) { await sdk.disconnect().catch(() => {}); throw new Error('Cast canceled.'); }
      active.sdk = sdk;
      const on = (event, handler) => { const guarded = e => { if (current()) handler(e.detail || {}); }; sdk.addEventListener(event, guarded); active.handlers.push([event, guarded]); };
      const liveMessage = () => this.update({ state: 'casting', listeners: active.listeners.size,
        message: active.listeners.size ? 'Doodle Jazz is connected to ' + active.listeners.size + (active.listeners.size === 1 ? ' listener.' : ' listeners.') : 'On VDO.Ninja. Share the listener link to let someone tune in.' });
      on('peerConnected', detail => { if (detail.connection?.type === 'publisher' && typeof detail.uuid === 'string') { active.listeners.add(detail.uuid); liveMessage(); } });
      on('peerDisconnected', detail => { active.listeners.delete(detail.uuid); liveMessage(); });
      on('disconnected', detail => {
        if (detail.intentional) return;
        if (detail.willReconnect) this.update({ state: 'reconnecting', message: 'The casting connection dropped. Reconnecting…' });
        else void this.fail(active, 'The casting connection ended. Jazz still plays locally; start a new cast to reconnect.');
      });
      on('reconnecting', () => this.update({ state: 'reconnecting', message: 'Reconnecting the cast…' }));
      on('reconnected', liveMessage);
      on('reconnectFailed', () => void this.fail(active, 'Could not reconnect the cast. Start a new cast when your connection is ready.'));
      on('connectionFailed', detail => { active.listeners.delete(detail.uuid); liveMessage(); });
      active.ended = () => { if (current()) void this.stop(); };
      tracks[0].addEventListener('ended', active.ended, { once: true });
      await sdk.connect();
      if (!current()) throw new Error('Cast canceled.');
      await sdk.publish(stream, { streamID: link.streamID, label: 'Doodle Jazz', media: { audio: { codec: 'opus', maxBitrate: 128000 } } });
      if (!current()) throw new Error('Cast canceled.');
      this.update({ url: link.url }); liveMessage();
      const measure = async () => {
        try {
          const reports = await sdk.getStats();
          if (!current()) return;
          let bytes = 0, packets = 0;
          for (const rows of Object.values(reports)) for (const row of rows) {
            if (row.connectionType === 'publisher' && row.type === 'outbound-rtp' && (row.kind || row.mediaType) === 'audio') {
              if (Number.isFinite(row.bytesSent) && row.bytesSent >= 0) bytes += row.bytesSent;
              if (Number.isFinite(row.packetsSent) && row.packetsSent >= 0) packets += row.packetsSent;
            }
          }
          this.update({ bytes, packets });
        } catch { /* Network diagnostics never interrupt local music. */ }
        if (current()) active.statsTimer = setTimeout(measure, 3000);
      };
      void measure();
      return this.value;
    })();
    try { return await Promise.race([work, canceled]); }
    catch (e) {
      if (current()) await this.fail(active, e.message === 'VDO.Ninja did not connect in time. Try casting again.' ? e.message : 'Could not start the audio cast. Jazz still plays locally; try casting again.');
      throw e;
    } finally { clearTimeout(timeout); active.cancel = null; }
  }
  async release(active) {
    if (active.released) return; active.released = true;
    clearTimeout(active.statsTimer);
    for (const [event, handler] of active.handlers) active.sdk?.removeEventListener(event, handler);
    active.source.stream.getTracks().forEach(track => { if (active.ended) track.removeEventListener('ended', active.ended); });
    releaseSource(active.source);
    try { active.sdk?.stopPublishing(); } catch {}
    try { await active.sdk?.disconnect(); } catch {}
  }
  async fail(active, message) {
    if (this.active !== active) return;
    this.active = null; this.generation++; active.cancel?.();
    this.update({ state: 'error', listeners: 0, bytes: 0, packets: 0, url: '', message });
    await this.release(active);
  }
  async stop() {
    const active = this.active;
    if (!active) return;
    this.active = null; this.generation++; active.cancel?.();
    this.update({ state: 'idle', listeners: 0, bytes: 0, packets: 0, url: '', message: 'Casting stopped. Your Jazz player stays local.' });
    await this.release(active);
  }
}

export function createJazzCastUI({ getSource, getPlayback }) {
  const $ = id => document.getElementById(id);
  const caster = new JazzCaster({ onChange: info => {
    $('cast-status').textContent = getPlayback() === 'paused' && info.state === 'casting' ? 'Jazz is paused. Listeners hear silence until you resume.' : info.message;
    $('cast-status').classList.toggle('error', info.state === 'error');
    $('cast-jazz').disabled = ['connecting', 'casting', 'reconnecting'].includes(info.state) || getPlayback() !== 'playing';
    $('stop-cast').hidden = !['connecting', 'casting', 'reconnecting'].includes(info.state);
    $('cast-link-row').hidden = !info.url;
    if ($('cast-link').value !== info.url) $('cast-copy').textContent = 'Copy listener link';
    $('cast-link').value = info.url; $('cast-listen').href = info.url || '#';
    $('cast-meter').textContent = info.bytes > 0 ? Math.round(info.bytes / 1024) + ' KB of music sent · ' + info.listeners + (info.listeners === 1 ? ' listener' : ' listeners') : '';
  } });
  $('cast-jazz').addEventListener('click', async () => {
    if (caster.active || getPlayback() !== 'playing') return;
    try { await caster.start(getSource()); } catch { /* Controller presents its safe, actionable status. */ }
  });
  $('stop-cast').addEventListener('click', () => void caster.stop());
  $('cast-copy').addEventListener('click', async () => {
    if (!caster.value.url) return;
    try { await navigator.clipboard.writeText(caster.value.url); $('cast-copy').textContent = 'Copied'; }
    catch { $('cast-link').focus(); $('cast-link').select(); $('cast-status').textContent = 'Select and copy the listener link shown here.'; }
  });
  return { caster, stop: () => caster.stop(), playbackChanged() {
    $('cast-jazz').disabled = !!caster.active || getPlayback() !== 'playing';
    if (caster.active && getPlayback() === 'paused') $('cast-status').textContent = 'Jazz is paused. Listeners hear silence until you resume.';
    else if (caster.active && getPlayback() === 'playing' && caster.value.state === 'casting') $('cast-status').textContent = caster.value.message;
  } };
}
