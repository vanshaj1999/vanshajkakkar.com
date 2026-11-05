/* The matcher, shared by the local Node server and the deployed Worker.

   It used to be copied into both, which is how the two quietly drift apart: a fix lands
   in one and the other keeps the old behaviour, and the bug only shows up in production.
   One implementation, imported twice.

   Four things it does beyond counting shared words:

     1. Suffix stripping, so "deployment" and "deploy" are the same term. On a corpus this
        small, morphology is the single biggest source of misses.
     2. Aliases, because a visitor says "infra" and "k8s" while the corpus says
        "infrastructure" and "kubernetes". Expansion happens on both sides.
     3. Adjacent word pairs, so "cloud computing" scores above the sum of "cloud" and
        "computing" seen separately. Phrases carry more meaning than their words do.
     4. Inverse document frequency, so a rare word like "pgvector" outweighs a common one
        like "built".

   It returns null rather than a weak guess. A miss costs a model call; a wrong hit costs
   a wrong answer, and the wrong answer is much more expensive.
*/

const STOP = new Set([
  'what', 'is', 'the', 'a', 'an', 'of', 'he', 'his', 'him', 'does', 'do', 'did', 'has',
  'have', 'and', 'to', 'in', 'on', 'for', 'with', 'how', 'are', 'can',
  /* The rest of the interrogatives. "what" and "how" were already here and the others
     were simply missed, which is not a harmless inconsistency: "where" carries a lot of
     idf weight and it appears in the location entry's variants, so "where did he study"
     was ranking the answer about Adelaide above the answer about his degrees. The word
     that should decide that question is "study", not "where". */
  'where', 'when', 'why', 'who', 'whom', 'whose', 'which',
  'tell', 'me', 'about', 'i', 'it', 'be', 'was', 'were', 'been', 'as',
  'at', 'by', 'or', 'if', 'so', 'any', 'some', 'there', 'their', 'they', 'we', 'us',
]);

/* "you", "your" and "this" are NOT stopwords here, and that is a corpus-specific call
   rather than an oversight.

   On this corpus they carry the single most important distinction there is: whether a
   question is about Vanshaj or about the assistant answering it. Treating them as noise
   reduced "how did he build you" to the one term "built", which then matched "what has he
   built" and returned the portfolio overview to someone asking how the chatbot works.

   A general-purpose stopword list is the wrong tool for a corpus of twenty entries where
   one of them is the system itself. */

/* Almost all synonym handling now comes from the embedding model in semantic.js, which
   is why this list is nine entries rather than fifty. What survives is the class an
   embedding model is genuinely poor at: short technical abbreviations, where the token is
   too rare and too ambiguous to sit near its expansion in vector space. Everything else
   was removed rather than kept "just in case", because a stale alias silently outranks a
   correct semantic match. */
const ALIAS = new Map(Object.entries({
  k8s: 'kubernetes', infra: 'infrastructure', llm: 'language model',
  rag: 'retrieval', cv: 'computer vision', ml: 'machine learning',
  tts: 'text to speech', stt: 'speech to text', ocr: 'text recognition',
  // Australian, and exactly the shape this table is for: three letters too rare and too
  // ambiguous for an embedding model to place near their expansion.
  uni: 'university', qs: 'questions',
}));

/* Deliberately crude, and that is the point. A real stemmer is a dependency and a
   surprise; this handles the endings that actually occur in a hundred question variants
   and leaves anything short alone so "aws" and "ml" survive intact. */
function stem(w) {
  if (w.length <= 4) return w;
  /* -ies and -ied go back to -y before anything else runs.

     Left to the strip loop below, "study", "studies" and "studied" came out as three
     different tokens: "study" untouched, "studies" losing "ies" to leave "stud", and
     "studied" losing "ed" to leave "studi". Three stems for one word means a question
     asking about study could not match a corpus entry that mentions studies.
     The rewritten form does not have to be a real word, it only has to be the same one
     on both sides, which is why "series" becoming "sery" costs nothing. */
  if (w.length >= 5 && (w.endsWith('ies') || w.endsWith('ied'))) return w.slice(0, -3) + 'y';
  for (const suf of ['ational', 'iveness', 'ization', 'isation', 'ements', 'ement', 'ingly',
                     'ation', 'ities', 'ives', 'ings', 'ions', 'ies', 'ing', 'ed', 'es', 'ly', 's']) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

export function terms(s) {
  const raw = String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t && !STOP.has(t));
  const out = [];
  for (const w of raw) {
    const t = stem(w);
    out.push(t);
    const alias = ALIAS.get(t) || ALIAS.get(w);
    if (alias && alias !== t) out.push(alias);
  }
  return out;
}

// Adjacent pairs from the unstemmed order, which is what makes a phrase a phrase.
function pairs(list) {
  const out = [];
  for (let i = 0; i + 1 < list.length; i++) out.push(list[i] + '~' + list[i + 1]);
  return out;
}

/* One edit apart, where an edit is an insertion, a deletion, a substitution or a swap of
   two neighbours. Written as a single walk rather than a distance matrix because the only
   question here is "is it 1 or more", and answering that does not need the matrix.

   Transposition is in because it is the typo people actually make: "retreival",
   "recieve", "lamdba". Plain Levenshtein scores those 2 and would miss all of them. */
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, slack = 1;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (!slack--) return false;
    if (a.length === b.length) {
      // Substitution, or two neighbours the wrong way round.
      if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } else { i++; j++; }
    } else if (a.length > b.length) i++;
    else j++;
  }
  return true;
}

/* A term the corpus has never seen, five letters or longer, is far more likely to be a
   misspelling of a term it does know than a real word it has no answer for. "Lamba
   packing strategies" returned a refusal while "Lambda packaging strategies" returned the
   AWS answer, which is a retrieval failure dressed up as an honest one.

   Only unknown terms are corrected, so a word the corpus does know is never rewritten,
   and only to a distance of one, so this repairs slips rather than guessing at meaning.
   Five characters is the floor because below it a single edit connects genuinely
   different words: "cost" and "case" would become the same query. */
function correct(qt, vocab) {
  return qt.map((t) => {
    if (t.length < 5 || vocab.has(t)) return t;
    for (const v of vocab) if (Math.abs(v.length - t.length) <= 1 && withinOneEdit(t, v)) return v;
    return t;
  });
}

export function buildIndex(corpus) {
  const n = corpus.answers.length;
  const df = new Map();
  /* The answer body is indexed too, and it was not before. That omission is the reason
     the corpus kept looking thinner than it is: only the hand-written question variants
     were searchable, so a fact stated in an answer was lexically invisible unless someone
     had also thought to list it as a phrasing. "ecs" refused while the AWS answer sat
     there ready, because no variant contained the word.

     It carries a penalty rather than equal footing. A curated variant is somebody saying
     "this is what this entry is for"; a body match is only "this word appears in here".
     At 0.72 a whole-query body match lands just over the threshold while a real variant
     match still reaches 1.0, so bodies extend reach without ever outranking intent. */
  const BODY_WEIGHT = 0.72;
  const entries = corpus.answers.map((entry) => {
    const seen = new Set();
    const variants = entry.q.map((v) => {
      const t = terms(v);
      const p = pairs(t);
      for (const x of [...t, ...p]) seen.add(x);
      return { t, p, mass: 0, w: 1 };
    });
    const bt = terms(entry.a);
    const bp = pairs(bt);
    for (const x of [...bt, ...bp]) seen.add(x);
    variants.push({ t: bt, p: bp, mass: 0, w: BODY_WEIGHT });
    for (const x of seen) df.set(x, (df.get(x) || 0) + 1);
    return { entry, variants };
  });

  // Single terms only. Pairs are rebuilt from the corrected terms, so they do not belong.
  const vocab = new Set();
  for (const x of df.keys()) if (!x.includes('~')) vocab.add(x);

  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log(1 + n / d));
  const weight = (t) => idf.get(t) || Math.log(1 + n);

  // Precompute each variant's own mass once rather than on every question.
  for (const e of entries) {
    for (const v of e.variants) {
      v.mass = v.t.reduce((s, t) => s + weight(t), 0)
             + v.p.reduce((s, p) => s + weight(p) * 1.5, 0) || 1;
    }
  }
  return { entries, weight, vocab };
}

/* Precision and recall, blended. Precision alone lets a one-word variant match anything;
   recall alone rewards long variants for containing common words. The threshold sits
   where a genuine near-miss still falls through to the model. */
const THRESHOLD = 0.40;
const PAIR_BONUS = 1.5;

/* A question can be perfectly on topic by vocabulary and still be a request to do work:
   "write me a python script" shares every term with the backend answer. Serving a cached
   answer there is the wrong reply, and reaching the model turns a portfolio into a free
   model proxy. Both are refused before ranking runs. */
const DO_VERB = 'write|generate|create|build|make|code|implement|translate|summari[sz]e|rewrite|draft|fix|debug|refactor';
const IMPERATIVE = new RegExp([
  // The verb opens the message: "write me a script", "generate some tests".
  `^\\s*(please\\s+)?(${DO_VERB})\\b`,
  // Or it is aimed at the assistant: "can you build a", "could you write me".
  `\\b(can|could|would|will) you\\s+(please\\s+)?(${DO_VERB})\\b`,
  // Or it takes an object, which "what does he build" never does.
  `\\b(${DO_VERB})\\s+(me|us|a|an|some|the|this|that|my)\\b`,
  // Persona and instruction attacks.
  `\\b(act as|pretend|roleplay|you are now|system prompt|your instructions)\\b`,
  `\\bignore\\s+(all\\s+|any\\s+)?(previous|prior|above|earlier)\\b`,
].join('|'), 'i');

export function isRequestForWork(question) {
  return IMPERATIVE.test(String(question));
}

/* One score per answer, in corpus order, so the result can be fused with a semantic
   ranking rather than only used on its own. */
export function lexicalScores(index, question) {
  const { weight, vocab } = index;
  // Correction happens before pairing, so "lamba packing" also repairs the phrase.
  const qt = correct(terms(question), vocab);
  if (!qt.length) return index.entries.map(() => 0);
  const qp = pairs(qt);
  const qSet = new Set([...qt, ...qp]);
  const qMass = qt.reduce((s, t) => s + weight(t), 0)
              + qp.reduce((s, p) => s + weight(p) * PAIR_BONUS, 0) || 1;

  return index.entries.map(({ variants }) => {
    let best = 0;
    for (const v of variants) {
      let hit = 0;
      for (const t of v.t) if (qSet.has(t)) hit += weight(t);
      for (const p of v.p) if (qSet.has(p)) hit += weight(p) * PAIR_BONUS;
      if (!hit) continue;
      const score = ((hit / qMass) * 0.6 + (hit / v.mass) * 0.4) * v.w;
      if (score > best) best = score;
    }
    return best;
  });
}

// Lexical only. Used where there is no embedding model to call, which is local development.
export function lookup(index, question) {
  if (isRequestForWork(question)) return null;
  const scores = lexicalScores(index, question);
  let bi = -1, bs = 0;
  scores.forEach((s, i) => { if (s > bs) { bs = s; bi = i; } });
  return bs >= THRESHOLD ? index.entries[bi].entry : null;
}

/* The confidence gate on a fused result.

   Fusion decides the order, this decides whether the winner is good enough to serve at
   all. Two independent ways to qualify, because the halves fail differently: a precise
   keyword question can score near zero on cosine, and a loosely worded one can share
   almost no vocabulary. Either being confident on its own is enough.

   Below both, it returns null and the question goes to the model. That is the correct
   trade: a miss costs one cheap model call, a wrong hit costs a wrong answer. */
export const CONFIDENT_LEXICAL = 0.40;
export const CONFIDENT_COSINE = 0.66;

export function isConfident(lexical, cosine) {
  return lexical >= CONFIDENT_LEXICAL || (cosine != null && cosine >= CONFIDENT_COSINE);
}

// Top answers by fused score, so the page can place a question among its evidence.
export function topNear(entries, fused, lexical, cosine, k = 3) {
  return fused
    .map((f, i) => ({ i, f }))
    .filter(({ i }) => lexical[i] > 0 || (cosine && cosine[i] > 0))
    .sort((a, b) => b.f - a.f)
    .slice(0, k)
    .map(({ i }) => ({ id: entries[i].id, score: +(cosine ? cosine[i] : lexical[i]).toFixed(3) }));
}
