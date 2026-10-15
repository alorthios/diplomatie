'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { pool } = require('./db');
const config = require('./config');
const { HttpError } = require('./errors');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'dip_session';
const PSEUDO_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;
const PIN_RE = /^\d{4,8}$/;

async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pin, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPin(pin, stored) {
  const [, saltB64, keyB64] = stored.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(pin, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function validateCredentials(pseudo, pin) {
  if (typeof pseudo !== 'string' || !PSEUDO_RE.test(pseudo.trim())) {
    throw new HttpError(400, 'Pseudo invalide : 3 à 20 caractères (lettres, chiffres, _ . -).');
  }
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) {
    throw new HttpError(400, 'Le code PIN doit contenir 4 à 8 chiffres.');
  }
  return pseudo.trim();
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400e3);
  await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), userId, expires]);
  return { token, expires };
}

function setCookie(res, token, expires) {
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, expires, path: '/',
  });
}

async function register(pseudoRaw, pin) {
  if (!config.allowRegistration) throw new HttpError(403, 'Les inscriptions sont fermées.');
  const pseudo = validateCredentials(pseudoRaw, pin);
  const hash = await hashPin(pin);
  try {
    const { rows } = await pool.query('INSERT INTO users (pseudo, pin_hash) VALUES ($1, $2) RETURNING id, pseudo', [pseudo, hash]);
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Ce pseudo est déjà pris.');
    throw err;
  }
}

async function login(pseudoRaw, pin) {
  const pseudo = validateCredentials(pseudoRaw, pin);
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(pseudo) = lower($1)', [pseudo]);
  const user = rows[0];
  const fail = new HttpError(401, 'Pseudo ou code PIN incorrect.');
  if (!user) {
    await hashPin(pin); // temps constant approximatif
    throw fail;
  }
  if (user.locked_until && user.locked_until > new Date()) {
    const min = Math.ceil((user.locked_until - Date.now()) / 60000);
    throw new HttpError(429, `Trop d'essais. Compte verrouillé encore ${min} min.`);
  }
  if (!(await verifyPin(pin, user.pin_hash))) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= config.maxLoginAttempts;
    await pool.query(
      'UPDATE users SET failed_attempts = $2, locked_until = $3 WHERE id = $1',
      [user.id, lock ? 0 : attempts, lock ? new Date(Date.now() + config.lockMinutes * 60e3) : null],
    );
    if (lock) throw new HttpError(429, `Trop d'essais. Compte verrouillé ${config.lockMinutes} min.`);
    throw fail;
  }
  await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  return { id: user.id, pseudo: user.pseudo };
}

async function changePin(userId, oldPin, newPin) {
  if (!PIN_RE.test(newPin || '')) throw new HttpError(400, 'Le code PIN doit contenir 4 à 8 chiffres.');
  const { rows } = await pool.query('SELECT pin_hash FROM users WHERE id = $1', [userId]);
  if (!rows[0] || !PIN_RE.test(oldPin || '') || !(await verifyPin(oldPin, rows[0].pin_hash))) {
    throw new HttpError(401, 'Code PIN actuel incorrect.');
  }
  await pool.query('UPDATE users SET pin_hash = $2 WHERE id = $1', [userId, await hashPin(newPin)]);
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Middleware : charge req.user depuis le cookie de session. */
async function sessionMiddleware(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const { rows } = await pool.query(
        `SELECT u.id, u.pseudo FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [sha256(token)],
      );
      if (rows[0]) { req.user = rows[0]; req.sessionToken = token; }
    }
    next();
  } catch (err) { next(err); }
}

function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Connexion requise.'));
  return next();
}

async function logout(req, res) {
  if (req.sessionToken) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(req.sessionToken)]);
  res.clearCookie(COOKIE, { path: '/' });
}

async function purgeExpiredSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
}

module.exports = {
  register, login, logout, changePin, createSession, setCookie, sessionMiddleware, requireUser,
  purgeExpiredSessions, hashPin, verifyPin,
};
