import { C, rgba, label, roundRect, ease } from './pal.js';

const CYCLE = 9300, TYPE = 6400, KEY = 65, CLEAR = 8700, MOVE = 500, LAND = 600;
const QUERY = 'a crowd outdoors';
// Each word narrows the results only once it has been typed in full.
const WORDS = [['CROWD', 7], ['OUTDOOR', 16]];
const FILES = [
  ['img', 'OUTDOOR', 'CROWD'], ['aud', 'STAGE', 'NIGHT'], ['vid', 'CROWD', 'STAGE'],
  ['obj', 'LOGO', 'TEXT'], ['img', 'OUTDOOR', 'NIGHT'], ['vid', 'OUTDOOR', 'CROWD'],
  ['img', 'TEXT', 'LOGO'], ['obj', 'STAGE', 'LOGO'], ['img', 'CROWD', 'OUTDOOR'],
];
const GLYPHS = {
  img: [[[-1, 0.6], [-0.3, -0.4], [0.15, 0.15], [0.5, -0.15], [1, 0.6]]],
  vid: [[[-0.5, -0.7], [0.7, 0], [-0.5, 0.7], [-0.5, -0.7]]],
  aud: [[[-0.6, -0.5], [-0.6, 0.5]], [[0, -0.9], [0, 0.9]], [[0.6, -0.6], [0.6, 0.6]]],
  obj: [[[-0.78, -0.32], [0.32, -0.32], [0.32, 0.78], [-0.78, 0.78], [-0.78, -0.32],
    [-0.32, -0.78], [0.78, -0.78], [0.78, 0.32], [0.32, 0.78]], [[0.32, -0.32], [0.78, -0.78]]],
};
export const STILL = 8200;

export function init(w, h) {
  const wide = w >= 460, big = wide && h >= 300, S = big ? 24 : 18, cols = wide ? 3 : 2;
  const cw = Math.min(w - 28, 520), ox = (w - cw) / 2, cellW = S + 54, gap = wide ? 18 : 8;
  const trayR = ox + S + 12, gw = cols * cellW + (cols - 1) * gap, gx = ox + cw - gw;
  const sw = S + (big ? 40 : 34), sx = (trayR + gx - sw) / 2;
  const pill = h - (big ? 44 : 40), ph = big ? 26 : 22, sh = S + 10, sg = big ? 12 : 6;
  const top = big ? 64 : 58, span = 4 * sh + 3 * sg;
  const sy = top + Math.max(0, (pill - ph / 2 - 18 - top - span) / 2), cy = sy + span / 2;
  const slots = [0, 1, 2, 3].map(k => sy + k * (sh + sg) + sh / 2);
  const rows = [-1, 0, 1].map(r => cy + r * (big ? 46 : 34));
  const free = [0, 0, 0, 0], jobs = [];
  for (let i = 0; i < cols * 3; i++) {
    const drop = 150 + i * 230, k = free.indexOf(Math.min(...free));
    const start = Math.max(drop + 350, free[k]), end = start + MOVE + 1000 + (i * 3 % 4) * 140;
    free[k] = end + 150;
    jobs.push({ i, kind: FILES[i][0], tags: FILES[i].slice(1), slot: k, drop, start, end });
  }
  // Right-hand columns fill first so no tile in flight crosses one that has landed.
  [...jobs].sort((a, b) => a.end - b.end).forEach((j, r) => {
    j.cx = gx + (cols - 1 - Math.floor(r / 3)) * (cellW + gap) + S / 2;
    j.gy = rows[r % 3];
  });
  return {
    wide, S, ox, gx, gw, sx, sw, sy, sh, span, slots, rows, jobs, pill, ph, trayR,
    m1: (trayR + sx) / 2, m2: (sx + sw + gx) / 2, head: sy + span - 4 - S / 2,
  };
}

function tile(ctx, x, y, S, kind, col) {
  roundRect(ctx, x - S / 2, y - S / 2, S, S, 3);
  ctx.fillStyle = C.ink; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = ctx.fillStyle = col; ctx.stroke();
  const q = S * 0.26; ctx.beginPath();
  for (const pts of GLYPHS[kind]) {
    pts.forEach(([dx, dy], i) => ctx[i ? 'lineTo' : 'moveTo'](x + dx * q, y + dy * q));
  }
  if (kind === 'vid') ctx.fill();
  ctx.stroke();
}

function chip(ctx, x, y, text, lit) {
  roundRect(ctx, x, y - 5.5, text.length * 5.85 + 8, 11, 2);
  ctx.fillStyle = lit ? rgba(C.lime, 0.16 * lit) : rgba(C.text, 0.06); ctx.fill();
  label(ctx, text, x + 4, y + 0.5, lit > 0.5 ? C.lime : C.mute, 'left', 9);
}

// Out to the gutter, along it, then in: the same three legs the hairlines draw.
function route(a, m, b, q) {
  const x = q < 0.5 ? a.x + (m - a.x) * ease(q / 0.3) : m + (b.x - m) * ease((q - 0.65) / 0.35);
  return { x, y: a.y + (b.y - a.y) * ease((q - 0.2) / 0.55) };
}

function place(s, j, t) {
  const k = s.jobs.reduce((n, o) => (o.i < j.i ? n + 1 - ease((t - o.start - 100) / 300) : n), 0);
  const tray = { x: s.ox + 6 + s.S / 2, y: s.head - k * (s.S + 4) };
  const slot = { x: s.sx + 5 + s.S / 2, y: s.slots[j.slot] };
  if (t < j.start) return { ...tray, y: tray.y - 30 * (1 - ease((t - j.drop) / 350)) };
  if (t < j.start + MOVE) return route(tray, s.m1, slot, (t - j.start) / MOVE);
  if (t < j.end) return slot;
  return route(slot, s.m2, { x: j.cx, y: j.gy }, (t - j.end) / LAND);
}

function line(ctx, x0, y0, x1, y1, col) {
  ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

export function frame(ctx, w, h, t, s) {
  ctx.clearRect(0, 0, w, h);
  const tt = t % CYCLE, fade = 1 - ease((tt - CLEAR) / 400), sz = s.wide ? 10 : 9;
  const typed = Math.max(0, Math.min(QUERY.length, Math.floor((tt - TYPE) / KEY)));
  const on = WORDS.map(([, at]) => ease((tt - TYPE - at * KEY) / 250));

  label(ctx, 'UPLOAD', s.ox, s.sy - 16, C.mute, 'left', sz);
  label(ctx, 'FOUR WORKERS · THE SPEND CEILING', s.sx, s.sy - 16, C.mute, 'left', sz);
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.text, 0.12);
  roundRect(ctx, s.ox, s.sy, s.S + 12, s.span, 4); ctx.stroke();
  const hair = rgba(C.text, 0.07);
  line(ctx, s.trayR, s.head, s.m1, s.head, hair);
  line(ctx, s.m1, s.head, s.m1, s.slots[0], hair);
  line(ctx, s.m2, s.slots[0], s.m2, s.slots[3], hair);
  for (const y of s.rows) line(ctx, s.m2, y, s.gx, y, hair);

  s.slots.forEach((y, k) => {
    const job = s.jobs.find(j => j.slot === k && tt >= j.start + MOVE && tt < j.end);
    const x0 = s.sx + s.S + 11, x1 = s.sx + s.sw - 6;
    line(ctx, s.m1, y, s.sx, y, hair); line(ctx, s.sx + s.sw, y, s.m2, y, hair);
    roundRect(ctx, s.sx, y - s.sh / 2, s.sw, s.sh, 4);
    ctx.strokeStyle = job ? rgba(C.lime, 0.5) : rgba(C.text, 0.12); ctx.stroke();
    line(ctx, x0, y, x1, y, rgba(C.text, 0.08));
    if (!job) return;
    const q = (tt - job.start - MOVE) / (job.end - job.start - MOVE);
    line(ctx, x0, y, x0 + (x1 - x0) * q, y, C.lime);
  });

  for (const j of s.jobs) {
    if (tt < j.drop) continue;
    const m = WORDS.map((_, k) => WORDS.slice(0, k + 1).every(([g]) => j.tags.includes(g)));
    const hl = (m[0] ? on[0] : 0) + (m[1] - m[0]) * on[1];
    const dim = (1 - m[0]) * on[0] + (m[0] - m[1]) * on[1];
    const a = fade * ease((tt - j.drop) / 350) * (1 - 0.7 * dim), p = place(s, j, tt);
    ctx.globalAlpha = a;
    tile(ctx, p.x, p.y, s.S, j.kind, tt < j.start + MOVE ? C.grey : C.mute);
    if (hl > 0) { ctx.globalAlpha = a * hl; tile(ctx, p.x, p.y, s.S, j.kind, C.lime); }
    j.tags.forEach((g, n) => {
      const wi = WORDS.findIndex(([x]) => x === g);
      ctx.globalAlpha = a * ease((tt - j.end - LAND - 100 - n * 150) / 200);
      chip(ctx, j.cx + s.S / 2 + 5, j.gy + (n ? 6.5 : -6.5), g, wi < 0 ? 0 : hl * on[wi]);
    });
    ctx.globalAlpha = 1;
  }

  const px = s.gx, py = s.pill, cx = px + 28 + typed * sz * 0.65;
  roundRect(ctx, px, py - s.ph / 2, s.gw, s.ph, s.ph / 2);
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.text, 0.12 + (typed ? 0.1 * fade : 0)); ctx.stroke();
  ctx.strokeStyle = C.mute; ctx.beginPath(); ctx.arc(px + 14, py - 1, 3.6, 0, 7); ctx.stroke();
  line(ctx, px + 16.6, py + 1.6, px + 19.5, py + 4.5, C.mute);
  ctx.globalAlpha = fade; label(ctx, QUERY.slice(0, typed), px + 27, py, C.text, 'left', sz);
  ctx.globalAlpha = 1;
  if (tt < CLEAR && Math.floor(tt / 450) % 2 === 0) line(ctx, cx, py - 6, cx, py + 6, C.lime);
}
