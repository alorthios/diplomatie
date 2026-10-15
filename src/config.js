'use strict';

function int(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Variable ${name} invalide : ${v}`);
  return n;
}

module.exports = {
  port: int('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://diplomatie:diplomatie@localhost:5432/diplomatie',
  // Cookie « Secure » : à activer derrière un reverse proxy HTTPS
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  sessionDays: int('SESSION_DAYS', 30),
  maxLoginAttempts: int('MAX_LOGIN_ATTEMPTS', 5),
  lockMinutes: int('LOCK_MINUTES', 15),
  tickSeconds: int('TICK_SECONDS', 15),
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
};
