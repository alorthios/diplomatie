import { renderMap, locPoint, POWER_COLORS } from './map.js';
import { RULES } from './rules.js';

// ------------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------------

const $app = document.getElementById('app');
const $nav = document.getElementById('usernav');
const $toast = document.getElementById('toast');

/** Création d'élément : h('div.class', {attr}, ...enfants) */
function h(tag, attrs, ...children) {
  const [base, id] = tag.split('#');
  const [name, ...classes] = base.split('.');
  const e = document.createElement(name || 'div');
  if (classes.length) e.className = classes.join(' ');
  if (id) e.id = id;
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'class') e.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

let toastTimer;
function toast(msg, kind = 'info') {
  $toast.textContent = msg;
  $toast.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.className = ''; }, 4000);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const provOf = (loc) => loc.split('/')[0];

const RESULT_TEXT = {
  bounce: 'rebond', cut: 'soutien coupé', void: 'sans effet', noconvoy: 'pas de convoi',
  paradox: 'paradoxe de convoi', default: 'par défaut', waive: 'renonciation',
};

const PRESS_LABEL = { full: 'Négociations libres', public: 'Messages publics uniquement', none: 'Sans négociation (gunboat)' };

function durationLabel(min) {
  if (!min) return 'Sans échéance';
  if (min < 60) return `${min} min par phase`;
  if (min < 1440) return `${min / 60} h par phase`;
  return `${min / 1440} j par phase`;
}

// ------------------------------------------------------------------
// État global
// ------------------------------------------------------------------

const S = {
  me: null,
  map: null,
  view: null,          // vue de la partie courante
  gameId: null,
  draft: {},           // ordres en cours de saisie (clé : province de l'unité, ou index pour ajustements)
  draftPhaseId: null,
  dirty: false,
  selected: null,      // emplacement de l'unité sélectionnée sur la carte
  tab: 'orders',
  history: null,       // phase passée affichée
  messages: [],
  lastMsgId: 0,
  channel: 'ALL',
  unread: 0,
  timers: [],
  clockOffset: 0,
};

function clearTimers() {
  for (const t of S.timers) clearInterval(t);
  S.timers = [];
}

// ------------------------------------------------------------------
// Routage
// ------------------------------------------------------------------

async function route() {
  clearTimers();
  if (!S.me) {
    const r = await api('GET', '/api/me');
    S.me = r.user;
    S.registration = r.registration;
    S.version = r.version;
  }
  renderNav();
  if (!S.me) return renderLogin();
  if (!S.map) S.map = await api('GET', '/api/map');
  const m = location.hash.match(/^#\/game\/(\d+)/);
  if (m) return openGame(Number(m[1]));
  return renderLobby();
}

window.addEventListener('hashchange', () => route().catch(showFatal));

function showFatal(err) {
  $app.replaceChildren(h('div.card.center', h('p', `Erreur : ${err.message}`), h('button', { onclick: () => route() }, 'Réessayer')));
}

function renderNav() {
  $nav.replaceChildren(h('button.link', { onclick: () => rulesDialog() }, 'Règles'));
  if (!S.me) return;
  $nav.append(
    h('span.muted', S.me.pseudo),
    h('button.link', { onclick: changePinDialog }, 'PIN'),
    h('button.link', {
      onclick: async () => {
        await api('POST', '/api/auth/logout', {});
        S.me = null;
        location.hash = '#/';
        route();
      },
    }, 'Déconnexion'),
  );
}

// ------------------------------------------------------------------
// Connexion
// ------------------------------------------------------------------

function renderLogin() {
  let mode = 'login';
  const pseudo = h('input', { id: 'pseudo', autocomplete: 'username', required: true, minlength: 3, maxlength: 20, autocapitalize: 'none' });
  const pin = h('input', { id: 'pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]{4,8}', autocomplete: 'current-password', required: true, maxlength: 8 });
  const submit = h('button.primary', { type: 'submit' }, 'Se connecter');
  const switcher = h('button.link', { type: 'button' }, 'Créer un compte');
  const hint = h('p.muted.small', 'Le code PIN contient 4 à 8 chiffres.');
  switcher.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    submit.textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
    switcher.textContent = mode === 'login' ? 'Créer un compte' : 'J\'ai déjà un compte';
    pin.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  });
  const form = h('form.card.login', {
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const r = await api('POST', mode === 'login' ? '/api/auth/login' : '/api/auth/register', { pseudo: pseudo.value, pin: pin.value });
        S.me = r.user;
        route();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        submit.disabled = false;
      }
    },
  },
  h('h1', 'Diplomatie'),
  h('p.muted', 'Europe, 1901. Sept puissances, aucune chance, toutes les trahisons.'),
  h('label', { for: 'pseudo' }, 'Pseudo'), pseudo,
  h('label', { for: 'pin' }, 'Code PIN'), pin,
  hint,
  submit,
  S.registration ? switcher : null);
  $app.replaceChildren(form);
  pseudo.focus();
}

function changePinDialog() {
  const oldPin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'current-password' });
  const newPin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'new-password' });
  const dlg = h('dialog.card',
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('PUT', '/api/me/pin', { oldPin: oldPin.value, newPin: newPin.value });
          toast('Code PIN modifié.');
          dlg.close();
        } catch (err) { toast(err.message, 'error'); }
      },
    },
    h('h2', 'Changer de code PIN'),
    h('label', 'PIN actuel'), oldPin,
    h('label', 'Nouveau PIN (4 à 8 chiffres)'), newPin,
    h('div.row', h('button.primary', { type: 'submit' }, 'Valider'), h('button', { type: 'button', onclick: () => dlg.close() }, 'Annuler'))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function rulesDialog(intro) {
  const close = h('button.primary', { type: 'button', onclick: () => dlg.close() }, intro ? 'C\'est parti !' : 'Fermer');
  const dlg = h('dialog.card.rules',
    h('h2', 'Règles du jeu'),
    intro ? h('p.intro', 'La partie commence ! Voici l\'essentiel des règles. Vous pourrez les revoir à tout moment avec le bouton « Règles » en haut de l\'écran.') : null,
    RULES.map((s) => h('section',
      h('h3', s.title),
      s.body.map((b) => Array.isArray(b) ? h('ul', b.map((li) => h('li', li))) : h('p', b)))),
    h('div.row.sticky-actions', close));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  close.focus();
}

/** Au premier affichage d'une partie lancée, présente les règles au joueur (une fois par partie). */
const rulesShown = new Set();
function showRulesOnce() {
  const key = `diplomatie:regles:${S.gameId}`;
  if (rulesShown.has(key)) return;
  rulesShown.add(key);
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch { /* stockage indisponible : la mémoire de session suffit */ }
  if (!document.querySelector('dialog[open]')) rulesDialog(true);
}

// ------------------------------------------------------------------
// Salon
// ------------------------------------------------------------------

async function renderLobby() {
  const { games, presets } = await api('GET', '/api/games');
  const mine = games.filter((g) => g.joined && g.status !== 'finished');
  const open = games.filter((g) => !g.joined && g.status === 'lobby');
  const others = games.filter((g) => !g.joined && g.status === 'active');
  const done = games.filter((g) => g.status === 'finished');

  const section = (title, list, empty) => h('section.card',
    h('h2', title),
    list.length ? h('ul.gamelist', list.map(gameItem)) : h('p.muted', empty));

  $app.replaceChildren(
    h('div.lobby',
      h('div.lobby-main',
        section('Mes parties', mine, 'Vous ne participez à aucune partie en cours.'),
        section('Parties ouvertes', open, 'Aucune partie en attente de joueurs.'),
        others.length ? section('Parties en cours', others, '') : null,
        done.length ? section('Parties terminées', done, '') : null),
      createGameForm(presets)),
  );
  S.timers.push(setInterval(() => { if (!document.hidden && !document.querySelector('.lobby input:focus')) renderLobby().catch(() => {}); }, 15000));
}

function gameItem(g) {
  const status = g.status === 'lobby' ? `Salon · ${g.player_count}/7 joueurs`
    : g.status === 'active' ? `${phaseShort(g.phase)}${g.deadline ? ` · échéance ${new Date(g.deadline).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`
      : g.result === 'DRAW' ? 'Match nul' : g.result && S.map.powerNames[g.result] ? `Victoire : ${S.map.powerNames[g.result]}` : 'Terminée';
  return h('li', h('a', { href: `#/game/${g.id}` },
    h('span.gname', g.name),
    g.my_power ? h('span.badge', { 'data-power': g.my_power }, S.map.powerNames[g.my_power]) : null,
    h('span.muted.small', status)));
}

function phaseShort(name) {
  if (!name) return '';
  const season = { S: 'Printemps', F: 'Automne', W: 'Hiver' }[name[0]];
  const phase = { M: 'mouvements', R: 'retraites', A: 'ajustements' }[name.at(-1)];
  return `${season} ${name.slice(1, 5)} · ${phase}`;
}

function createGameForm(presets) {
  const name = h('input', { required: true, maxlength: 60, placeholder: 'Ex. : La partie du jeudi' });
  const power = h('select', h('option', { value: '' }, 'Au hasard'), S.map.powers.map((p) => h('option', { value: p }, S.map.powerNames[p])));
  const duration = h('select', presets.map((m) => h('option', { value: m }, durationLabel(m))));
  duration.value = '1440';
  const press = h('select', Object.entries(PRESS_LABEL).map(([k, v]) => h('option', { value: k }, v)));
  return h('form.card.create', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', '/api/games', { name: name.value, power: power.value || null, phaseMinutes: Number(duration.value), press: press.value });
        location.hash = `#/game/${r.id}`;
      } catch (err) { toast(err.message, 'error'); }
    },
  },
  h('h2', 'Nouvelle partie'),
  h('label', 'Nom'), name,
  h('label', 'Ma puissance'), power,
  h('label', 'Durée des phases'), duration,
  h('p.muted.small', 'Une phase est résolue dès que tous les joueurs sont prêts, ou à l\'échéance.'),
  h('label', 'Négociations'), press,
  h('button.primary', { type: 'submit' }, 'Créer la partie'));
}

// ------------------------------------------------------------------
// Partie
// ------------------------------------------------------------------

async function openGame(id) {
  if (S.gameId !== id) {
    Object.assign(S, { gameId: id, view: null, draft: {}, draftPhaseId: null, dirty: false, selected: null, tab: 'orders', history: null, messages: [], lastMsgId: 0, channel: 'ALL', unread: 0 });
  }
  await refreshGame(true);
  S.timers.push(setInterval(() => { if (!document.hidden) refreshGame(false).catch(() => {}); }, 5000));
  S.timers.push(setInterval(updateCountdown, 1000));
}

async function refreshGame(force) {
  const view = await api('GET', `/api/games/${S.gameId}`);
  S.clockOffset = new Date(view.serverTime).getTime() - Date.now();
  const prev = S.view;
  S.view = view;
  const phaseChanged = !prev || !prev.phase || !view.phase || prev.phase.id !== view.phase.id;
  if (view.phase && (phaseChanged || !S.dirty) && S.draftPhaseId !== view.phase.id) {
    loadDraft();
  }
  if (phaseChanged && prev && prev.phase && view.phase) {
    toast(`Nouvelle phase : ${view.phase.label}`);
    S.history = null;
  }
  await fetchMessages();
  const sig = JSON.stringify([view.game, view.players, view.phase && view.phase.id, view.myOrders && view.myOrders.ready, view.history.length]);
  if (force || phaseChanged || sig !== S.lastSig) {
    S.lastSig = sig;
    renderGame();
  } else {
    renderPlayersBadge();
  }
}

function loadDraft() {
  const v = S.view;
  S.draft = {};
  S.draftPhaseId = v.phase.id;
  S.dirty = false;
  S.selected = null;
  const list = (v.myOrders && v.myOrders.orders) || [];
  if (v.phase.state.phase === 'A') {
    list.forEach((o, i) => { S.draft[i] = o; });
  } else {
    for (const o of list) S.draft[provOf(o.unit)] = o;
  }
}

function myPower() { return S.view.me && S.view.me.power; }

function mustAct() {
  const v = S.view;
  return v.game.status === 'active' && myPower() && v.phase.powersToAct.includes(myPower());
}

function renderGame() {
  const v = S.view;
  const head = h('div.gamehead',
    h('div',
      h('a.back', { href: '#/' }, '← Parties'),
      h('h1', v.game.name),
      h('p.muted.small', durationLabel(v.game.phaseMinutes), ' · ', PRESS_LABEL[v.game.press])),
    v.phase ? h('div.phasebox',
      h('div.phase-label', S.history ? `Historique : ${S.history.label}` : v.phase.label),
      h('div.countdown', { id: 'countdown' }),
      v.me && v.me.power ? h('div', h('span.badge', { 'data-power': v.me.power }, S.map.powerNames[v.me.power])) : null) : null);

  if (v.game.status === 'lobby') {
    $app.replaceChildren(head, renderWaitingRoom());
    return;
  }

  const banner = v.game.status === 'finished'
    ? h('div.banner', v.game.result === 'DRAW' ? 'Partie terminée : match nul.'
      : S.map.powerNames[v.game.result] ? `Partie terminée : victoire de ${S.map.powerNames[v.game.result]} !` : 'Partie terminée.')
    : null;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('map');
  const mapWrap = h('div.mapwrap', h('div.mapscroll', svg), mapLegend());

  const tabs = [
    ['orders', 'Ordres'], ['players', 'Joueurs'], ['messages', 'Messages'], ['history', 'Historique'],
  ];
  const tabbar = h('div.tabs', { role: 'tablist' }, tabs.map(([k, label]) => h('button', {
    role: 'tab', 'aria-selected': S.tab === k ? 'true' : 'false', class: S.tab === k ? 'active' : null,
    onclick: () => { S.tab = k; if (k === 'messages') S.unread = 0; renderGame(); },
  }, label, k === 'messages' && S.unread ? h('span.pill', S.unread) : null, k === 'players' ? h('span#readybadge') : null)));

  const panel = h('div.panel', tabbar, h('div.tabbody', renderTab()));
  const prevScroll = document.querySelector('.mapscroll');
  const keepScroll = prevScroll ? prevScroll.scrollLeft : null;
  $app.replaceChildren(...[head, banner, h('div.gamegrid', mapWrap, panel)].filter(Boolean));
  drawMap();
  restoreMapScroll(keepScroll);
  updateCountdown();
  renderPlayersBadge();
  if (v.game.status === 'active' && myPower()) showRulesOnce();
}

/** Sur petit écran, la carte défile : on garde la position, sinon on centre sur ses unités. */
function restoreMapScroll(previous) {
  const box = document.querySelector('.mapscroll');
  const svg = box && box.querySelector('svg');
  if (!box || box.scrollWidth <= box.clientWidth) return;
  if (previous !== null) { box.scrollLeft = previous; return; }
  const state = (S.history || S.view.phase).state;
  const mine = state.units.filter((u) => u.power === myPower());
  const list = mine.length ? mine : state.units;
  if (!list.length) return;
  const avgX = list.reduce((sum, u) => sum + locPoint(null, u.loc)[0], 0) / list.length;
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  box.scrollLeft = Math.max(0, avgX * scale - box.clientWidth / 2);
}

function mapLegend() {
  return h('div.legend', S.map.powers.map((p) => h('span.legend-item',
    h('span.swatch', { 'data-power': p }), S.map.powerNames[p],
    ` (${Object.values((S.history || S.view.phase).state.centers).filter((x) => x === p).length})`)));
}

function renderPlayersBadge() {
  const b = document.getElementById('readybadge');
  if (!b || !S.view.phase) return;
  const humans = S.view.players.filter((p) => S.view.phase.powersToAct.includes(p.power));
  const ready = humans.filter((p) => p.ready).length;
  b.textContent = humans.length ? ` ${ready}/${humans.length}` : '';
}

function updateCountdown() {
  const el = document.getElementById('countdown');
  if (!el || !S.view || !S.view.phase) return;
  if (S.view.game.status !== 'active' || S.history) { el.textContent = ''; return; }
  const d = S.view.phase.deadline;
  if (!d) { el.textContent = 'Sans échéance'; return; }
  const ms = new Date(d).getTime() - (Date.now() + S.clockOffset);
  if (ms <= 0) { el.textContent = 'Résolution imminente…'; return; }
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  el.textContent = `Reste ${days ? `${days} j ` : ''}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  el.classList.toggle('urgent', ms < 10 * 60e3);
}

// ---- Salon d'attente ----

function renderWaitingRoom() {
  const v = S.view;
  const taken = new Map(v.players.filter((p) => p.power).map((p) => [p.power, p]));
  const joined = !!v.me;
  const choose = async (power) => {
    try {
      await api('POST', `/api/games/${S.gameId}/join`, { power });
      refreshGame(true);
    } catch (err) { toast(err.message, 'error'); }
  };
  const grid = h('div.powergrid', S.map.powers.map((p) => {
    const holder = taken.get(p);
    return h('button.powercard', {
      'data-power': p, disabled: holder && !holder.isMe, class: holder && holder.isMe ? 'mine' : null,
      onclick: () => choose(p),
    }, h('strong', S.map.powerNames[p]), h('span.small', holder ? holder.pseudo : 'Libre'));
  }));
  const random = v.players.filter((p) => !p.power);
  return h('div.waiting',
    h('section.card',
      h('h2', `Salon — ${v.players.length}/7 joueurs`),
      h('p.muted', 'Choisissez une puissance, ou laissez le hasard décider au lancement.'),
      grid,
      random.length ? h('p.small', 'Au hasard : ', random.map((p) => p.pseudo).join(', ')) : null,
      h('div.row',
        !joined ? h('button.primary', { onclick: () => choose(null) }, 'Rejoindre (puissance au hasard)') : null,
        joined && v.me.power ? h('button', { onclick: () => choose(null) }, 'Plutôt au hasard') : null,
        v.game.isCreator ? h('button.primary', {
          onclick: async () => {
            const missing = 7 - v.players.length;
            if (missing > 0 && !confirm(`${missing} puissance(s) sans joueur resteront en désordre civil (leurs unités tiennent leur position). Lancer quand même ?`)) return;
            try { await api('POST', `/api/games/${S.gameId}/start`, {}); refreshGame(true); } catch (err) { toast(err.message, 'error'); }
          },
        }, 'Lancer la partie') : null,
        joined ? h('button.danger', {
          onclick: async () => {
            if (!confirm(v.game.isCreator ? 'Supprimer cette partie ?' : 'Quitter cette partie ?')) return;
            await api('POST', `/api/games/${S.gameId}/leave`, {});
            location.hash = '#/';
          },
        }, v.game.isCreator ? 'Supprimer' : 'Quitter') : null)),
    renderMessagesCard());
}

// ------------------------------------------------------------------
// Carte et flèches
// ------------------------------------------------------------------

function drawMap() {
  const svg = document.querySelector('svg.map');
  if (!svg) return;
  if (S.history) {
    renderMap(svg, S.map, S.history.state, { arrows: reportArrows(S.history.report) });
    return;
  }
  const state = S.view.phase.state;
  const arrows = mustAct() ? draftArrows(state) : [];
  const targets = new Set();
  if (S.selected && mustAct()) {
    for (const opt of optionsForSelected()) targets.add(provOf(opt));
  }
  renderMap(svg, S.map, state, {
    arrows, selected: S.selected, targets, onClick: mustAct() ? onMapClick : null,
  });
}

function draftArrows(state) {
  const pw = myPower();
  const out = [];
  if (state.phase === 'M') {
    for (const o of Object.values(S.draft)) {
      const unit = unitAt(state, provOf(o.unit));
      if (!unit) continue;
      out.push(orderToArrow(o, unit, state, pw));
    }
  } else if (state.phase === 'R') {
    for (const o of Object.values(S.draft)) {
      const d = state.dislodged.find((x) => provOf(x.loc) === provOf(o.unit));
      if (d && o.action === 'retreat' && o.to) out.push({ kind: 'retreat', from: d.loc, to: o.to, power: pw });
    }
  }
  return out.filter(Boolean);
}

function locFor(state, province) {
  const u = unitAt(state, province);
  return u ? u.loc : province;
}

function orderToArrow(o, unit, state, power) {
  switch (o.action) {
    case 'hold': return { kind: 'hold', from: unit.loc, power };
    case 'move': return o.to ? { kind: 'move', from: unit.loc, to: o.to, power } : null;
    case 'support': return o.target ? { kind: 'support', from: unit.loc, via: locFor(state, o.target), to: o.targetTo || null, power } : null;
    case 'convoy': return o.target && o.targetTo ? { kind: 'convoy', from: unit.loc, via: o.target, to: o.targetTo, power } : null;
    default: return null;
  }
}

function reportArrows(report) {
  const out = [];
  for (const r of (report && report.orders) || []) {
    const o = r.order;
    if (!o) continue;
    const failed = r.result === 'fail';
    if (o.kind === 'M') out.push({ kind: 'move', from: o.loc, to: o.dest, power: r.power, failed });
    else if (o.kind === 'S') out.push({ kind: 'support', from: o.loc, via: o.supTarget, to: o.supDest, power: r.power });
    else if (o.kind === 'C') out.push({ kind: 'convoy', from: o.loc, via: o.cvFrom, to: o.cvTo, power: r.power });
    else if (o.kind === 'R') out.push({ kind: 'retreat', from: o.loc, to: o.dest, power: r.power, failed });
  }
  return out;
}

function onMapClick(province) {
  const state = S.view.phase.state;
  const pw = myPower();
  if (state.phase === 'A') return;
  // Destination pour l'unité sélectionnée ?
  if (S.selected && provOf(S.selected) !== province) {
    const o = S.draft[provOf(S.selected)];
    const opts = optionsForSelected();
    const match = opts.find((l) => provOf(l) === province);
    if (match && o) {
      if (state.phase === 'R') { o.action = 'retreat'; o.to = match; }
      else if (o.action === 'move' || !o.action || o.action === 'hold') { o.action = 'move'; o.to = match; delete o.viaConvoy; }
      else if (o.action === 'support' && !o.target) { o.target = province; }
      else if (o.action === 'support') { o.targetTo = province; }
      S.dirty = true;
      S.selected = null;
      S.tab = 'orders';
      renderGame();
      return;
    }
  }
  // Sélection d'une de mes unités
  const unit = state.phase === 'R'
    ? state.dislodged.find((d) => provOf(d.loc) === province && d.power === pw)
    : state.units.find((u) => provOf(u.loc) === province && u.power === pw);
  if (unit) {
    S.selected = S.selected === unit.loc ? null : unit.loc;
    if (!S.draft[province]) S.draft[province] = { unit: province, action: state.phase === 'R' ? 'retreat' : 'move' };
    else if (S.draft[province].action === 'hold') S.draft[province].action = 'move';
  } else {
    S.selected = null;
  }
  S.tab = 'orders';
  renderGame();
  const row = document.querySelector(`[data-unit-row="${province}"]`);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function optionsForSelected() {
  const state = S.view.phase.state;
  if (!S.selected) return [];
  if (state.phase === 'R') {
    const d = state.dislodged.find((x) => x.loc === S.selected);
    return d ? d.options : [];
  }
  const unit = unitAt(state, provOf(S.selected));
  const o = S.draft[provOf(S.selected)] || {};
  if (o.action === 'support') {
    if (!o.target) return supportTargets(state, unit).map((u) => u.loc);
    return supportDestinations(state, unit, unitAt(state, o.target)).map((x) => x);
  }
  return moveOptions(state, unit).map((x) => x.to);
}

// ------------------------------------------------------------------
// Calcul des options d'ordres (miroir des règles du serveur)
// ------------------------------------------------------------------

function unitAt(state, province) {
  return state.units.find((u) => provOf(u.loc) === province) || null;
}

function neighbors(type, loc) {
  if (type === 'A') return S.map.army[provOf(loc)] || [];
  return S.map.fleet[loc] || [];
}

const isSea = (p) => S.map.provinces[provOf(p)].type === 'sea';
const isCoastal = (p) => S.map.provinces[provOf(p)].type === 'coast';

function canReachProvince(unit, province) {
  return neighbors(unit.type, unit.loc).some((l) => provOf(l) === province);
}

function seaNeighbors(province) {
  const out = new Set();
  for (const [k, list] of Object.entries(S.map.fleet)) {
    if (provOf(k) !== province) continue;
    for (const n of list) if (isSea(n)) out.add(n);
  }
  return out;
}

/** Provinces côtières atteignables par convoi depuis une province côtière. */
function convoyDestinations(state, from) {
  if (!isCoastal(from)) return [];
  const fleets = new Set(state.units.filter((u) => u.type === 'F' && isSea(u.loc)).map((u) => u.loc));
  const seen = new Set();
  const queue = [...seaNeighbors(from)].filter((s) => fleets.has(s));
  queue.forEach((s) => seen.add(s));
  while (queue.length) {
    const s = queue.shift();
    for (const n of S.map.fleet[s] || []) {
      if (isSea(n) && fleets.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  const dests = new Set();
  for (const s of seen) for (const n of S.map.fleet[s] || []) if (!isSea(n) && provOf(n) !== from) dests.add(provOf(n));
  return [...dests];
}

function moveOptions(state, unit) {
  const out = [];
  if (unit.type === 'F') {
    for (const l of neighbors('F', unit.loc)) out.push({ to: l, label: l });
  } else {
    const adj = neighbors('A', unit.loc);
    for (const p of adj) out.push({ to: p, label: p });
    for (const p of convoyDestinations(state, provOf(unit.loc))) {
      out.push({ to: p, label: `${p} (convoi)`, via: true });
    }
  }
  return out;
}

function unitCanReach(state, u, province) {
  if (provOf(u.loc) === province) return false;
  if (u.type === 'F') return canReachProvince(u, province);
  if (isSea(province)) return false;
  return (S.map.army[provOf(u.loc)] || []).includes(province) || convoyDestinations(state, provOf(u.loc)).includes(province);
}

function supportDestinations(state, supporter, target) {
  if (!target) return [];
  const out = [];
  const seen = new Set();
  for (const l of neighbors(supporter.type, supporter.loc)) {
    const p = provOf(l);
    if (seen.has(p) || p === provOf(supporter.loc)) continue;
    seen.add(p);
    if (unitCanReach(state, target, p)) out.push(p);
  }
  return out;
}

function supportTargets(state, supporter) {
  return state.units.filter((u) => u !== supporter && (
    canReachProvince(supporter, provOf(u.loc)) || supportDestinations(state, supporter, u).length > 0));
}

function describeUnit(u) {
  const name = S.map.provinces[provOf(u.loc)].name;
  return `${u.type === 'A' ? 'Armée' : 'Flotte'} ${u.loc} (${name})`;
}

function provLabel(loc) {
  const p = S.map.provinces[provOf(loc)];
  return `${loc} — ${p.name}`;
}

// ------------------------------------------------------------------
// Onglets
// ------------------------------------------------------------------

function renderTab() {
  if (S.tab === 'players') return renderPlayers();
  if (S.tab === 'messages') return renderMessagesCard();
  if (S.tab === 'history') return renderHistory();
  return renderOrders();
}

function renderOrders() {
  const v = S.view;
  if (S.history) {
    return h('div', h('p', 'Vous consultez une phase passée.'), h('button', { onclick: () => { S.history = null; renderGame(); } }, 'Revenir à la phase en cours'));
  }
  const lastReport = h('div');
  if (v.history.length) {
    loadReportInto(lastReport, v.history.at(-1).idx);
  }
  if (v.game.status !== 'active') return h('div', lastReport);
  if (!myPower()) return h('div', h('p.muted', 'Vous êtes spectateur de cette partie.'), lastReport);
  if (!mustAct()) {
    return h('div', h('p.muted', 'Aucun ordre à donner pour vous pendant cette phase. En attente des autres joueurs.'), lastReport);
  }
  const state = v.phase.state;
  let body;
  if (state.phase === 'M') body = renderMovementOrders(state);
  else if (state.phase === 'R') body = renderRetreatOrders(state);
  else body = renderAdjustmentOrders(state);

  const ready = v.myOrders && v.myOrders.ready;
  const status = h('p.small', { class: ready ? 'ok' : 'muted' },
    ready ? '✓ Vous êtes prêt. Vous pouvez encore modifier vos ordres jusqu\'à la résolution.'
      : S.dirty ? 'Modifications non enregistrées.' : 'Ordres enregistrés, pas encore prêt.');
  const actions = h('div.row.sticky-actions',
    h('button', { onclick: () => saveOrders(false) }, 'Enregistrer'),
    h('button.primary', { onclick: () => saveOrders(true) }, ready && !S.dirty ? 'Mettre à jour' : 'Valider et être prêt'),
    ready ? h('button.link', { onclick: () => saveOrders(false) }, 'Je ne suis plus prêt') : null);
  return h('div', body, status, actions, h('div#ordererrors'), lastReport);
}

async function saveOrders(ready) {
  const state = S.view.phase.state;
  let orders = Object.values(S.draft).filter((o) => o && o.action);
  if (state.phase === 'M') orders = orders.filter((o) => o.action === 'hold' || (o.action === 'move' && o.to) || (o.action === 'support' && o.target) || (o.action === 'convoy' && o.target && o.targetTo));
  if (state.phase === 'R') orders = orders.filter((o) => o.action === 'disband' || o.to);
  if (state.phase === 'A') orders = orders.filter((o) => o.action !== 'build' || o.loc);
  try {
    const r = await api('PUT', `/api/games/${S.gameId}/orders`, { orders, ready });
    S.dirty = false;
    S.draftPhaseId = null; // recharger depuis le serveur
    await refreshGame(true);
    if (r.errors.length) {
      const box = document.getElementById('ordererrors');
      if (box) {
        box.replaceChildren(h('div.errors', h('strong', 'Ordres refusés :'),
          h('ul', r.errors.map((e) => h('li', `${e.order.unit || e.order.loc || ''} : ${e.error}`)))));
      }
      toast(`${r.errors.length} ordre(s) refusé(s).`, 'error');
    } else {
      toast(ready ? 'Ordres validés, vous êtes prêt.' : 'Ordres enregistrés.');
    }
  } catch (err) { toast(err.message, 'error'); }
}

function select(options, value, onchange, placeholder) {
  const s = h('select', { onchange: (e) => onchange(e.target.value) },
    placeholder ? h('option', { value: '' }, placeholder) : null,
    options.map(([v, label]) => h('option', { value: v }, label)));
  s.value = value || '';
  return s;
}

function renderMovementOrders(state) {
  const mine = state.units.filter((u) => u.power === myPower());
  const rows = mine.map((u) => {
    const p = provOf(u.loc);
    const o = S.draft[p] || { unit: p, action: 'hold' };
    const update = (patch) => {
      S.draft[p] = { unit: p, ...o, ...patch };
      S.dirty = true;
      renderGame();
    };
    const actions = [['hold', 'Tenir'], ['move', 'Avancer'], ['support', 'Soutenir']];
    if (u.type === 'F' && isSea(u.loc)) actions.push(['convoy', 'Convoyer']);
    const parts = [select(actions, o.action || 'hold', (a) => update({ action: a, to: undefined, target: undefined, targetTo: undefined, viaConvoy: undefined }))];

    if (o.action === 'move') {
      const opts = moveOptions(state, u);
      const adjacent = (to) => opts.some((x) => x.to === to && !x.via);
      const value = o.to ? `${o.to}${o.viaConvoy || !adjacent(o.to) ? '|c' : ''}` : '';
      parts.push(select(opts.map((x) => [`${x.to}${x.via ? '|c' : ''}`, x.via ? `${provLabel(x.to)} (convoi)` : provLabel(x.to)]),
        value, (val) => {
          const [to, c] = val.split('|');
          update({ to: to || undefined, viaConvoy: c === 'c' ? true : undefined });
        }, 'Destination…'));
    } else if (o.action === 'support') {
      const targets = supportTargets(state, u);
      parts.push(select(targets.map((t) => [provOf(t.loc), `${t.type} ${t.loc} (${S.map.powerNames[t.power]})`]), o.target,
        (t) => update({ target: t, targetTo: undefined }), 'Unité soutenue…'));
      if (o.target) {
        const target = unitAt(state, o.target);
        const dests = supportDestinations(state, u, target);
        const canHold = canReachProvince(u, o.target);
        parts.push(select([...(canHold ? [['', 'pour tenir']] : []), ...dests.map((d) => [d, `vers ${provLabel(d)}`])],
          o.targetTo || '', (d) => update({ targetTo: d || undefined }), canHold ? null : 'Vers…'));
      }
    } else if (o.action === 'convoy') {
      const armies = state.units.filter((x) => x.type === 'A' && isCoastal(x.loc));
      parts.push(select(armies.map((a) => [provOf(a.loc), `A ${a.loc} (${S.map.powerNames[a.power]})`]), o.target,
        (t) => update({ target: t, targetTo: undefined }), 'Armée…'));
      if (o.target) {
        const dests = convoyDestinations(state, o.target);
        parts.push(select(dests.map((d) => [d, `vers ${provLabel(d)}`]), o.targetTo, (d) => update({ targetTo: d }), 'Vers…'));
      }
    }
    return h('div.orderrow', { 'data-unit-row': p, class: S.selected === u.loc ? 'selected' : null },
      h('button.unitbtn', {
        'data-power': u.power,
        onclick: () => { S.selected = S.selected === u.loc ? null : u.loc; if (!S.draft[p]) S.draft[p] = { unit: p, action: 'move' }; renderGame(); },
        title: 'Sélectionner sur la carte',
      }, `${u.type} ${u.loc}`),
      h('div.orderfields', parts));
  });
  return h('div',
    h('p.muted.small', 'Astuce : touchez une unité sur la carte, puis sa destination.'),
    rows);
}

function renderRetreatOrders(state) {
  const mine = state.dislodged.filter((d) => d.power === myPower());
  return h('div',
    h('p', 'Unités délogées : choisissez une retraite ou un licenciement. Sans ordre, l\'unité est licenciée.'),
    mine.map((d) => {
      const p = provOf(d.loc);
      const o = S.draft[p] || { unit: p, action: 'disband' };
      const value = o.action === 'retreat' && o.to ? o.to : 'disband';
      return h('div.orderrow', { 'data-unit-row': p },
        h('span.unitbtn', { 'data-power': d.power }, `${d.type} ${d.loc}`),
        h('div.orderfields', select([['disband', 'Licencier'], ...d.options.map((l) => [l, `Retraite vers ${provLabel(l)}`])], value, (val) => {
          S.draft[p] = val === 'disband' ? { unit: p, action: 'disband' } : { unit: p, action: 'retreat', to: val };
          S.dirty = true;
          renderGame();
        })));
    }));
}

function renderAdjustmentOrders(state) {
  const counts = S.view.phase.adjustments[myPower()];
  const delta = counts.delta;
  if (delta > 0) {
    const n = Math.min(delta, counts.freeHomes.length);
    const choices = [];
    for (const c of counts.freeHomes) {
      choices.push([`A:${c}`, `Armée à ${provLabel(c)}`]);
      const prov = S.map.provinces[c];
      if (prov.type === 'coast') {
        if (prov.coasts) for (const coast of prov.coasts) choices.push([`F:${c}/${coast}`, `Flotte à ${c}/${coast}`]);
        else choices.push([`F:${c}`, `Flotte à ${provLabel(c)}`]);
      }
    }
    const rows = [];
    for (let i = 0; i < n; i++) {
      const o = S.draft[i];
      const value = o && o.action === 'build' ? `${o.unitType}:${o.loc}` : '';
      rows.push(h('div.orderrow', h('span.unitbtn', `Construction ${i + 1}`),
        h('div.orderfields', select(choices, value, (val) => {
          if (!val) delete S.draft[i];
          else { const [t, loc] = val.split(':'); S.draft[i] = { action: 'build', unitType: t, loc }; }
          S.dirty = true;
          renderGame();
        }, 'Ne pas construire'))));
    }
    return h('div',
      h('p', `Vous avez ${counts.centers} centres pour ${counts.units} unités : ${delta} construction(s) possible(s)`,
        n < delta ? ` (seulement ${n} centre(s) d'origine libre(s))` : '', '.'),
      rows);
  }
  const n = -delta;
  const mine = state.units.filter((u) => u.power === myPower());
  const rows = [];
  for (let i = 0; i < n; i++) {
    const o = S.draft[i];
    rows.push(h('div.orderrow', h('span.unitbtn', `Licenciement ${i + 1}`),
      h('div.orderfields', select(mine.map((u) => [provOf(u.loc), describeUnit(u)]), o ? o.unit : '', (val) => {
        if (!val) delete S.draft[i]; else S.draft[i] = { action: 'disband', unit: val };
        S.dirty = true;
        renderGame();
      }, 'Choisir une unité…'))));
  }
  return h('div',
    h('p', `Vous avez ${counts.centers} centres pour ${counts.units} unités : ${n} unité(s) à licencier.`),
    h('p.muted.small', 'Sans ordre, les unités les plus éloignées de vos centres d\'origine sont licenciées.'),
    rows);
}

const reportCache = new Map();
async function loadReport(idx) {
  const key = `${S.gameId}:${idx}`;
  if (!reportCache.has(key)) reportCache.set(key, await api('GET', `/api/games/${S.gameId}/phases/${idx}`));
  return reportCache.get(key);
}

async function loadReportInto(container, idx) {
  try {
    const ph = await loadReport(idx);
    container.replaceChildren(h('h3', `Résultats : ${ph.label}`), renderReport(ph.report));
  } catch { /* ignoré */ }
}

function renderReport(report) {
  const byPower = {};
  for (const r of report.orders) (byPower[r.power] = byPower[r.power] || []).push(r);
  return h('div.report', Object.entries(byPower).map(([pw, list]) => h('div.report-power',
    h('h4', h('span.swatch', { 'data-power': pw }), S.map.powerNames[pw] || pw),
    h('ul', list.map((r) => h('li', { class: r.result === 'ok' ? 'res-ok' : 'res-fail' },
      h('span.mono', r.text),
      r.result === 'invalid' ? h('span.small', ` — refusé : ${r.detail}`)
        : r.detail ? h('span.small', ` — ${RESULT_TEXT[r.detail] || r.detail}`) : null,
      r.dislodged ? h('span.small.warn', ' — délogée') : null))))));
}

function renderPlayers() {
  const v = S.view;
  const toAct = v.phase ? v.phase.powersToAct : [];
  const rows = S.map.powers.map((pw) => {
    const p = v.players.find((x) => x.power === pw);
    const centers = Object.values(v.phase.state.centers).filter((x) => x === pw).length;
    const units = v.phase.state.units.filter((u) => u.power === pw).length;
    let status = '';
    if (v.game.status === 'active' && toAct.includes(pw)) {
      status = !p ? 'désordre civil' : p.ready ? '✓ prêt' : p.submitted ? 'ordres saisis' : 'en attente';
    }
    return h('tr', { class: p && p.isMe ? 'me' : null },
      h('td', h('span.swatch', { 'data-power': pw }), S.map.powerNames[pw]),
      h('td', p ? p.pseudo : h('span.muted', '—')),
      h('td.num', centers),
      h('td.num', units),
      h('td.small', status, p && p.drawVote ? ' · vote nul' : ''));
  });
  const me = v.me;
  return h('div',
    h('table.players',
      h('thead', h('tr', h('th', 'Puissance'), h('th', 'Joueur'), h('th.num', 'Centres'), h('th.num', 'Unités'), h('th', 'Statut'))),
      h('tbody', rows)),
    h('p.small.muted', `Victoire à ${18} centres.`),
    v.game.status === 'active' && me && me.power ? h('div.row',
      h('button', {
        onclick: async () => {
          try { await api('POST', `/api/games/${S.gameId}/draw`, { vote: !me.drawVote }); refreshGame(true); } catch (err) { toast(err.message, 'error'); }
        },
      }, me.drawVote ? 'Retirer mon vote de match nul' : 'Proposer un match nul'),
      v.game.isCreator ? h('button.danger', {
        onclick: async () => {
          if (!confirm('Résoudre la phase maintenant, sans attendre les ordres manquants ?')) return;
          try { await api('POST', `/api/games/${S.gameId}/resolve`, {}); refreshGame(true); } catch (err) { toast(err.message, 'error'); }
        },
      }, 'Forcer la résolution') : null) : null,
    v.game.status === 'active' ? h('p.small.muted', 'Le match nul est prononcé quand tous les joueurs encore en jeu l\'ont voté.') : null);
}

function renderHistory() {
  const v = S.view;
  if (!v.history.length) return h('p.muted', 'Aucune phase résolue pour l\'instant.');
  const list = h('ol.history', [...v.history].reverse().map((ph) => h('li', h('button.link', {
    class: S.history && S.history.idx === ph.idx ? 'active' : null,
    onclick: async () => {
      S.history = await loadReport(ph.idx);
      renderGame();
    },
  }, phaseShort(ph.name)))));
  return h('div',
    S.history ? h('div',
      h('div.row', h('button', { onclick: () => { S.history = null; renderGame(); } }, '← Phase en cours')),
      h('h3', S.history.label),
      h('p.small.muted', 'La carte montre les positions avant résolution et les ordres donnés (pointillés : échec).'),
      renderReport(S.history.report)) : null,
    list);
}

// ------------------------------------------------------------------
// Messagerie
// ------------------------------------------------------------------

async function fetchMessages() {
  try {
    const { messages } = await api('GET', `/api/games/${S.gameId}/messages?since=${S.lastMsgId}`);
    if (!messages.length) return;
    S.messages.push(...messages);
    S.lastMsgId = messages.at(-1).id;
    const fresh = messages.filter((m) => m.from_power !== myPower() || !myPower()).length;
    if (S.tab !== 'messages' && S.view.game.status !== 'lobby') S.unread += fresh;
    const list = document.getElementById('msglist');
    if (list) { renderMessageList(list); }
  } catch { /* ignoré */ }
}

function channelOf(m) {
  if (!m.to_power) return 'ALL';
  return m.from_power === myPower() ? m.to_power : m.from_power;
}

function renderMessageList(list) {
  const msgs = S.messages.filter((m) => S.view.game.status === 'finished' || channelOf(m) === S.channel);
  list.replaceChildren(...(msgs.length ? msgs.map((m) => h('div.msg', { class: m.from_power && m.from_power === myPower() ? 'mine' : null },
    h('div.msg-head',
      m.from_power ? h('span.swatch', { 'data-power': m.from_power }) : null,
      h('strong', m.from_power ? S.map.powerNames[m.from_power] : m.pseudo),
      m.to_power ? h('span.small', ` → ${S.map.powerNames[m.to_power]}`) : null,
      h('span.small.muted', ` · ${m.phase_name ? phaseShort(m.phase_name) : ''} ${new Date(m.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`)),
    h('div.msg-body', m.body))) : [h('p.muted.small', 'Aucun message.')]));
  list.scrollTop = list.scrollHeight;
}

function renderMessagesCard() {
  const v = S.view;
  const press = v.game.press;
  const canWrite = !!v.me && (v.game.status !== 'active' || press !== 'none');
  const channels = [['ALL', 'Public']];
  if (v.game.status === 'active' && press === 'full' && myPower()) {
    for (const pw of S.map.powers) if (pw !== myPower()) channels.push([pw, S.map.powerNames[pw]]);
  }
  if (!channels.some(([k]) => k === S.channel)) S.channel = 'ALL';
  const list = h('div.msglist#msglist');
  const input = h('textarea', { rows: 2, maxlength: 2000, placeholder: canWrite ? 'Votre message…' : 'Messagerie désactivée', disabled: !canWrite });
  const form = h('form.msgform', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      try {
        await api('POST', `/api/games/${S.gameId}/messages`, { to: S.channel, body: input.value });
        input.value = '';
        await fetchMessages();
      } catch (err) { toast(err.message, 'error'); }
    },
  }, input, h('button.primary', { type: 'submit', disabled: !canWrite }, 'Envoyer'));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
  const card = h('section.card.messages',
    v.game.status === 'lobby' ? h('h2', 'Discussion du salon') : null,
    channels.length > 1 ? h('div.channels', channels.map(([k, label]) => h('button', {
      class: S.channel === k ? 'active' : null,
      'data-power': k !== 'ALL' ? k : null,
      onclick: () => { S.channel = k; renderMessageList(list); card.querySelectorAll('.channels button').forEach((b) => b.classList.toggle('active', b.textContent === label)); },
    }, label))) : null,
    list,
    form);
  renderMessageList(list);
  return card;
}

// ------------------------------------------------------------------

route().catch(showFatal);

export { POWER_COLORS };
