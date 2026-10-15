'use strict';
/**
 * Tests d'intégration de l'API. Nécessitent une base PostgreSQL :
 *   DATABASE_URL=postgres://… npm test
 * Ignorés si TEST_DATABASE n'est pas défini à "1".
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const enabled = process.env.TEST_DATABASE === '1';

test('API : partie complète à deux joueurs', { skip: !enabled && 'TEST_DATABASE=1 requis' }, async (t) => {
  const db = require('../src/db');
  const { createApp } = require('../src/server');
  await db.migrate();
  await db.pool.query('TRUNCATE users, games RESTART IDENTITY CASCADE');
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await db.pool.end(); });

  function client() {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, {
        method,
        headers: { 'content-type': 'application/json', cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const data = await res.json();
      return { status: res.status, data };
    };
  }
  const alice = client();
  const bob = client();

  await t.test('inscription et connexion', async () => {
    assert.equal((await alice('POST', '/api/auth/register', { pseudo: 'alice', pin: '1234' })).status, 201);
    assert.equal((await bob('POST', '/api/auth/register', { pseudo: 'bob', pin: '5678' })).status, 201);
    assert.equal((await bob('POST', '/api/auth/register', { pseudo: 'Alice', pin: '0000' })).status, 409);
    assert.equal((await bob('POST', '/api/auth/register', { pseudo: 'x', pin: '12' })).status, 400);
    assert.equal((await bob('POST', '/api/auth/login', { pseudo: 'bob', pin: '0000' })).status, 401);
    assert.equal((await bob('POST', '/api/auth/login', { pseudo: 'BOB', pin: '5678' })).status, 200);
    assert.equal((await alice('GET', '/api/me')).data.user.pseudo, 'alice');
  });

  await t.test('verrouillage après trop d\'échecs', async () => {
    const eve = client();
    await eve('POST', '/api/auth/register', { pseudo: 'eve', pin: '1111' });
    let last;
    for (let i = 0; i < 5; i++) last = await eve('POST', '/api/auth/login', { pseudo: 'eve', pin: '9999' });
    assert.equal(last.status, 429);
    assert.equal((await eve('POST', '/api/auth/login', { pseudo: 'eve', pin: '1111' })).status, 429);
  });

  let id;
  await t.test('salon et lancement', async () => {
    const created = await alice('POST', '/api/games', { name: 'Test', phaseMinutes: 0, press: 'full', power: 'FRA' });
    assert.equal(created.status, 201);
    id = created.data.id;
    assert.equal((await bob('POST', `/api/games/${id}/join`, { power: 'FRA' })).status, 409);
    assert.equal((await bob('POST', `/api/games/${id}/join`, { power: 'GER' })).status, 200);
    assert.equal((await bob('POST', `/api/games/${id}/start`, {})).status, 403);
    assert.equal((await alice('POST', `/api/games/${id}/start`, {})).status, 200);
    const g = await alice('GET', `/api/games/${id}`);
    assert.equal(g.data.game.status, 'active');
    assert.equal(g.data.phase.name, 'S1901M');
    assert.equal(g.data.me.power, 'FRA');
  });

  await t.test('ordres, validation et résolution quand tous sont prêts', async () => {
    const bad = await alice('PUT', `/api/games/${id}/orders`, { orders: [{ unit: 'MUN', action: 'hold' }], ready: false });
    assert.equal(bad.data.errors.length, 1);
    await alice('PUT', `/api/games/${id}/orders`, { orders: [{ unit: 'PAR', action: 'move', to: 'BUR' }], ready: true });
    let g = await alice('GET', `/api/games/${id}`);
    assert.equal(g.data.phase.name, 'S1901M', 'attend Bob');
    await bob('PUT', `/api/games/${id}/orders`, { orders: [{ unit: 'MUN', action: 'move', to: 'BUR' }], ready: true });
    g = await alice('GET', `/api/games/${id}`);
    assert.equal(g.data.phase.name, 'F1901M');
    const hist = await alice('GET', `/api/games/${id}/phases/0`);
    assert.ok(hist.data.report.orders.some((o) => o.text === 'A PAR - BUR' && o.detail === 'bounce'));
  });

  await t.test('messagerie privée', async () => {
    assert.equal((await alice('POST', `/api/games/${id}/messages`, { to: 'GER', body: 'Alliance ?' })).status, 201);
    assert.equal((await alice('POST', `/api/games/${id}/messages`, { to: 'ALL', body: 'Bonjour à tous' })).status, 201);
    const m = await bob('GET', `/api/games/${id}/messages`);
    assert.equal(m.data.messages.length, 2);
    const outsider = client();
    await outsider('POST', '/api/auth/register', { pseudo: 'carol', pin: '4321' });
    const seen = await outsider('GET', `/api/games/${id}/messages`);
    assert.equal(seen.data.messages.length, 1, 'un spectateur ne voit que le public');
  });

  await t.test('résolution forcée et match nul', async () => {
    assert.equal((await bob('POST', `/api/games/${id}/resolve`, {})).status, 403);
    assert.equal((await alice('POST', `/api/games/${id}/resolve`, {})).status, 200);
    const g = await alice('GET', `/api/games/${id}`);
    assert.equal(g.data.phase.name, 'S1902M', 'aucun ajustement en 1901 : on passe au printemps 1902');
    await alice('POST', `/api/games/${id}/draw`, { vote: true });
    await bob('POST', `/api/games/${id}/draw`, { vote: true });
    const end = await alice('GET', `/api/games/${id}`);
    assert.equal(end.data.game.status, 'finished');
    assert.equal(end.data.game.result, 'DRAW');
  });

  await t.test('protection CSRF : JSON obligatoire', async () => {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', body: 'pseudo=a&pin=1234', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(res.status, 415);
  });
});
