/* Release gate. Run before anything is published.
   node audit.mjs

   Three checks, all of which the portfolio research found real sites failing:
   1. Link integrity. Every internal link must resolve to a file on disk.
      This is the bug that made a peer's eight good projects unreachable: his routes
      worked when clicked and 404'd when requested directly.
   2. Confidentiality. No client name, hostname, distribution id, account number,
      colleague name or database name may appear in the built output.
   3. House style. No em dash or en dash anywhere.

   The confidentiality patterns are NOT in this file, deliberately. A committed list of
   the things you must never publish is itself a leak. They live in .audit-patterns.txt,
   which is gitignored. One pattern per line, blank lines and # comments ignored.
*/
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';

const ROOT = resolve('./public');
let failures = 0;
const fail = (m) => { console.error('  FAIL  ' + m); failures++; };
const pass = (m) => console.log('  ok    ' + m);

async function walk(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = await walk(ROOT);
const html = files.filter(f => extname(f) === '.html');

// Every answer in data/answers.json is published text: the demo returns it verbatim to
// a visitor and the edge function bundles it. It does not live under public/, so without
// this it would be the one body of public copy the gate never reads.
const published = [...files];
for (const extra of ['data/answers.json']) {
  if (existsSync(extra)) published.push(extra);
}

console.log(`\nAuditing ${published.length} files (${html.length} pages) under public/ plus the answer data\n`);

/* ---- 1. link integrity ---------------------------------------------------- */
console.log('1. Link integrity');
let linkCount = 0;
for (const f of html) {
  const src = await readFile(f, 'utf8');
  const refs = [...src.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|#|data:)/.test(ref)) continue;
    linkCount++;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = clean.startsWith('/')
      ? join(ROOT, clean)
      : resolve(dirname(f), clean);
    const candidates = [target, join(target, 'index.html')];
    if (!candidates.some(c => existsSync(c))) {
      fail(`${f.replace(ROOT, '')} -> ${ref} does not resolve`);
    }
  }
}
if (failures === 0) pass(`${linkCount} internal links all resolve`);
const afterLinks = failures;

/* ---- 2. confidentiality ---------------------------------------------------- */
console.log('\n2. Confidentiality');
const patternFile = '.audit-patterns.txt';
if (!existsSync(patternFile)) {
  fail(`${patternFile} missing. The gate cannot run without it. See the header of this file.`);
} else {
  const patterns = (await readFile(patternFile, 'utf8'))
    .split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  let hits = 0;
  for (const f of published) {
    if (!/\.(html|js|json|css|xml|txt|svg)$/.test(f)) continue;
    const src = await readFile(f, 'utf8');
    for (const p of patterns) {
      // Word-boundary match, so a colleague's first name does not fire on "estimate".
      // A pattern wrapped in slashes is treated as a raw regex.
      const rx = p.startsWith('/') && p.endsWith('/')
        ? new RegExp(p.slice(1, -1), 'i')
        : new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (rx.test(src)) {
        fail(`${f.replace(ROOT, '')} contains a stripped term: "${p}"`);
        hits++;
      }
    }
  }
  if (!hits) pass(`${patterns.length} stripped terms, none present in the output`);
}

// Anything under public/ is served verbatim at a guessable URL. The CV is sent on
// request and approved one at a time, so a copy sitting here would quietly undo that
// whether or not a page links to it. Unlinked is not the same as unreachable.
const served = files.filter(f => /\.(pdf|docx?|pages)$/i.test(f));
if (served.length) {
  for (const f of served) fail(`${f.replace(ROOT, '')} is served publicly. Documents belong in private/.`);
} else {
  pass('no documents exposed under public/');
}

/* ---- 3. house style -------------------------------------------------------- */
console.log('\n3. House style');
let dashes = 0;
for (const f of published) {
  if (!/\.(html|js|json|css|md|xml|txt)$/.test(f)) continue;
  const src = await readFile(f, 'utf8');
  const found = src.match(/[—–―]/g);
  if (found) { fail(`${f.replace(ROOT, '')} contains ${found.length} em or en dash(es)`); dashes++; }
}
if (!dashes) pass('no em or en dashes');

/* ---- 4. crawlability ------------------------------------------------------- */
console.log('\n4. Crawlability');
for (const required of ['sitemap.xml', 'robots.txt']) {
  existsSync(join(ROOT, required)) ? pass(`${required} present`) : fail(`${required} missing`);
}
const sitemap = existsSync(join(ROOT, 'sitemap.xml'))
  ? await readFile(join(ROOT, 'sitemap.xml'), 'utf8') : '';
let listed = 0, skipped = 0;
for (const f of html) {
  const src = await readFile(f, 'utf8');
  // A noindex page in a sitemap is a contradiction: the sitemap asks a crawler to index
  // it and the page tells the same crawler not to. Error pages are the usual case.
  if (/<meta name="robots"[^>]*noindex/i.test(src)) { skipped++; continue; }
  const route = f.replace(ROOT, '').replace(/\/index\.html$/, '/');
  if (sitemap.includes(route)) listed++;
  else fail(`${route} is not listed in sitemap.xml`);
}
pass(`${listed} indexable page(s) in sitemap.xml${skipped ? `, ${skipped} noindex page(s) correctly left out` : ''}`);

/* ---- 5. per-page basics ---------------------------------------------------- */
console.log('\n5. Per-page basics');
const basicsStart = failures;
for (const f of html) {
  const src = await readFile(f, 'utf8');
  const short = f.replace(ROOT, '');
  if (!/<title>[^<]{3,}<\/title>/.test(src)) fail(`${short} has no usable <title>`);
  if (!/<meta name="description"/.test(src)) fail(`${short} has no meta description`);
  if (!/<h1[\s>]/.test(src)) fail(`${short} has no h1`);
  if (!/lang="en-AU"/.test(src)) fail(`${short} is not marked lang="en-AU"`);
}
if (failures === basicsStart) pass('every page has a title, description, h1 and lang');

console.log(
  failures === 0
    ? '\nPASS. Safe to publish.\n'
    : `\nBLOCKED. ${failures} problem(s) above must be fixed before publishing.\n`
);
process.exit(failures === 0 ? 0 : 1);
