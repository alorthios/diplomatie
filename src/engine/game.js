'use strict';
/**
 * Déroulement d'une partie : état initial, validation des ordres,
 * résolution des phases (mouvement, retraite, ajustement) et enchaînement.
 *
 * État :
 *   { year, season: 'S'|'F'|'W', phase: 'M'|'R'|'A',
 *     units: [{power, type, loc}], centers: {PROV: power},
 *     dislodged: [{power, type, loc, attackerFrom, options:[loc]}],
 *     winner: power|null }
 *
 * Ordres bruts (venant du client) :
 *   mouvement : {unit, action:'hold'|'move'|'support'|'convoy', to, target, targetTo, viaConvoy}
 *   retraite  : {unit, action:'retreat'|'disband', to}
 *   ajustement: {action:'build', loc, unitType} | {action:'disband', unit} | {action:'waive'}
 */
const M = require('./map');
const { adjudicateMovement } = require('./adjudicator');

const VICTORY_CENTERS = 18;

function initialState() {
  const units = [];
  const centers = {};
  for (const pw of M.POWERS) {
    for (const [type, loc] of M.START_UNITS[pw]) units.push({ power: pw, type, loc });
    for (const c of M.HOME_CENTERS[pw]) centers[c] = pw;
  }
  return { year: 1901, season: 'S', phase: 'M', units, centers, dislodged: [], winner: null };
}

function phaseName(s) { return `${s.season}${s.year}${s.phase}`; }

function phaseLabel(s) {
  const season = { S: 'Printemps', F: 'Automne', W: 'Hiver' }[s.season];
  const phase = { M: 'mouvements', R: 'retraites', A: 'ajustements' }[s.phase];
  return `${season} ${s.year} — ${phase}`;
}

function unitAt(state, province) {
  return state.units.find((u) => M.prov(u.loc) === province) || null;
}

// ------------------------------------------------------------------
// Validation des ordres de mouvement
// ------------------------------------------------------------------

/** Peut-on convoyer une armée de `from` vers `to` (géographiquement, flottes de mer présentes) ? */
function convoyPossible(state, from, to) {
  if (!M.isCoastal(from) || !M.isCoastal(to) || from === to) return false;
  const fleetsAtSea = new Set(state.units.filter((u) => u.type === 'F' && M.isSea(M.prov(u.loc))).map((u) => u.loc));
  const seaNeigh = (p) => {
    const out = new Set();
    for (const key of Object.keys(M.fleetAdj)) {
      if (M.prov(key) !== p) continue;
      for (const n of M.fleetAdj[key]) if (M.isSea(n)) out.add(n);
    }
    return out;
  };
  const goal = seaNeigh(to);
  const seen = new Set();
  const queue = [...seaNeigh(from)].filter((s) => fleetsAtSea.has(s));
  queue.forEach((s) => seen.add(s));
  while (queue.length) {
    const s = queue.shift();
    if (goal.has(s)) return true;
    for (const n of M.fleetAdj[s]) {
      if (M.isSea(n) && fleetsAtSea.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return false;
}

/** Résout la destination d'une flotte : ajoute la côte si elle est déductible. */
function fleetDestination(from, to) {
  const province = M.prov(to);
  if (M.coastOf(to)) return M.canMove('F', from, to) ? to : null;
  const coasts = M.reachableCoasts(from, province);
  if (coasts.length === 1) return coasts[0];
  return null; // inaccessible ou côte ambiguë
}

/**
 * Normalise un ordre de mouvement. Retourne {order} ou {error}.
 * L'ordre normalisé est celui attendu par l'adjudicateur.
 */
function normalizeMovementOrder(state, power, raw) {
  const unitProv = raw && raw.unit ? M.prov(String(raw.unit).toUpperCase()) : null;
  const unit = unitProv && unitAt(state, unitProv);
  if (!unit) return { error: 'Aucune unité à cet emplacement.' };
  if (unit.power !== power) return { error: 'Cette unité ne vous appartient pas.' };
  const base = { power, unitType: unit.type, loc: unit.loc, prov: unitProv };
  const up = (v) => (v ? String(v).toUpperCase().replace(/\/(NC|SC|EC)$/, (m) => m.toLowerCase()) : null);

  switch (raw.action) {
    case 'hold':
      return { order: { ...base, kind: 'H' } };
    case 'move': {
      const to = up(raw.to);
      if (!to || !M.PROVINCES[M.prov(to)]) return { error: 'Destination inconnue.' };
      const dest = M.prov(to);
      if (dest === unitProv) return { error: 'Une unité ne peut pas se déplacer sur place.' };
      if (unit.type === 'F') {
        const destLoc = fleetDestination(unit.loc, to);
        if (!destLoc) {
          if (M.reachableCoasts(unit.loc, dest).length > 1) return { error: 'Précisez la côte de destination.' };
          return { error: 'Cette flotte ne peut pas atteindre cette province.' };
        }
        return { order: { ...base, kind: 'M', dest, destLoc, viaConvoy: false } };
      }
      if (M.isSea(dest)) return { error: 'Une armée ne peut pas aller en mer.' };
      const adjacent = M.canMove('A', unitProv, dest);
      const viaConvoy = !!raw.viaConvoy || !adjacent;
      if (viaConvoy && !convoyPossible(state, unitProv, dest)) {
        return { error: adjacent ? 'Aucun convoi possible vers cette province.' : 'Province non adjacente et aucun convoi possible.' };
      }
      return { order: { ...base, kind: 'M', dest, destLoc: dest, viaConvoy } };
    }
    case 'support': {
      const target = up(raw.target) && M.prov(up(raw.target));
      const tUnit = target && unitAt(state, target);
      if (!tUnit) return { error: 'Aucune unité à soutenir à cet emplacement.' };
      if (target === unitProv) return { error: 'Une unité ne peut pas se soutenir elle-même.' };
      const targetTo = raw.targetTo ? M.prov(up(raw.targetTo)) : null;
      if (targetTo) {
        if (targetTo === unitProv) return { error: 'Impossible de soutenir une attaque contre soi-même.' };
        if (!M.canReachProvince(unit.type, unit.loc, targetTo)) return { error: 'L\'unité ne peut pas atteindre la province visée.' };
        // L'unité soutenue doit pouvoir s'y rendre (directement ou par convoi)
        const reach = tUnit.type === 'F'
          ? M.canReachProvince('F', tUnit.loc, targetTo)
          : !M.isSea(targetTo) && (M.canMove('A', target, targetTo) || convoyPossible(state, target, targetTo));
        if (!reach) return { error: 'L\'unité soutenue ne peut pas atteindre cette province.' };
        return { order: { ...base, kind: 'S', supTarget: target, supDest: targetTo } };
      }
      if (!M.canReachProvince(unit.type, unit.loc, target)) return { error: 'L\'unité ne peut pas atteindre la province soutenue.' };
      return { order: { ...base, kind: 'S', supTarget: target, supDest: null } };
    }
    case 'convoy': {
      if (unit.type !== 'F' || !M.isSea(unitProv)) return { error: 'Seule une flotte en mer peut convoyer.' };
      const from = up(raw.target) && M.prov(up(raw.target));
      const to = up(raw.targetTo) && M.prov(up(raw.targetTo));
      const army = from && unitAt(state, from);
      if (!army || army.type !== 'A') return { error: 'Aucune armée à convoyer à cet emplacement.' };
      if (!to || !M.isCoastal(to) || !M.isCoastal(from)) return { error: 'Le convoi doit relier deux provinces côtières.' };
      if (!convoyPossible(state, from, to)) return { error: 'Aucune chaîne de flottes possible pour ce convoi.' };
      return { order: { ...base, kind: 'C', cvFrom: from, cvTo: to } };
    }
    default:
      return { error: 'Type d\'ordre inconnu.' };
  }
}

// ------------------------------------------------------------------
// Retraites et ajustements
// ------------------------------------------------------------------

function normalizeRetreatOrder(state, power, raw) {
  const p = raw && raw.unit ? M.prov(String(raw.unit).toUpperCase()) : null;
  const d = state.dislodged.find((x) => M.prov(x.loc) === p);
  if (!d) return { error: 'Aucune unité délogée à cet emplacement.' };
  if (d.power !== power) return { error: 'Cette unité ne vous appartient pas.' };
  if (raw.action === 'disband') return { order: { prov: p, kind: 'D' } };
  if (raw.action !== 'retreat') return { error: 'Ordre de retraite inconnu.' };
  const to = raw.to ? String(raw.to).toUpperCase().replace(/\/(NC|SC|EC)$/, (m) => m.toLowerCase()) : '';
  let dest = d.options.find((o) => o === to);
  if (!dest && !M.coastOf(to)) {
    const matches = d.options.filter((o) => M.prov(o) === to);
    if (matches.length > 1) return { error: 'Précisez la côte de retraite.' };
    dest = matches[0];
  }
  if (!dest) return { error: 'Retraite impossible vers cette province.' };
  return { order: { prov: p, kind: 'R', to: dest } };
}

function adjustmentCounts(state) {
  const out = {};
  for (const pw of M.POWERS) {
    const centers = Object.values(state.centers).filter((x) => x === pw).length;
    const units = state.units.filter((u) => u.power === pw).length;
    out[pw] = { centers, units, delta: centers - units, freeHomes: freeHomeCenters(state, pw) };
  }
  return out;
}

function freeHomeCenters(state, power) {
  return M.HOME_CENTERS[power].filter((c) => state.centers[c] === power && !unitAt(state, c));
}

function normalizeAdjustmentOrder(state, power, raw, alreadyAccepted) {
  const counts = adjustmentCounts(state)[power];
  const action = raw && raw.action;
  if (action === 'waive') {
    if (counts.delta <= 0) return { error: 'Aucune construction disponible.' };
    return { order: { kind: 'W' } };
  }
  if (action === 'build') {
    if (counts.delta <= 0) return { error: 'Aucune construction disponible.' };
    const type = raw.unitType === 'F' ? 'F' : 'A';
    const loc = String(raw.loc || '').toUpperCase().replace(/\/(NC|SC|EC)$/, (m) => m.toLowerCase());
    const p = M.prov(loc);
    if (!M.HOME_CENTERS[power].includes(p)) return { error: 'On ne construit que dans ses centres d\'origine.' };
    if (state.centers[p] !== power) return { error: 'Ce centre d\'origine ne vous appartient plus.' };
    if (unitAt(state, p)) return { error: 'Ce centre est occupé.' };
    if (alreadyAccepted.some((o) => o.kind === 'B' && M.prov(o.loc) === p)) return { error: 'Construction déjà prévue ici.' };
    let finalLoc = p;
    if (type === 'F') {
      if (!M.isCoastal(p)) return { error: 'Une flotte doit être construite sur une côte.' };
      const coasts = M.PROVINCES[p].coasts;
      if (coasts) {
        if (!M.coastOf(loc) || !coasts.includes(M.coastOf(loc))) return { error: 'Précisez la côte.' };
        finalLoc = loc;
      }
    }
    return { order: { kind: 'B', type, loc: finalLoc } };
  }
  if (action === 'disband') {
    if (counts.delta >= 0) return { error: 'Aucun licenciement requis.' };
    const p = M.prov(String(raw.unit || '').toUpperCase());
    const u = unitAt(state, p);
    if (!u || u.power !== power) return { error: 'Aucune de vos unités à cet emplacement.' };
    if (alreadyAccepted.some((o) => o.kind === 'D' && o.prov === p)) return { error: 'Unité déjà licenciée.' };
    return { order: { kind: 'D', prov: p } };
  }
  return { error: 'Ordre d\'ajustement inconnu.' };
}

/** Distance (en provinces) d'une unité au plus proche centre d'origine possédé — pour les licenciements d'office. */
function distanceToHome(state, power, unit) {
  const homes = new Set(M.HOME_CENTERS[power].filter((c) => state.centers[c] === power));
  if (homes.size === 0) return 0;
  const start = M.prov(unit.loc);
  const seen = new Set([start]);
  let frontier = [start];
  let d = 0;
  while (frontier.length) {
    if (frontier.some((p) => homes.has(p))) return d;
    const next = [];
    for (const p of frontier) {
      const ns = new Set([...(M.armyAdj[p] || [])]);
      for (const key of Object.keys(M.fleetAdj)) if (M.prov(key) === p) for (const n of M.fleetAdj[key]) ns.add(M.prov(n));
      for (const n of ns) if (!seen.has(n)) { seen.add(n); next.push(n); }
    }
    frontier = next;
    d++;
  }
  return 99;
}

// ------------------------------------------------------------------
// Validation générique d'un lot d'ordres d'une puissance
// ------------------------------------------------------------------

/**
 * Valide la liste d'ordres d'une puissance pour la phase courante.
 * Retourne { accepted: [{raw, order}], errors: [{raw, error}] }.
 * Un seul ordre par unité : le dernier l'emporte.
 */
function validateOrders(state, power, rawOrders) {
  const accepted = [];
  const errors = [];
  for (const raw of rawOrders || []) {
    let res;
    if (state.phase === 'M') res = normalizeMovementOrder(state, power, raw);
    else if (state.phase === 'R') res = normalizeRetreatOrder(state, power, raw);
    else res = normalizeAdjustmentOrder(state, power, raw, accepted.map((a) => a.order));
    if (res.error) { errors.push({ raw, error: res.error }); continue; }
    if (state.phase !== 'A') {
      const i = accepted.findIndex((a) => a.order.prov === res.order.prov);
      if (i >= 0) accepted.splice(i, 1);
    }
    accepted.push({ raw, order: res.order });
  }
  if (state.phase === 'A') {
    const delta = adjustmentCounts(state)[power].delta;
    const limit = Math.abs(delta);
    if (accepted.length > limit) {
      for (const extra of accepted.splice(limit)) errors.push({ raw: extra.raw, error: 'Nombre d\'ajustements dépassé.' });
    }
  }
  return { accepted, errors };
}

/** Puissances qui doivent donner des ordres pendant cette phase. */
function powersToAct(state) {
  if (state.phase === 'M') return M.POWERS.filter((pw) => state.units.some((u) => u.power === pw));
  if (state.phase === 'R') return M.POWERS.filter((pw) => state.dislodged.some((d) => d.power === pw));
  const counts = adjustmentCounts(state);
  return M.POWERS.filter((pw) => {
    const c = counts[pw];
    if (c.delta < 0) return true;
    return c.delta > 0 && c.freeHomes.length > 0;
  });
}

// ------------------------------------------------------------------
// Résolution
// ------------------------------------------------------------------

/**
 * Résout la phase courante.
 * @param state état courant
 * @param ordersByPower { POWER: [rawOrder] }
 * @returns { state: nouvel état, report: { phase, orders: [...] } }
 */
function resolvePhase(state, ordersByPower) {
  const s = JSON.parse(JSON.stringify(state));
  if (s.phase === 'M') return resolveMovement(s, ordersByPower);
  if (s.phase === 'R') return resolveRetreats(s, ordersByPower);
  return resolveAdjustments(s, ordersByPower);
}

function resolveMovement(s, ordersByPower) {
  const orders = [];
  const report = [];
  const byProv = {};
  for (const pw of M.POWERS) {
    const { accepted, errors } = validateOrders(s, pw, ordersByPower[pw] || []);
    for (const a of accepted) byProv[a.order.prov] = a.order;
    for (const e of errors) report.push({ power: pw, text: describeRaw(e.raw), result: 'invalid', detail: e.error });
  }
  for (const u of s.units) {
    const p = M.prov(u.loc);
    orders.push(byProv[p] || { power: u.power, unitType: u.type, loc: u.loc, prov: p, kind: 'H', defaulted: true });
  }
  const out = adjudicateMovement(orders);
  const resultByProv = {};
  for (const r of out.results) resultByProv[r.prov] = r;
  for (const o of orders) {
    const r = resultByProv[o.prov];
    report.push({
      power: o.power, text: describeOrder(o), result: r.result, detail: r.detail,
      dislodged: !!r.dislodged, defaulted: !!o.defaulted,
    });
  }
  s.units = out.units;
  s.dislodged = out.dislodged;
  const from = phaseName(s);
  if (s.dislodged.length) {
    s.phase = 'R';
  } else {
    advanceAfterSeason(s);
  }
  return { state: s, report: { phase: from, orders: report } };
}

function resolveRetreats(s, ordersByPower) {
  const report = [];
  const chosen = {};
  for (const pw of M.POWERS) {
    const { accepted, errors } = validateOrders(s, pw, ordersByPower[pw] || []);
    for (const a of accepted) chosen[a.order.prov] = a.order;
    for (const e of errors) report.push({ power: pw, text: describeRaw(e.raw), result: 'invalid', detail: e.error });
  }
  const targets = {};
  for (const d of s.dislodged) {
    const o = chosen[M.prov(d.loc)];
    if (o && o.kind === 'R') (targets[M.prov(o.to)] = targets[M.prov(o.to)] || []).push(d);
  }
  for (const d of s.dislodged) {
    const o = chosen[M.prov(d.loc)];
    const name = `${d.type} ${d.loc}`;
    if (!o || o.kind === 'D') {
      report.push({ power: d.power, text: `${name} licenciée`, result: 'ok', detail: o ? null : 'default' });
      continue;
    }
    if (targets[M.prov(o.to)].length > 1) {
      report.push({ power: d.power, text: `${name} R ${o.to}`, result: 'fail', detail: 'bounce' });
      continue;
    }
    s.units.push({ power: d.power, type: d.type, loc: o.to });
    report.push({ power: d.power, text: `${name} R ${o.to}`, result: 'ok' });
  }
  const from = phaseName(s);
  s.dislodged = [];
  advanceAfterSeason(s);
  return { state: s, report: { phase: from, orders: report } };
}

function resolveAdjustments(s, ordersByPower) {
  const report = [];
  const counts = adjustmentCounts(s);
  for (const pw of M.POWERS) {
    const { accepted, errors } = validateOrders(s, pw, ordersByPower[pw] || []);
    for (const e of errors) report.push({ power: pw, text: describeRaw(e.raw), result: 'invalid', detail: e.error });
    const delta = counts[pw].delta;
    if (delta > 0) {
      let built = 0;
      for (const { order } of accepted) {
        if (order.kind === 'B') {
          s.units.push({ power: pw, type: order.type, loc: order.loc });
          report.push({ power: pw, text: `Construction ${order.type} ${order.loc}`, result: 'ok' });
          built++;
        }
      }
      const waived = Math.min(delta, counts[pw].freeHomes.length) - built;
      if (waived > 0) report.push({ power: pw, text: `${waived} construction(s) non utilisée(s)`, result: 'ok', detail: 'waive' });
    } else if (delta < 0) {
      let toRemove = -delta;
      for (const { order } of accepted) {
        if (order.kind !== 'D' || toRemove === 0) continue;
        const u = unitAt(s, order.prov);
        s.units = s.units.filter((x) => x !== u);
        report.push({ power: pw, text: `Licenciement ${u.type} ${u.loc}`, result: 'ok' });
        toRemove--;
      }
      // Licenciements d'office : unités les plus éloignées, flottes d'abord, puis ordre alphabétique
      while (toRemove > 0) {
        const mine = s.units.filter((u) => u.power === pw)
          .map((u) => ({ u, d: distanceToHome(s, pw, u) }))
          .sort((a, b) => b.d - a.d || (a.u.type === b.u.type ? 0 : a.u.type === 'F' ? -1 : 1) || a.u.loc.localeCompare(b.u.loc));
        const victim = mine[0].u;
        s.units = s.units.filter((x) => x !== victim);
        report.push({ power: pw, text: `Licenciement ${victim.type} ${victim.loc}`, result: 'ok', detail: 'default' });
        toRemove--;
      }
    }
  }
  const from = phaseName(s);
  s.season = 'S';
  s.year += 1;
  s.phase = 'M';
  return { state: s, report: { phase: from, orders: report } };
}

/** Passage à la phase suivante après les mouvements (et retraites) d'une saison. */
function advanceAfterSeason(s) {
  if (s.season === 'S') {
    s.season = 'F';
    s.phase = 'M';
    return;
  }
  // Fin d'automne : prise des centres
  for (const u of s.units) {
    const p = M.prov(u.loc);
    if (M.PROVINCES[p].sc) s.centers[p] = u.power;
  }
  for (const pw of M.POWERS) {
    if (Object.values(s.centers).filter((x) => x === pw).length >= VICTORY_CENTERS) s.winner = pw;
  }
  s.season = 'W';
  s.phase = 'A';
  if (s.winner) return;
  if (powersToAct(s).length === 0) {
    s.season = 'S';
    s.year += 1;
    s.phase = 'M';
  }
}

// ------------------------------------------------------------------
// Affichage
// ------------------------------------------------------------------

function describeOrder(o) {
  const u = `${o.unitType} ${o.loc}`;
  switch (o.kind) {
    case 'H': return `${u} H`;
    case 'M': return `${u} - ${o.destLoc}${o.viaConvoy ? ' (convoi)' : ''}`;
    case 'S': return o.supDest ? `${u} S ${o.supTarget} - ${o.supDest}` : `${u} S ${o.supTarget}`;
    case 'C': return `${u} C ${o.cvFrom} - ${o.cvTo}`;
    default: return u;
  }
}

function describeRaw(raw) {
  if (!raw) return '?';
  const a = raw.action;
  if (a === 'hold') return `${raw.unit} H`;
  if (a === 'move') return `${raw.unit} - ${raw.to}`;
  if (a === 'support') return raw.targetTo ? `${raw.unit} S ${raw.target} - ${raw.targetTo}` : `${raw.unit} S ${raw.target}`;
  if (a === 'convoy') return `${raw.unit} C ${raw.target} - ${raw.targetTo}`;
  if (a === 'retreat') return `${raw.unit} R ${raw.to}`;
  if (a === 'build') return `Construction ${raw.unitType} ${raw.loc}`;
  if (a === 'disband') return `Licenciement ${raw.unit}`;
  if (a === 'waive') return 'Renonciation';
  return JSON.stringify(raw);
}

module.exports = {
  VICTORY_CENTERS, initialState, phaseName, phaseLabel, validateOrders, powersToAct,
  resolvePhase, adjustmentCounts, convoyPossible, unitAt,
};
