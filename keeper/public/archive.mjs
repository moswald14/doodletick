// Small, dependency-free ZIP writer/reader. Stored (uncompressed) entries only.
// Used for plain licensed bundles and already-encrypted library backups.
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const validName = name => typeof name === 'string' && name.length < 256 && !name.startsWith('/') && !name.includes('\\') && !name.split('/').some(p => p === '..' || p === '.' || !p) && !/[\x00-\x1f]/.test(name);
export function zip(entries) {
  const chunks = [], directory = []; let offset = 0;
  if (entries.length > 1000) throw new Error('Too many files in this bundle.');
  const names = new Set();
  for (const [name, content] of entries) {
    if (!validName(name) || names.has(name)) throw new Error('Invalid archive path.'); names.add(name);
    const label = enc.encode(name), data = typeof content === 'string' ? enc.encode(content) : new Uint8Array(content), crc = crc32(data);
    const h = new Uint8Array(30 + label.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(12, 33, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, label.length, true); h.set(label, 30);
    const c = new Uint8Array(46 + label.length), d = new DataView(c.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint16(14, 33, true); d.setUint32(16, crc, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, label.length, true); d.setUint32(42, offset, true); c.set(label, 46);
    chunks.push(h, data); directory.push(c); offset += h.length + data.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer), size = directory.reduce((n, c) => n + c.length, 0);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
export function unzip(buffer, maxBytes = 150 * 1024 * 1024) {
  const data = new Uint8Array(buffer), v = new DataView(data.buffer, data.byteOffset, data.byteLength), result = new Map();
  if (data.length > maxBytes || data.length < 22) throw new Error('This archive is missing or too large.');
  let offset = 0, total = 0;
  while (offset + 4 <= data.length && v.getUint32(offset, true) === 0x04034b50) {
    if (offset + 30 > data.length) throw new Error('Truncated archive.');
    const flags = v.getUint16(offset + 6, true), method = v.getUint16(offset + 8, true), size = v.getUint32(offset + 18, true), raw = v.getUint32(offset + 22, true), nameLen = v.getUint16(offset + 26, true), extra = v.getUint16(offset + 28, true);
    if (flags !== 0x800 || method !== 0 || raw !== size || result.size >= 1000) throw new Error('Import a bundle exported by Doodle Tick (stored ZIP format).');
    const start = offset + 30 + nameLen + extra, end = start + size;
    if (end > data.length || start > data.length || (total += size) > maxBytes) throw new Error('Truncated or oversized archive.');
    const name = dec.decode(data.subarray(offset + 30, offset + 30 + nameLen));
    if (!validName(name) || result.has(name)) throw new Error('Unsafe or duplicate archive path.');
    const bytes = data.slice(start, end);
    if (crc32(bytes) !== v.getUint32(offset + 14, true)) throw new Error('This archive has been altered or damaged.');
    result.set(name, bytes); offset = end;
  }
  if (!result.size || offset + 4 > data.length || v.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
  return result;
}
