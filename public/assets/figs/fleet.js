import { C, rgba, label, roundRect, ease } from './pal.js';

const N = 8, CYCLE = 3200, SEND = 300, ARRIVE = 1100;
export const STILL = CYCLE + 700;

const isPause = k => k % 4 === 3;

export function init(w, h) {
  const cx = w / 2, cy = h - 58;
  const R = Math.min(w * 0.42, (cy - 70) / 0.78);
  const sets = Array.from({ length: N }, (_, i) => {
    const a = Math.PI * (1.08 + (i / (N - 1)) * 0.84);
    return { x: cx + Math.cos(a) * R, y: cy - 14 + Math.sin(a) * R * 0.78 };
  });
  return { cx, cy, sets };
}

// Film time only advances between a PLAY arriving and the next command arriving.
function filmMs(t) {
  if (t < ARRIVE) return 0;
  const j = Math.floor((t - ARRIVE) / CYCLE);
  const plays = j - Math.floor(j / 4);
  return plays * CYCLE + (isPause(j) ? 0 : t - ARRIVE - j * CYCLE);
}

function headset(ctx, x, y, fill) {
  roundRect(ctx, x - 15, y - 8, 30, 16, 7);
  ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.arc(x - 6, y, 3.2, 0, 7); ctx.arc(x + 6, y, 3.2, 0, 7); ctx.fill();
}

export function frame(ctx, w, h, t, s) {
  ctx.clearRect(0, 0, w, h);
  const k = Math.floor(t / CYCLE), ms = t % CYCLE;
  const cmdPause = isPause(k);
  const arrived = ms >= ARRIVE;
  const showPause = arrived ? cmdPause : k === 0 || isPause(k - 1);
  const cmdColour = cmdPause ? C.grey : C.lime;

  if (w >= 460) label(ctx, 'NO SERVER · NO SIGNAL', w - 14, 17, C.mute, 'right');
  else label(ctx, 'NO SERVER · NO SIGNAL', 14, 36);

  for (const p of s.sets) {
    ctx.strokeStyle = rgba(C.text, 0.08); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s.cx, s.cy - 14); ctx.lineTo(p.x, p.y); ctx.stroke();
    if (ms > SEND && ms < ARRIVE) {
      const q = ease((ms - SEND) / (ARRIVE - SEND));
      const px = s.cx + (p.x - s.cx) * q, py = s.cy - 14 + (p.y - s.cy + 14) * q;
      ctx.fillStyle = cmdColour;
      ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 7); ctx.fill();
    }
  }

  const flash = arrived ? Math.max(0, 1 - (ms - ARRIVE) / 600) : 0;
  for (const p of s.sets) {
    if (flash > 0 && !showPause) {
      ctx.fillStyle = rgba(C.lime, 0.18 * flash);
      ctx.beginPath(); ctx.arc(p.x, p.y, 16 + 10 * (1 - flash), 0, 7); ctx.fill();
    }
    headset(ctx, p.x, p.y, showPause ? C.grey : C.lime);
  }

  const glow = ms < SEND + 200 ? 1 - ms / (SEND + 200) : 0;
  roundRect(ctx, s.cx - 24, s.cy - 14, 48, 30, 5);
  ctx.fillStyle = C.ink; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = glow > 0 ? rgba(C.lime, 0.5 + glow / 2) : rgba(C.lime, 0.6);
  ctx.stroke();
  if (ms < 1500) label(ctx, cmdPause ? 'PAUSE' : 'PLAY', s.cx, s.cy - 30, cmdColour, 'center');

  const f = Math.floor(filmMs(t) / 1000);
  const tc = `${String(Math.floor(f / 60)).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`;
  label(ctx, 'TABLET', s.cx, s.cy + 30, C.mute, 'center');
  label(ctx, `FILM ${tc} · ${showPause ? 'PAUSED' : 'PLAYING'} ON EVERY HEADSET`, s.cx, s.cy + 46,
    showPause ? C.mute : C.lime, 'center');
}
