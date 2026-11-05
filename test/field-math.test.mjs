import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, placeDots, fieldHeight, nearest, countWithin, focusPoint, emptySpot }
  from '../public/assets/field-math.js';

const pts = [{ x: 10, y: 10, id: 'a' }, { x: 20, y: 10, id: 'a' }, { x: 100, y: 100, id: 'b' }];

test('eight anchors per layout, all on canvas', () => {
  for (const k of ['wide', 'narrow']) {
    assert.equal(ANCHORS[k].length, 8);
    for (const p of ANCHORS[k]) assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
  }
});

test('placeDots maps the unit disc into the anchor circle', () => {
  const [d] = placeDots([{ a: 0, u: 0, v: 0, id: 'x', s: 's' }], 1440, 900);
  assert.equal(d.x, ANCHORS.wide[0].x * 1440);
  assert.equal(d.y, ANCHORS.wide[0].y * 900);
});

test('narrow layouts keep the field in the top band', () => {
  assert.equal(fieldHeight(390, 1100), 420);
  assert.equal(fieldHeight(1440, 900), 900);
  const dots = placeDots([{ a: 6, u: 0, v: 1, id: 'x', s: 's' }], 390, 1100);
  assert.ok(dots[0].y < 420);
});

test('nearest and countWithin', () => {
  assert.deepEqual(nearest(pts, 12, 10), { i: 0, d: 2 });
  assert.equal(nearest([], 0, 0).i, -1);
  assert.equal(countWithin(pts, 15, 10, 6), 2);
});

test('focusPoint weights by score and ignores unknown ids', () => {
  const near = [{ id: 'a', score: 0.75 }, { id: 'b', score: 0.25 }, { id: 'z', score: 1 }];
  assert.deepEqual(focusPoint(pts, near), { x: 15 * 0.75 + 100 * 0.25, y: 10 * 0.75 + 100 * 0.25 });
  assert.equal(focusPoint(pts, []), null);
});

test('emptySpot lands inside its box and away from every dot', () => {
  const e = emptySpot(pts, { x0: 160, x1: 400, y0: 20, y1: 200 });
  assert.ok(e.x >= 160 && e.x <= 400 && e.y >= 20 && e.y <= 200);
  assert.ok(nearest(pts, e.x, e.y).d > 60);
});
