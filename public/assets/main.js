import { runFigs } from './figs/run.js';
import { createField } from './field.js';
import { createAgent } from './agent.js';
import { initCvForm } from './cv.js';

const nav = document.getElementById('nav');
new IntersectionObserver(([e]) => nav.classList.toggle('solid', !e.isIntersecting), {
  rootMargin: '-60px 0px 0px 0px',
}).observe(document.getElementById('top'));

runFigs();
initCvForm();

fetch('/assets/field.json')
  .then(r => r.json())
  .then(data => {
    const answers = new Set(data.dots.map(d => d.id)).size;
    document.getElementById('field-count').textContent =
      `${data.dots.length} sentences · ${answers} answers · ${data.areas.length} areas`;
    const field = createField(document.getElementById('field'), data, document.getElementById('readout'));
    createAgent(field);
  });
