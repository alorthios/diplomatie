// Génère public/map-shapes.js : le fond de carte géographique.
// Usage : npm run build:map  (ajouter --debug pour afficher les points de découpe)
//
// Données : Natural Earth 1:50m (domaine public) via le paquet world-atlas.
// Méthode :
//  1. les pays actuels sont projetés (conique conforme centrée sur l'Europe) ;
//  2. chaque pays est réparti entre les provinces de Diplomatie qui le couvrent,
//     au plus proche de leurs points (diagramme de Voronoï restreint au pays) ;
//     les frontières entre pays sont donc réelles, celles à l'intérieur approchées ;
//  3. les mers se partagent de la même façon l'eau restante.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Delaunay } from 'd3-delaunay';
import { geoConicConformal } from 'd3-geo';
import { feature } from 'topojson-client';
import pc from 'polygon-clipping';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-50m.json');
const M = require('../src/engine/map.js');
const DEBUG = process.argv.includes('--debug');

// ------------------------------------------------------------------
// Points des provinces [lat, lon] : le premier sert d'emplacement (étiquette,
// unités) ; les suivants affinent la découpe.
// ------------------------------------------------------------------
const SITES = {
  // Mers
  NAO: [[56, -20], [63, -16], [48, -21], [67, -22], [52, -13]],
  NWG: [[67, 3], [64, -6], [70.5, 12], [72, -2]],
  BAR: [[70.6, 33], [71, 25], [69, 42], [73, 50]],
  NTH: [[56, 3.5], [54, 3], [58.5, 1], [53.2, 2.4], [59.8, 3.4]],
  SKA: [[58.1, 9.8], [57.3, 11.4]],
  HEL: [[54.3, 7.6]],
  BAL: [[55.5, 17], [57.2, 19.5], [54.6, 13], [58.8, 20.3]],
  BOT: [[62.5, 20.5], [64.8, 23], [59.8, 25.5], [60.3, 19.5]],
  IRI: [[53.6, -5.4], [51.3, -7]],
  ENG: [[50, -2.5], [49.5, -5.5], [50.7, 0.9]],
  MAO: [[44, -13], [40, -14], [35, -12], [46, -4.5], [48, -11], [37, -9.5]],
  WES: [[38, 3.5], [36.6, -0.5], [37.6, 7.5]],
  LYO: [[42.4, 4.6], [42.4, 7.6]],
  TYS: [[40, 12], [39, 10.6], [41.5, 11]],
  ION: [[37, 18], [34.5, 16.5], [36.4, 21], [33.4, 20], [36, 14]],
  ADR: [[43, 15.5], [41.5, 18.3], [44.8, 13]],
  AEG: [[38.5, 25], [36.5, 25.5], [40.2, 24.5]],
  EAS: [[34.3, 30], [33.8, 25.5], [35.2, 34.5], [32.8, 33]],
  BLA: [[43.2, 34], [44, 31], [42.5, 38.5], [46, 36.5]],
  // Angleterre
  CLY: [[57.4, -5.2], [56.0, -4.6]],
  EDI: [[56.7, -2.9], [57.6, -2.4]],
  LVP: [[54.3, -2.9]],
  YOR: [[54.0, -1.1]],
  WAL: [[52.3, -3.8]],
  LON: [[51.6, -0.5], [52.4, 0.9]],
  // France
  BRE: [[48.1, -2.9]],
  PIC: [[50.0, 2.1]],
  PAR: [[48.4, 2.4]],
  BUR: [[47.0, 4.8], [48.4, 6.4]],
  GAS: [[44.5, -0.2]],
  MAR: [[43.8, 5.0]],
  // Allemagne
  KIE: [[53.6, 9.8]],
  BER: [[52.8, 13.3]],
  MUN: [[48.8, 11.0]],
  RUH: [[51.0, 7.5]],
  PRU: [[54.2, 20.5]],
  SIL: [[51.0, 16.6]],
  // Italie
  PIE: [[45.0, 7.7]],
  VEN: [[45.6, 11.6]],
  TUS: [[43.4, 11.0]],
  ROM: [[42.0, 12.9]],
  APU: [[41.2, 16.0]],
  NAP: [[39.8, 16.2], [37.5, 14.2]],
  // Autriche-Hongrie
  VIE: [[48.0, 16.0]],
  BUD: [[47.2, 20.0], [46.5, 24.5]],
  TRI: [[45.2, 15.3], [43.8, 17.8]],
  TYR: [[47.0, 12.0]],
  BOH: [[49.8, 14.6]],
  GAL: [[49.6, 23.8]],
  // Russie
  STP: [[61, 35], [67.8, 34], [64, 40], [59.3, 30.5]],
  MOS: [[55.5, 38], [57.5, 44]],
  WAR: [[52.3, 20.6]],
  SEV: [[47.3, 37.5], [45, 40.5], [44.9, 34.2]],
  UKR: [[49.5, 30.5]],
  LVN: [[57.5, 25.5]],
  FIN: [[63, 26.5], [67.5, 27], [61, 24.5]],
  // Turquie
  CON: [[41.1, 28.2], [40.2, 29.3]],
  ANK: [[40.6, 33.0]],
  SMY: [[38.5, 29.0], [37.2, 33.5]],
  ARM: [[40.0, 41.5]],
  SYR: [[35.5, 38.0], [33.5, 36.0]],
  // Neutres
  NWY: [[61.0, 8.5], [66.5, 14.5], [69.5, 20], [59, 7]],
  SWE: [[59.8, 15.0], [64.5, 18.5], [67.5, 21], [57, 14]],
  DEN: [[56.0, 9.3], [55.5, 12]],
  HOL: [[52.4, 5.7]],
  BEL: [[50.6, 4.5]],
  SPA: [[40.0, -3.7], [42, -1], [38, -4]],
  POR: [[39.8, -8.0], [41.5, -8]],
  NAF: [[33.5, -1.0], [32, -7], [35.2, 4]],
  TUN: [[34.5, 9.5]],
  SER: [[44.0, 21.0]],
  ALB: [[41.0, 20.0]],
  GRE: [[39.5, 22.0], [37.6, 22.2]],
  BUL: [[42.7, 25.3]],
  RUM: [[45.7, 25.0]],
};

// Côtes multiples [lat, lon]
const COAST_SITES = {
  STP: { nc: [68.6, 37], sc: [60.2, 29.2] },
  SPA: { nc: [43.3, -5.0], sc: [37.0, -3.5] },
  BUL: { ec: [43.0, 27.6], sc: [41.0, 25.0] },
};

// Zones hors jeu : [nom, lat, lon]
const DECOR_LAND = {
  irl: [53.3, -8], isl: [64.8, -18], sui: [46.8, 8.0], cor: [42.1, 9.1], sar: [40.0, 9.0],
  cre: [35.2, 24.9], cyp: [35.0, 33.2], gro: [70, -35],
  af1: [27, 0], af2: [27, 15], af3: [30, 22], af4: [27, 30], lev: [31, 36.5],
  irq: [32, 44], irn: [37, 47], kaz: [48, 52], ru1: [60, 52], ru2: [52, 47], ru3: [66, 50], ru4: [56, 56],
  cau: [42.5, 46],
};
const DECOR_SEA = { cas: [42, 50.5], red: [26, 35] };

// Répartition des pays actuels entre provinces (et zones hors jeu)
const COUNTRIES = {
  'United Kingdom': ['CLY', 'EDI', 'LVP', 'YOR', 'WAL', 'LON'],
  'Isle of Man': ['LVP'],
  Ireland: ['irl'], Iceland: ['isl'], Greenland: ['gro'], 'Faeroe Is.': ['isl'],
  Norway: ['NWY'], Sweden: ['SWE'], Finland: ['FIN'], 'Åland': ['FIN'], Denmark: ['DEN'],
  Russia: ['STP', 'MOS', 'SEV', 'PRU', 'LVN', 'ru1', 'ru2', 'ru3', 'ru4', 'cau'],
  Estonia: ['LVN'], Latvia: ['LVN'], Lithuania: ['LVN', 'WAR', 'PRU'],
  Belarus: ['WAR', 'MOS', 'LVN', 'UKR'],
  Poland: ['PRU', 'SIL', 'WAR', 'GAL', 'BER'],
  Germany: ['KIE', 'BER', 'MUN', 'RUH', 'SIL'],
  Netherlands: ['HOL'], Belgium: ['BEL'], Luxembourg: ['BEL'],
  France: ['BRE', 'PIC', 'PAR', 'BUR', 'GAS', 'MAR', 'cor'],
  Monaco: ['MAR'], Andorra: ['SPA'], Jersey: ['BRE'], Guernsey: ['BRE'],
  Switzerland: ['sui'], Liechtenstein: ['sui'],
  Austria: ['TYR', 'VIE'], Czechia: ['BOH', 'VIE'], Slovakia: ['BUD', 'GAL'], Hungary: ['BUD'],
  Slovenia: ['TRI'], Croatia: ['TRI', 'BUD'], 'Bosnia and Herz.': ['TRI'],
  Serbia: ['SER'], Kosovo: ['SER'], Montenegro: ['ALB'], Macedonia: ['SER'], Albania: ['ALB'],
  Greece: ['GRE', 'cre'], Bulgaria: ['BUL'], Romania: ['RUM', 'BUD'], Moldova: ['UKR'],
  Ukraine: ['GAL', 'UKR', 'SEV'],
  Turkey: ['CON', 'ANK', 'SMY', 'ARM', 'SYR'],
  Syria: ['SYR'], Lebanon: ['SYR'], Israel: ['lev'], Palestine: ['lev'], Jordan: ['lev'],
  Georgia: ['ARM', 'SEV'], Armenia: ['ARM'], Azerbaijan: ['cau'],
  Cyprus: ['cyp'], 'N. Cyprus': ['cyp'],
  Italy: ['PIE', 'VEN', 'TUS', 'ROM', 'APU', 'NAP', 'sar'], 'San Marino': ['TUS'], Vatican: ['ROM'], Malta: ['NAP'],
  Spain: ['SPA'], Portugal: ['POR'],
  Morocco: ['NAF'], Algeria: ['NAF', 'af1'], Tunisia: ['TUN'],
};

// ------------------------------------------------------------------
// Projection
// ------------------------------------------------------------------
const W = 1000;
const box = { type: 'Polygon', coordinates: [[]] };
for (let lon = -11; lon <= 44; lon += 1) box.coordinates[0].push([lon, 33]);
const proj0 = geoConicConformal().rotate([-16, 0]).parallels([40, 64]).fitWidth(W, { type: 'MultiPoint', coordinates: box.coordinates[0] });
// Cadre : on recadre verticalement sur 30°N–71°N au centre
const top = proj0([16, 71.6])[1];
const bottom = proj0([16, 31.2])[1];
const H = Math.round(bottom - top);
const projection = proj0.translate([proj0.translate()[0], proj0.translate()[1] - top]);
const P = ([lat, lon]) => projection([lon, lat]);
const FRAME = [[[0, 0], [W, 0], [W, H], [0, H], [0, 0]]];

function projectPolygons(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const out = [];
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer.some(([lon, lat]) => lon > -45 && lon < 75 && lat > 22 && lat < 82)) continue;
    const rings = poly.map((ring) => ring.filter(([lon]) => lon > -90 && lon < 120).map(([lon, lat]) => projection([lon, lat])));
    if (rings[0].length < 4) continue;
    for (const r of rings) if (r.length && (r[0][0] !== r.at(-1)[0] || r[0][1] !== r.at(-1)[1])) r.push(r[0]);
    out.push(rings.filter((r) => r.length >= 4));
  }
  if (!out.length) return [];
  try { return pc.intersection(out, FRAME); } catch { return []; }
}

// ------------------------------------------------------------------
// Voronoï avec frontières légèrement irrégulières
// ------------------------------------------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
function wiggle(a, b) {
  const forward = key(a) < key(b);
  const [p, q] = forward ? [a, b] : [b, a];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy);
  if (len < 8) return [];
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.min(10, Math.max(2, Math.round(len / 9)));
  const seed = key(p) + key(q);
  const amp = Math.min(6, len * 0.08);
  const pts = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const off = ((hash(seed + i) - 0.5) * 2 * amp + (hash(seed + i + 'b') - 0.5) * amp) * Math.sin(Math.PI * t);
    pts.push([p[0] + dx * t + nx * off, p[1] + dy * t + ny * off]);
  }
  return forward ? pts : pts.reverse();
}

/** Répartit une zone (multipolygone) entre des points : { owner: multipolygone } */
function partition(area, points) {
  const owners = [...new Set(points.map((p) => p.owner))];
  if (owners.length === 1) return { [owners[0]]: area };
  const pad = 400;
  const d = Delaunay.from(points, (p) => p.xy[0], (p) => p.xy[1]);
  const v = d.voronoi([-pad, -pad, W + pad, H + pad]);
  const cells = {};
  points.forEach((p, i) => {
    const poly = v.cellPolygon(i);
    if (!poly) return;
    const ring = [];
    for (let k = 0; k < poly.length - 1; k++) ring.push(poly[k], ...wiggle(poly[k], poly[k + 1]));
    ring.push(ring[0]);
    (cells[p.owner] = cells[p.owner] || []).push([ring]);
  });
  const out = {};
  for (const [owner, polys] of Object.entries(cells)) {
    const cell = polys.length > 1 ? pc.union(...polys) : polys;
    const part = pc.intersection(area, cell);
    if (part.length) out[owner] = part;
  }
  return out;
}

// ------------------------------------------------------------------
// Construction
// ------------------------------------------------------------------
const sitePoints = {};
for (const [id, list] of Object.entries(SITES)) sitePoints[id] = list.map(P);
for (const [id, ll] of Object.entries(DECOR_LAND)) sitePoints[id] = [P(ll)];
for (const [id, ll] of Object.entries(DECOR_SEA)) sitePoints[id] = [P(ll)];

const pieces = {}; // owner -> [multipolygones]
const add = (owner, mp) => { (pieces[owner] = pieces[owner] || []).push(mp); };

const countries = feature(world, world.objects.countries).features;
const landParts = [];
for (const c of countries) {
  const mp = projectPolygons(c.geometry);
  if (!mp.length) continue;
  landParts.push(mp);
  const owners = COUNTRIES[c.properties.name];
  if (!owners) { add('_land', mp); continue; }
  const pts = owners.flatMap((o) => (sitePoints[o] || []).map((xy) => ({ owner: o, xy })));
  for (const [owner, part] of Object.entries(partition(mp, pts))) add(owner, part);
}
const land = pc.union(...landParts);
const water = pc.difference(FRAME, land);

const seaIds = Object.keys(SITES).filter((id) => M.PROVINCES[id].type === 'sea');
const seaPts = [...seaIds, ...Object.keys(DECOR_SEA)].flatMap((o) => sitePoints[o].map((xy) => ({ owner: o, xy })));
for (const [owner, part] of Object.entries(partition(water, seaPts))) add(owner, part);

// ------------------------------------------------------------------
// Simplification et sortie
// ------------------------------------------------------------------
function simplify(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let max = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len;
      if (dist > max) { max = dist; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}
function area(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(s / 2);
}
const r1 = (v) => Math.round(v * 10) / 10;
function toPath(mp, minArea = 3) {
  let d = '';
  for (const poly of mp) {
    if (area(poly[0]) < minArea) continue;
    for (const ring of poly) {
      if (area(ring) < minArea) continue;
      const mid = Math.floor(ring.length / 2);
      const s = [...simplify(ring.slice(0, mid + 1), 0.35).slice(0, -1), ...simplify(ring.slice(mid), 0.35)];
      if (s.length < 4) continue;
      d += `M${s.slice(0, -1).map((p) => `${r1(p[0])},${r1(p[1])}`).join('L')}Z`;
    }
  }
  return d;
}

const shapes = {};
const decor = { land: '', sea: '' };
for (const [owner, list] of Object.entries(pieces)) {
  const mp = list.length > 1 ? pc.union(...list) : list[0];
  if (M.PROVINCES[owner]) shapes[owner] = toPath(mp, 1);
  else if (DECOR_SEA[owner]) decor.sea += toPath(mp);
  else decor.land += toPath(mp);
}
const missing = Object.keys(M.PROVINCES).filter((id) => !shapes[id]);
if (missing.length) console.warn(`Provinces sans contour : ${missing.join(', ')}`);

const pos = {};
for (const id of Object.keys(SITES)) pos[id] = sitePoints[id][0].map(r1);
const coastPos = {};
for (const [id, cs] of Object.entries(COAST_SITES)) {
  coastPos[id] = {};
  for (const [c, ll] of Object.entries(cs)) coastPos[id][c] = P(ll).map(r1);
}

const out = `// Fichier généré par scripts/build-map.mjs — ne pas modifier à la main.
// Fond de carte : Natural Earth 1:50m (domaine public), via world-atlas.
export const VIEW = [${W}, ${H}];
export const SHAPES = ${JSON.stringify(shapes)};
export const DECOR = ${JSON.stringify(decor)};
export const COAST = ${JSON.stringify(toPath(land, 1))};
export const POS = ${JSON.stringify(pos)};
export const COAST_POS = ${JSON.stringify(coastPos)};
${DEBUG ? `export const SITES = ${JSON.stringify(Object.entries(sitePoints).flatMap(([id, l]) => l.map((p) => [id, ...p.map(r1)])))};\n` : ''}`;
writeFileSync(new URL('../public/map-shapes.js', import.meta.url), out);
console.log(`map-shapes.js : ${Object.keys(shapes).length} provinces, ${W}×${H}, ${(out.length / 1024).toFixed(0)} Ko`);
