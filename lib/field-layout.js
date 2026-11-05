export function splitSentences(text) {
  return String(text)
    .replace(/\*\*/g, '')
    .split(/\n+/)
    .flatMap(line => line.replace(/^-\s*/, '').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/))
    .map(s => s.trim())
    .filter(s => s.length > 12);
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const unit = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };

function without(v, a) {
  if (!a) return v;
  const p = dot(v, a);
  return v.map((x, j) => x - p * a[j]);
}

// Power iteration on X^T X. A fixed seed vector keeps the output identical run to run.
function topAxis(rows, against = null) {
  let v = unit(without(rows[0].map((_, j) => Math.sin(j + 1)), against));
  for (let k = 0; k < 80; k++) {
    const next = v.map(() => 0);
    for (const r of rows) { const p = dot(r, v); r.forEach((x, j) => { next[j] += p * x; }); }
    v = unit(without(next, against));
  }
  return v;
}

export function pca2(vectors) {
  const n = vectors.length, d = vectors[0].length;
  const mean = Array.from({ length: d }, (_, j) => vectors.reduce((s, r) => s + r[j], 0) / n);
  const rows = vectors.map(r => r.map((x, j) => x - mean[j]));
  const a = topAxis(rows);
  const b = topAxis(rows.map(r => without(r, a)), a);
  return rows.map(r => [dot(r, a), dot(r, b)]);
}

function relax(pts, gap = 0.22, rounds = 60) {
  for (let k = 0; k < rounds; k++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1], d = Math.hypot(dx, dy);
      if (d >= gap) continue;
      // Identical sentences sit on one spot, so they need a direction that is not zero.
      const ux = d < 1e-9 ? Math.cos(i + j) : dx / d, uy = d < 1e-9 ? Math.sin(i + j) : dy / d;
      const push = (gap - d) / 2;
      pts[i][0] -= ux * push; pts[i][1] -= uy * push;
      pts[j][0] += ux * push; pts[j][1] += uy * push;
    }
    for (const p of pts) { const r = Math.hypot(p[0], p[1]); if (r > 1) { p[0] /= r; p[1] /= r; } }
  }
  return pts.map(([u, v]) => [+u.toFixed(4), +v.toFixed(4)]);
}

export function layoutArea(vectors) {
  if (vectors.length === 1) return [[0, 0]];
  const pts = pca2(vectors);
  const r = Math.max(...pts.map(([u, v]) => Math.hypot(u, v))) || 1;
  return relax(pts.map(([u, v]) => [u / r * 0.9, v / r * 0.9]));
}
