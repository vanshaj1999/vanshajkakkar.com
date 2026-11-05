import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, lexicalScores, CONFIDENT_LEXICAL } from '../lib/retrieval.js';
import { QUESTIONS } from '../public/assets/questions.js';

const corpus = JSON.parse(readFileSync(new URL('../data/answers.json', import.meta.url), 'utf8'));
const index = buildIndex(corpus);

test('every answer in the field has a click question', () => {
  for (const { id } of corpus.answers) assert.ok(QUESTIONS[id], id);
});

test('each click question lands on its own answer without a model call', () => {
  for (const [id, q] of Object.entries(QUESTIONS)) {
    const lex = lexicalScores(index, q);
    const best = lex.indexOf(Math.max(...lex));
    assert.equal(corpus.answers[best].id, id, q);
    assert.ok(lex[best] >= CONFIDENT_LEXICAL, q);
  }
});
