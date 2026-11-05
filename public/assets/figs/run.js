const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

function fit(cv) {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
  const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

async function start(cv) {
  const mod = await import(`./${cv.dataset.fig}.js`);
  let g = fit(cv), state = mod.init(g.w, g.h), on = false;
  const t0 = performance.now();
  const draw = now => mod.frame(g.ctx, g.w, g.h, still ? mod.STILL : now - t0, state);
  const loop = now => { if (!on) return; draw(now); requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => {
    on = e.isIntersecting && !still;
    if (on) requestAnimationFrame(loop); else draw(performance.now());
  }).observe(cv);
  new ResizeObserver(() => {
    g = fit(cv); state = mod.init(g.w, g.h); draw(performance.now());
  }).observe(cv);
}

// Modules load only when their band comes within a screen of view.
export function runFigs(root = document) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { io.unobserve(e.target); start(e.target); }
  }), { rootMargin: '100% 0px' });
  root.querySelectorAll('canvas[data-fig]').forEach(cv => io.observe(cv));
}
