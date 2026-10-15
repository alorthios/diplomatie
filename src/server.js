'use strict';
const path = require('node:path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const games = require('./games');
const M = require('./engine/map');
const log = require('./log');
const { HttpError } = require('./errors');
const pkg = require('../package.json');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const gameId = (req) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identifiant de partie invalide.');
  return id;
};

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    });
    next();
  });

  app.get('/healthz', wrap(async (_req, res) => {
    await db.pool.query('SELECT 1');
    res.json({ status: 'ok', version: pkg.version });
  }));

  // Revalidation à chaque chargement (304 si inchangé) : après une mise à jour,
  // le navigateur ne mélange pas d'anciens et de nouveaux fichiers de l'interface.
  app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
  app.use(express.json({ limit: '32kb' }));

  // Protection CSRF : les requêtes qui modifient l'état doivent être en JSON
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && !req.is('application/json')) {
      return next(new HttpError(415, 'Requête JSON attendue.'));
    }
    return next();
  });
  app.use('/api', auth.sessionMiddleware);
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // ---- Authentification ----
  const loginLimiter = rateLimiter(30, 15 * 60e3);
  app.post('/api/auth/register', loginLimiter, wrap(async (req, res) => {
    const user = await auth.register(req.body.pseudo, req.body.pin);
    const { token, expires } = await auth.createSession(user.id);
    auth.setCookie(res, token, expires);
    res.status(201).json({ user });
  }));
  app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
    const user = await auth.login(req.body.pseudo, req.body.pin);
    const { token, expires } = await auth.createSession(user.id);
    auth.setCookie(res, token, expires);
    res.json({ user });
  }));
  app.post('/api/auth/logout', wrap(async (req, res) => {
    await auth.logout(req, res);
    res.json({ ok: true });
  }));
  app.get('/api/me', (req, res) => res.json({ user: req.user || null, registration: config.allowRegistration, version: pkg.version }));
  app.put('/api/me/pin', auth.requireUser, wrap(async (req, res) => {
    await auth.changePin(req.user.id, req.body.oldPin, req.body.newPin);
    res.json({ ok: true });
  }));

  // ---- Données de la carte ----
  const mapData = M.publicMap();
  app.get('/api/map', (_req, res) => res.set('Cache-Control', 'public, max-age=3600').json(mapData));

  // ---- Parties ----
  app.use('/api/games', auth.requireUser);
  app.get('/api/games', wrap(async (req, res) => res.json({ games: await games.listGames(req.user.id), presets: games.PHASE_PRESETS })));
  app.post('/api/games', wrap(async (req, res) => res.status(201).json(await games.createGame(req.user.id, req.body))));
  app.get('/api/games/:id', wrap(async (req, res) => res.json(await games.getGame(req.user.id, gameId(req)))));
  app.post('/api/games/:id/join', wrap(async (req, res) => {
    await games.joinGame(req.user.id, gameId(req), req.body.power || null);
    res.json({ ok: true });
  }));
  app.post('/api/games/:id/leave', wrap(async (req, res) => res.json(await games.leaveGame(req.user.id, gameId(req)))));
  app.post('/api/games/:id/start', wrap(async (req, res) => {
    await games.startGame(req.user.id, gameId(req));
    res.json({ ok: true });
  }));
  app.put('/api/games/:id/orders', wrap(async (req, res) => res.json(await games.submitOrders(req.user.id, gameId(req), req.body))));
  app.post('/api/games/:id/resolve', wrap(async (req, res) => {
    await games.forceResolve(req.user.id, gameId(req));
    res.json({ ok: true });
  }));
  app.post('/api/games/:id/draw', wrap(async (req, res) => {
    await games.voteDraw(req.user.id, gameId(req), req.body.vote);
    res.json({ ok: true });
  }));
  app.get('/api/games/:id/phases/:idx', wrap(async (req, res) => {
    res.json(await games.getPhase(gameId(req), Number.parseInt(req.params.idx, 10)));
  }));
  app.get('/api/games/:id/messages', wrap(async (req, res) => {
    res.json({ messages: await games.listMessages(req.user.id, gameId(req), Number.parseInt(req.query.since, 10) || 0) });
  }));
  app.post('/api/games/:id/messages', wrap(async (req, res) => res.status(201).json(await games.postMessage(req.user.id, gameId(req), req.body))));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route inconnue.')));

  // Application monopage
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'JSON invalide.');
    const status = err.status || 500;
    if (status >= 500) log.error('Erreur serveur', { path: req.path, err: err.stack || err.message });
    res.status(status).json({ error: status >= 500 ? 'Erreur interne du serveur.' : err.message });
  });
  return app;
}

/** Limiteur simple en mémoire par adresse IP. */
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || entry.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++entry.n > max) return next(new HttpError(429, 'Trop de tentatives, réessayez plus tard.'));
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return next();
  };
}

async function main() {
  await db.waitForDatabase();
  await db.migrate();
  const app = createApp();
  const server = app.listen(config.port, () => log.info(`Diplomatie ${pkg.version} à l'écoute sur le port ${config.port}`));

  const timer = setInterval(() => {
    games.tick().catch((err) => log.error('Tick', { err: err.message }));
  }, config.tickSeconds * 1000);
  const purge = setInterval(() => auth.purgeExpiredSessions().catch(() => {}), 3600e3);

  const shutdown = (sig) => {
    log.info(`Arrêt (${sig})`);
    clearInterval(timer);
    clearInterval(purge);
    server.close(() => db.pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10e3).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    log.error('Démarrage impossible', { err: err.stack || err.message });
    process.exit(1);
  });
}

module.exports = { createApp };
