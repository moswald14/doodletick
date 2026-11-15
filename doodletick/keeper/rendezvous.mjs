import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readSignal } from './public/arcade-link.mjs';
import { hash } from './public/core.mjs';
const token = () => randomBytes(24).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function makeRendezvous({ now = Date.now } = {}) {
  const rooms = new Map(), limits = new Map();
  const clean = () => {
    for (const [id, room] of rooms) { if (now() - room.updated > 45000) rooms.delete(id); else for (const [jid, join] of room.joins) if (now() - join.created > 120000) room.joins.delete(jid); }
    for (const [ip, record] of limits) if (now() - record.since > 60000) limits.delete(ip);
  };
  return async function route(req, res, url) {
    if (!url.pathname.startsWith('/arcade-api/')) return false;
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); return true; };
    clean(); const ip = req.socket.remoteAddress || 'local';
    if (!limits.has(ip)) limits.set(ip, { since: now(), count: 0 });
    if (++limits.get(ip).count > 900) return send(429, { error: 'Lobby request limit reached. Try again in a minute.' });
    let body = {};
    if (['POST', 'PATCH'].includes(req.method)) {
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required.' });
      let raw = '', length = 0;
      for await (const bytes of req) { length += bytes.length; if (length > 100000) return send(413, { error: 'Request too large.' }); raw += bytes; }
      try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); } catch { return send(400, { error: 'Invalid JSON object.' }); }
    }
    const auth = req.headers.authorization?.replace(/^Bearer /, '');
    const parts = url.pathname.slice('/arcade-api/'.length).split('/').filter(Boolean);
    const publicRoom = room => ({ id: room.id, title: room.title, game: room.game, players: room.players, capacity: 4, updated: room.updated, host: room.host });
    if (parts.length === 1 && parts[0] === 'rooms') {
      if (req.method === 'GET') return send(200, { rooms: [...rooms.values()].filter(r => r.discoverable).map(publicRoom), scope: 'this-lobby-service' });
      if (req.method === 'POST') {
        if (rooms.size >= 64) return send(503, { error: 'This lobby is full.' });
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 60 || !['dash', 'flood', 'four'].includes(body.game) || typeof body.host !== 'string' || body.host.length > 24) return send(400, { error: 'Invalid room details.' });
        const id = randomBytes(8).toString('hex').toUpperCase(), hostToken = token();
        rooms.set(id, { id, title: body.title.trim(), host: body.host, game: body.game, players: 1, discoverable: body.discoverable === true, updated: now(), hostToken, joins: new Map() });
        return send(201, { id, token: hostToken });
      }
    }
    if (parts[0] !== 'rooms' || !/^[A-F0-9]{16}$/.test(parts[1] || '')) return send(404, { error: 'Room not found.' });
    const room = rooms.get(parts[1]); if (!room) return send(404, { error: 'This room is closed or expired.' });
    const host = same(auth, room.hostToken);
    if (parts.length === 2) {
      if (req.method === 'GET') return send(200, publicRoom(room));
      if (!host) return send(403, { error: 'Room host authorization required.' });
      if (req.method === 'DELETE') { rooms.delete(room.id); return send(200, { closed: true }); }
      if (req.method === 'PATCH') { if (!Number.isInteger(body.players) || body.players < 1 || body.players > 4 || !['dash', 'flood', 'four'].includes(body.game)) return send(400, { error: 'Invalid room status.' }); room.players = body.players; room.game = body.game; room.updated = now(); return send(200, publicRoom(room)); }
    }
    if (parts.length === 3 && parts[2] === 'inbox' && req.method === 'GET') {
      if (!host) return send(403, { error: 'Room host authorization required.' });
      room.updated = now(); return send(200, { offers: [...room.joins.values()].filter(j => !j.answer).map(j => ({ id: j.id, offer: j.offer })) });
    }
    if (parts.length === 3 && parts[2] === 'join' && req.method === 'POST') {
      if (room.players >= 4 || [...room.joins.values()].filter(j => !j.answer).length >= 4 || room.joins.size >= 12) return send(409, { error: 'This room is full or has too many pending joins.' });
      let offer; try { offer = await readSignal(body.offer, 'offer'); } catch (e) { return send(400, { error: e.message }); }
      if (offer.record.room !== room.id || offer.record.role !== 'guest') return send(400, { error: 'This offer belongs to another room.' });
      const id = randomBytes(8).toString('hex'), secret = token(); room.joins.set(id, { id, token: secret, offer: body.offer, offerHash: await hash(offer), created: now(), answer: null }); return send(201, { id, token: secret });
    }
    if (parts.length === 4 && parts[2] === 'join') {
      const join = room.joins.get(parts[3]); if (!join) return send(404, { error: 'Join request expired.' });
      if (req.method === 'GET') { if (!same(auth, join.token)) return send(403, { error: 'Join authorization required.' }); return send(200, { answer: join.answer }); }
      if (req.method === 'POST') {
        if (!host) return send(403, { error: 'Room host authorization required.' });
        let answer; try { answer = await readSignal(body.answer, 'answer'); } catch (e) { return send(400, { error: e.message }); }
        if (answer.record.room !== room.id || answer.record.role !== 'host' || answer.record.replyTo !== join.offerHash) return send(400, { error: 'Answer does not match this join request.' });
        if (join.answer && join.answer !== body.answer) return send(409, { error: 'This join already has an answer.' });
        join.answer = body.answer; return send(200, { answered: true });
      }
    }
    return send(405, { error: 'Unsupported lobby operation.' });
  };
}
