'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/engine/map');

test('fond de carte : contour et position pour chaque province', async () => {
  const { SHAPES, POS, COAST_POS, COAST, VIEW } = await import('../public/map-shapes.js');
  const [w, h] = VIEW;
  const inside = ([x, y]) => x >= 0 && y >= 0 && x <= w && y <= h;
  for (const id of Object.keys(M.PROVINCES)) {
    assert.match(SHAPES[id] || '', /^M[\d.,LMZ-]+$/, `contour manquant : ${id}`);
    assert.ok(POS[id] && inside(POS[id]), `position hors carte : ${id}`);
  }
  for (const [id, coasts] of Object.entries(M.COASTS)) {
    for (const c of Object.keys(coasts)) assert.ok(inside(COAST_POS[id][c]), `côte manquante : ${id}/${c}`);
  }
  assert.ok(COAST.length > 1000);
});
