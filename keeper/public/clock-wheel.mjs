import { EPOCH, tickAt, tetrachromaColor } from './core.mjs';

const HOUR = 3600000;
export function clockModel(now = Date.now(), black = 0) {
  const tick = tickAt(now), elapsed = Math.max(0, now - EPOCH) % HOUR;
  return {
    tick, angle: (tick.position + elapsed / HOUR) * 15,
    time: new Date(now).toISOString().slice(11, 19),
    colors: Array.from({ length: 24 }, (_, hour) => ({ hour,
      ...tetrachromaColor(tickAt(EPOCH + (tick.cycle * 24 + hour) * HOUR).color, black)
    }))
  };
}
const point = (radius, degrees) => {
  const a = (degrees - 90) * Math.PI / 180;
  return [150 + radius * Math.cos(a), 150 + radius * Math.sin(a)];
};
export function sectorPath(hour) {
  const start = hour * 15 + 0.7, end = (hour + 1) * 15 - 0.7;
  return `M ${point(119, start)} A 119 119 0 0 1 ${point(119, end)} L ${point(94, end)} A 94 94 0 0 0 ${point(94, start)} Z`;
}
const svg = (name, attrs = {}, text) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
export function createClockWheel(container) {
  const dial = svg('svg', { viewBox: '0 0 300 300', role: 'img', 'aria-label': '24-hour color clock, UTC' });
  const segments = svg('g', { class: 'clock-segments' });
  dial.append(segments);
  for (const hour of [0, 6, 12, 18]) {
    const [x, y] = point(137, hour * 15);
    dial.append(svg('text', { x, y, class: 'clock-numeral', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, String(hour).padStart(2, '0')));
  }
  const hand = svg('g', { class: 'clock-hand' });
  hand.append(svg('path', { d: 'M 146 62 L 150 46 L 154 62 Z' }), svg('line', { x1: 150, y1: 65, x2: 150, y2: 78 }));
  const time = svg('text', { x: 150, y: 145, class: 'clock-time', 'text-anchor': 'middle' });
  const date = svg('text', { x: 150, y: 185, class: 'clock-date', 'text-anchor': 'middle' });
  dial.append(hand, time, svg('text', { x: 150, y: 166, class: 'clock-zone', 'text-anchor': 'middle' }, '24 HOURS · UTC'), date);
  container.replaceChildren(dial);
  let paletteKey, paths = [];
  return (now, black) => {
    const model = clockModel(now, black), key = model.tick.cycle + ':' + black;
    if (key !== paletteKey) {
      paletteKey = key;
      paths = model.colors.map(color => {
        const path = svg('path', { d: sectorPath(color.hour), fill: color.preview });
        path.append(svg('title', {}, `${String(color.hour).padStart(2, '0')}:00 UTC · ${color.value}`));
        return path;
      });
      segments.replaceChildren(...paths);
    }
    paths.forEach((path, hour) => path.classList.toggle('current', hour === model.tick.position));
    hand.setAttribute('transform', `rotate(${model.angle} 150 150)`);
    time.textContent = model.time;
    date.textContent = new Date(now).toISOString().slice(0, 10);
    dial.setAttribute('aria-label', `${model.time} UTC. Hour ${model.tick.position}, color ${model.colors[model.tick.position].value}. 24 hourly colors, clockwise from midnight.`);
  };
}
