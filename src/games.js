'use strict';
const crypto = require('node:crypto');
const { pool, tx } = require('./db');
const G = require('./engine/game');
const M = require('./engine/map');
const { HttpError } = require('./errors');
const log = require('./log');

const PHASE_PRESETS = [0, 5, 10, 30, 60, 180, 720, 1440, 2880, 4320];

// ------------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------------

function cleanRawOrder(o) {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  for (const k of ['unit', 'action', 'to', 'target', 'targetTo', 'loc', 'unitType']) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = String(o[k]).slice(0, 12);
  }
  if (o.viaConvoy) out.viaConvoy = true;
  return out;
}

function isAlive(state, power) {
  return state.units.some((u) => u.power === power)
    || Object.values(state.centers).includes(power)
    || state.dislodged.some((d) => d.power === power);
}

async function loadGame(c, gameId, lock = false) {
  const { rows } = await c.query(`SELECT * FROM games WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [gameId]);
  if (!rows[0]) throw new HttpError(404, 'Partie introuvable.');
  return rows[0];
}

async function loadPlayers(c, gameId) {
  const { rows } = await c.query(
    `SELECT p.*, u.pseudo FROM players p JOIN users u ON u.id = p.user_id
     WHERE p.game_id = $1 ORDER BY p.joined_at`, [gameId],
  );
  return rows;
}

async function currentPhase(c, gameId, lock = false) {
  const { rows } = await c.query(
    `SELECT * FROM phases WHERE game_id = $1 ORDER BY idx DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`, [gameId],
  );
  return rows[0] || null;
}

function deadlineFrom(game) {
  return game.phase_minutes > 0 ? new Date(Date.now() + game.phase_minutes * 60e3) : null;
}

// ------------------------------------------------------------------
// Salon
// ------------------------------------------------------------------

async function listGames(userId) {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.status, g.phase_minutes, g.press, g.result, g.created_at,
            u.pseudo AS creator,
            (SELECT count(*)::int FROM players p WHERE p.game_id = g.id) AS player_count,
            (SELECT p.power FROM players p WHERE p.game_id = g.id AND p.user_id = $1) AS my_power,
            EXISTS (SELECT 1 FROM players p WHERE p.game_id = g.id AND p.user_id = $1) AS joined,
            (SELECT ph.name FROM phases ph WHERE ph.game_id = g.id ORDER BY ph.idx DESC LIMIT 1) AS phase,
            (SELECT ph.deadline FROM phases ph WHERE ph.game_id = g.id ORDER BY ph.idx DESC LIMIT 1) AS deadline
     FROM games g JOIN users u ON u.id = g.creator_id
     ORDER BY (g.status = 'finished'), g.created_at DESC
     LIMIT 200`,
    [userId],
  );
  return rows;
}

async function createGame(userId, body) {
  const name = String(body.name || '').trim().slice(0, 60);
  if (name.length < 2) throw new HttpError(400, 'Donnez un nom à la partie (2 caractères minimum).');
  const minutes = Number.parseInt(body.phaseMinutes, 10) || 0;
  if (!PHASE_PRESETS.includes(minutes)) throw new HttpError(400, 'Durée de phase invalide.');
  const press = ['full', 'public', 'none'].includes(body.press) ? body.press : 'full';
  const power = body.power && M.POWERS.includes(body.power) ? body.power : null;
  return tx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO games (name, creator_id, phase_minutes, press) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, userId, minutes, press],
    );
    await c.query('INSERT INTO players (game_id, user_id, power) VALUES ($1, $2, $3)', [rows[0].id, userId, power]);
    return { id: rows[0].id };
  });
}

async function joinGame(userId, gameId, power) {
  if (power && !M.POWERS.includes(power)) throw new HttpError(400, 'Puissance inconnue.');
  return tx(async (c) => {
    const game = await loadGame(c, gameId, true);
    if (game.status !== 'lobby') throw new HttpError(409, 'La partie a déjà commencé.');
    const players = await loadPlayers(c, gameId);
    const mine = players.find((p) => p.user_id === userId);
    if (!mine && players.length >= M.POWERS.length) throw new HttpError(409, 'La partie est complète.');
    if (power && players.some((p) => p.power === power && p.user_id !== userId)) {
      throw new HttpError(409, 'Cette puissance est déjà prise.');
    }
    if (mine) {
      await c.query('UPDATE players SET power = $3 WHERE game_id = $1 AND user_id = $2', [gameId, userId, power || null]);
    } else {
      await c.query('INSERT INTO players (game_id, user_id, power) VALUES ($1, $2, $3)', [gameId, userId, power || null]);
    }
  });
}

async function leaveGame(userId, gameId) {
  return tx(async (c) => {
    const game = await loadGame(c, gameId, true);
    if (game.status !== 'lobby') throw new HttpError(409, 'Impossible de quitter une partie commencée.');
    if (game.creator_id === userId) {
      await c.query('DELETE FROM games WHERE id = $1', [gameId]);
      return { deleted: true };
    }
    await c.query('DELETE FROM players WHERE game_id = $1 AND user_id = $2', [gameId, userId]);
    return { deleted: false };
  });
}

async function startGame(userId, gameId) {
  await tx(async (c) => {
    const game = await loadGame(c, gameId, true);
    if (game.creator_id !== userId) throw new HttpError(403, 'Seul le créateur peut lancer la partie.');
    if (game.status !== 'lobby') throw new HttpError(409, 'La partie a déjà commencé.');
    const players = await loadPlayers(c, gameId);
    // Attribution aléatoire des puissances restantes
    const free = M.POWERS.filter((pw) => !players.some((p) => p.power === pw));
    for (let i = free.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [free[i], free[j]] = [free[j], free[i]];
    }
    for (const p of players.filter((x) => !x.power)) {
      await c.query('UPDATE players SET power = $3 WHERE game_id = $1 AND user_id = $2', [gameId, p.user_id, free.shift()]);
    }
    const state = G.initialState();
    await c.query(
      'INSERT INTO phases (game_id, idx, name, state, deadline) VALUES ($1, 0, $2, $3, $4)',
      [gameId, G.phaseName(state), state, deadlineFrom(game)],
    );
    await c.query("UPDATE games SET status = 'active', started_at = now() WHERE id = $1", [gameId]);
  });
  await advance(gameId);
}

// ------------------------------------------------------------------
// Résolution
// ------------------------------------------------------------------

/**
 * Fait avancer la partie tant que les conditions sont réunies :
 * tous les joueurs concernés sont prêts, l'échéance est passée, ou résolution forcée.
 * Les puissances sans joueur (désordre civil) n'ont pas d'ordres.
 */
async function advance(gameId, { force = false } = {}) {
  let forced = force;
  for (let guard = 0; guard < 20; guard++) {
    const resolved = await tx(async (c) => {
      const game = await loadGame(c, gameId, true);
      if (game.status !== 'active') return false;
      const phase = await currentPhase(c, gameId, true);
      if (!phase || phase.resolved_at) return false;
      const players = await loadPlayers(c, gameId);
      const human = new Set(players.map((p) => p.power).filter(Boolean));
      const needed = G.powersToAct(phase.state).filter((pw) => human.has(pw));
      const { rows: orderRows } = await c.query('SELECT * FROM orders WHERE phase_id = $1', [phase.id]);
      const allReady = needed.every((pw) => orderRows.some((o) => o.power === pw && o.ready));
      const overdue = phase.deadline && phase.deadline <= new Date();
      if (!(forced || overdue || allReady)) return false;

      const ordersByPower = {};
      for (const o of orderRows) ordersByPower[o.power] = o.orders;
      const { state, report } = G.resolvePhase(phase.state, ordersByPower);
      await c.query('UPDATE phases SET report = $2, resolved_at = now() WHERE id = $1', [phase.id, report]);
      await c.query(
        'INSERT INTO phases (game_id, idx, name, state, deadline) VALUES ($1, $2, $3, $4, $5)',
        [gameId, phase.idx + 1, G.phaseName(state), state, state.winner ? null : deadlineFrom(game)],
      );
      await c.query('UPDATE players SET draw_vote = false WHERE game_id = $1', [gameId]);
      if (state.winner) {
        await c.query("UPDATE games SET status = 'finished', result = $2, finished_at = now() WHERE id = $1", [gameId, state.winner]);
      } else if (![...human].some((pw) => isAlive(state, pw))) {
        await c.query("UPDATE games SET status = 'finished', result = 'NONE', finished_at = now() WHERE id = $1", [gameId]);
      }
      log.info('Phase résolue', { gameId, phase: phase.name, next: G.phaseName(state) });
      return true;
    });
    forced = false;
    if (!resolved) return;
  }
}

async function forceResolve(userId, gameId) {
  const game = await loadGame(pool, gameId);
  if (game.creator_id !== userId) throw new HttpError(403, 'Seul le créateur peut forcer la résolution.');
  if (game.status !== 'active') throw new HttpError(409, 'La partie n\'est pas en cours.');
  await advance(gameId, { force: true });
}

/** Résout les phases dont l'échéance est passée (appelé périodiquement). */
async function tick() {
  const { rows } = await pool.query(
    `SELECT DISTINCT ph.game_id FROM phases ph JOIN games g ON g.id = ph.game_id
     WHERE ph.resolved_at IS NULL AND ph.deadline <= now() AND g.status = 'active'`,
  );
  for (const r of rows) {
    try { await advance(r.game_id); } catch (err) { log.error('Échec de résolution', { gameId: r.game_id, err: err.message }); }
  }
}

// ------------------------------------------------------------------
// Ordres
// ------------------------------------------------------------------

async function myPower(c, gameId, userId) {
  const { rows } = await c.query('SELECT power FROM players WHERE game_id = $1 AND user_id = $2', [gameId, userId]);
  return rows[0] ? rows[0].power : undefined;
}

async function submitOrders(userId, gameId, body) {
  const raw = Array.isArray(body.orders) ? body.orders.slice(0, 40).map(cleanRawOrder).filter(Boolean) : [];
  const ready = !!body.ready;
  const result = await tx(async (c) => {
    const game = await loadGame(c, gameId, true);
    if (game.status !== 'active') throw new HttpError(409, 'La partie n\'est pas en cours.');
    const power = await myPower(c, gameId, userId);
    if (!power) throw new HttpError(403, 'Vous ne jouez pas dans cette partie.');
    const phase = await currentPhase(c, gameId);
    if (!G.powersToAct(phase.state).includes(power)) throw new HttpError(409, 'Vous n\'avez pas d\'ordre à donner pendant cette phase.');
    const { accepted, errors } = G.validateOrders(phase.state, power, raw);
    await c.query(
      `INSERT INTO orders (phase_id, power, orders, ready, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (phase_id, power) DO UPDATE SET orders = EXCLUDED.orders, ready = EXCLUDED.ready, updated_at = now()`,
      [phase.id, power, JSON.stringify(accepted.map((a) => a.raw)), ready],
    );
    return { accepted: accepted.length, errors: errors.map((e) => ({ order: e.raw, error: e.error })), ready };
  });
  if (ready) await advance(gameId);
  return result;
}

async function voteDraw(userId, gameId, vote) {
  await tx(async (c) => {
    const game = await loadGame(c, gameId, true);
    if (game.status !== 'active') throw new HttpError(409, 'La partie n\'est pas en cours.');
    const power = await myPower(c, gameId, userId);
    if (!power) throw new HttpError(403, 'Vous ne jouez pas dans cette partie.');
    await c.query('UPDATE players SET draw_vote = $3 WHERE game_id = $1 AND user_id = $2', [gameId, userId, !!vote]);
    const phase = await currentPhase(c, gameId);
    const players = await loadPlayers(c, gameId);
    const alive = players.filter((p) => isAlive(phase.state, p.power));
    if (alive.length > 0 && alive.every((p) => p.draw_vote)) {
      await c.query("UPDATE games SET status = 'finished', result = 'DRAW', finished_at = now() WHERE id = $1", [gameId]);
      await c.query('UPDATE phases SET deadline = NULL WHERE id = $1', [phase.id]);
    }
  });
}

// ------------------------------------------------------------------
// Lecture
// ------------------------------------------------------------------

async function getGame(userId, gameId) {
  const game = await loadGame(pool, gameId);
  const players = await loadPlayers(pool, gameId);
  const me = players.find((p) => p.user_id === userId);
  const phase = await currentPhase(pool, gameId);
  const view = {
    game: {
      id: game.id, name: game.name, status: game.status, phaseMinutes: game.phase_minutes,
      press: game.press, result: game.result, isCreator: game.creator_id === userId,
    },
    me: me ? { power: me.power, drawVote: me.draw_vote } : null,
    players: [],
    phase: null,
    history: [],
    serverTime: new Date().toISOString(),
  };
  let orderRows = [];
  if (phase) {
    ({ rows: orderRows } = await pool.query('SELECT power, orders, ready FROM orders WHERE phase_id = $1', [phase.id]));
    const toAct = phase.resolved_at ? [] : G.powersToAct(phase.state);
    view.phase = {
      id: phase.id, idx: phase.idx, name: phase.name, label: G.phaseLabel(phase.state),
      state: phase.state, deadline: phase.deadline, powersToAct: toAct,
      adjustments: phase.state.phase === 'A' ? G.adjustmentCounts(phase.state) : null,
    };
    if (me && me.power) {
      const mine = orderRows.find((o) => o.power === me.power);
      view.myOrders = { orders: mine ? mine.orders : [], ready: mine ? mine.ready : false };
    }
    const { rows } = await pool.query('SELECT idx, name FROM phases WHERE game_id = $1 AND resolved_at IS NOT NULL ORDER BY idx', [gameId]);
    view.history = rows;
  }
  for (const p of players) {
    const o = orderRows.find((r) => r.power === p.power);
    view.players.push({
      pseudo: p.pseudo, power: p.power, isMe: p.user_id === userId,
      alive: phase ? isAlive(phase.state, p.power) : true,
      ready: o ? o.ready : false, submitted: !!(o && o.orders.length), drawVote: p.draw_vote,
      centers: phase ? Object.values(phase.state.centers).filter((x) => x === p.power).length : 0,
    });
  }
  return view;
}

async function getPhase(gameId, idx) {
  const { rows } = await pool.query(
    'SELECT idx, name, state, report, resolved_at FROM phases WHERE game_id = $1 AND idx = $2 AND resolved_at IS NOT NULL',
    [gameId, idx],
  );
  if (!rows[0]) throw new HttpError(404, 'Phase introuvable ou pas encore résolue.');
  return { ...rows[0], label: G.phaseLabel(rows[0].state) };
}

// ------------------------------------------------------------------
// Messagerie
// ------------------------------------------------------------------

async function listMessages(userId, gameId, sinceId) {
  const game = await loadGame(pool, gameId);
  const power = await myPower(pool, gameId, userId);
  const reveal = game.status === 'finished';
  const { rows } = await pool.query(
    `SELECT m.id, m.phase_name, m.from_power, m.to_power, m.body, m.created_at, u.pseudo
     FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.game_id = $1 AND m.id > $2
       AND ($3::boolean OR m.to_power IS NULL OR m.from_power = $4 OR m.to_power = $4)
     ORDER BY m.id LIMIT 500`,
    [gameId, sinceId || 0, reveal, power || '__none__'],
  );
  return rows;
}

async function postMessage(userId, gameId, body) {
  const text = String(body.body || '').trim();
  if (!text) throw new HttpError(400, 'Message vide.');
  if (text.length > 2000) throw new HttpError(400, 'Message trop long (2000 caractères maximum).');
  const game = await loadGame(pool, gameId);
  const power = await myPower(pool, gameId, userId);
  if (power === undefined) throw new HttpError(403, 'Seuls les joueurs de la partie peuvent écrire.');
  const to = body.to && body.to !== 'ALL' ? body.to : null;
  if (to && !M.POWERS.includes(to)) throw new HttpError(400, 'Destinataire inconnu.');
  if (to && to === power) throw new HttpError(400, 'Impossible de s\'écrire à soi-même.');
  if (game.status === 'active') {
    if (game.press === 'none') throw new HttpError(403, 'Les négociations sont désactivées dans cette partie.');
    if (game.press === 'public' && to) throw new HttpError(403, 'Seuls les messages publics sont autorisés dans cette partie.');
  } else if (to) {
    throw new HttpError(400, 'Les messages privés ne sont possibles qu\'en cours de partie.');
  }
  const phase = await currentPhase(pool, gameId);
  const { rows } = await pool.query(
    `INSERT INTO messages (game_id, user_id, phase_name, from_power, to_power, body)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [gameId, userId, phase ? phase.name : null, game.status === 'lobby' ? null : power, to, text],
  );
  return { id: rows[0].id };
}

module.exports = {
  PHASE_PRESETS, listGames, createGame, joinGame, leaveGame, startGame, submitOrders, voteDraw,
  forceResolve, tick, getGame, getPhase, listMessages, postMessage, advance,
};
