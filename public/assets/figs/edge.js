import { C, rgba, label, roundRect, ease } from './pal.js';

const T = 700, K = 5, CYCLE = T * K * 2;
export const STILL = T * 6.1;

const mod = n => ((n % K) + K) % K;
const missed = n => mod(n) === 1 || mod(n) === 3;

export function init(w, h) {
  const wide = w >= 460, P = Math.max(34, Math.min(52, w * 0.085));
  const camX = wide ? 30 : 26, xs = camX + 20;
  const pw = wide ? 104 : 54, px = w - 14 - pw, xe = px - 8;
  const cs = wide ? 34 : 24, chipX = Math.round(xs + (xe - xs) * 0.44);
  return {
    wide, P, fw: P * 0.54, fh: P * 0.4, camX, xs, xe, pw, ph: pw * 0.64, px, cs, chipX,
    lanes: [0.27, 0.66].map(f => 30 + (h - 30) * f), lab: (h - 30) * 0.13,
    tagL: chipX + cs / 2 + 32, tagR: px - 32,
  };
}

function shot(ctx, x, y, fw, fh, n, ink, box) {
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.text, 0.2);
  ctx.strokeRect(x - fw / 2, y - fh / 2, fw, fh);
  const fx = x + (mod(n) - 2) * fw * 0.09, r = fh * 0.13, hy = y - fh * 0.14;
  ctx.fillStyle = ctx.strokeStyle = ink;
  ctx.beginPath(); ctx.arc(fx, hy, r, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx, hy + r); ctx.lineTo(fx, y + fh * 0.32); ctx.stroke();
  if (!box) return;
  ctx.strokeStyle = box;
  ctx.strokeRect(fx - fh * 0.3, y - fh * 0.36, fh * 0.6, fh * 0.73);
}

function camera(ctx, x, y, flash) {
  ctx.lineWidth = 1; ctx.strokeStyle = C.mute;
  roundRect(ctx, x - 12, y - 7, 24, 15, 3); ctx.stroke();
  ctx.strokeRect(x - 7, y - 10, 6, 3);
  ctx.beginPath(); ctx.arc(x, y + 0.5, 4, 0, 7); ctx.stroke();
  ctx.fillStyle = rgba(C.text, 0.15 + 0.7 * flash);
  ctx.beginPath(); ctx.arc(x, y + 0.5, 1.8, 0, 7); ctx.fill();
}

// Pins are full crossing lines; the filled body then covers all but the stubs.
function chip(ctx, x, y, cs, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
  for (const o of [-cs / 4, 0, cs / 4]) {
    ctx.moveTo(x + o, y - cs / 2 - 4); ctx.lineTo(x + o, y + cs / 2 + 4);
    ctx.moveTo(x - cs / 2 - 4, y + o); ctx.lineTo(x + cs / 2 + 4, y + o);
  }
  ctx.stroke();
  roundRect(ctx, x - cs / 2, y - cs / 2, cs, cs, 3);
  ctx.fillStyle = C.ink; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.text, 0.1);
  ctx.strokeRect(x - cs / 4, y - cs / 4, cs / 2, cs / 2);
}

function dot(ctx, x, y, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
}

function browser(ctx, s, y, n, box) {
  const x = s.px, top = y - s.ph / 2;
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.text, 0.14);
  roundRect(ctx, x, top, s.pw, s.ph, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, top + 9); ctx.lineTo(x + s.pw, top + 9); ctx.stroke();
  ctx.fillStyle = rgba(C.text, 0.25);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.arc(x + 6 + i * 4.5, top + 4.5, 1.1, 0, 7); ctx.fill();
  }
  shot(ctx, x + s.pw / 2, top + 9 + (s.ph - 9) / 2, s.pw - 14, s.ph - 18, n, C.mute, box);
}

export function frame(ctx, w, h, t, s) {
  ctx.clearRect(0, 0, w, h);
  const u = (t % CYCLE) / T, f = u - Math.floor(u), span = (s.xe - s.xs) / s.P;

  s.lanes.forEach((y, li) => {
    const keep = li === 1, tags = [];
    let flash = 0, fn = 0;
    label(ctx, keep ? 'PERSISTENT SESSION' : 'PER-SHOT ACTIVATION', 14, y - s.lab);
    ctx.strokeStyle = rgba(C.text, 0.08); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s.xs, y); ctx.lineTo(s.px, y); ctx.stroke();

    for (let n = Math.ceil(u - span); n <= u; n++) {
      const x = s.xs + (u - n) * s.P, miss = !keep && missed(n), out = x > s.chipX;
      const d = Math.abs(x - s.chipX) / (s.cs / 2);
      if (d < 1) { flash = 1 - d; fn = n; }
      const done = out && !miss, box = keep ? C.lime : rgba(C.lime, 0.6);
      ctx.globalAlpha = ease((x - s.xs) / 14) * ease((s.xe - x) / 14);
      shot(ctx, x, y, s.fw, s.fh, n, done ? C.mute : C.grey, done ? box : null);
      ctx.globalAlpha = 1;
      if (out && miss) tags.push(x);
    }

    chip(ctx, s.chipX, y, s.cs, keep ? rgba(C.lime, 0.7) : C.grey);
    if (keep) {
      dot(ctx, s.chipX, y, C.lime);
      label(ctx, 'SESSION OPEN', s.chipX, y + s.cs / 2 + 14, C.lime, 'center', 9);
    } else {
      dot(ctx, s.chipX, y, C.grey);
      if (flash > 0) {
        const col = missed(fn) ? C.amber : C.lime;
        dot(ctx, s.chipX, y, rgba(col, flash));
        roundRect(ctx, s.chipX - s.cs / 2, y - s.cs / 2, s.cs, s.cs, 3);
        ctx.strokeStyle = rgba(col, flash * 0.8); ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    camera(ctx, s.camX, y, f < 0.25 ? 1 - f / 0.25 : 0);
    const last = Math.floor(u - span);
    browser(ctx, s, y, last, keep ? C.lime : missed(last) ? null : rgba(C.lime, 0.6));

    for (const x of tags) {
      ctx.globalAlpha = ease((x - s.tagL) / 10 + 1) * ease((s.tagR - x) / 8);
      label(ctx, 'NOT READY', x, y - s.fh / 2 - 9, C.amber, 'center', 9);
      ctx.globalAlpha = 1;
    }
  });

  const by = h - 18, sz = s.wide ? 10 : 9;
  label(ctx, 'CAMERA', s.camX - 12, by, C.grey, 'left', sz);
  label(ctx, 'ACCELERATOR', s.chipX, by, C.grey, 'center', sz);
  label(ctx, 'BROWSER STREAM', w - 14, by, C.grey, 'right', sz);
}
