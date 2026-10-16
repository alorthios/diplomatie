# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet respecte le [versionnement sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- Fond de carte géographique : côtes et frontières réelles (Natural Earth, domaine public), îles, mers, provinces colorées selon le propriétaire de leur centre.
- Script `npm run build:map` pour régénérer le fond de carte.
- Résumé des règles : présenté à chaque joueur au début de la partie, et consultable à tout moment avec le bouton « Règles » de la barre supérieure.

### Modifié

- La carte n'affiche plus le graphe de liaisons entre provinces.
- Le navigateur revalide les fichiers de l'interface à chaque chargement : une mise à jour est visible immédiatement, sans vider le cache.
- Finitions de l'interface :
  - polices Fraunces (titres) et Geist (texte), servies par l'application ;
  - fond légèrement grainé, ombres teintées, chiffres à chasse fixe dans le compte à rebours et les tableaux ;
  - retours visuels au survol et au clic sur les boutons, les liens et les cartes de puissance.
- Les confirmations (lancer, supprimer ou quitter une partie, forcer la résolution) s'affichent dans une boîte de dialogue de l'interface, et non plus dans la fenêtre native du navigateur.

### Corrigé

- La carte de la puissance choisie dans le salon perdait sa mise en forme : le nom du joueur était collé au nom de la puissance.
- L'ordre sélectionné perdait sa mise en page en deux colonnes.
- Le message d'état des ordres (« Ordres enregistrés… ») s'affichait en grand.
- Le toast vide dépassait en bas de l'écran.
- Les boîtes de dialogue (code PIN, confirmations) s'affichaient en bas de l'écran au lieu d'être centrées.

## [0.1.0] - 2026-10-15

### Ajouté

- Moteur de jeu :
  - carte standard de 1901 (75 provinces, 34 centres, côtes multiples) ;
  - résolution des mouvements selon l'algorithme de Kruijswijk, avec mouvement circulaire et règle de Szykman ;
  - retraites, ajustements, licenciements d'office et victoire à 18 centres.
- Comptes par pseudo et code PIN : hachage scrypt, sessions par cookie, verrouillage après trop d'échecs, changement de PIN.
- Parties :
  - salon avec choix de puissance, attribution au hasard et désordre civil des puissances libres ;
  - échéances configurables et résolution dès que tous les joueurs sont prêts ;
  - résolution forcée par le créateur, vote de match nul.
- Messagerie publique et privée, avec trois modes de négociation.
- Interface web :
  - carte SVG et saisie des ordres au toucher ou par listes ;
  - historique des phases et rapports de résolution ;
  - affichage mobile et thème sombre.
- Déploiement : Docker Compose (application et PostgreSQL 16) et migrations SQL versionnées.
- Outillage : CI GitHub Actions (lint, tests, test de démarrage Docker), release automatique vers GHCR, Dependabot.

[Non publié]: ../../compare/v0.1.0...HEAD
[0.1.0]: ../../releases/tag/v0.1.0
