// Dot Wave's original pixel cap and face, with deterministic spore variations.
export function mushroomArt(id = 'preview', decorations = [], growth = .7) {
  let seed = 2166136261;
  for (const c of id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const colors = ['#cb79a8', '#91bd74', '#e4a56c', '#82bbca', '#b29ad8', '#db8b7c'];
  const cap = colors[seed % colors.length], top = colors[(seed >>> 5) % colors.length];
  const spots = Array.from({ length: 3 + seed % 4 }, (_, i) => {
    const x = 42 + ((seed >>> (i * 3)) % 66), y = 30 + ((seed >>> (i * 4)) % 18);
    return `<rect x="${x}" y="${y}" width="${5 + i % 3 * 2}" height="6"/>`;
  }).join('');
  return `<svg viewBox="0 0 160 112" role="img" aria-label="Unique pixel mushroom" shape-rendering="crispEdges">
    <path fill="#36524d" d="M0 94h160v18H0z"/><path fill="#94c67f" d="M8 90h8v6H8zm126-4h6v10h-6zM27 94v-8h4v8z"/>
    ${decorations.includes('halo') ? '<ellipse cx="80" cy="14" rx="34" ry="8" fill="none" stroke="#e7d4ff" stroke-width="3"/>' : ''}
    <g transform="translate(0 ${Math.round((1 - growth) * 18)})"><path fill="#f1dba8" d="M64 50h32v43H64z"/><path fill="#c5aa86" d="M64 85h32v8H64z"/>
    <path fill="${cap}" d="M48 25h64v8h16v24H32V33h16z"/><path fill="${top}" d="M56 18h48v8H56z"/><g fill="#ffe1c8">${spots}</g>
    <path fill="#29333d" d="M70 66h4v5h-4zm16 0h4v5h-4zm-10 9h8v3h-8z"/>
    ${decorations.includes('ring') ? '<path fill="#edc962" d="M60 81h40v5H60z"/>' : ''}</g>
    ${decorations.includes('lantern') ? '<path stroke="#e9c675" fill="none" d="M128 93V62h12v8"/><rect x="135" y="70" width="10" height="13" fill="#f1c46b"/>' : ''}
    <g fill="${cap}"><path d="M22 42h4v4h-4zm112-22h4v4h-4zm-10 42h3v3h-3z"/></g></svg>`;
}
