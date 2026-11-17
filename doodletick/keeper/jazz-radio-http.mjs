// SPDX-License-Identifier: GPL-3.0-only
export function createJazzRadioHttpHandler(service) {
  let windowAt = 0, count = 0;
  return async (req, res, url) => {
    const prefix = '/api/jazz-radio/';
    if (!url.pathname.startsWith(prefix)) return false;
    const action = url.pathname.slice(prefix.length);
    const send = (code, value) => { if (res.destroyed) return true; res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); return true; };
    try {
      if (url.search && !(req.method === 'GET' && action === 'library' && url.searchParams.size === 1 && /^\d{1,4}$/.test(url.searchParams.get('offset') || ''))) return send(400, { error: 'Unexpected Jazz request options.' });
      if (req.method === 'GET') {
        if (action === 'status') return send(200, service.status());
        if (action === 'library') return send(200, service.library(url.search ? Number(url.searchParams.get('offset')) : 0));
        if (action === 'stream') { service.listen(res); return true; }
        const match = action.match(/^audio\/([a-f0-9]{64})\.mp3$/);
        if (match) {
          const audio = await service.audio(match[1]); let start = 0, end = audio.length - 1, code = 200;
          if (req.headers.range) {
            const range = /^bytes=(\d{1,10})-(\d{0,10})$/.exec(req.headers.range);
            if (!range || Number(range[1]) >= audio.length || (range[2] && Number(range[2]) < Number(range[1]))) { res.writeHead(416, { 'Content-Range': `bytes */${audio.length}` }); res.end(); return true; }
            start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); code = 206;
          }
          res.writeHead(code, { 'Content-Type': 'audio/mpeg', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
            ...(code === 206 ? { 'Content-Range': `bytes ${start}-${end}/${audio.length}` } : {}) });
          res.end(audio.subarray(start, end + 1)); return true;
        }
        return send(404, { error: 'Jazz action not found.' });
      }
      if (req.method !== 'POST' || !['start','stop','settings','shuffle','new-set','never-stop','voice','dig','receipt','context','beat'].includes(action)) return send(404, { error: 'Jazz action not found.' });
      if (req.headers['x-keeper-request'] !== '1') return send(403, { error: 'Missing request protection.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON required.' });
      if (Date.now() - windowAt > 60000) { windowAt = Date.now(); count = 0; }
      if (++count > 120) return send(429, { error: 'Please wait a minute before changing Jazz again.' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 6000) return send(413, { error: 'Jazz request too large.' }); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!input || typeof input !== 'object' || Array.isArray(input)) return send(400, { error: 'Invalid Jazz request.' });
      const result = action === 'start' ? await service.start() : action === 'stop' ? await service.stop()
        : action === 'settings' ? await service.settings(input) : action === 'shuffle' ? await service.shuffle()
        : action === 'new-set' ? await service.newSet() : action === 'never-stop' ? await service.neverStop(input.enabled)
        : action === 'voice' ? await service.voice(input.enabled) : action === 'dig' ? await service.dig(input.requestId)
        : action === 'receipt' ? await service.receipt() : action === 'context' ? service.context() : service.beat(input);
      return send(action === 'dig' && result.status !== 'saved' ? 202 : 200, result);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return true; }
      return send(error.status || (error instanceof SyntaxError ? 400 : 500), { error: error.status ? error.message : error instanceof SyntaxError ? 'Invalid JSON.' : 'Jazz could not complete this action. Existing recordings are safe.' });
    }
  };
}
