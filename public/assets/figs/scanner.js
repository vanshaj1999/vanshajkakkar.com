import { C, rgba, label, roundRect, ease } from './pal.js';

const CYCLE = 8000, SNAP = 2000, PASS = 1200, P = [2300, 3700], SETTLE = 5000, SUM = 5900, END = 7500;
export const STILL = 7000;

const AGREE = [true, true, false, true, true, false];
const span = (ms, a, d) => ease((ms - a) / d);

export function init(w, h) {
  const wide = w >= 460, gap = wide ? 28 : 16;
  const cw = wide ? Math.min(240, w * 0.44) : Math.max(112, Math.min(170, w * 0.47, w - 146));
  const split = cw < 142;
  const pw = wide ? Math.min(240, w - cw - gap - Math.max(48, w * 0.1)) : w - cw - gap - 28;
  const px = Math.round((w - pw - gap - cw) / 2), py = wide ? 50 : 54;
  const ph = h - py - (wide ? 56 : 52), cx = px + pw + gap, head = (wide ? 26 : 20) + 36 + (split ? 12 : 0);
  const rowH = Math.min(wide ? 30 : 26, (ph + (wide ? 24 : 34) - head) / 5), block = head + 5 * rowH;
  const cy = py + (ph + (wide ? 24 : 34) - block) / 2;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = [], lg = wide ? 15 : 13;
  for (let y = py + 20, i = 0; y < py + ph - 14; y += i === 1 ? lg * 1.5 : lg, i++) {
    const kind = i === 0 ? 'head' : i === 3 || i === 8 ? 'dots' : 'bars';
    const words = [], end = px + 14 + (pw - 28) * (0.5 + rnd() * 0.5);
    for (let x = px + 14; x < end - 6;) {
      const ww = Math.min(end - x, (kind === 'head' ? 18 : 8) + rnd() * 26);
      words.push([x, ww]); x += ww + 6;
    }
    lines.push({ y, kind, words });
  }
  return { wide, px, py, pw, ph, cx, cw, cy, rowH, split, lines };
}

function panel(ctx, s, ms) {
  const A = ms < SNAP ? 1.8 * (1 - span(ms, 200, 1700) * 0.7) : 0;
  ctx.save();
  ctx.translate(A * Math.sin(ms * 0.029) * Math.cos(ms * 0.011), A * Math.sin(ms * 0.023 + 1));
  roundRect(ctx, s.px, s.py, s.pw, s.ph, 6);
  ctx.fillStyle = rgba(C.text, 0.03); ctx.fill();
  ctx.strokeStyle = rgba(C.text, 0.14); ctx.lineWidth = 1; ctx.stroke();
  for (const l of s.lines) {
    const head = l.kind === 'head';
    ctx.fillStyle = rgba(C.text, head ? 0.42 : 0.26);
    for (const [x, ww] of l.words) {
      ctx.beginPath();
      if (l.kind === 'dots') {
        for (let d = x + 1.5; d < x + ww; d += 4.5) { ctx.moveTo(d + 1.3, l.y); ctx.arc(d, l.y, 1.3, 0, 7); }
      } else ctx.roundRect(x, l.y - (head ? 2.5 : 1.5), ww, head ? 5 : 3, 1.5);
      ctx.fill();
    }
  }
  const flash = 1 - Math.abs(ms - SNAP) / 300;
  if (flash > 0) {
    roundRect(ctx, s.px, s.py, s.pw, s.ph, 6); ctx.fillStyle = rgba(C.text, 0.1 * flash); ctx.fill();
  }
  for (const p of P) {
    if (ms < p || ms > p + PASS) continue;
    const y = s.py + 8 + (s.ph - 16) * (ms - p) / PASS;
    ctx.strokeStyle = rgba(C.lime, 0.6);
    ctx.beginPath(); ctx.moveTo(s.px + 6, y); ctx.lineTo(s.px + s.pw - 6, y); ctx.stroke();
  }
  ctx.restore();

  const pad = 6 + 12 * Math.max(1 - span(ms, 0, 900), span(ms, END, 500)), L = 12;
  ctx.strokeStyle = ms >= SNAP ? C.lime : rgba(C.text, 0.5); ctx.lineWidth = 1.5;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = s.px + s.pw / 2 + sx * (s.pw / 2 + pad), y = s.py + s.ph / 2 + sy * (s.ph / 2 + pad);
    ctx.beginPath(); ctx.moveTo(x - sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * L); ctx.stroke();
  }
}

function prompt(ctx, s, ms) {
  const x = s.px, y = s.py + s.ph + (s.wide ? 24 : 18), meter = span(ms, 200, 1700);
  const hold = 1 - span(ms, SNAP - 200, 200), froze = span(ms, SNAP, 250) * (1 - span(ms, END, 400));
  if (hold > 0) {
    ctx.globalAlpha = hold;
    label(ctx, 'HOLD STILL', x, y, C.mute, 'left', s.wide ? 10 : 9);
    const mx = s.wide ? x + 80 : x, my = s.wide ? y : y + 14;
    roundRect(ctx, mx, my - 1.5, 60, 3, 1.5); ctx.fillStyle = rgba(C.text, 0.1); ctx.fill();
    if (meter > 0.02) {
      roundRect(ctx, mx, my - 1.5, 60 * meter, 3, 1.5); ctx.fillStyle = rgba(C.text, 0.55); ctx.fill();
    }
  }
  if (froze > 0) {
    ctx.globalAlpha = froze;
    if (s.wide) label(ctx, 'FROZEN · YOU CAN PUT IT DOWN', x, y, C.lime);
    else ['FROZEN', 'YOU CAN PUT IT DOWN'].forEach((l, j) => label(ctx, l, x, y + j * 14, C.lime, 'left', 9));
  }
  ctx.globalAlpha = 1;
}

function checklist(ctx, s, ms) {
  const { cx, cy, cw, rowH, wide } = s, out = 1 - span(ms, END, 400), top = cy + (wide ? 26 : 20);
  const sz = cw >= 215 ? 10 : 9;
  label(ctx, 'FIELDS', cx, cy, C.mute, 'left', 9);
  const k = P.findIndex(p => ms >= p && ms < p + PASS);
  if (k >= 0) label(ctx, `PASS ${k + 1}`, cx + cw, cy, C.mute, 'right', 9);
  AGREE.forEach((ok, i) => {
    const y = top + i * rowH, done = span(ms, SETTLE + i * 120, 250) * out, col = ok ? C.lime : C.amber;
    label(ctx, `FIELD ${i + 1}`, cx, y, done > 0.5 ? col : C.mute, 'left', sz);
    P.forEach((p, j) => {
      const x = cx + (sz === 10 ? 60 : 56) + j * 14;
      ctx.strokeStyle = rgba(C.text, 0.2); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.stroke();
      if (ms < p + PASS * (i + 0.5) / 6 || out <= 0) return;
      ctx.globalAlpha = out;
      const c = done > 0.5 ? col : rgba(C.text, 0.7);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7);
      if (j === 1 && !ok) { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke(); }
      else { ctx.fillStyle = c; ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    if (done <= 0) return;
    ctx.globalAlpha = done;
    const text = ok ? 'CONFIRMED' : 'NOT READ · REPORTED';
    if (wide) label(ctx, text, cx + (sz === 10 ? 88 : 84), y, col, 'left', sz);
    else label(ctx, text, cx, y + 12, col, 'left', 9);
    ctx.globalAlpha = 1;
  });
  const sy = top + 5 * rowH + 36, sum = span(ms, SUM, 300) * out;
  ctx.fillStyle = rgba(C.text, 0.1); ctx.fillRect(cx, sy - 16, cw, 1);
  if (sum <= 0) return;
  ctx.globalAlpha = sum;
  const text = `${AGREE.filter(Boolean).length} CONFIRMED · ${AGREE.filter(a => !a).length} REPORTED`;
  (s.split ? text.split(' · ') : [text]).forEach((l, j) => label(ctx, l, cx, sy + j * 12, C.text, 'left', 9));
  ctx.globalAlpha = 1;
}

export function frame(ctx, w, h, t, s) {
  ctx.clearRect(0, 0, w, h);
  const ms = t % CYCLE;
  panel(ctx, s, ms);
  prompt(ctx, s, ms);
  checklist(ctx, s, ms);
}
