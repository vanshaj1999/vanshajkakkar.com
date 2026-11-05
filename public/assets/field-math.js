// Order matches the areas in field.json; radii follow how many sentences each area holds.
export const ANCHORS = {
  wide: [
    { x: 0.30, y: 0.18, r: 0.075 }, { x: 0.47, y: 0.28, r: 0.05 }, { x: 0.58, y: 0.21, r: 0.11 },
    { x: 0.66, y: 0.78, r: 0.10 }, { x: 0.86, y: 0.68, r: 0.13 }, { x: 0.54, y: 0.55, r: 0.06 },
    { x: 0.70, y: 0.44, r: 0.15 }, { x: 0.87, y: 0.24, r: 0.12 },
  ],
  narrow: [
    { x: 0.18, y: 0.18, r: 0.12 }, { x: 0.46, y: 0.80, r: 0.07 }, { x: 0.80, y: 0.20, r: 0.15 },
    { x: 0.16, y: 0.79, r: 0.13 }, { x: 0.76, y: 0.83, r: 0.17 }, { x: 0.50, y: 0.21, r: 0.07 },
    { x: 0.32, y: 0.48, r: 0.20 }, { x: 0.78, y: 0.50, r: 0.16 },
  ],
};

export const NARROW = 1100;
const TOP = 64;

// On a phone the copy sits under the field, so the field keeps to a fixed band at the top.
export const fieldHeight = (w, h) => (w < NARROW ? Math.min(h, 420) : h);

export function anchorsFor(w, h) {
  const nar = w < NARROW, set = nar ? ANCHORS.narrow : ANCHORS.wide;
  const fh = fieldHeight(w, h), top = nar ? TOP : 0, m = Math.min(w, fh - top);
  return set.map(an => ({ x: an.x * w, y: top + an.y * (fh - top), r: an.r * m }));
}

export function placeDots(dots, w, h) {
  const an = anchorsFor(w, h);
  return dots.map(d => {
    const a = an[d.a];
    return { x: a.x + d.u * a.r, y: a.y + d.v * a.r, a: d.a, id: d.id, s: d.s };
  });
}

export function nearest(points, x, y) {
  let i = -1, d = Infinity;
  points.forEach((p, k) => { const e = Math.hypot(p.x - x, p.y - y); if (e < d) { d = e; i = k; } });
  return { i, d };
}

export function countWithin(points, x, y, r) {
  return points.reduce((n, p) => n + (Math.hypot(p.x - x, p.y - y) <= r ? 1 : 0), 0);
}

export function focusPoint(points, near) {
  let x = 0, y = 0, w = 0;
  for (const n of near) {
    const own = points.filter(p => p.id === n.id);
    if (!own.length) continue;
    const cx = own.reduce((s, p) => s + p.x, 0) / own.length;
    const cy = own.reduce((s, p) => s + p.y, 0) / own.length;
    x += cx * n.score; y += cy * n.score; w += n.score;
  }
  return w ? { x: x / w, y: y / w } : null;
}

export function emptySpot(points, { x0, x1, y0, y1 }) {
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, far = -1;
  for (let x = x0; x <= x1; x += 16) for (let y = y0; y <= y1; y += 16) {
    const d = nearest(points, x, y).d;
    if (d > far) { far = d; best = { x, y }; }
  }
  return best;
}
