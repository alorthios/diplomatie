'use strict';
/**
 * Résolution de la phase de mouvement.
 *
 * Algorithme de Lucas Kruijswijk (« The Math of Adjudication ») : résolution
 * récursive avec hypothèses, détection des cycles, et règle de secours :
 *  - cycle composé uniquement de mouvements (et convois) : mouvement circulaire, tout réussit ;
 *  - paradoxe de convoi : règle de Szykman (l'armée convoyée du cycle reste sur place).
 *
 * Entrée : liste d'ordres normalisés, un par unité :
 *   { power, unitType, loc, prov, kind: 'H'|'M'|'S'|'C',
 *     dest, destLoc, viaConvoy,              // kind M
 *     supTarget, supDest,                    // kind S (supDest null = soutien défensif)
 *     cvFrom, cvTo }                         // kind C
 */
const M = require('./map');

const UNRESOLVED = 0;
const GUESSING = 1;
const RESOLVED = 2;

function adjudicateMovement(orders) {
  const at = {};
  const movesTo = {};
  for (const o of orders) {
    at[o.prov] = o;
    o.state = UNRESOLVED;
    o.res = false;
    o.paradox = false;
    if (o.kind === 'M') {
      o.isConvoy = o.unitType === 'A' && (o.viaConvoy || !M.canMove('A', o.prov, o.dest));
      (movesTo[o.dest] = movesTo[o.dest] || []).push(o);
    }
  }
  const supportsOf = {}; // clé "src>dest" ou "src>" -> soutiens
  for (const o of orders) {
    if (o.kind !== 'S') continue;
    const key = `${o.supTarget}>${o.supDest || ''}`;
    (supportsOf[key] = supportsOf[key] || []).push(o);
  }

  const deps = [];

  function resolve(o) {
    if (o.state === RESOLVED) return o.res;
    if (o.state === GUESSING) {
      if (!deps.includes(o)) deps.push(o);
      return o.res;
    }
    const start = deps.length;
    o.res = false;
    o.state = GUESSING;
    const first = adjudicate(o);
    if (deps.length === start) {
      if (o.state !== RESOLVED) { o.res = first; o.state = RESOLVED; }
      return first;
    }
    if (deps[start] !== o) {
      // Le résultat dépend de l'hypothèse faite sur un autre ordre
      deps.push(o);
      o.res = first;
      return first;
    }
    // Le résultat dépend de notre propre hypothèse : on essaie l'autre
    for (const d of deps.slice(start)) d.state = UNRESOLVED;
    deps.length = start;
    o.res = true;
    o.state = GUESSING;
    const second = adjudicate(o);
    if (first === second) {
      for (const d of deps.slice(start)) d.state = UNRESOLVED;
      deps.length = start;
      o.res = first;
      o.state = RESOLVED;
      return first;
    }
    backupRule(start);
    return resolve(o);
  }

  function backupRule(start) {
    const cycle = deps.slice(start);
    deps.length = start;
    const convoyMoves = cycle.filter((d) => d.kind === 'M' && d.isConvoy);
    const hasSupport = cycle.some((d) => d.kind === 'S');
    if (!hasSupport || convoyMoves.length === 0) {
      // Mouvement circulaire : les mouvements réussissent
      for (const d of cycle) {
        if (d.kind === 'M') { d.state = RESOLVED; d.res = true; } else d.state = UNRESOLVED;
      }
      return;
    }
    // Paradoxe de convoi (règle de Szykman)
    for (const d of convoyMoves) d.paradox = true;
    for (const d of cycle) d.state = UNRESOLVED;
  }

  function seaNeighbors(province) {
    const out = new Set();
    for (const key of Object.keys(M.fleetAdj)) {
      if (M.prov(key) !== province) continue;
      for (const n of M.fleetAdj[key]) if (M.isSea(M.prov(n))) out.add(n);
    }
    return out;
  }

  function pathOk(m) {
    if (!m.isConvoy) return true;
    if (m.paradox) return false;
    const goal = seaNeighbors(m.dest);
    const usable = (sea) => {
      const c = at[sea];
      return c && c.kind === 'C' && c.cvFrom === m.prov && c.cvTo === m.dest && resolve(c);
    };
    const seen = new Set();
    const queue = [];
    for (const s of seaNeighbors(m.prov)) if (usable(s)) { seen.add(s); queue.push(s); }
    while (queue.length) {
      const s = queue.shift();
      if (goal.has(s)) return true;
      for (const n of M.fleetAdj[s] || []) {
        if (!M.isSea(n) || seen.has(n)) continue;
        if (usable(n)) { seen.add(n); queue.push(n); }
      }
    }
    return false;
  }

  function isHeadToHead(m) {
    const opp = at[m.dest];
    return !!(opp && opp.kind === 'M' && opp.dest === m.prov && !opp.isConvoy && !m.isConvoy);
  }

  function supportCount(m, excludePower) {
    let n = 0;
    for (const s of supportsOf[`${m.prov}>${m.dest}`] || []) {
      if (s.power === excludePower) continue;
      if (resolve(s)) n++;
    }
    return n;
  }

  function attackStrength(m) {
    if (!pathOk(m)) return 0;
    const opp = at[m.dest];
    const h2h = isHeadToHead(m);
    if (!opp || (opp.kind === 'M' && !h2h && resolve(opp))) return 1 + supportCount(m, null);
    if (opp.power === m.power) return 0;
    return 1 + supportCount(m, opp.power);
  }

  function holdStrength(province) {
    const o = at[province];
    if (!o) return 0;
    if (o.kind === 'M') return resolve(o) ? 0 : 1;
    let n = 1;
    for (const s of supportsOf[`${province}>`] || []) if (resolve(s)) n++;
    return n;
  }

  function defendStrength(m) { return 1 + supportCount(m, null); }

  function preventStrength(m) {
    if (!pathOk(m)) return 0;
    if (isHeadToHead(m) && resolve(at[m.dest])) return 0;
    return 1 + supportCount(m, null);
  }

  function supportValid(s) {
    const t = at[s.supTarget];
    if (!t) return false;
    if (s.supDest) return t.kind === 'M' && t.dest === s.supDest;
    return t.kind !== 'M';
  }

  function adjudicate(o) {
    switch (o.kind) {
      case 'M': {
        if (!pathOk(o)) return false;
        const attack = attackStrength(o);
        if (isHeadToHead(o)) {
          if (attack <= defendStrength(at[o.dest])) return false;
        } else if (attack <= holdStrength(o.dest)) return false;
        for (const other of movesTo[o.dest]) {
          if (other !== o && attack <= preventStrength(other)) return false;
        }
        return true;
      }
      case 'S': {
        if (!supportValid(o)) return false;
        for (const m of movesTo[o.prov] || []) {
          if (m.power === o.power) continue;
          if (o.supDest && m.prov === o.supDest) {
            if (resolve(m)) return false; // délogé par l'unité visée
          } else if (pathOk(m)) return false; // soutien coupé
        }
        return true;
      }
      case 'C':
        return !(movesTo[o.prov] || []).some((m) => resolve(m));
      default:
        return true;
    }
  }

  for (const o of orders) resolve(o);

  // ---- Résultats ----
  const results = [];
  const dislodged = [];
  const newUnits = [];
  const contested = new Set();
  const successfulInto = {};
  for (const o of orders) if (o.kind === 'M' && o.res) successfulInto[o.dest] = o;

  for (const o of orders) {
    const r = { prov: o.prov, power: o.power, result: 'ok', detail: null };
    if (o.kind === 'M') {
      if (o.res) r.result = 'ok';
      else if (o.isConvoy && !pathOk(o)) { r.result = 'fail'; r.detail = o.paradox ? 'paradox' : 'noconvoy'; }
      else { r.result = 'fail'; r.detail = 'bounce'; }
      if (!o.res && pathOk(o) && !successfulInto[o.dest]) contested.add(o.dest);
    } else if (o.kind === 'S') {
      if (!supportValid(o)) { r.result = 'fail'; r.detail = 'void'; }
      else if (!o.res) { r.result = 'fail'; r.detail = 'cut'; }
    } else if (o.kind === 'C') {
      const valid = at[o.cvFrom] && at[o.cvFrom].kind === 'M' && at[o.cvFrom].dest === o.cvTo && at[o.cvFrom].isConvoy;
      if (!valid) { r.result = 'fail'; r.detail = 'void'; }
    }
    const movedAway = o.kind === 'M' && o.res;
    const attacker = successfulInto[o.prov];
    if (!movedAway && attacker) {
      r.dislodged = true;
      dislodged.push({
        power: o.power, type: o.unitType, loc: o.loc,
        attackerFrom: attacker.prov, attackerViaConvoy: attacker.isConvoy,
      });
    } else {
      newUnits.push({ power: o.power, type: o.unitType, loc: movedAway ? o.destLoc : o.loc });
    }
    results.push(r);
  }

  // Options de retraite
  const occupied = new Set(newUnits.map((u) => M.prov(u.loc)));
  for (const d of dislodged) {
    d.options = M.neighbors(d.type, d.loc).filter((l) => {
      const p = M.prov(l);
      if (occupied.has(p) || contested.has(p)) return false;
      if (p === d.attackerFrom && !d.attackerViaConvoy) return false;
      return true;
    });
  }

  return { units: newUnits, dislodged, results, contested: [...contested] };
}

module.exports = { adjudicateMovement };
