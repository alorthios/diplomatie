'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const config = require('./config');
const log = require('./log');

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
// Une connexion inactive perdue (redémarrage de PostgreSQL…) ne doit pas faire tomber le serveur
pool.on('error', (err) => log.warn('Connexion PostgreSQL perdue', { err: err.message }));

/** Exécute fn(client) dans une transaction. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function waitForDatabase(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === retries) throw err;
      log.info(`Base de données indisponible (${err.code || err.message}), nouvel essai ${i}/${retries}…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Applique les migrations SQL de /migrations dans l'ordre, une seule fois chacune. */
async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(421901)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await c.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    for (const f of files) {
      if (done.has(f)) continue;
      log.info(`Migration ${f}`);
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
    }
  });
}

module.exports = { pool, tx, migrate, waitForDatabase };
