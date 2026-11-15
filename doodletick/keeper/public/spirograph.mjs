import { hash, unb64, checkSignature } from './core.mjs';
const gcd = (a, b) => b ? gcd(b, a % b) : a;
export async function identitySeal(publicKey) { return makeSeal(await hash({ purpose: 'doodletick-identity-spirograph-v1', publicKey })); }
export async function pairingSeal(offer, answer) {
  const a = offer?.record, b = answer?.record;
  if (!a || !b || a.type !== 'offer' || b.type !== 'answer' || a.format !== b.format || a.expires < Date.now() || b.expires < Date.now() || b.replyTo !== await hash(offer) || !await checkSignature(a, offer.signature, a.publicKey) || !await checkSignature(b, answer.signature, b.publicKey)) throw new Error('Spirograph authentication requires a fresh, signed invitation and its matching answer.');
  return makeSeal(await hash({ purpose: 'doodletick-pair-spirograph-v1', offer, answer }));
}
export function makeSeal(digest) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(digest)) throw new Error('Invalid spirograph fingerprint.');
  const seed = unb64(digest); if (seed.length !== 32) throw new Error('Invalid seal.');
  const code = Array.from(seed.slice(0, 10), n => n.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{5}/g).join(' ');
  const paths = [];
  for (let layer = 0; layer < 3; layer++) {
    const at = layer * 8, outer = 11 + seed[at] % 12, inner = 2 + seed[at + 1] % (outer - 3), pen = 3 + seed[at + 2] % 16;
    const turns = inner / gcd(outer, inner), limit = Math.PI * 2 * turns, count = Math.max(700, turns * 200), angle = seed[at + 3] / 255 * Math.PI * 2;
    const scale = (113 - layer * 13) / (outer - inner + pen), hue = (seed[at + 4] + layer * 100) % 360;
    let d = '';
    for (let i = 0; i <= count; i++) {
      const t = limit * i / count, x = (outer - inner) * Math.cos(t) + pen * Math.cos((outer - inner) / inner * t), y = (outer - inner) * Math.sin(t) - pen * Math.sin((outer - inner) / inner * t);
      const px = 128 + scale * (x * Math.cos(angle) - y * Math.sin(angle)), py = 128 + scale * (x * Math.sin(angle) + y * Math.cos(angle));
      d += (i ? 'L' : 'M') + px.toFixed(2) + ',' + py.toFixed(2);
    }
    paths.push(`<path d="${d}Z" stroke="hsl(${hue} 65% ${28 + seed[at + 5] % 18}%)" stroke-width="${(0.65 + seed[at + 6] / 300).toFixed(2)}"/>`);
  }
  // SVG contains only numeric geometry and constants, never names or other
  // untrusted markup. The code remains available without color or vision.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Spirograph verification seal ${code}"><rect width="256" height="256" rx="24" fill="#faf8ee"/><circle cx="128" cy="128" r="119" fill="none" stroke="#d6d7c9"/><g fill="none" stroke-linejoin="round">${paths.join('')}</g><circle cx="128" cy="128" r="3" fill="#20251e"/></svg>`;
  return { digest, code, svg };
}
