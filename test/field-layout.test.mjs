import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, pca2, layoutArea } from '../lib/field-layout.js';

test('splits prose and list items, drops fragments and bold markers', () => {
  const s = splitSentences('He builds **systems**. It works offline.\n- A list item here\n- ok');
  assert.deepEqual(s, ['He builds systems.', 'It works offline.', 'A list item here']);
});

test('pca2 spreads collinear points along the first axis', () => {
  const pts = pca2([[0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 3, 0]]);
  const us = pts.map(p => p[0]);
  assert.ok(Math.max(...us) - Math.min(...us) > 3);
  for (const p of pts) assert.ok(Math.abs(p[1]) < 1e-6);
});

test('layout stays inside the unit disc and is deterministic', () => {
  const vecs = Array.from({ length: 9 }, (_, i) => [Math.sin(i), Math.cos(i * 2), i / 9]);
  const a = layoutArea(vecs), b = layoutArea(vecs);
  assert.deepEqual(a, b);
  for (const [u, v] of a) assert.ok(Math.hypot(u, v) <= 1.0001);
});

test('layout separates duplicates and centres a single point', () => {
  const [p, q] = layoutArea([[1, 0], [1, 0]]);
  assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.1);
  assert.deepEqual(layoutArea([[3, 4]]), [[0, 0]]);
});
