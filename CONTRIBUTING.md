# Contribuer

## Branches

- `main` est toujours déployable : la CI (lint, tests, construction et démarrage de l'image Docker) doit y être verte.
- On développe sur une branche courte (`feat/convois-ui`, `fix/retraites`…), puis on fusionne par pull request.

## Messages de commit

Le projet suit [Conventional Commits](https://www.conventionalcommits.org/fr/) :

```
<type>(<portée>): <résumé à l'impératif, en minuscules>

<corps facultatif : le pourquoi, pas le comment>
```

Types utilisés :

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation |
| `refactor` | Changement de code sans effet fonctionnel |
| `test` | Ajout ou correction de tests |
| `ci` | Intégration continue |
| `build` | Docker, dépendances, outillage |
| `chore` | Maintenance diverse |

Portées courantes : `engine`, `api`, `auth`, `db`, `ui`, `docker`.

Un changement incompatible s'annonce par `!` après le type (`feat(api)!: …`), avec un pied `BREAKING CHANGE: …`.

Chaque commit doit laisser le projet dans un état qui passe `npm run lint` et `npm test`.

## Versions et releases

Le projet suit le [versionnement sémantique](https://semver.org/lang/fr/). Le [CHANGELOG](CHANGELOG.md) suit le format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

Pour publier une version :

1. Déplacer les entrées de la section `[Non publié]` du CHANGELOG vers une nouvelle section `[x.y.z] - AAAA-MM-JJ`, puis committer avec le message `docs: préparer la version x.y.z`.
2. Lancer `npm version x.y.z -m "chore(release): %s"`. Cette commande met à jour `package.json`, commite et crée le tag `vx.y.z`.
3. Lancer `git push --follow-tags`.

Le workflow `Release` vérifie que le tag correspond à `package.json`, relance les tests, puis :

- publie l'image sur `ghcr.io/<propriétaire>/diplomatie`, avec les tags `x.y.z`, `x.y` et `latest` ;
- crée la release GitHub à partir de la section correspondante du CHANGELOG.

## Migrations de base de données

Chaque changement de schéma passe par un nouveau fichier `migrations/NNN_description.sql`. On ne modifie jamais une migration déjà publiée.
