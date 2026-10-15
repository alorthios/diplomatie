'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/engine/map');

test('fond de carte : chaque province a un contour', async () => {
  const { SHAPES, BORDERS } = await import('../public/map-shapes.js');
  for (const id of Object.keys(M.PROVINCES)) assert.match(SHAPES[id] || '', /^M[\d.,LMZ]+$/, `contour manquant : ${id}`);
  assert.ok(BORDERS.coast.length > 0);
});
