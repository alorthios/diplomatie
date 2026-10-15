'use strict';
// Journalisation minimale au format JSON (lisible via `docker compose logs`).

function write(level, msg, extra) {
  const line = { t: new Date().toISOString(), level, msg, ...(extra || {}) };
  (level === 'error' ? process.stderr : process.stdout).write(`${JSON.stringify(line)}\n`);
}

module.exports = {
  info: (msg, extra) => write('info', msg, extra),
  warn: (msg, extra) => write('warn', msg, extra),
  error: (msg, extra) => write('error', msg, extra),
};
