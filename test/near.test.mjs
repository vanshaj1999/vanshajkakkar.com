import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topNear } from '../lib/retrieval.js';

const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

test('ranks by fused score and keeps three', () => {
  const near = topNear(entries, [0.1, 0.4, 0.3, 0.2], [0.1, 0.5, 0.2, 0.3], null);
  assert.deepEqual(near.map(n => n.id), ['b', 'c', 'd']);
});

test('reports cosine when the semantic half ran', () => {
  const near = topNear(entries, [0.1, 0.4, 0.3, 0.2], [0, 0, 0, 0], [0.5, 0.71234, 0.6, 0.55]);
  assert.deepEqual(near[0], { id: 'b', score: 0.712 });
});

test('drops answers neither half matched', () => {
  const near = topNear(entries, [0.1, 0.2, 0.05, 0.01], [0, 0.3, 0, 0], null);
  assert.deepEqual(near.map(n => n.id), ['b']);
});
