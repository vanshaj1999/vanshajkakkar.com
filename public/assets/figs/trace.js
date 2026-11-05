import { C, rgba, label, roundRect, ease } from './pal.js';

const LEAD = 400, FILL = 3200, HOLD = 1500, FADE = 600, CYCLE = 6000;
export const STILL = LEAD + FILL + 800;

const ROWS = [
  { k: 'PHONE', a: 0, b: 0.16, note: 'THE VISITOR’S PHONE IS THE MICROPHONE',
    short: 'THE VISITOR’S PHONE IS THE MIC' },
  { k: 'SPEECH', a: 0.06, b: 0.26, note: 'STREAMING SPEECH TO TEXT' },
  { k: 'API', a: 0.18, b: 0.95, note: 'TOOL CALLS NEED A 60-SECOND SINGLE-AUDIENCE TOKEN',
    short: '60-SECOND SINGLE-AUDIENCE TOKEN' },
  { k: 'RETRIEVAL', a: 0.3, b: 0.46, note: 'DENSE VECTORS AND FULL-TEXT RANKING, FUSED',
    short: 'DENSE AND FULL TEXT, FUSED' },
  { k: 'MODEL', a: 0.44, b: 0.76, note: 'ANSWERS FROM THE DOCUMENTS, EXCEPT ON SAFETY',
    short: 'FROM THE DOCUMENTS, EXCEPT ON SAFETY' },
  { k: 'VOICE', a: 0.58, b: 0.9, note: 'OUR OWN VOICE SPEAKS BACK' },
  { k: 'AVATAR', a: 0.7, b: 0.97, note: 'VIDEO ONLY, RENDERED BY THE VENDOR',
    short: 'VIDEO ONLY, BY THE VENDOR', vendor: true },
  { k: 'CLOUD', a: 0, b: 1, note: 'ALL OF IT ON CLOUD INFRASTRUCTURE WE BUILT',
    short: 'ON CLOUD INFRASTRUCTURE WE BUILT' },
];
const LAST = ROWS.length - 1, ADV = 0.66;

export function init(w, h) {
  const wide = w >= 460, size = wide ? 10 : 9;
  const top = wide ? 46 : 54, capY = h - 20, bottom = capY - 24;
  return { wide, size, top, bottom, capY, rh: (bottom - top) / ROWS.length,
    x0: wide ? 96 : 78, x1: w - 14, bh: wide ? 6 : 5 };
}

// The note follows the most recently started span, then the root once every leaf has closed.
function active(p) {
  if (p >= ROWS[LAST - 1].b) return LAST;
  let i = 0;
  for (let j = 1; j < LAST; j++) if (ROWS[j].a <= p) i = j;
  return i;
}

function bar(ctx, x0, x1, y, bh, hollow) {
  if (x1 - x0 < 2) return;
  if (!hollow) { roundRect(ctx, x0, y - bh / 2, x1 - x0, bh, 1.5); ctx.fill(); return; }
  roundRect(ctx, x0 + 0.5, y - bh / 2 + 0.5, x1 - x0 - 1, bh - 1, 1.5);
  ctx.stroke();
}

export function frame(ctx, w, h, t, s) {
  ctx.clearRect(0, 0, w, h);
  const ms = t % CYCLE;
  const p = Math.min(1, Math.max(0, (ms - LEAD) / FILL));
  const fade = 1 - ease((ms - LEAD - FILL - HOLD) / FADE);
  const X = q => s.x0 + (s.x1 - s.x0) * q;
  const rowY = i => s.top + s.rh * (i + 0.5);
  const act = active(p);

  const status = 'LITE MODE · VENDOR RENDERS VIDEO ONLY';
  if (s.wide) label(ctx, status, w - 14, 17, C.mute, 'right');
  else label(ctx, status, 14, 36);

  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const gx = Math.round(X(i / 10)) + 0.5;
    ctx.strokeStyle = rgba(C.text, i % 5 ? 0.06 : 0.1);
    ctx.beginPath(); ctx.moveTo(gx, s.top - 6); ctx.lineTo(gx, s.bottom); ctx.stroke();
  }
  if (p > 0 && p < 1) {
    const px = Math.round(X(p)) + 0.5;
    ctx.strokeStyle = rgba(C.text, 0.12);
    ctx.beginPath(); ctx.moveTo(px, s.top - 6); ctx.lineTo(px, s.bottom); ctx.stroke();
  }

  ROWS.forEach((r, i) => {
    const y = rowY(i), on = i === act && fade > 0 && ms > 0;
    label(ctx, r.k, 14, y, on ? C.text : C.mute, 'left', s.size);
    if (p <= r.a) return;
    const e = Math.min(p, r.b);
    ctx.globalAlpha = fade;
    ctx.fillStyle = ctx.strokeStyle = r.vendor ? C.grey : C.lime;
    if (r.k === 'RETRIEVAL') {
      const m = r.a + (r.b - r.a) * 0.55, g = s.bh / 2;
      bar(ctx, X(r.a), X(Math.min(e, m)), y - g, 2);
      bar(ctx, X(r.a), X(Math.min(e, m)), y + g, 2);
      if (e > m) bar(ctx, X(m), X(e), y, s.bh);
    } else bar(ctx, X(r.a), X(e), y, s.bh, i === LAST);
    ctx.globalAlpha = 1;
  });

  const r = ROWS[act];
  if (p > 0 && p < 1) {
    const hx = X(Math.min(p, r.b)), hy = rowY(act), rad = s.wide ? 3 : 2.6;
    ctx.fillStyle = C.panel;
    ctx.beginPath(); ctx.arc(hx, hy, rad + 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = r.vendor ? C.mute : C.lime;
    ctx.beginPath(); ctx.arc(hx, hy, rad, 0, 7); ctx.fill();
  }

  const room = w - 28, fits = txt => txt.length * s.size * ADV <= room;
  const note = fits(r.note) ? r.note : r.short && fits(r.short) ? r.short : '';
  const since = ms - (act === 0 ? 0 : LEAD + FILL * (act === LAST ? ROWS[LAST - 1].b : r.a));
  ctx.strokeStyle = rgba(C.text, 0.08);
  ctx.beginPath(); ctx.moveTo(14, s.capY - 13.5); ctx.lineTo(w - 14, s.capY - 13.5); ctx.stroke();
  ctx.globalAlpha = Math.min(fade, ease(since / 180));
  if (note) label(ctx, note, 14, s.capY, r.vendor ? C.mute : C.text, 'left', s.size);
  ctx.globalAlpha = 1;
}
