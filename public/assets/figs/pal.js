export const C = {
  ink: '#0B0D10', panel: '#111419', rule: '#22262B', text: '#E8EAE3', mute: '#8B918A',
  lime: '#C8F560', amber: '#FFB547', grey: '#6D736B',
};

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function label(ctx, text, x, y, color = C.mute, align = 'left', size = 10) {
  ctx.font = `400 ${size}px "Azeret Mono", ui-monospace, monospace`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export const ease = q => (q < 0 ? 0 : q > 1 ? 1 : q * q * (3 - 2 * q));
