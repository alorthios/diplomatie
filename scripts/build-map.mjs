// Génère public/map-shapes.js : les contours des provinces pour le fond de carte.
// Usage : npm run build:map
//
// La carte est un diagramme de Voronoï : chaque province occupe la zone la plus
// proche de sa position, éventuellement complétée de points supplémentaires
// (EXTRA) pour mieux suivre la géographie. Des points « décor » (océan, Afrique,
// Asie, Suisse…) complètent la carte sans être jouables. Les frontières sont
// légèrement déformées, de façon identique des deux côtés, pour un aspect naturel.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Delaunay } from 'd3-delaunay';

const require = createRequire(import.meta.url);
const M = require('../src/engine/map.js');

const W = 980;
const H = 860;
const DEBUG = process.argv.includes('--debug');

// Points supplémentaires rattachés à une province : [province, x, y]
const EXTRA = [
  // Mer du Nord, Manche : détacher la Grande-Bretagne du continent
  ['NTH', 310, 340], ['NTH', 300, 380], ['NTH', 360, 230], ['NTH', 320, 215],
  ['ENG', 290, 418], ['ENG', 250, 440], ['ENG', 160, 445],
  ['DEN', 418, 352],
  // Atlantique et mer d'Irlande autour des îles
  ['NAO', 70, 320], ['NAO', 130, 150], ['NAO', 200, 140], ['NAO', 60, 420],
  ['NWG', 270, 130], ['NWG', 230, 60], ['NWG', 330, 160],
  ['IRI', 190, 325], ['IRI', 110, 380], ['IRI', 180, 395],
  ['MAO', 120, 560], ['MAO', 30, 470], ['MAO', 150, 520],
  // Baltique, Botnie, Skagerrak
  ['BAL', 470, 335], ['BAL', 560, 290], ['BAL', 490, 290],
  ['BOT', 590, 245], ['BOT', 545, 170], ['BOT', 580, 120],
  ['SKA', 470, 255],
  ['BAR', 520, 40], ['BAR', 760, 40],
  // Méditerranée
  ['LYO', 340, 640], ['WES', 200, 720], ['WES', 300, 760], ['WES', 230, 770],
  ['TYS', 380, 700], ['TYS', 430, 780],
  ['ION', 470, 790], ['ION', 590, 800], ['ION', 440, 830],
  ['ADR', 455, 610], ['ADR', 490, 660], ['ADR', 520, 650],
  ['AEG', 620, 720], ['AEG', 680, 715], ['AEG', 680, 790],
  ['EAS', 700, 830], ['EAS', 860, 820],
  // Mer Noire
  ['BLA', 730, 600], ['BLA', 760, 520], ['BLA', 840, 590], ['BLA', 710, 560],
];

// Points décor : [type, x, y] — 'sea' (océan) ou 'land' (terre hors jeu)
const DECOR = [
  // Océan
  ['sea', 10, 60], ['sea', 10, 220], ['sea', 5, 560], ['sea', 10, 760], ['sea', 200, 15], ['sea', 400, 15],
  // Islande
  ['land', 150, 55],
  // Irlande
  ['land', 140, 315], ['land', 115, 330],
  // Suisse
  ['land', 368, 550],
  // Afrique
  ['land', 60, 850], ['land', 250, 855], ['land', 460, 855], ['land', 620, 858],
  // Moyen-Orient et Asie
  ['land', 975, 560], ['land', 975, 720], ['land', 960, 845], ['land', 975, 400],
  ['land', 975, 250], ['land', 975, 100], ['land', 880, 360], ['land', 900, 200],
  ['land', 865, 520], ['land', 820, 860], ['land', 870, 450],
  // Laponie
  ['land', 640, 80],
];

const sites = [];
for (const p of Object.values(M.PROVINCES)) sites.push({ prov: p.id, type: p.type, x: p.x, y: p.y });
for (const [id, x, y] of EXTRA) sites.push({ prov: id, type: M.PROVINCES[id].type, x, y });
for (const [type, x, y] of DECOR) sites.push({ prov: null, type, x, y });

const delaunay = Delaunay.from(sites, (s) => s.x, (s) => s.y);
const voronoi = delaunay.voronoi([0, 0, W, H]);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const onBorder = (p) => p[0] <= 0.01 || p[1] <= 0.01 || p[0] >= W - 0.01 || p[1] >= H - 0.01;

/** Points intermédiaires d'une arête a→b, identiques quel que soit le sens de parcours. */
function wiggle(a, b) {
  if (onBorder(a) && onBorder(b)) return [];
  const forward = key(a) < key(b);
  const [p, q] = forward ? [a, b] : [b, a];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy);
  if (len < 10) return [];
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.min(6, Math.max(2, Math.round(len / 14)));
  const seed = key(p) + key(q);
  const amp = Math.min(8, len * 0.1);
  const pts = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const off = (hash(seed + i) - 0.5) * 2 * amp * Math.sin(Math.PI * t);
    pts.push([p[0] + dx * t + nx * off, p[1] + dy * t + ny * off]);
  }
  return forward ? pts : pts.reverse();
}

const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (pts) => pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join('L');

const shapes = {};
const decor = { sea: [], land: [] };
const edgeOwners = new Map(); // arête -> [site, site]

sites.forEach((s, i) => {
  const poly = voronoi.cellPolygon(i);
  if (!poly) return;
  const pts = [];
  for (let k = 0; k < poly.length - 1; k++) {
    const a = poly[k];
    const b = poly[k + 1];
    const mids = wiggle(a, b);
    pts.push(a, ...mids);
    const ek = [key(a), key(b)].sort().join('|');
    if (!edgeOwners.has(ek)) edgeOwners.set(ek, { line: [a, ...mids, b], owners: [] });
    edgeOwners.get(ek).owners.push(s);
  }
  const d = `M${fmt(pts)}Z`;
  if (s.prov) shapes[s.prov] = (shapes[s.prov] || '') + d;
  else decor[s.type === 'sea' ? 'sea' : 'land'].push(d);
});

// Frontières : uniquement entre zones différentes
const isLand = (s) => s.type !== 'sea';
const borders = { coast: '', land: '', sea: '' };
for (const { line, owners } of edgeOwners.values()) {
  if (owners.length !== 2) continue;
  const [a, b] = owners;
  if (a.prov && a.prov === b.prov) continue;
  if (!a.prov && !b.prov && a.type === b.type) continue;
  let kind;
  if (isLand(a) !== isLand(b)) kind = 'coast';
  else if (isLand(a)) kind = 'land';
  else if (a.prov && b.prov) kind = 'sea';
  else continue; // mer jouable / océan décor : pas de trait
  borders[kind] += `M${fmt(line)}`;
}

const out = `// Fichier généré par scripts/build-map.mjs — ne pas modifier à la main.
export const SHAPES = ${JSON.stringify(shapes)};
export const DECOR = ${JSON.stringify(decor)};
export const BORDERS = ${JSON.stringify(borders)};
${DEBUG ? `export const SITES = ${JSON.stringify(sites.map((s) => [s.prov || s.type, s.x, s.y]))};\n` : ''}`;
writeFileSync(new URL('../public/map-shapes.js', import.meta.url), out);
console.log(`map-shapes.js : ${Object.keys(shapes).length} provinces, ${(out.length / 1024).toFixed(1)} Ko`);
