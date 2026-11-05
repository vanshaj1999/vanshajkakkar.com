import { C, rgba, label, roundRect, ease } from './pal.js';

const CYCLE = 10000, ENTER = 900, ROUTE = 1020, LANE = 1300, OUT = 250;
const SOFT = 0.5, HARD = 0.76, RESET = 9400;
export const STILL = 7700;

const Q = [
  [100, 'A', 0], [800, 'B', 0], [1500, 'B', 1], [2200, 'A', 0], [2900, 'B', 0], [3600, 'C', 1],
  [4300, 'A', 0], [5000, 'C', 0], [5700, 'A', 0], [6400, 'B', 0], [7100, 'C', 1], [7800, 'A', 0],
];

// Spend moves only as calls land, so the cap trips on a real call and holds later large calls.
function plan() {
  const hot = new Set();
  const pills = Q.map(([at, th, long]) => {
    const sticky = !long && hot.has(th);
    if (long) hot.add(th);
    return { at, th, long, sticky, big: long || sticky, cost: long || sticky ? 0.18 : 0.025 };
  });
  let sum = 0, pause = Infinity;
  for (const q of pills) if ((sum += q.cost) >= HARD) { pause = q.at + ROUTE + LANE; break; }
  for (const q of pills) {
    q.lane = !q.big ? 0 : q.at + ROUTE >= pause ? 2 : 1;
    const dest = q.lane === 2 ? 'PAUSED' : !q.big ? 'SMALL' : q.sticky ? 'STAYS LARGE' : 'LARGE';
    q.log = `${q.th} · ${q.long ? 'LONG' : 'SHORT'} · ${dest}`;
  }
  return { pills, pause };
}
const P = plan();

export function init(w, h) {
  const wide = w >= 460, top = wide ? 46 : 52, x1 = w - 14;
  const barY = h - (wide ? 22 : 18), searchY = barY - (wide ? 48 : 40);
  const ys = [top + (wide ? 22 : 16), searchY - (wide ? 52 : 40)];
  const rx = Math.round(w * 0.34), bend = wide ? 56 : 36, sx = rx + bend;
  return { wide, barY, searchY, ys, ry: (ys[0] + ys[1]) / 2, rx, bend, sx, x1,
    gate: Math.round(sx + (x1 - sx) * 0.3), pw: wide ? [20, 42] : [16, 32], bx0: wide ? 66 : 58 };
}

function lanePos(s, i, d) {
  const dy = s.ys[i] - s.ry, l1 = Math.hypot(s.bend, dy);
  if (d >= l1) return [s.sx + d - l1, s.ys[i]];
  const u = d / l1, v = 1 - u;
  return [s.rx + s.bend * (1.5 * u * v + u * u * u), s.ry + dy * (3 * v * u * u + u * u * u)];
}

function pill(ctx, s, q, age) {
  if (age < 0) return;
  const pw = s.pw[q.long], lane = Math.min(q.lane, 1), held = q.lane === 2;
  let x = s.rx, y = s.ry, a = ease(age / 200), col = C.text;
  if (age < ENTER) x = 14 + pw / 2 + (s.rx - 14 - pw / 2) * (age / ENTER);
  else if (age >= ROUTE) {
    const l1 = Math.hypot(s.bend, s.ys[lane] - s.ry), end = l1 + s.x1 - 12 - pw / 2 - s.sx;
    const stop = held ? l1 + s.gate - 9 - pw / 2 - s.sx : end;
    [x, y] = lanePos(s, lane, Math.min(stop, end * (age - ROUTE) / LANE));
    col = held ? C.grey : C.lime;
    a = 1 - ease((age - ROUTE - LANE * stop / end - (held ? 500 : 0)) / (held ? 400 : OUT));
    if (a <= 0) return;
  }
  ctx.globalAlpha = a;
  roundRect(ctx, x - pw / 2, y - 5.5, pw, 11, 5.5);
  ctx.fillStyle = C.panel; ctx.fill(); ctx.fillStyle = rgba(col, 0.12); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(col, 0.8); ctx.stroke();
  label(ctx, q.th, q.long ? x - pw / 2 + 8 : x, y + 0.5, col, 'center', 8);
  ctx.globalAlpha = 1;
}

function path(ctx, s, i, dash) {
  const mx = s.rx + s.bend / 2;
  ctx.setLineDash(dash ? [3, 4] : []);
  ctx.beginPath(); ctx.moveTo(s.rx, s.ry);
  ctx.bezierCurveTo(mx, s.ry, mx, s.ys[i], s.sx, s.ys[i]); ctx.lineTo(s.x1 - 4, s.ys[i]);
  ctx.stroke(); ctx.setLineDash([]);
}

function end(ctx, s, y, text, col, tcol) {
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(s.x1 - 3.5, y, 3.5, 0, 7); ctx.stroke();
  label(ctx, text, s.x1, y - 13, tcol, 'right', 9);
}

function spend(ctx, s, ms) {
  let f = 0;
  for (const q of P.pills) if (q.lane < 2) f += q.cost * ease((ms - q.at - ROUTE - LANE) / 400);
  f = Math.min(1, f) * (1 - ease((ms - RESET) / 500));
  const bw = s.x1 - s.bx0, y = s.barY, band = f >= HARD ? 2 : f >= SOFT ? 1 : 0;
  label(ctx, 'SPEND', 14, y, C.mute);
  roundRect(ctx, s.bx0, y - 2, bw, 4, 2); ctx.fillStyle = rgba(C.text, 0.08); ctx.fill();
  roundRect(ctx, s.bx0, y - 2, bw * f, 4, 2); ctx.fillStyle = band ? C.amber : C.lime; ctx.fill();
  ctx.fillStyle = rgba(C.text, 0.12);
  for (const b of [SOFT, HARD]) ctx.fillRect(Math.round(s.bx0 + bw * b), y - 6, 1, 12);
  const tone = i => (i !== band ? C.mute : i ? C.amber : C.text);
  label(ctx, 'NORMAL', s.bx0, y - 13, tone(0), 'left', 9);
  label(ctx, 'SOFT', s.bx0 + bw * SOFT + 4, y - 13, tone(1), 'left', 9);
  label(ctx, 'HARD PAUSE', s.x1, y - 13, tone(2), 'right', 9);
}

export function frame(ctx, w, h, t, s) {
  ctx.clearRect(0, 0, w, h);
  const ms = t % CYCLE;
  const held = ease((ms - P.pause) / 300) * (1 - ease((ms - RESET) / 300)), off = held > 0.5;

  // This caption wraps to two lines on a narrow panel, so the status sits below it.
  if (s.wide) label(ctx, 'EVERY DECISION LOGGED', w - 14, 17, C.mute, 'right');
  else label(ctx, 'EVERY DECISION LOGGED', 14, 48);

  ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.text, 0.1);
  ctx.beginPath(); ctx.moveTo(14, s.ry); ctx.lineTo(s.rx, s.ry);
  ctx.moveTo(14, s.searchY); ctx.lineTo(s.x1 - 4, s.searchY); ctx.stroke();
  path(ctx, s, 0, false); path(ctx, s, 1, off);
  end(ctx, s, s.ys[0], 'SMALL MODEL', C.lime, C.mute);
  end(ctx, s, s.ys[1], 'LARGE MODEL', off ? C.grey : C.lime, off ? C.grey : C.mute);
  end(ctx, s, s.searchY, 'SEARCH', C.lime, off ? C.lime : C.mute);
  ctx.globalAlpha = held; ctx.fillStyle = C.mute;
  ctx.fillRect(s.gate - 3, s.ys[1] - 5, 2, 10); ctx.fillRect(s.gate + 1, s.ys[1] - 5, 2, 10);
  label(ctx, 'PAUSED', s.gate, s.ys[1] - 13, C.mute, 'center', 9);

  for (let u = (t % 420) / 2600; u < 1; u += 420 / 2600) {
    ctx.globalAlpha = Math.min(1, u * 8, (1 - u) * 8); ctx.fillStyle = C.lime;
    ctx.beginPath(); ctx.arc(14 + (s.x1 - 26) * u, s.searchY, 2, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  const done = [];
  for (const q of P.pills) for (const age of [ms - q.at, ms + CYCLE - q.at]) {
    pill(ctx, s, q, age);
    if (age >= ROUTE) done.push([age - ROUTE, q]);
  }
  done.sort((a, b) => a[0] - b[0]);
  roundRect(ctx, s.rx - 8, s.ry - 8, 16, 16, 4);
  ctx.fillStyle = C.ink; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(C.lime, 1 - 0.4 * ease(done[0][0] / 300));
  ctx.stroke();
  label(ctx, 'ROUTER', s.rx - 14, s.ry + 15, C.mute, 'right', 9);

  const lh = s.wide ? 15 : 12, lx = s.sx + (s.wide ? 16 : 10), slide = 1 - ease(done[0][0] / 250);
  done.slice(0, 4).forEach(([, q], i) => {
    ctx.globalAlpha = i === 0 ? 1 - slide : [1, 0.7, 0.45, 0.45 * slide][i];
    const col = q.lane === 2 ? C.mute : q.sticky ? C.lime : C.text;
    label(ctx, q.log, lx, s.ry + lh * (i - 1 - slide), col, 'left', s.x1 - lx < 150 ? 8 : 9);
  });
  ctx.globalAlpha = 1;
  spend(ctx, s, ms);
}
