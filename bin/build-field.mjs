import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { splitSentences, layoutArea } from '../lib/field-layout.js';

// Every answer id must appear exactly once, so a new answer forces a decision about its area.
const AREAS = [
  { key: 'vision', label: 'computer vision', ids: ['vision', 'ocr', 'annotation'] },
  { key: 'edge', label: 'on-device and edge', ids: ['ondevice'] },
  { key: 'speech', label: 'speech and avatars', ids: ['speech', 'avatar', 'illustrated-avatar'] },
  { key: 'llm', label: 'retrieval and LLMs',
    ids: ['rag', 'llm', 'frameworks', 'thisdemo', 'course-assistant'] },
  { key: 'cloud', label: 'cloud and delivery',
    ids: ['cloud', 'aws', 'delivery', 'multicloud', 'backend'] },
  { key: 'cost', label: 'cost', ids: ['cost'] },
  { key: 'work', label: 'how I work', ids: ['overview', 'how-many-projects', 'strongest',
    'workingstyle', 'teamwork', 'stack', 'languages'] },
  { key: 'background', label: 'background', ids: ['experience', 'education', 'certifications',
    'patent', 'availability', 'clients', 'boundaries'] },
];

async function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  for (const p of ['Library/Preferences/.wrangler', '.config/.wrangler', '.wrangler']) {
    try {
      const toml = await readFile(join(homedir(), p, 'config/default.toml'), 'utf8');
      const m = toml.match(/^oauth_token\s*=\s*"([^"]+)"/m);
      if (m) return m[1];
    } catch {}
  }
  throw new Error('No token. Set CLOUDFLARE_API_TOKEN or run `npx wrangler whoami` first.');
}

async function cf(path, tok, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors)}`);
  return j.result;
}

const corpus = JSON.parse(await readFile(new URL('../data/answers.json', import.meta.url), 'utf8'));
const mapped = AREAS.flatMap(a => a.ids);
const ids = corpus.answers.map(a => a.id);
const missing = ids.filter(id => !mapped.includes(id));
const stale = mapped.filter(id => !ids.includes(id));
if (missing.length || stale.length) throw new Error(`Unmapped: ${missing} Stale: ${stale}`);

const tok = await token();
const account = process.env.CLOUDFLARE_ACCOUNT_ID || (await cf('/accounts', tok))[0].id;
const model = '@cf/baai/bge-base-en-v1.5';

const dots = [];
for (const [a, area] of AREAS.entries()) {
  const items = area.ids.flatMap(id =>
    splitSentences(corpus.answers.find(x => x.id === id).a).map(s => ({ id, s })));
  const vecs = [];
  for (let i = 0; i < items.length; i += 50) {
    const res = await cf(`/accounts/${account}/ai/run/${model}`, tok,
      { text: items.slice(i, i + 50).map(x => x.s) });
    vecs.push(...res.data);
  }
  layoutArea(vecs).forEach(([u, v], i) => dots.push({ a, id: items[i].id, u, v, s: items[i].s }));
}

const out = { v: 1, areas: AREAS.map(({ key, label }) => ({ key, label })), dots };
await writeFile(new URL('../public/assets/field.json', import.meta.url), JSON.stringify(out));
console.log(`${dots.length} dots across ${AREAS.length} areas`);
