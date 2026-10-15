'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/engine/game');
const { makeState, run, positions, dislodgedAt } = require('./helpers');

const has = (state, s) => assert.ok(positions(state).includes(s), `attendu ${s} dans ${positions(state).join(', ')}`);

test('mouvement simple', () => {
  const { state } = run(makeState({ FRA: ['A PAR'] }), { FRA: ['A PAR - BUR'] });
  has(state, 'FRA:A BUR');
  assert.equal(G.phaseName(state), 'F1901M');
});

test('rebond entre deux attaques égales', () => {
  const { state } = run(makeState({ FRA: ['A PAR'], GER: ['A MUN'] }), { FRA: ['A PAR - BUR'], GER: ['A MUN - BUR'] });
  has(state, 'FRA:A PAR');
  has(state, 'GER:A MUN');
});

test('attaque soutenue déloge', () => {
  const { state } = run(makeState({ GER: ['A MUN', 'A RUH'], FRA: ['A BUR'] }), { GER: ['A MUN - BUR', 'A RUH S A MUN - BUR'] });
  has(state, 'GER:A BUR');
  assert.deepEqual(dislodgedAt(state), ['BUR']);
  const opts = state.dislodged[0].options;
  assert.ok(!opts.includes('MUN'), 'pas de retraite vers la province de l\'attaquant');
  assert.ok(opts.includes('PAR'));
  assert.equal(state.phase, 'R');
});

test('soutien coupé', () => {
  const { state } = run(
    makeState({ GER: ['A MUN', 'A RUH'], FRA: ['A BUR', 'A BEL'] }),
    { GER: ['A MUN - BUR', 'A RUH S A MUN - BUR'], FRA: ['A BEL - RUH'] },
  );
  has(state, 'FRA:A BUR');
  has(state, 'GER:A MUN');
  assert.deepEqual(dislodgedAt(state), []);
});

test('un soutien n\'est pas coupé par une attaque venant de la province visée', () => {
  const { state } = run(
    makeState({ GER: ['A MUN', 'A RUH'], FRA: ['A BUR'] }),
    { GER: ['A MUN - BUR', 'A RUH S A MUN - BUR'], FRA: ['A BUR - RUH'] },
  );
  has(state, 'GER:A BUR');
  has(state, 'GER:A RUH');
  assert.deepEqual(dislodgedAt(state), ['BUR']);
});

test('échange direct impossible sans convoi', () => {
  const { state } = run(makeState({ GER: ['A BER'], RUS: ['A PRU'] }), { GER: ['A BER - PRU'], RUS: ['A PRU - BER'] });
  has(state, 'GER:A BER');
  has(state, 'RUS:A PRU');
});

test('mouvement circulaire', () => {
  const { state } = run(
    makeState({ FRA: ['A BUR'], GER: ['A MUN'], ENG: ['A RUH'] }),
    { FRA: ['A BUR - MUN'], GER: ['A MUN - RUH'], ENG: ['A RUH - BUR'] },
  );
  has(state, 'FRA:A MUN');
  has(state, 'GER:A RUH');
  has(state, 'ENG:A BUR');
});

test('on ne déloge pas sa propre unité', () => {
  const { state } = run(
    makeState({ GER: ['A MUN', 'A RUH', 'A KIE'] }),
    { GER: ['A RUH - MUN', 'A KIE S A RUH - MUN', 'A MUN H'] },
  );
  has(state, 'GER:A RUH');
  has(state, 'GER:A MUN');
});

test('un soutien étranger n\'aide pas à déloger sa propre unité', () => {
  const { state } = run(
    makeState({ FRA: ['A BUR'], GER: ['A MUN', 'A RUH'] }),
    { FRA: ['A BUR - MUN'], GER: ['A RUH S A BUR - MUN', 'A MUN H'] },
  );
  has(state, 'GER:A MUN');
  has(state, 'FRA:A BUR');
});

test('garnison assiégée', () => {
  const { state } = run(
    makeState({ GER: ['A MUN'], FRA: ['A BUR', 'A RUH'], ITA: ['A TYR', 'A BOH'] }),
    { FRA: ['A BUR - MUN', 'A RUH S A BUR - MUN'], ITA: ['A TYR - MUN', 'A BOH S A TYR - MUN'] },
  );
  has(state, 'GER:A MUN');
  assert.deepEqual(dislodgedAt(state), []);
});

test('convoi simple', () => {
  const { state } = run(makeState({ ENG: ['A YOR', 'F NTH'] }), { ENG: ['A YOR - NWY', 'F NTH C A YOR - NWY'] });
  has(state, 'ENG:A NWY');
});

test('convoi par deux flottes', () => {
  const { state } = run(
    makeState({ ENG: ['A LON', 'F ENG', 'F MAO'] }),
    { ENG: ['A LON - POR', 'F ENG C A LON - POR', 'F MAO C A LON - POR'] },
  );
  has(state, 'ENG:A POR');
});

test('convoi interrompu par une flotte délogée', () => {
  const { state } = run(
    makeState({ ENG: ['A LON', 'F NTH'], GER: ['F HEL', 'F DEN'] }),
    { ENG: ['A LON - BEL', 'F NTH C A LON - BEL'], GER: ['F HEL - NTH', 'F DEN S F HEL - NTH'] },
  );
  has(state, 'ENG:A LON');
  has(state, 'GER:F NTH');
  assert.deepEqual(dislodgedAt(state), ['NTH']);
});

test('paradoxe de convoi (règle de Szykman)', () => {
  const { state } = run(
    makeState({ ENG: ['F LON', 'F WAL'], FRA: ['A BRE', 'F ENG'] }),
    { ENG: ['F LON S F WAL - ENG', 'F WAL - ENG'], FRA: ['A BRE - LON', 'F ENG C A BRE - LON'] },
  );
  has(state, 'ENG:F ENG');
  has(state, 'ENG:F LON');
  has(state, 'FRA:A BRE');
  assert.deepEqual(dislodgedAt(state), ['ENG']);
});

test('une unité délogée en face-à-face ne gêne pas le mouvement vers sa province d\'origine', () => {
  const { state } = run(
    makeState({ GER: ['A BER', 'F KIE', 'A SIL'], RUS: ['A PRU'] }),
    { GER: ['A BER - PRU', 'F KIE - BER', 'A SIL S A BER - PRU'], RUS: ['A PRU - BER'] },
  );
  has(state, 'GER:A PRU');
  has(state, 'GER:F BER');
  assert.deepEqual(dislodgedAt(state), ['PRU']);
});

test('soutien défensif d\'une unité qui bouge : sans effet', () => {
  const { state } = run(
    makeState({ GER: ['A MUN', 'A RUH'], FRA: ['A BUR', 'A PAR', 'A MAR'] }),
    { GER: ['A MUN - BUR', 'A RUH S A MUN - BUR'], FRA: ['A BUR - GAS', 'A MAR - GAS', 'A PAR S A BUR'] },
  );
  // BUR-GAS rebondit contre MAR-GAS, le soutien de PAR est nul : BUR est délogée
  assert.deepEqual(dislodgedAt(state), ['BUR']);
});

test('côtes multiples', () => {
  const s0 = makeState({ FRA: ['F MAO', 'F GAS'] });
  const bad = G.validateOrders(s0, 'FRA', [{ unit: 'MAO', action: 'move', to: 'SPA' }]);
  assert.equal(bad.accepted.length, 0);
  assert.match(bad.errors[0].error, /côte/);
  const { state } = run(s0, { FRA: ['F MAO - POR', 'F GAS - SPA'] });
  has(state, 'FRA:F SPA/nc');
  has(state, 'FRA:F POR');
});

test('ordres refusés : unité d\'une autre puissance, armée en mer', () => {
  const s0 = makeState({ FRA: ['A PAR'], GER: ['A MUN'] });
  assert.equal(G.validateOrders(s0, 'FRA', [{ unit: 'MUN', action: 'hold' }]).accepted.length, 0);
  assert.equal(G.validateOrders(s0, 'FRA', [{ unit: 'PAR', action: 'move', to: 'ENG' }]).accepted.length, 0);
  assert.equal(G.validateOrders(s0, 'FRA', [{ unit: 'PAR', action: 'move', to: 'MUN' }]).accepted.length, 0);
});

test('retraites : rebond entre deux retraites vers la même province', () => {
  const s0 = makeState({ FRA: ['A PIC'] }, {
    phase: 'R',
    dislodged: [
      { power: 'GER', type: 'A', loc: 'BUR', attackerFrom: 'MAR', options: ['PAR', 'BEL'] },
      { power: 'ENG', type: 'A', loc: 'HOL', attackerFrom: 'KIE', options: ['BEL'] },
    ],
  });
  const { state } = G.resolvePhase(s0, {
    GER: [{ unit: 'BUR', action: 'retreat', to: 'BEL' }],
    ENG: [{ unit: 'HOL', action: 'retreat', to: 'BEL' }],
  });
  assert.equal(state.units.length, 1);
  assert.equal(G.phaseName(state), 'F1901M');
});

test('automne : prise de centres puis constructions', () => {
  const s0 = makeState({ FRA: ['A BUR', 'F MAO', 'A GAS'] }, { season: 'F', centers: { PAR: 'FRA', MAR: 'FRA', BRE: 'FRA' } });
  const { state } = run(s0, { FRA: ['A BUR - BEL', 'F MAO - POR', 'A GAS - SPA'] });
  assert.equal(G.phaseName(state), 'W1901A');
  assert.equal(state.centers.BEL, 'FRA');
  assert.equal(G.adjustmentCounts(state).FRA.delta, 3);
  const r = G.resolvePhase(state, { FRA: [
    { action: 'build', loc: 'PAR', unitType: 'A' },
    { action: 'build', loc: 'BRE', unitType: 'F' },
    { action: 'build', loc: 'PAR', unitType: 'A' },
  ] });
  has(r.state, 'FRA:A PAR');
  has(r.state, 'FRA:F BRE');
  assert.equal(r.state.units.length, 5);
  assert.equal(G.phaseName(r.state), 'S1902M');
});

test('licenciement d\'office de l\'unité la plus éloignée', () => {
  const s0 = makeState({ FRA: ['A PAR', 'A MOS'] }, { season: 'W', phase: 'A', centers: { PAR: 'FRA' } });
  const { state } = G.resolvePhase(s0, {});
  assert.deepEqual(positions(state), ['FRA:A PAR']);
});

test('partie complète : premier tour standard', () => {
  let s = G.initialState();
  assert.equal(s.units.length, 22);
  let r = G.resolvePhase(s, {
    ENG: [{ unit: 'LON', action: 'move', to: 'NTH' }, { unit: 'EDI', action: 'move', to: 'NWG' }, { unit: 'LVP', action: 'move', to: 'YOR' }],
    RUS: [{ unit: 'STP', action: 'move', to: 'BOT' }, { unit: 'SEV', action: 'move', to: 'BLA' }],
    TUR: [{ unit: 'ANK', action: 'move', to: 'BLA' }],
  });
  s = r.state;
  has(s, 'ENG:F NTH');
  has(s, 'RUS:F BOT');
  has(s, 'RUS:F SEV');
  has(s, 'TUR:F ANK');
  assert.equal(G.phaseName(s), 'F1901M');
  r = G.resolvePhase(s, {
    ENG: [{ unit: 'YOR', action: 'move', to: 'NWY', viaConvoy: true }, { unit: 'NTH', action: 'convoy', target: 'YOR', targetTo: 'NWY' }],
    RUS: [{ unit: 'BOT', action: 'move', to: 'SWE' }],
  });
  s = r.state;
  assert.equal(s.centers.NWY, 'ENG');
  assert.equal(s.centers.SWE, 'RUS');
  assert.equal(G.phaseName(s), 'W1901A');
  assert.deepEqual(G.powersToAct(s).sort(), ['ENG', 'RUS']);
});

test('échange de places grâce à un convoi', () => {
  const { state } = run(
    makeState({ ENG: ['A NWY', 'F SKA'], RUS: ['A SWE'] }),
    { ENG: ['A NWY - SWE via', 'F SKA C A NWY - SWE'], RUS: ['A SWE - NWY'] },
  );
  has(state, 'ENG:A SWE');
  has(state, 'RUS:A NWY');
});

test('une armée convoyée coupe un soutien', () => {
  const { state } = run(
    makeState({ ENG: ['A LON', 'F NTH'], FRA: ['A PIC', 'A BUR'], GER: ['A HOL', 'A BEL'] }),
    { ENG: ['A LON - HOL', 'F NTH C A LON - HOL'], FRA: ['A PIC - BEL', 'A BUR S A PIC - BEL'], GER: ['A HOL S A BEL'] },
  );
  has(state, 'FRA:A BEL');
  assert.deepEqual(dislodgedAt(state), ['BEL']);
});
