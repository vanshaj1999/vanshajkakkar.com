import { C, rgba, label, roundRect, ease } from './pal.js';

const CYCLE = 7000, ZOOM = 3200, SNAP = 4000, BOX = 4300, CALL = 5400, BACK = 6300;
export const STILL = 2800;

const ROWS = ['DISEASE 1', 'DISEASE 2', 'DISEASE 3', 'HEALTHY'];
const TICK = [0.3, 0.3, 0.3, 0.8];
const FAR = [0.18, 0.22, 0.12, 0.48];
const NEAR = [0.08, 0.74, 0.06, 0.12];
const span = (ms, a, d) => ease((ms - a) / d);

export function init(w, h) {
  const top = 44, room = h - top - 12;
  const pw = Math.round(Math.min(Math.min(room, 250) / 2, w * 0.28)), ph = pw * 2;
  const gap = Math.max(18, w * 0.07), bw = Math.min(300, w - pw - gap - 28), split = bw < 166;
  const rowH = Math.min(38, (room - 93 - (split ? 14 : 0)) / 3), block = 93 + rowH * 3 + (split ? 14 : 0);
  const px = Math.max(14, Math.round((w - pw - gap - bw) / 2)), py = top + (room - ph) / 2;
  const bx = px + pw + gap, by = py + ph / 2 - block / 2;
  const scr = { x: px + 5, y: py + 12, w: pw - 10, h: ph - 24 };
  const rx = scr.w * 0.2, gy = scr.y + scr.h * 0.64;
  const a = { x: scr.x + scr.w * 0.48, y: gy - rx * 0.66, rx, ry: rx * 0.46 };
  const patch = { x: a.x - rx * 0.32, y: a.y - a.ry * 0.1, r: rx * 0.13 };
  const f = { x: a.x + rx * 0.12, y: a.y + rx * 0.05 };
  return { px, py, pw, ph, scr, gy, a, patch, f, bx, bw, by, rowH, split, Z: 2 };
}

function animal(ctx, s) {
  const { x, y, rx, ry } = s.a;
  ctx.strokeStyle = rgba(C.text, 0.2); ctx.lineWidth = rx * 0.11; ctx.lineCap = 'round';
  for (const k of [-0.72, -0.42, 0.42, 0.72]) {
    ctx.beginPath(); ctx.moveTo(x + k * rx, y + ry * 0.5); ctx.lineTo(x + k * rx, s.gy); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x - rx * 0.95, y - ry * 0.3);
  ctx.lineTo(x - rx * 1.06, y + ry * 0.7); ctx.lineWidth = rx * 0.05; ctx.stroke();
  ctx.fillStyle = rgba(C.text, 0.16);
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + rx * 0.96, y - ry * 0.55, rx * 0.3, ry * 0.5, 0.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + rx * 0.86, y - ry * 1.05, rx * 0.12, ry * 0.16, -0.6, 0, 7);
  ctx.fill();
  const p = s.patch;
  ctx.fillStyle = rgba(C.ink, 0.6);
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.arc(p.x + p.r * 0.9, p.y + p.r * 0.5, p.r * 0.7, 0, 7);
  ctx.fill();
}

function phone(ctx, s, ms) {
  const { scr, f, Z } = s;
  const q = span(ms, ZOOM, 800) * (1 - span(ms, BACK, 600)), z = 1 + (Z - 1) * q;
  const F = { x: f.x + (scr.x + scr.w / 2 - f.x) * q, y: f.y + (scr.y + scr.h / 2 - f.y) * q };
  const map = (x, y) => [F.x + (x - f.x) * z, F.y + (y - f.y) * z];

  roundRect(ctx, s.px, s.py, s.pw, s.ph, 14);
  ctx.strokeStyle = rgba(C.text, 0.18); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.save();
  roundRect(ctx, scr.x, scr.y, scr.w, scr.h, 8);
  ctx.fillStyle = C.ink; ctx.fill(); ctx.clip();
  ctx.save();
  ctx.translate(F.x, F.y); ctx.scale(z, z); ctx.translate(-f.x, -f.y);
  ctx.fillStyle = rgba(C.text, 0.03); ctx.fillRect(scr.x - scr.w, s.gy, scr.w * 3, scr.h);
  ctx.strokeStyle = rgba(C.text, 0.1); ctx.lineWidth = 1 / z;
  ctx.beginPath(); ctx.moveTo(scr.x - scr.w, s.gy); ctx.lineTo(scr.x + scr.w * 2, s.gy); ctx.stroke();
  animal(ctx, s);
  const ask = span(ms, 1900, 400) * (1 - span(ms, ZOOM + 300, 500));
  if (ask > 0) {
    ctx.strokeStyle = rgba(C.amber, 0.8 * ask); ctx.lineWidth = 1 / z; ctx.setLineDash([3 / z, 3 / z]);
    ctx.strokeRect(f.x - scr.w / (2 * Z) + 1, f.y - scr.h / (2 * Z) + 1, scr.w / Z - 2, scr.h / Z - 2);
    ctx.setLineDash([]);
  }
  ctx.restore();

  const box = span(ms, BOX, 500) * (1 - span(ms, BACK, 300));
  if (box > 0) {
    const [cx, cy] = map(s.patch.x + s.patch.r * 0.4, s.patch.y + s.patch.r * 0.2), r = s.patch.r * 2.6 * z;
    const l = r * 0.6 * box;
    ctx.strokeStyle = C.lime; ctx.lineWidth = 1.5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cx + sx * r, y = cy + sy * r;
      ctx.beginPath(); ctx.moveTo(x - sx * l, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * l); ctx.stroke();
    }
    ctx.globalAlpha = box; label(ctx, 'LESION', cx - r, cy - r - 9, C.lime, 'left', 9);
    ctx.globalAlpha = 1;
  }
  const flash = Math.max(0, 1 - Math.abs(ms - SNAP) / 250, 1 - ms / 250);
  if (flash > 0) { ctx.fillStyle = rgba(C.text, 0.12 * flash); ctx.fillRect(scr.x, scr.y, scr.w, scr.h); }
  ctx.restore();
  roundRect(ctx, s.px + s.pw * 0.36, s.py + 4, s.pw * 0.28, 3, 1.5);
  ctx.fillStyle = rgba(C.text, 0.18); ctx.fill();
}

function bars(ctx, s, ms) {
  const grow = span(ms, 300, 1000) * (1 - span(ms, BACK, 600)), call = span(ms, BOX + 200, 900);
  label(ctx, 'CLASSIFIER', s.bx, s.by, C.mute, 'left', 9);
  label(ctx, 'THRESHOLD', s.bx + s.bw, s.by, C.mute, 'right', 9);
  ctx.fillStyle = rgba(C.text, 0.6); ctx.fillRect(s.bx + s.bw - 64, s.by - 5, 1.5, 10);
  ROWS.forEach((name, i) => {
    const y = s.by + 26 + i * s.rowH, v = (FAR[i] + (NEAR[i] - FAR[i]) * call) * grow;
    const over = v >= TICK[i];
    label(ctx, name, s.bx, y, over ? C.lime : C.mute, 'left', 9);
    roundRect(ctx, s.bx, y + 11, s.bw, 4, 2); ctx.fillStyle = rgba(C.text, 0.08); ctx.fill();
    if (v > 0.005) {
      roundRect(ctx, s.bx, y + 11, s.bw * v, 4, 2); ctx.fillStyle = over ? C.lime : C.grey; ctx.fill();
    }
    ctx.fillStyle = rgba(C.text, 0.6); ctx.fillRect(s.bx + s.bw * TICK[i] - 0.75, y + 8, 1.5, 10);
  });
  const vy = s.by + 26 + 3 * s.rowH + 43, size = s.bw >= 185 ? 10 : 9;
  const ask = span(ms, 1500, 300) * (1 - span(ms, ZOOM, 300));
  const read = span(ms, SNAP, 300) * (1 - span(ms, CALL - 300, 300));
  const done = span(ms, CALL, 300) * (1 - span(ms, BACK, 300));
  for (const [a, text, col] of [[ask, 'UNCERTAIN · TAKE A CLOSEUP', C.amber], [read, 'READING', C.grey],
    [done, 'DISEASE 2 · CALLED', C.lime]]) {
    if (a <= 0) continue;
    ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(s.bx + 3, vy, 3, 0, 7); ctx.fill();
    const lines = s.split ? text.split(' · ') : [text];
    lines.forEach((l, j) => label(ctx, l, s.bx + 12, vy + j * 14, col, 'left', size));
    ctx.globalAlpha = 1;
  }
  label(ctx, 'ON THE PHONE · NO SIGNAL', s.bx, vy + (s.split ? 38 : 24), C.mute, 'left', 9);
}

export function frame(ctx, w, h, t, s) {
  ctx.clearRect(0, 0, w, h);
  const ms = t % CYCLE;
  phone(ctx, s, ms);
  bars(ctx, s, ms);
}
