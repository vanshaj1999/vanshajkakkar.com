/* The semantic half of retrieval.

   The lexical matcher in retrieval.js is fast, free and deterministic, but it only knows
   words. It cannot tell that "what does he do with the cloud" and "infrastructure
   experience" are the same question, so the old fix was an alias table: a hand-written
   list of synonyms that only ever covers the phrasings someone thought of in advance.

   This replaces the guessing with an embedding model. Both halves run, and their two
   ranked lists are fused, so an exact term and a loosely worded question both land. It is
   the same design as the hybrid retrieval in the work this site describes, which is the
   point: the site should be built the way the case studies say he builds things.

   Cost is the reason this is affordable rather than clever. bge-base runs on Workers AI
   inside the free daily neuron allowance, the corpus is embedded once per isolate and
   held in memory, and a question costs a single embedding call. There is no vector
   database, because twenty answers is a dot product, not an index.
*/

const MODEL = '@cf/baai/bge-base-en-v1.5';
const BATCH = 20;          // the model's own input cap per call
const TIMEOUT_MS = 4000;   // a visitor is never held on the optional half of a search

export async function embed(env, texts) {
  if (!env || !env.AI || !texts.length) return null;
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const r = await env.AI.run(MODEL, { text: slice });
    const vecs = r && r.data;
    if (!Array.isArray(vecs) || vecs.length !== slice.length) return null;
    out.push(...vecs);
  }
  return out.map(normalise);
}

// Pre-normalising means similarity is a plain dot product rather than a division per
// comparison. On twenty vectors that is not a performance argument, it is a clarity one.
function normalise(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => x / n);
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/* One vector per answer, built from the answer text plus its question variants, so an
   entry is findable both by what it says and by how people ask for it. Cached on the
   module so a warm isolate pays nothing. */
let CORPUS_VECS = null;
let PENDING = null;

export async function corpusVectors(env, corpus) {
  if (CORPUS_VECS) return CORPUS_VECS;
  // Concurrent first requests must not each trigger their own embedding pass.
  if (PENDING) return PENDING;
  PENDING = (async () => {
    const texts = corpus.answers.map(e => `${e.q.join('. ')}. ${e.a}`);
    const vecs = await withTimeout(embed(env, texts));
    if (vecs) CORPUS_VECS = vecs;
    PENDING = null;
    return vecs;
  })();
  return PENDING;
}

function withTimeout(promise) {
  return Promise.race([
    promise.catch(() => null),
    new Promise(res => setTimeout(() => res(null), TIMEOUT_MS)),
  ]);
}

/* Returns cosine similarity per answer index, or null if the semantic half is
   unavailable. Null is a normal outcome, not an error: locally there is no AI binding at
   all, and the lexical half has to be able to carry the search on its own. */
export async function semanticScores(env, corpus, question) {
  const vecs = await corpusVectors(env, corpus);
  if (!vecs) return null;
  const q = await withTimeout(embed(env, [question]));
  if (!q) return null;
  return vecs.map(v => dot(q[0], v));
}

/* Reciprocal rank fusion. It combines two rankings without needing their scores to be on
   the same scale, which they are not: a lexical overlap ratio and a cosine similarity
   are not comparable numbers and averaging them is how you get a confidently wrong
   ranking. k=60 is the usual constant and flattens the difference between rank 1 and
   rank 2 enough that one list cannot dominate on its own. */
export function fuse(lexical, semantic, k = 60) {
  const rank = (scores) => {
    const order = scores.map((s, i) => [i, s]).sort((a, b) => b[1] - a[1]);
    const r = new Array(scores.length).fill(Infinity);
    order.forEach(([i], pos) => { if (scores[i] > 0) r[i] = pos; });
    return r;
  };
  const lr = rank(lexical);
  const sr = semantic ? rank(semantic) : null;

  /* The tiebreak, and it is not cosmetic.

     When one half ranks A first and B second, and the other half ranks them the other way
     round, RRF gives both exactly 1/(k) + 1/(k+1). A perfect tie. Whichever entry happens
     to sit earlier in the corpus then wins, which is not a ranking decision, it is an
     accident of file order.

     That is what sent "how did he build you" to the portfolio overview: the phrase matched
     an entry about the assistant word for word, while the embedding leaned toward the
     entry that talks about building things, and the overview won on being listed first.

     Ties go to the stronger exact-word match. The nudge is a millionth, far below the gap
     between adjacent ranks, so it can only ever separate a true tie and never reorder two
     entries the fusion actually ranked differently. */
  const TIEBREAK = 1e-6;
  return lexical.map((_, i) => {
    let s = 1 / (k + lr[i]);
    if (sr) s += 1 / (k + sr[i]);
    return s + lexical[i] * TIEBREAK;
  });
}
