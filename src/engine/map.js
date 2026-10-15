'use strict';
// Carte standard de Diplomatie (Europe 1901) : 75 provinces, 34 centres.
// type : 'sea' (mer), 'coast' (côtière), 'land' (intérieure)

const POWERS = ['ENG', 'FRA', 'GER', 'ITA', 'AUS', 'RUS', 'TUR'];

const POWER_NAMES = {
  ENG: 'Angleterre', FRA: 'France', GER: 'Allemagne', ITA: 'Italie',
  AUS: 'Autriche-Hongrie', RUS: 'Russie', TUR: 'Turquie',
};

// [abréviation, nom, type, centre?, puissance d'origine, x, y]
const PROVINCE_LIST = [
  // Mers
  ['NAO', 'Atlantique Nord', 'sea', false, null, 90, 230],
  ['NWG', 'Mer de Norvège', 'sea', false, null, 380, 90],
  ['BAR', 'Mer de Barents', 'sea', false, null, 640, 30],
  ['NTH', 'Mer du Nord', 'sea', false, null, 330, 280],
  ['SKA', 'Skagerrak', 'sea', false, null, 440, 265],
  ['HEL', 'Baie d\'Héligoland', 'sea', false, null, 375, 345],
  ['BAL', 'Mer Baltique', 'sea', false, null, 520, 320],
  ['BOT', 'Golfe de Botnie', 'sea', false, null, 565, 215],
  ['IRI', 'Mer d\'Irlande', 'sea', false, null, 150, 360],
  ['ENG', 'Manche', 'sea', false, null, 215, 430],
  ['MAO', 'Atlantique Centre', 'sea', false, null, 80, 520],
  ['WES', 'Méditerranée Ouest', 'sea', false, null, 270, 720],
  ['LYO', 'Golfe du Lion', 'sea', false, null, 320, 660],
  ['TYS', 'Mer Tyrrhénienne', 'sea', false, null, 400, 745],
  ['ION', 'Mer Ionienne', 'sea', false, null, 525, 815],
  ['ADR', 'Mer Adriatique', 'sea', false, null, 470, 640],
  ['AEG', 'Mer Égée', 'sea', false, null, 645, 755],
  ['EAS', 'Méditerranée Est', 'sea', false, null, 770, 815],
  ['BLA', 'Mer Noire', 'sea', false, null, 790, 565],
  // Angleterre
  ['CLY', 'Clyde', 'coast', false, null, 225, 205],
  ['EDI', 'Édimbourg', 'coast', true, 'ENG', 268, 225],
  ['LVP', 'Liverpool', 'coast', true, 'ENG', 235, 280],
  ['YOR', 'Yorkshire', 'coast', false, null, 275, 318],
  ['WAL', 'Pays de Galles', 'coast', false, null, 215, 365],
  ['LON', 'Londres', 'coast', true, 'ENG', 265, 375],
  // France
  ['BRE', 'Brest', 'coast', true, 'FRA', 195, 490],
  ['PIC', 'Picardie', 'coast', false, null, 270, 460],
  ['PAR', 'Paris', 'land', true, 'FRA', 250, 530],
  ['BUR', 'Bourgogne', 'land', false, null, 320, 530],
  ['GAS', 'Gascogne', 'coast', false, null, 220, 590],
  ['MAR', 'Marseille', 'coast', true, 'FRA', 295, 605],
  // Allemagne
  ['KIE', 'Kiel', 'coast', true, 'GER', 410, 400],
  ['BER', 'Berlin', 'coast', true, 'GER', 470, 380],
  ['MUN', 'Munich', 'land', true, 'GER', 405, 500],
  ['RUH', 'Ruhr', 'land', false, null, 368, 450],
  ['PRU', 'Prusse', 'coast', false, null, 535, 380],
  ['SIL', 'Silésie', 'land', false, null, 495, 445],
  // Italie
  ['VEN', 'Venise', 'coast', true, 'ITA', 420, 595],
  ['ROM', 'Rome', 'coast', true, 'ITA', 445, 680],
  ['NAP', 'Naples', 'coast', true, 'ITA', 515, 728],
  ['PIE', 'Piémont', 'coast', false, null, 360, 585],
  ['TUS', 'Toscane', 'coast', false, null, 400, 640],
  ['APU', 'Apulie', 'coast', false, null, 497, 685],
  // Autriche-Hongrie
  ['VIE', 'Vienne', 'land', true, 'AUS', 520, 535],
  ['BUD', 'Budapest', 'land', true, 'AUS', 585, 570],
  ['TRI', 'Trieste', 'coast', true, 'AUS', 500, 600],
  ['TYR', 'Tyrol', 'land', false, null, 440, 545],
  ['BOH', 'Bohême', 'land', false, null, 470, 495],
  ['GAL', 'Galicie', 'land', false, null, 615, 500],
  // Russie
  ['STP', 'Saint-Pétersbourg', 'coast', true, 'RUS', 730, 185],
  ['MOS', 'Moscou', 'land', true, 'RUS', 760, 330],
  ['WAR', 'Varsovie', 'land', true, 'RUS', 580, 430],
  ['SEV', 'Sébastopol', 'coast', true, 'RUS', 805, 465],
  ['UKR', 'Ukraine', 'land', false, null, 680, 450],
  ['LVN', 'Livonie', 'coast', false, null, 615, 300],
  ['FIN', 'Finlande', 'coast', false, null, 615, 160],
  // Turquie
  ['CON', 'Constantinople', 'coast', true, 'TUR', 725, 680],
  ['ANK', 'Ankara', 'coast', true, 'TUR', 805, 660],
  ['SMY', 'Smyrne', 'coast', true, 'TUR', 760, 745],
  ['ARM', 'Arménie', 'coast', false, null, 905, 640],
  ['SYR', 'Syrie', 'coast', false, null, 885, 760],
  // Neutres
  ['NWY', 'Norvège', 'coast', true, null, 440, 175],
  ['SWE', 'Suède', 'coast', true, null, 510, 220],
  ['DEN', 'Danemark', 'coast', true, null, 428, 318],
  ['HOL', 'Hollande', 'coast', true, null, 345, 400],
  ['BEL', 'Belgique', 'coast', true, null, 312, 440],
  ['SPA', 'Espagne', 'coast', true, null, 150, 645],
  ['POR', 'Portugal', 'coast', true, null, 65, 640],
  ['NAF', 'Afrique du Nord', 'coast', false, null, 160, 805],
  ['TUN', 'Tunisie', 'coast', true, null, 355, 805],
  ['ALB', 'Albanie', 'coast', false, null, 545, 680],
  ['SER', 'Serbie', 'land', true, null, 590, 635],
  ['GRE', 'Grèce', 'coast', true, null, 590, 725],
  ['BUL', 'Bulgarie', 'coast', true, null, 655, 650],
  ['RUM', 'Roumanie', 'coast', true, null, 685, 580],
];

// Côtes multiples : position d'affichage de chaque côte
const COASTS = {
  STP: { nc: [735, 115], sc: [670, 235] },
  SPA: { nc: [150, 595], sc: [195, 690] },
  BUL: { ec: [700, 625], sc: [640, 695] },
};

// Frontières terrestres (armées)
const ARMY_EDGES = `
CLY-EDI CLY-LVP EDI-LVP EDI-YOR LVP-YOR LVP-WAL YOR-WAL YOR-LON WAL-LON
BRE-PIC BRE-PAR BRE-GAS PIC-PAR PIC-BUR PIC-BEL PAR-BUR PAR-GAS
BUR-GAS BUR-MAR BUR-BEL BUR-RUH BUR-MUN GAS-MAR GAS-SPA MAR-PIE MAR-SPA
BEL-RUH BEL-HOL HOL-RUH HOL-KIE RUH-KIE RUH-MUN KIE-MUN KIE-BER KIE-DEN
BER-MUN BER-SIL BER-PRU PRU-SIL PRU-WAR PRU-LVN SIL-MUN SIL-BOH SIL-GAL SIL-WAR
MUN-BOH MUN-TYR DEN-SWE SWE-NWY SWE-FIN NWY-FIN NWY-STP FIN-STP
STP-MOS STP-LVN LVN-MOS LVN-WAR MOS-WAR MOS-UKR MOS-SEV WAR-GAL WAR-UKR
UKR-GAL UKR-RUM UKR-SEV SEV-RUM SEV-ARM GAL-BOH GAL-VIE GAL-BUD GAL-RUM
BOH-VIE BOH-TYR TYR-VIE TYR-TRI TYR-VEN TYR-PIE VIE-BUD VIE-TRI
BUD-RUM BUD-SER BUD-TRI TRI-SER TRI-ALB TRI-VEN PIE-VEN PIE-TUS
VEN-APU VEN-ROM VEN-TUS TUS-ROM ROM-APU ROM-NAP APU-NAP SPA-POR NAF-TUN
ALB-SER ALB-GRE SER-GRE SER-BUL SER-RUM GRE-BUL BUL-RUM BUL-CON
CON-ANK CON-SMY ANK-SMY ANK-ARM SMY-ARM SMY-SYR ARM-SYR
`;

// Liaisons maritimes (flottes), avec côtes explicites
const FLEET_EDGES = `
NAO-NWG NAO-IRI NAO-MAO NAO-CLY NAO-LVP
NWG-BAR NWG-NTH NWG-EDI NWG-CLY NWG-NWY
BAR-NWY BAR-STP/nc
NTH-SKA NTH-HEL NTH-ENG NTH-EDI NTH-YOR NTH-LON NTH-BEL NTH-HOL NTH-DEN NTH-NWY
SKA-NWY SKA-SWE SKA-DEN
HEL-DEN HEL-KIE HEL-HOL
BAL-DEN BAL-SWE BAL-BOT BAL-LVN BAL-PRU BAL-BER BAL-KIE
BOT-SWE BOT-FIN BOT-STP/sc BOT-LVN
IRI-LVP IRI-WAL IRI-ENG IRI-MAO
ENG-WAL ENG-LON ENG-BEL ENG-PIC ENG-BRE ENG-MAO
MAO-BRE MAO-GAS MAO-SPA/nc MAO-POR MAO-SPA/sc MAO-NAF MAO-WES
WES-SPA/sc WES-LYO WES-TYS WES-TUN WES-NAF
LYO-SPA/sc LYO-MAR LYO-PIE LYO-TUS LYO-TYS
TYS-TUS TYS-ROM TYS-NAP TYS-ION TYS-TUN
ION-NAP ION-APU ION-ADR ION-ALB ION-GRE ION-AEG ION-EAS ION-TUN
ADR-VEN ADR-TRI ADR-ALB ADR-APU
AEG-GRE AEG-BUL/sc AEG-CON AEG-SMY AEG-EAS
EAS-SMY EAS-SYR
BLA-RUM BLA-SEV BLA-ARM BLA-ANK BLA-CON BLA-BUL/ec
CLY-EDI CLY-LVP EDI-YOR YOR-LON LON-WAL WAL-LVP
BRE-PIC BRE-GAS PIC-BEL BEL-HOL HOL-KIE KIE-DEN KIE-BER BER-PRU PRU-LVN
LVN-STP/sc STP/sc-FIN FIN-SWE SWE-DEN SWE-NWY NWY-STP/nc
GAS-SPA/nc SPA/nc-POR POR-SPA/sc SPA/sc-MAR MAR-PIE PIE-TUS TUS-ROM ROM-NAP
NAP-APU APU-VEN VEN-TRI TRI-ALB ALB-GRE GRE-BUL/sc BUL/sc-CON CON-BUL/ec
BUL/ec-RUM RUM-SEV SEV-ARM ARM-ANK ANK-CON CON-SMY SMY-SYR NAF-TUN
`;

const START_UNITS = {
  ENG: [['F', 'LON'], ['F', 'EDI'], ['A', 'LVP']],
  FRA: [['F', 'BRE'], ['A', 'PAR'], ['A', 'MAR']],
  GER: [['F', 'KIE'], ['A', 'BER'], ['A', 'MUN']],
  ITA: [['F', 'NAP'], ['A', 'ROM'], ['A', 'VEN']],
  AUS: [['F', 'TRI'], ['A', 'VIE'], ['A', 'BUD']],
  RUS: [['F', 'STP/sc'], ['A', 'MOS'], ['A', 'WAR'], ['F', 'SEV']],
  TUR: [['F', 'ANK'], ['A', 'CON'], ['A', 'SMY']],
};

// ---- Construction des structures ----
const PROVINCES = {};
for (const [id, name, type, sc, home, x, y] of PROVINCE_LIST) {
  PROVINCES[id] = { id, name, type, sc, home, x, y, coasts: COASTS[id] ? Object.keys(COASTS[id]) : null };
}

const armyAdj = {};
const fleetAdj = {};
function addEdge(adj, a, b) {
  (adj[a] = adj[a] || new Set()).add(b);
  (adj[b] = adj[b] || new Set()).add(a);
}
for (const pair of ARMY_EDGES.trim().split(/\s+/)) {
  const [a, b] = pair.split('-');
  addEdge(armyAdj, a, b);
}
for (const pair of FLEET_EDGES.trim().split(/\s+/)) {
  const [a, b] = pair.split('-');
  addEdge(fleetAdj, a, b);
}

/** Province (sans côte) d'un emplacement : 'STP/sc' -> 'STP' */
function prov(loc) { return loc.split('/')[0]; }
function coastOf(loc) { return loc.split('/')[1] || null; }

/** Un emplacement est-il valide pour ce type d'unité ? */
function isValidLocation(type, loc) {
  const p = PROVINCES[prov(loc)];
  if (!p) return false;
  if (type === 'A') return p.type !== 'sea' && !coastOf(loc);
  // Flotte
  if (p.type === 'land') return false;
  if (p.coasts) return p.coasts.includes(coastOf(loc));
  return !coastOf(loc);
}

/** Déplacement direct possible de from vers to (avec côtes pour les flottes) */
function canMove(type, from, to) {
  if (type === 'A') {
    return !!(armyAdj[prov(from)] && armyAdj[prov(from)].has(prov(to)));
  }
  return !!(fleetAdj[from] && fleetAdj[from].has(to));
}

/** Emplacements atteignables directement */
function neighbors(type, from) {
  if (type === 'A') return [...(armyAdj[prov(from)] || [])];
  return [...(fleetAdj[from] || [])];
}

/** L'unité peut-elle atteindre la province (côte indifférente) ? (utile pour les soutiens) */
function canReachProvince(type, from, province) {
  if (type === 'A') return canMove('A', from, province);
  return neighbors('F', from).some((l) => prov(l) === province);
}

/** Côtes d'une province accessibles à une flotte depuis from */
function reachableCoasts(from, province) {
  return neighbors('F', from).filter((l) => prov(l) === province);
}

function isCoastal(province) { const p = PROVINCES[prov(province)]; return !!p && p.type === 'coast'; }
function isSea(province) { const p = PROVINCES[prov(province)]; return !!p && p.type === 'sea'; }

const SUPPLY_CENTERS = Object.values(PROVINCES).filter((p) => p.sc).map((p) => p.id);
const HOME_CENTERS = {};
for (const pw of POWERS) HOME_CENTERS[pw] = Object.values(PROVINCES).filter((p) => p.home === pw).map((p) => p.id);

/** Liste des liaisons (province à province) pour l'affichage */
function displayEdges() {
  const seen = new Set();
  const out = [];
  const push = (a, b, kind) => {
    const key = [a, b].sort().join('-');
    if (seen.has(key)) return;
    seen.add(key);
    out.push([a, b, kind]);
  };
  for (const a of Object.keys(armyAdj)) for (const b of armyAdj[a]) push(a, b, 'land');
  for (const a of Object.keys(fleetAdj)) for (const b of fleetAdj[a]) push(prov(a), prov(b), 'sea');
  return out;
}

function publicMap() {
  const army = {};
  const fleet = {};
  for (const k of Object.keys(armyAdj)) army[k] = [...armyAdj[k]];
  for (const k of Object.keys(fleetAdj)) fleet[k] = [...fleetAdj[k]];
  return {
    powers: POWERS, powerNames: POWER_NAMES, provinces: PROVINCES, coasts: COASTS,
    army, fleet, edges: displayEdges(), homeCenters: HOME_CENTERS, supplyCenters: SUPPLY_CENTERS,
  };
}

module.exports = {
  POWERS, POWER_NAMES, PROVINCES, COASTS, START_UNITS, SUPPLY_CENTERS, HOME_CENTERS,
  prov, coastOf, isValidLocation, canMove, neighbors, canReachProvince, reachableCoasts,
  isCoastal, isSea, publicMap, armyAdj, fleetAdj,
};
