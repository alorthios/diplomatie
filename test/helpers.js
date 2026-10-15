'use strict';
const G = require('../src/engine/game');

/**
 * Prépare un état de test.
 * units : { ENG: ['F LON', 'A WAL'], FRA: [...] }
 */
function makeState(units, extra = {}) {
  const state = { year: 1901, season: 'S', phase: 'M', units: [], centers: {}, dislodged: [], winner: null, ...extra };
  for (const [power, list] of Object.entries(units)) {
    for (const s of list) {
      const [type, loc] = s.split(' ');
      state.units.push({ power, type, loc });
    }
  }
  return state;
}

/**
 * Traduit la notation classique en ordre brut :
 *  "A PAR - BUR", "A LON - BEL via", "F ENG C A LON - BEL", "A MUN S A PAR - BUR",
 *  "A MUN S A KIE", "A PAR H"
 */
function parse(text) {
  const t = text.trim().split(/\s+/);
  const unit = t[1];
  if (t[2] === 'H') return { unit, action: 'hold' };
  if (t[2] === '-') return { unit, action: 'move', to: t[3], viaConvoy: t[4] === 'via' };
  if (t[2] === 'S') return { unit, action: 'support', target: t[4], targetTo: t[5] === '-' ? t[6] : null };
  if (t[2] === 'C') return { unit, action: 'convoy', target: t[4], targetTo: t[6] };
  throw new Error(`Ordre non reconnu : ${text}`);
}

/** Résout un tour de mouvement. orders : { ENG: ['F LON - ENG'] } */
function run(state, orders) {
  const raw = {};
  for (const [pw, list] of Object.entries(orders)) raw[pw] = list.map(parse);
  return G.resolvePhase(state, raw);
}

/** Positions finales : { 'LON': 'F ENG' } -> liste triée "ENG:F LON" */
function positions(state) {
  return state.units.map((u) => `${u.power}:${u.type} ${u.loc}`).sort();
}

function dislodgedAt(state) {
  return state.dislodged.map((d) => d.loc).sort();
}

module.exports = { makeState, parse, run, positions, dislodgedAt };
