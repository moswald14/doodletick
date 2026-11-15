import { b64, unb64, random, checkSignature, hash } from './core.mjs';
import { verifyReplay, validatePack, defaultPack } from './game-engine.mjs';
import { verifyManifest, verifyFile } from './licenses.mjs';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
export function emptyArcade(username) { return { version: 1, profile: { name: username, color: '#deff79', icon: 'spark', bio: '' }, worlds: [], currentWorld: defaultPack(), matches: [], friends: [] }; }
export async function verifyMatchReceipt(receipt) {
  try {
    if (!receipt || !verifyReplay(receipt.record) || receipt.id !== await hash(receipt.record) || !Array.isArray(receipt.proofs) || receipt.proofs.length > 4) return false;
    const r = receipt.record;
    if (typeof r.matchId !== 'string' || r.matchId.length > 80 || !Number.isFinite(Date.parse(r.startedAt)) || !Number.isFinite(Date.parse(r.endedAt)) || new Set(r.roster.map(p => p.id)).size !== r.roster.length) return false;
    for (const p of r.roster) { if (p.bot) { if (!/^bot-\d$/.test(p.id)) return false; } else if (p.id !== await hash(p.publicKey)) return false; }
    if (!r.roster.some(p => p.id === r.host && !p.bot)) return false;
    const seen = new Set();
    for (const proof of receipt.proofs) { const player = r.roster.find(p => !p.bot && p.id === proof.player); if (!player || seen.has(proof.player) || !await checkSignature(r, proof.signature, player.publicKey)) return false; seen.add(proof.player); }
    return seen.has(r.host);
  } catch { return false; }
}
export function agreement(receipt) { const humans = receipt.record.roster.filter(p => !p.bot); return { signed: humans.filter(p => receipt.proofs.some(s => s.player === p.id)).length, total: humans.length, practice: receipt.record.roster.some(p => p.bot) }; }
async function validate(data) {
  if (data?.version !== 1 || typeof data.profile?.name !== 'string' || data.profile.name.length > 24 || !/^#[0-9a-fA-F]{6}$/.test(data.profile.color) || !['spark', 'moon', 'leaf', 'comet'].includes(data.profile.icon) || typeof data.profile.bio !== 'string' || data.profile.bio.length > 120 || !Array.isArray(data.matches) || data.matches.length > 40 || !Array.isArray(data.worlds) || data.worlds.length > 20 || !Array.isArray(data.friends) || data.friends.length > 100) throw new Error('Invalid arcade backup.');
  validatePack(data.currentWorld);
  if (data.currentSource && !await verifyManifest(data.currentSource)) throw new Error('The source world credit is invalid.');
  if (data.currentCredit && !await verifyFile(data.currentCredit, enc.encode(JSON.stringify(data.currentWorld, null, 2)))) throw new Error('The saved world does not match its credits.');
  for (const world of data.worlds) { if (typeof world.id !== 'string' || world.id.length > 80) throw new Error('Invalid world identifier.'); validatePack(world.pack); if (world.parent && !await verifyManifest(world.parent)) throw new Error('A source world credit is invalid.'); }
  for (const friend of data.friends) if (!friend || !/^[A-Za-z0-9_-]{43}$/.test(friend.id) || typeof friend.name !== 'string' || friend.name.length > 24) throw new Error('Invalid saved creator.');
  for (const receipt of data.matches) if (!await verifyMatchReceipt(receipt)) throw new Error('A match in the arcade backup failed replay or signature verification.');
  return data;
}
async function db() { return new Promise((resolve, reject) => { const r = indexedDB.open('doodletick-arcade-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('profiles', { keyPath: 'scope' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
export class ArcadeStore {
  constructor(identity, key = null) { this.identity = identity; this.key = key; this.scope = identity.fingerprint; this.data = emptyArcade(identity.username); this.queue = Promise.resolve(); this.closed = false; this.revision = null; }
  async open() {
    if (!this.key) return this.data;
    const database = await db(), row = await new Promise((resolve, reject) => { const r = database.transaction('profiles').objectStore('profiles').get(this.scope); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); database.close();
    if (row) { this.data = await this.decode(row); this.revision = row.revision || null; } return this.data;
  }
  async envelope() { if (this.closed || !this.key) throw new Error('Unlock your Keeper to back up the arcade.'); const iv = random(12), bytes = enc.encode(JSON.stringify(this.data)); if (bytes.length > 22000000) throw new Error('Arcade archive is full. Export and remove some replays first.'); const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('doodletick-arcade-v1:' + this.scope) }, this.key, bytes); return { format: 'doodletick-arcade-v1', scope: this.scope, iv: b64(iv), ciphertext: b64(ciphertext) }; }
  async decode(row) { if (row.format !== 'doodletick-arcade-v1' || row.scope !== this.scope || typeof row.ciphertext !== 'string' || row.ciphertext.length > 30000000) throw new Error('Restore the matching identity vault before this arcade backup.'); const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.iv), additionalData: enc.encode('doodletick-arcade-v1:' + this.scope) }, this.key, unb64(row.ciphertext)); return validate(JSON.parse(dec.decode(bytes))); }
  async save() {
    if (this.closed) throw new Error('Arcade session is closed.'); if (!this.key) return;
    const job = this.queue.catch(() => {}).then(async () => {
      if (this.closed) return;
      const row = await this.envelope();
      await navigator.locks.request('doodletick-arcade:' + this.scope, async () => {
        if (this.closed) return;
        const database = await db();
        try {
          const previous = await new Promise((resolve, reject) => { const r = database.transaction('profiles').objectStore('profiles').get(this.scope); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
          if ((previous?.revision || null) !== this.revision) throw new Error('Your arcade changed in another tab. Back up this tab before locking and unlocking to load the latest copy.');
          if (this.closed) return;
          row.revision = b64(random(12));
          await new Promise((resolve, reject) => { const tx = database.transaction('profiles', 'readwrite'); tx.objectStore('profiles').put(row); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(new Error('Arcade storage is unavailable. Download a backup.')); });
          this.revision = row.revision;
        } finally { database.close(); }
      });
    }); this.queue = job; return job;
  }
  async addReceipt(receipt) { if (!await verifyMatchReceipt(receipt)) throw new Error('This match failed replay or signature verification.'); const index = this.data.matches.findIndex(r => r.id === receipt.id); if (index >= 0) this.data.matches[index] = structuredClone(receipt); else this.data.matches.unshift(structuredClone(receipt)); this.data.matches = this.data.matches.slice(0, 40); while (JSON.stringify(this.data).length > 20000000 && this.data.matches.length > 1) this.data.matches.pop(); await this.save(); }
  async restore(row) { const data = await this.decode(row); if (this.closed) throw new Error('Arcade session closed.'); this.data = data; await this.save(); return data; }
  close() { this.closed = true; this.key = null; }
}
