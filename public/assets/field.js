import { NARROW, placeDots, anchorsFor, fieldHeight, nearest, focusPoint, emptySpot } from './field-math.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LIME = '200,245,96', AMBER = '255,181,71', GREY = '109,115,107', TEXT = '232,234,227';
const RING_COLOUR = { answered: LIME, profile: AMBER, refused: AMBER, error: GREY };

const trim = s => (s.length > 70 ? s.slice(0, 68).replace(/\s+\S*$/, '') + '…' : s);

export function createField(canvas, data, readout) {
  const host = canvas.parentElement, ctx = canvas.getContext('2d');
  let W = 0, H = 0, FH = 0, ring = 90, pts = [], anchors = [], links = [];
  let q = null, target = null, pointerAt = 0, focus = null, visible = true, shown = '';
  let mode = 'mouse', overField = false, armed = null;
  const t0 = performance.now();

  function roamPoint(t) {
    const nar = W < NARROW;
    const cx = nar ? 0.5 : 0.72, ax = nar ? 0.4 : 0.22;
    return { x: W * (cx + ax * Math.sin(t * 0.00017)), y: FH * (0.5 + 0.36 * Math.sin(t * 0.00029 + 1.3)) };
  }

  function land(f) {
    const pick = f.state === 'answered' ? f.near.slice(0, 1) : f.near;
    const p = f.state === 'refused' || f.state === 'error' ? null : focusPoint(pts, pick);
    if (f.state === 'error') return { x: q.x, y: q.y };
    return p || emptySpot(pts, W < NARROW
      ? { x0: W * 0.1, x1: W * 0.9, y0: 80, y1: FH - 10 }
      : { x0: W * 0.5, x1: W * 0.95, y0: 90, y1: H * 0.55 });
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; FH = fieldHeight(W, H); ring = W < 720 ? 60 : 90;
    canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    pts = placeDots(data.dots, W, H);
    anchors = anchorsFor(W, H);
    links = [];
    for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) links.push([i - 1, i]);
    if (!q) q = roamPoint(0);
    if (focus) Object.assign(focus, land(focus));
    draw(performance.now());
  }

  function updateReadout(near, count) {
    if (focus || !near) {
      readout.classList.remove('on'); canvas.style.cursor = ''; shown = ''; armed = null;
      return;
    }
    const p = pts[near.i], ok = count >= 3, key = `${near.i}${ok}${mode}`;
    armed = ok ? p.id : null;
    canvas.style.cursor = armed && mode === 'mouse' ? 'pointer' : '';
    if (key !== shown) {
      shown = key;
      readout.textContent = '';
      const add = (cls, text, colour) => {
        const s = document.createElement('span');
        s.className = cls; s.textContent = text;
        if (colour) s.style.color = `rgb(${colour})`;
        readout.appendChild(s);
      };
      add('area', data.areas[p.a].label);
      add('s', ok ? trim(p.s) : 'Too little written near here to answer from.');
      const act = mode === 'touch' ? 'Tap again to ask' : 'Click to ask about this';
      add('v', ok ? act : "It would say I don't know", ok ? LIME : AMBER);
    }
    const bw = readout.offsetWidth, bh = readout.offsetHeight;
    const floor = W < NARROW ? FH : H - 12;
    let x = q.x + 18, y = q.y + 16;
    if (x + bw > W - 12) x = q.x - bw - 18;
    if (y + bh > floor) y = Math.min(q.y - bh - 16, floor - bh);
    readout.style.transform = `translate(${Math.max(8, x)}px,${Math.max(64, y)}px)`;
    readout.classList.add('on');
  }

  function draw(now) {
    if (!W || !q) return;
    const t = now - t0;
    const hold = mode === 'touch' ? 6000 : 2000;
    const driven = !focus && target && (still || (mode === 'mouse' && overField) || now - pointerAt < hold);
    let goal = q;
    if (focus) goal = focus;
    else if (driven) goal = target;
    else if (!still) goal = roamPoint(t);
    const k = still ? 1 : focus ? 0.07 : 0.12;
    q = { x: q.x + (goal.x - q.x) * k, y: q.y + (goal.y - q.y) * k };

    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    const hoverNear = !focus ? nearest(pts, q.x, q.y) : null;
    const lead = focus && (focus.state === 'answered' || focus.state === 'profile') && focus.near[0];
    const thread = hoverNear && hoverNear.d < ring ? pts[hoverNear.i].id : lead && lead.id;
    if (thread) {
      ctx.strokeStyle = `rgba(${LIME},.22)`;
      ctx.beginPath();
      for (const [a, b] of links) {
        if (pts[a].id === thread) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
      }
      ctx.stroke();
    }

    ctx.font = '400 10px "Azeret Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    const closest = hoverNear ? pts[hoverNear.i].a : nearest(anchors, q.x, q.y).i;
    anchors.forEach((an, i) => {
      if (W < NARROW && i !== closest) return;
      const near = Math.max(0, 1 - Math.hypot(an.x - q.x, an.y - q.y) / (an.r + 160));
      ctx.fillStyle = `rgba(${TEXT},${0.32 + 0.5 * near})`;
      const x = Math.min(Math.max(an.x, 70), W - 70);
      ctx.fillText(data.areas[i].label.toUpperCase(), x, an.y - an.r - 14);
    });

    const lit = focus ? new Set(focus.state === 'answered' ? focus.near.slice(0, 1).map(n => n.id)
      : focus.state === 'profile' ? focus.near.map(n => n.id) : []) : null;
    const inRing = [];
    pts.forEach((p, i) => {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!focus && d < ring) inRing.push(p);
      const on = lit && lit.has(p.id);
      ctx.fillStyle = on ? `rgb(${LIME})` : `rgba(${TEXT},${0.58 + (still ? 0 : 0.14 * Math.sin(t * 0.0012 + i))})`;
      const r = on ? 2.8 : 1.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    });

    const hits = focus ? pts.filter(p => lit.has(p.id)) : inRing;
    const colour = focus ? RING_COLOUR[focus.state] : inRing.length >= 3 ? LIME : AMBER;
    for (const p of hits) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      ctx.strokeStyle = `rgba(${focus ? LIME : colour},${focus ? 0.35 : Math.max(0.1, 0.7 - d / ring * 0.6)})`;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      if (!focus) { ctx.fillStyle = `rgb(${colour})`; ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, 7); ctx.fill(); }
    }

    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = `rgba(${colour},.45)`;
    ctx.beginPath(); ctx.arc(q.x, q.y, focus ? 26 : ring, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    const core = focus && focus.state === 'error' ? `rgb(${GREY})` : '#fff';
    ctx.fillStyle = core; ctx.strokeStyle = core;
    ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, 7); ctx.fill();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(q.x + dx * 6, q.y + dy * 6); ctx.lineTo(q.x + dx * 12, q.y + dy * 12);
    }
    ctx.stroke();

    updateReadout(driven && overField ? hoverNear : null, inRing.length);
  }

  function loop(now) {
    if (!visible || still) return;
    draw(now);
    requestAnimationFrame(loop);
  }

  const kind = e => (e.pointerType === 'touch' ? 'touch' : 'mouse');
  host.addEventListener('pointerdown', e => { mode = kind(e); });
  host.addEventListener('pointermove', e => {
    if (e.target.closest('.answer, .ask, .chips')) return;
    const r = canvas.getBoundingClientRect();
    mode = kind(e); overField = e.target === canvas;
    target = { x: e.clientX - r.left, y: e.clientY - r.top };
    pointerAt = performance.now();
    if (still) draw(pointerAt);
  });
  host.addEventListener('pointerleave', e => {
    // A lifted finger also fires pointerleave, so only a mouse leaving clears the probe.
    if (kind(e) === 'touch') return;
    target = null; overField = false;
    if (still) draw(performance.now());
  });
  canvas.addEventListener('click', e => {
    if (focus) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (armed && Math.hypot(x - q.x, y - q.y) < ring) { api.onPick?.(armed); return; }
    if (mode !== 'touch' || y > FH) return;
    target = { x, y }; pointerAt = performance.now(); overField = true;
    if (still) draw(pointerAt);
  });
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !still) requestAnimationFrame(loop);
  }).observe(host);
  new ResizeObserver(resize).observe(canvas);

  const api = {
    onPick: null,
    focus(near, state) {
      focus = { near: near || [], state };
      Object.assign(focus, land(focus));
      if (still) { q = { x: focus.x, y: focus.y }; draw(performance.now()); }
    },
    clear() { focus = null; if (still) draw(performance.now()); },
  };
  return api;
}
