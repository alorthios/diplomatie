// Rendu SVG schématique de la carte : provinces en nœuds, frontières en liaisons.
import * as SHAPEDATA from './map-shapes.js';

const { SHAPES, DECOR, BORDERS } = SHAPEDATA;

const NS = 'http://www.w3.org/2000/svg';

export const POWER_COLORS = {
  ENG: '#3a5bbf', FRA: '#5aa9de', GER: '#5b5f66', ITA: '#3f9b4a',
  AUS: '#c8423b', RUS: '#8a5cc2', TUR: '#d6a11e',
};

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

const provOf = (loc) => loc.split('/')[0];

export function locPoint(map, loc) {
  const [p, coast] = loc.split('/');
  if (coast && map.coasts[p]) return map.coasts[p][coast];
  return [map.provinces[p].x, map.provinces[p].y];
}

/**
 * @param svg élément <svg>
 * @param map données /api/map
 * @param state état de phase
 * @param opts { arrows: [{kind, from, to, via, power}], selected, targets: Set(prov), onClick(prov) }
 */
export function renderMap(svg, map, state, opts = {}) {
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 980 860');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Carte de l\'Europe');

  const defs = el('defs', {}, svg);
  for (const [pw, color] of Object.entries({ ...POWER_COLORS, X: '#222' })) {
    const m = el('marker', { id: `arrow-${pw}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }, m);
  }

  el('rect', { x: 0, y: 0, width: 980, height: 860, class: 'map-ocean' }, svg);

  // Décor : océan et terres hors jeu
  const gDecor = el('g', { class: 'map-decor' }, svg);
  el('path', { d: DECOR.sea.join(''), class: 'decor-sea' }, gDecor);
  el('path', { d: DECOR.land.join(''), class: 'decor-land' }, gDecor);

  // Territoires : mers d'abord, terres ensuite (les côtes passent par-dessus)
  const gProv = el('g', { class: 'map-provinces' }, svg);
  const ordered = Object.values(map.provinces).sort((a, b) => (a.type === 'sea') === (b.type === 'sea') ? 0 : a.type === 'sea' ? -1 : 1);
  for (const p of ordered) {
    const g = el('g', { class: 'prov', 'data-prov': p.id, tabindex: opts.onClick ? 0 : null }, gProv);
    const owner = p.sc ? state.centers[p.id] : null;
    const classes = ['terr', p.type === 'sea' ? 'terr-sea' : 'terr-land'];
    if (opts.targets && opts.targets.has(p.id)) classes.push('terr-target');
    if (opts.selected && provOf(opts.selected) === p.id) classes.push('terr-selected');
    const shape = el('path', { d: SHAPES[p.id], class: classes.join(' ') }, g);
    if (owner) {
      shape.style.setProperty('--owner', POWER_COLORS[owner]);
      shape.classList.add('terr-owned');
    }
    const title = el('title', {}, g);
    title.textContent = `${p.name}${p.sc ? ' (centre)' : ''}${owner ? ` — ${map.powerNames[owner]}` : ''}`;
    if (opts.onClick) {
      g.addEventListener('click', () => opts.onClick(p.id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClick(p.id); } });
    }
  }

  // Frontières et côtes
  const gBorders = el('g', { class: 'map-borders' }, svg);
  el('path', { d: BORDERS.sea, class: 'border-sea' }, gBorders);
  el('path', { d: BORDERS.land, class: 'border-land' }, gBorders);
  el('path', { d: BORDERS.coast, class: 'border-coast' }, gBorders);

  // Étiquettes et centres (au-dessus de tous les territoires)
  const gLabels = el('g', { class: 'map-labels' }, svg);
  for (const p of Object.values(map.provinces)) {
    const owner = p.sc ? state.centers[p.id] : null;
    if (p.sc) {
      el('circle', { cx: p.x, cy: p.y + 15, r: 5, class: 'sc-dot', fill: owner ? POWER_COLORS[owner] : '#f4ecd8' }, gLabels);
      el('circle', { cx: p.x, cy: p.y + 15, r: 2, class: 'sc-core' }, gLabels);
    }
    const t = el('text', { x: p.x, y: p.y - 15, class: `label label-${p.type}` }, gLabels);
    t.textContent = p.id;
  }

  // Côtes multiples
  for (const coasts of Object.values(map.coasts)) {
    for (const [c, [x, y]] of Object.entries(coasts)) {
      el('circle', { cx: x, cy: y, r: 3, class: 'coast-dot' }, gLabels);
      const t = el('text', { x, y: y - 6, class: 'coast-label' }, gLabels);
      t.textContent = c;
    }
  }

  if (SHAPEDATA.SITES) {
    for (const [id, x, y] of SHAPEDATA.SITES) {
      el('circle', { cx: x, cy: y, r: 2.5, fill: '#c00' }, gLabels);
      const t = el('text', { x: x + 3, y: y - 3, style: 'font: 7px sans-serif; fill: #c00' }, gLabels);
      t.textContent = id;
    }
  }

  // Flèches d'ordres
  const gArrows = el('g', { class: 'map-arrows' }, svg);
  for (const a of opts.arrows || []) drawArrow(gArrows, map, state, a);

  // Unités
  const gUnits = el('g', { class: 'map-units' }, svg);
  for (const u of state.units) drawUnit(gUnits, map, u, false, opts);
  for (const d of state.dislodged || []) drawUnit(gUnits, map, d, true, opts);
}

function drawUnit(parent, map, u, dislodged, opts) {
  let [x, y] = locPoint(map, u.loc);
  if (dislodged) { x += 14; y += 12; }
  const g = el('g', { class: `unit${dislodged ? ' unit-dislodged' : ''}${opts.selected === u.loc ? ' unit-selected' : ''}` }, parent);
  const color = POWER_COLORS[u.power];
  if (u.type === 'A') {
    el('rect', { x: x - 10, y: y - 10, width: 20, height: 20, rx: 4, fill: color, class: 'unit-shape' }, g);
  } else {
    el('path', { d: `M${x - 12},${y - 4} L${x + 12},${y - 4} L${x + 8},${y + 9} L${x - 8},${y + 9} Z`, fill: color, class: 'unit-shape' }, g);
    el('line', { x1: x, y1: y - 4, x2: x, y2: y - 13, class: 'unit-mast' }, g);
  }
  const t = el('text', { x, y: y + (u.type === 'A' ? 4 : 5), class: 'unit-letter' }, g);
  t.textContent = u.type;
  const title = el('title', {}, g);
  title.textContent = `${u.type === 'A' ? 'Armée' : 'Flotte'} ${map.powerNames[u.power]} — ${u.loc}${dislodged ? ' (délogée)' : ''}`;
  if (opts.onClick) g.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick(provOf(u.loc)); });
}

function shorten(x1, y1, x2, y2, d1, d2) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  return [x1 + ux * d1, y1 + uy * d1, x2 - ux * d2, y2 - uy * d2];
}

function drawArrow(parent, map, state, a) {
  const color = POWER_COLORS[a.power] || '#222';
  const marker = `url(#arrow-${POWER_COLORS[a.power] ? a.power : 'X'})`;
  const [fx, fy] = locPoint(map, a.from);
  if (a.kind === 'hold') {
    el('circle', { cx: fx, cy: fy, r: 15, class: 'arrow-hold', stroke: color }, parent);
    return;
  }
  if (a.kind === 'move' || a.kind === 'retreat') {
    const [tx, ty] = locPoint(map, a.to);
    const [x1, y1, x2, y2] = shorten(fx, fy, tx, ty, 10, 14);
    el('line', { x1, y1, x2, y2, stroke: color, class: `arrow arrow-${a.kind}${a.failed ? ' arrow-failed' : ''}`, 'marker-end': marker }, parent);
    return;
  }
  if (a.kind === 'support' || a.kind === 'convoy') {
    const [mx, my] = locPoint(map, a.via);
    if (a.to) {
      const [tx, ty] = locPoint(map, a.to);
      const cx = (mx + tx) / 2;
      const cy = (my + ty) / 2;
      const [x1, y1] = shorten(fx, fy, cx, cy, 10, 0);
      el('line', { x1, y1, x2: cx, y2: cy, stroke: color, class: `arrow arrow-${a.kind}`, 'marker-end': marker }, parent);
    } else {
      const [x1, y1, x2, y2] = shorten(fx, fy, mx, my, 10, 16);
      el('line', { x1, y1, x2, y2, stroke: color, class: `arrow arrow-${a.kind}`, 'marker-end': marker }, parent);
      el('circle', { cx: mx, cy: my, r: 17, class: 'arrow-hold arrow-support-hold', stroke: color }, parent);
    }
  }
}
