/* Cloudflare Pages Function. The deployed twin of server.mjs.
   Same controls, same cache, same refusal path. State moves from memory to Workers KV
   so counters survive across requests and across isolates.

   Bindings required on the Pages project:
     DEMO_KV            KV namespace
     OPENAI_API_KEY     secret
     DEMO_SECRET        secret, any long random string, signs session tokens
     DEMO_MODEL         plain var, defaults to gpt-5-nano
     TURNSTILE_SECRET   secret

   The governing rule, from research/05-demo-spec.md section 5:
   an attacker gets limited, a visitor never sees a limit, and the site cannot go down.
   Every path below that hits a cap falls back to a cached answer or the prepared refusal.
   None of them returns an error to the visitor.
*/
import corpus from '../../data/answers.json';
import { buildIndex, lexicalScores, isRequestForWork, isConfident, topNear } from '../../lib/retrieval.js';
import { semanticScores, fuse } from '../../lib/semantic.js';

const CFG = {
  maxInputChars: 500,
  maxTurns: 8,
  sessionMs: 3 * 60 * 1000,
  perIpDaily: 3,
  verifiedPool: 17,
  unverifiedPool: 3,
  monthlyBudgetUsd: 15,
  maxOutputTokens: 260,   // an answer longer than this is padding, not detail
  modelTimeoutMs: 10000,
  // gpt-5-nano, USD per token. $0.05 per 1M in, $0.40 per 1M out.
  priceIn: 0.05 / 1e6,
  priceOut: 0.40 / 1e6,

  // Workers AI is billed in neurons, and Cloudflare gives 10,000 a day at no charge.
  // The cap below is deliberately 6,000, not 10,000: it leaves the speech layer its
  // headroom and means a bad day still cannot produce a bill.
  dailyNeurons: 6000,
};

/* The router. Both are free inside the neuron allowance, so this is not a cost decision
   the way the OpenAI tier was, it is a latency one: the small model answers a short,
   plainly worded question just as well and returns faster.

   Prices are neurons per million tokens, from Cloudflare's published table, 27 August 2026.
   At roughly 2,100 input and 400 output tokens per answer that works out at about 23
   neurons on the small model and 138 on the large, so the daily cap is never the binding
   constraint. The per IP and pool limits are. */
const MODELS = {
  small: { id: '@cf/meta/llama-3.2-3b-instruct',        nIn: 4625,  nOut: 30475 },
  large: { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', nIn: 26668, nOut: 204805 },
};

// Escalate on the shape of the question, not on a keyword list. Long questions, questions
// with more than one clause, and comparisons are the ones the small model flattens.
function pickModel(question) {
  const q = question.trim();
  if (q.length > 140) return MODELS.large;
  if ((q.match(/[?]/g) || []).length > 1) return MODELS.large;
  if (/\b(compare|versus|vs\.?|difference|why did|trade.?off|instead of|rather than)\b/i.test(q)) return MODELS.large;
  // Hypotheticals are where a small model starts predicting instead of reporting, which
  // is the one failure this assistant cannot have. Send them to the model that holds the
  // refusal rule under pressure.
  if (/\b(would he|could he|can he|is he (comfortable|able|willing)|how would|what if|do you think)\b/i.test(q)) return MODELS.large;
  return MODELS.small;
}

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}
async function signSession(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}
async function verifySession(secret, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (await hmac(secret, body) !== mac) return null;   // constant-time enough at this size
  try {
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return Date.now() > payload.exp ? null : payload;
  } catch { return null; }
}

/* ---- layer 2, the answer cache ------------------------------------------- */
// The matcher itself lives in lib/retrieval.js so the Node server and this Worker share
// one implementation rather than two copies that drift.
let INDEX = null;
/* Two searches, fused. The keyword half always runs because it is free and instant. The
   embedding half runs when the AI binding is there, and returning null when it is not is
   a normal outcome rather than a failure: the keyword half has to be able to carry the
   search alone, which is what makes the assistant work with no bindings at all. */
async function findAnswer(env, question) {
  if (!INDEX) INDEX = buildIndex(corpus);
  const lex = lexicalScores(INDEX, question);
  const cos = await semanticScores(env, corpus, question);
  const fused = fuse(lex, cos);
  const near = topNear(corpus.answers, fused, lex, cos);

  let bi = -1, bf = 0;
  fused.forEach((f, i) => { if ((lex[i] > 0 || (cos && cos[i] > 0)) && f > bf) { bf = f; bi = i; } });
  if (bi < 0) return { hit: null, near };

  return { hit: isConfident(lex[bi], cos ? cos[bi] : null) ? corpus.answers[bi] : null, near };
}

/* ---- KV counters ---------------------------------------------------------- */
const day = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);

/* Every KV call is wrapped, because the governing rule is that the site cannot go down.
   The free tier allows 1,000 writes a day, and an unguarded put throws a 429 past that,
   which would surface to a visitor as a broken assistant.

   The two directions are deliberately different:
     reads  fail CLOSED. An unreadable budget is treated as spent, so a KV outage cannot
            turn into an uncapped OpenAI bill. The visitor still gets the refusal text,
            which is a real answer, not an error.
     writes fail OPEN and silently. A counter is bookkeeping. Losing one must never cost
            a visitor their answer. */
async function kvRead(kv, key, onFail) {
  try { return Number(await kv.get(key) || 0); } catch { return onFail; }
}
async function kvWrite(kv, key, value, ttl) {
  try { await kv.put(key, String(value), { expirationTtl: ttl }); return true; }
  catch { return false; }
}
async function bump(kv, key, ttl) {
  const n = await kvRead(kv, key, Number.MAX_SAFE_INTEGER) + 1;
  await kvWrite(kv, key, n, ttl);
  return n;
}

/* ---- layer 3, the live model -------------------------------------------------
   Workers AI first, because it is free inside the daily neuron allowance and needs no
   key, no card and no third party. OpenAI is kept as an override for the day a better
   model is worth paying for, and is used only when OPENAI_API_KEY is actually set. */
const SYSTEM = `You answer questions about one engineer's technical work, using only the CONTEXT below.

Rules, in priority order:
1. If the CONTEXT does not contain the answer, say so plainly and stop. Do not infer, do not extrapolate, do not fill a gap with something plausible. Saying "I do not have that" is the correct and expected answer, not a failure.
1a. This applies hardest to hypotheticals. A question of the form "would he", "could he", "is he comfortable with", "how would he handle" is asking you to predict, and the CONTEXT contains evidence, not predictions. Answer with what he has actually done that is closest to the question, say plainly that the rest is not something the site can answer for him, and point the reader at contacting him. Never begin an answer with "He would likely", "This suggests" or "It appears".
2. Never name a client, employer, colleague or product. The context is deliberately anonymous. If asked who he worked for, say that client names are not published and offer what the work was instead.
3. Answer only about this engineer's work. Refuse anything else in one sentence.
4. He is an AI software engineer. Never describe him as a full stack engineer, a web developer or a software engineer without the AI. His focus is AI, machine learning, data science and the cloud those run on.
5. Be short. Three or four sentences of prose, or a lead line and up to four points each starting with "- ". Never both at length. Australian English, and never an em dash.
6. Never pad. No "here are some possible tasks", no generic descriptions of what engineers do in general. If you only have one specific thing, say the one thing.
7. Never invent a number. Only use figures that appear in the CONTEXT, and keep any stated limit attached to the figure it qualifies.`;

function buildContext() {
  return corpus.answers.map(a => `- ${a.a}`).join('\n');
}

// Layer 3a. No key, no bill, same account as the site itself.
async function askWorkersAI(env, question) {
  if (!env.AI) return { ok: false, reason: 'no_binding' };
  const model = pickModel(question);
  try {
    const r = await env.AI.run(model.id, {
      max_tokens: CFG.maxOutputTokens,
      messages: [
        { role: 'system', content: `${SYSTEM}\n\nCONTEXT:\n${buildContext()}` },
        { role: 'user', content: question },
      ],
    });
    const text = (r && (r.response || r.result?.response) || '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    // Estimated rather than measured. Workers AI does not return a token count on every
    // model, and a burn figure that is roughly right and always present beats an exact
    // one that is sometimes missing. Four characters per token is the usual rule.
    const inTok = (SYSTEM.length + buildContext().length + question.length) / 4;
    const neurons = (inTok / 1e6) * model.nIn + (CFG.maxOutputTokens / 1e6) * model.nOut;
    return { ok: true, text, cost: 0, neurons, model: model.id };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'error' };
  }
}

// Layer 3b. Only reached when a key is deliberately set.
async function askOpenAI(env, question) {
  if (!env.OPENAI_API_KEY) return { ok: false, reason: 'no_key' };
  const context = buildContext();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CFG.modelTimeoutMs);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.DEMO_MODEL || 'gpt-5-nano',
        max_completion_tokens: CFG.maxOutputTokens,
        messages: [
          { role: 'system', content: `${SYSTEM}\n\nCONTEXT:\n${context}` },
          { role: 'user', content: question },
        ],
      }),
    });
    if (!r.ok) return { ok: false, reason: `http_${r.status}` };
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, reason: 'empty' };
    const u = data.usage || {};
    const cost = (u.prompt_tokens || 0) * CFG.priceIn + (u.completion_tokens || 0) * CFG.priceOut;
    return { ok: true, text, cost, neurons: 0, model: env.DEMO_MODEL || 'gpt-5-nano' };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET || !token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const d = await r.json();
    return d.success === true;
  } catch { return false; }
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
  },
});

export async function onRequestPost({ request, env }) {
  const kv = env.DEMO_KV;
  const secret = env.DEMO_SECRET || 'dev-only-not-a-secret';
  // Set by Cloudflare at the edge. A client cannot forge this. Never trust X-Forwarded-For.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Origin check. A filter against casual abuse, not a control. A script sends anything.
  const origin = request.headers.get('Origin');
  const host = request.headers.get('Host');
  if (origin && host && !origin.includes(host)) return json({ answer: corpus.refusal, source: 'refusal' });

  let body;
  try { body = await request.json(); } catch { return json({ answer: corpus.refusal, source: 'refusal' }); }

  const question = String(body.question || '').slice(0, 2000);
  if (!question.trim()) return json({ answer: corpus.refusal, source: 'refusal' });

  // control 4
  if (question.length > CFG.maxInputChars) {
    return json({ answer: `Questions are capped at ${CFG.maxInputChars} characters. Try a shorter one.`, source: 'control' });
  }

  // control 16, signed session
  let session = await verifySession(secret, body.session);
  if (!session) session = { id: crypto.randomUUID(), turns: 0, exp: Date.now() + CFG.sessionMs };

  // controls 5 and 6
  if (session.turns >= CFG.maxTurns) {
    return json({
      answer: 'That is eight turns, which is the limit for one session. Everything covered is on the case study pages.',
      source: 'control', session: await signSession(secret, session),
    });
  }
  session.turns += 1;
  const sessionToken = await signSession(secret, session);

  // control 15, cache first. Free, unlimited, no rate limit, always available.
  // A request to do work is refused before anything is spent on it. Reaching the model
  // here would mean paying for the privilege of declining, and would make the site a
  // free model proxy for anyone who worded it as a question.
  if (isRequestForWork(question)) {
    return json({ answer: corpus.refusal, source: 'refusal', near: [], session: sessionToken });
  }

  const { hit, near } = await findAnswer(env, question);
  if (hit) {
    // No KV at all on this path. It is the busiest one and it needs no state: a cached
    // answer costs nothing, so there is nothing to meter and nothing that can fail.
    return json({ answer: hit.a, source: 'cache', id: hit.id, near, session: sessionToken });
  }

  // Only novel questions reach the limited layers.
  const verified = await verifyTurnstile(env, body.turnstile, ip);
  let overIp = false, overPool = false, overBudget = false;

  if (kv) {
    const n = await bump(kv, `ip:${day()}:${ip}`, 60 * 60 * 26);
    overIp = n > CFG.perIpDaily;                                   // control 7, soft
    const poolKey = verified ? `pool:v:${day()}` : `pool:u:${day()}`;
    const used = await kvRead(kv, poolKey, Number.MAX_SAFE_INTEGER);
    overPool = used >= (verified ? CFG.verifiedPool : CFG.unverifiedPool);  // control 8, split
    const spend = await kvRead(kv, `spend:${month()}`, Number.MAX_SAFE_INTEGER);
    const neurons = await kvRead(kv, `neurons:${day()}`, Number.MAX_SAFE_INTEGER);
    // control 12, now two ceilings. Dollars only ever move if an OpenAI key is set;
    // neurons are the one that actually binds, and it is the free allowance itself.
    overBudget = spend >= CFG.monthlyBudgetUsd || neurons >= CFG.dailyNeurons;
    if (!overIp && !overPool && !overBudget) {
      await kvWrite(kv, poolKey, used + 1, 60 * 60 * 26);
    }
  }

  // Degrade invisibly. The visitor is never told a limit was hit.
  if (overIp || overPool || overBudget) {
    return json({ answer: corpus.refusal, source: 'refusal', near, session: sessionToken });
  }

  // Free tier first. OpenAI is tried only if it is configured and Workers AI could not
  // answer, so a missing AI binding degrades to a paid model rather than to nothing.
  let live = await askWorkersAI(env, question);
  if (!live.ok) live = await askOpenAI(env, question);

  if (!live.ok) {
    return json({ answer: corpus.refusal, source: 'refusal', near, session: sessionToken });
  }

  if (kv) {
    // The two figures that have to survive a restart, because each one stands between a
    // novel question and a cost: dollars for the paid tier, neurons for the free one.
    if (live.cost) {
      const spend = await kvRead(kv, `spend:${month()}`, 0) + live.cost;
      await kvWrite(kv, `spend:${month()}`, spend, 60 * 60 * 24 * 40);
    }
    if (live.neurons) {
      const burn = await kvRead(kv, `neurons:${day()}`, 0) + live.neurons;
      await kvWrite(kv, `neurons:${day()}`, Math.round(burn), 60 * 60 * 26);
    }
  }
  return json({ answer: live.text, source: 'model', near, session: sessionToken });
}

