# Diplomatie

Jeu de Diplomatie multijoueur en ligne, à héberger soi-même avec Docker.
L'action se déroule en Europe en 1901, entre sept puissances, sans dé ni hasard : seuls comptent les ordres et les alliances.

## Fonctionnalités

- **Comptes simples** : un pseudo et un code PIN de 4 à 8 chiffres. Le PIN est haché avec scrypt, et le compte se verrouille temporairement après 5 échecs.
- **Salon** : création de partie, choix de sa puissance ou attribution au hasard, lancement à partir d'un joueur. Les puissances sans joueur passent en désordre civil.
- **Règles complètes** :
  - mouvements, soutiens offensifs et défensifs, convois multi-flottes ;
  - retraites, constructions et licenciements, côtes multiples (STP, SPA, BUL) ;
  - victoire à 18 centres.
- **Moteur de résolution** fondé sur l'algorithme de Kruijswijk :
  - mouvements circulaires ;
  - paradoxes de convoi, tranchés par la règle de Szykman ;
  - garnisons assiégées, échanges par convoi.
- **Rythme de jeu** : chaque phase est résolue dès que tous les joueurs sont prêts, ou à l'échéance (de 5 minutes à 3 jours, ou sans échéance). Le créateur peut forcer la résolution.
- **Négociations** : messages publics et privés entre puissances. Trois modes au choix : libre, public uniquement, ou sans négociation (« gunboat »).
- **Suivi de partie** :
  - historique de chaque phase, avec la carte, les ordres de tous les joueurs et leurs résultats ;
  - vote de match nul ;
  - interface adaptée au mobile, avec thème sombre.

## Installation

Prérequis : Docker et Docker Compose v2.

```bash
git clone <url-du-dépôt> diplomatie && cd diplomatie
cp .env.example .env
# Éditez .env : mettez au minimum un vrai mot de passe dans POSTGRES_PASSWORD
docker compose up -d
```

L'application est disponible sur `http://<serveur>:3000`.

Deux conteneurs tournent :

| Service | Rôle |
|---------|------|
| `app`   | Serveur Node.js (API et interface web), migrations appliquées au démarrage |
| `db`    | PostgreSQL 16, données dans le volume `db-data` |

### Utiliser l'image publiée

Chaque release publie une image multi-architecture (amd64 et arm64) sur le GitHub Container Registry. Pour l'utiliser sans rien compiler, renseignez dans `.env` :

```bash
APP_IMAGE=ghcr.io/<propriétaire>/diplomatie:1
```

puis lancez :

```bash
docker compose pull && docker compose up -d --no-build
```

### Derrière un reverse proxy HTTPS

Pour un accès depuis Internet, placez l'application derrière Caddy, Traefik ou nginx avec TLS, puis passez `COOKIE_SECURE=true` et `TRUST_PROXY=true` dans `.env`.

Une fois vos joueurs inscrits, vous pouvez fermer les inscriptions avec `ALLOW_REGISTRATION=false`.

### Configuration

| Variable | Défaut | Description |
|----------|--------|-------------|
| `POSTGRES_PASSWORD` | (obligatoire) | Mot de passe de la base |
| `HTTP_PORT` | `3000` | Port exposé sur l'hôte |
| `COOKIE_SECURE` | `false` | Cookie de session réservé au HTTPS |
| `TRUST_PROXY` | `false` | Faire confiance à `X-Forwarded-For` |
| `ALLOW_REGISTRATION` | `true` | Autoriser la création de comptes |
| `APP_IMAGE` | `diplomatie:local` | Image de l'application |
| `TZ` | `Europe/Paris` | Fuseau horaire des journaux |

Ces variables du serveur ont des valeurs par défaut raisonnables : `SESSION_DAYS` (30), `MAX_LOGIN_ATTEMPTS` (5), `LOCK_MINUTES` (15) et `TICK_SECONDS` (15).

### Sauvegarde et restauration

```bash
# Sauvegarde
docker compose exec -T db pg_dump -U diplomatie diplomatie > sauvegarde.sql

# Restauration
docker compose exec -T db psql -U diplomatie diplomatie < sauvegarde.sql
```

### Mise à jour

```bash
git pull && docker compose up -d --build
```

Les migrations de base de données s'appliquent automatiquement au démarrage.

## Développement

Prérequis : Node.js 22 et un PostgreSQL accessible.

```bash
npm install
docker compose up -d db                     # ou votre propre PostgreSQL
DATABASE_URL=postgres://diplomatie:<mdp>@localhost:5432/diplomatie npm start
npm run lint
npm test                                    # tests du moteur
TEST_DATABASE=1 DATABASE_URL=… npm test     # + tests d'intégration de l'API
```

Pour développer contre la base du compose, exposez son port avec un fichier `docker-compose.override.yml` (ignoré par Git si vous l'y ajoutez).

### Architecture

```
src/
  engine/map.js          Carte : provinces, côtes, adjacences, unités de départ
  engine/adjudicator.js  Résolution des mouvements (Kruijswijk + Szykman)
  engine/game.js         Validation des ordres, retraites, ajustements, enchaînement des phases
  auth.js                Comptes, PIN, sessions
  games.js               Parties, ordres, échéances, messagerie
  server.js              API HTTP (Express) et service de l'interface
migrations/              Schéma SQL versionné
public/                  Interface web (JavaScript sans framework)
scripts/build-map.mjs    Génération du fond de carte (public/map-shapes.js)
test/                    Tests (node:test)
```

Le moteur de jeu est indépendant de la base et du serveur. Il est couvert par des tests reprenant les cas principaux du DATC (Diplomacy Adjudicator Test Cases).

Les règles de contribution (commits, branches, releases) sont décrites dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Limites connues

- Les côtes et frontières entre pays sont réelles (frontières actuelles, pas celles de 1914) ; les limites entre provinces d'un même pays sont approchées.
- Pas de notifications par e-mail ou push : l'échéance s'affiche dans l'interface.

Fond de carte : [Natural Earth](https://www.naturalearthdata.com/) (domaine public), généré par `npm run build:map`.

*Diplomacy est une marque déposée de Hasbro. Ce projet est une implémentation amateur indépendante des règles, destinée à un usage privé.*
