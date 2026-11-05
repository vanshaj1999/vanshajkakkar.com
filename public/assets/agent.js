import { QUESTIONS } from './questions.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SUGGESTIONS = [
  'What has he built?',
  'What has he done with cloud computing?',
  'How does he keep model costs down?',
  'Tell me about his computer vision work',
];

const LABELS = {
  pending: 'Looking through my work',
  answered: 'From my written answers',
  profile: 'From my general profile, no close match',
  refused: "I don't know",
  control: 'A limit on this session',
  error: "Couldn't reach the agent",
};

const ERROR_TEXT = "Couldn't reach the agent just now. You can email me at Vanshaj.kakkar@gmail.com.";
const STATE = { cache: 'answered', model: 'profile', refusal: 'refused', control: 'control' };

// The text has passed through a model, so it is built node by node and never trusted as markup.
function emphasise(target, text) {
  String(text).split(/\*\*/).forEach((part, i) => {
    if (!part) return;
    if (i % 2) { const b = document.createElement('strong'); b.textContent = part; target.appendChild(b); }
    else target.appendChild(document.createTextNode(part));
  });
}

function render(el, text) {
  el.textContent = '';
  let list = null;
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.charAt(0) === '-') {
      if (!list) { list = document.createElement('ul'); el.appendChild(list); }
      const li = document.createElement('li');
      emphasise(li, t.replace(/^-\s*/, ''));
      list.appendChild(li);
    } else {
      list = null;
      const p = document.createElement('p');
      emphasise(p, t);
      el.appendChild(p);
    }
  }
}

export function createAgent(field) {
  const form = document.getElementById('ask');
  const input = document.getElementById('ask-input');
  const send = document.getElementById('ask-send');
  const chips = document.getElementById('ask-chips');
  const panel = document.getElementById('answer');
  const stateEl = document.getElementById('answer-state');
  const qEl = document.getElementById('answer-q');
  const aEl = document.getElementById('answer-a');
  let session = null, busy = false, timer = 0;

  function show(state, question) {
    panel.hidden = false;
    stateEl.className = `answer-state ${state}`;
    stateEl.textContent = LABELS[state];
    qEl.textContent = question;
  }

  function stream(text) {
    clearTimeout(timer);
    const str = String(text);
    if (reduced) { render(aEl, str); return; }
    const byLine = str.indexOf('\n-') !== -1;
    const parts = byLine ? str.split('\n') : str.split(' ');
    let n = 0;
    (function step() {
      render(aEl, parts.slice(0, n).join(byLine ? '\n' : ' '));
      if (n++ < parts.length) timer = setTimeout(step, byLine ? 110 : 18);
    })();
  }

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    busy = true; send.disabled = true;
    show('pending', q);
    aEl.textContent = '';
    if (innerWidth < 900) panel.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, session }),
      });
      const d = await r.json();
      if (d.session) session = d.session;
      const state = STATE[d.source] || 'error';
      if (state !== 'control') field.focus(d.near || [], state);
      show(state, q);
      stream(state === 'error' ? ERROR_TEXT : d.answer);
    } catch {
      field.focus([], 'error');
      show('error', q);
      render(aEl, ERROR_TEXT);
    } finally {
      busy = false; send.disabled = false;
    }
  }

  for (const s of SUGGESTIONS) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = s;
    b.addEventListener('click', () => { input.value = s; ask(s); });
    chips.appendChild(b);
  }

  field.onPick = id => {
    const q = QUESTIONS[id];
    if (q) { input.value = q; ask(q); }
  };

  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  document.getElementById('answer-x').addEventListener('click', () => {
    clearTimeout(timer);
    panel.hidden = true;
    field.clear();
    input.focus({ preventScroll: true });
  });

  const jump = e => {
    e.preventDefault();
    document.getElementById('top').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    setTimeout(() => input.focus({ preventScroll: true }), reduced ? 0 : 450);
  };
  document.querySelectorAll('a[href="#ask"], a[href="#demo"]').forEach(a => a.addEventListener('click', jump));
  if (location.hash === '#ask' || location.hash === '#demo') input.focus();
}
