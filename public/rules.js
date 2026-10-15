// Résumé des règles affiché dans la fenêtre « Règles ».
// Chaque section contient des paragraphes (chaînes) et des listes (tableaux de chaînes).

export const RULES = [
  {
    title: 'But du jeu',
    body: [
      'Vous dirigez l\'une des sept grandes puissances de l\'Europe de 1901 : Angleterre, France, Allemagne, Italie, Autriche-Hongrie, Russie ou Turquie.',
      'La première puissance à contrôler 18 des 34 centres de ravitaillement (les points sur la carte) gagne. Les joueurs encore en jeu peuvent aussi voter un match nul.',
      'Il n\'y a ni dé ni hasard : seuls comptent vos ordres et vos alliances.',
    ],
  },
  {
    title: 'Déroulement d\'une année',
    body: [
      [
        'Printemps : mouvements.',
        'Automne : mouvements, puis prise de contrôle des centres.',
        'Hiver : ajustements (constructions et licenciements).',
      ],
      'Une phase de retraites suit chaque phase de mouvements quand des unités ont été délogées.',
      'Tous les joueurs écrivent leurs ordres en secret et en même temps. Les ordres sont révélés et exécutés ensemble. La phase est résolue dès que tous les joueurs sont prêts, ou à l\'échéance. Une unité sans ordre tient sa position.',
    ],
  },
  {
    title: 'Les unités',
    body: [
      [
        'Armée (A) : se déplace sur les provinces terrestres, côtières comprises.',
        'Flotte (F) : se déplace sur les mers et les provinces côtières, en longeant la côte.',
      ],
      'Une province ne contient qu\'une unité. Toutes les unités ont la même force : seuls les soutiens font la différence.',
      'Saint-Pétersbourg, l\'Espagne et la Bulgarie ont deux côtes. Une flotte y est placée sur l\'une d\'elles et ne peut rejoindre que les provinces voisines de cette côte.',
    ],
  },
  {
    title: 'Les ordres',
    body: [
      [
        'Tenir : l\'unité reste sur place et se défend.',
        'Avancer : l\'unité tente d\'entrer dans une province voisine.',
        'Soutenir : l\'unité ajoute sa force au mouvement ou au maintien d\'une autre unité, même étrangère. Elle doit pouvoir elle-même atteindre la province concernée.',
        'Convoyer : une flotte en mer transporte une armée d\'une côte à une autre. Plusieurs flottes peuvent former une chaîne.',
      ],
    ],
  },
  {
    title: 'Résolution des conflits',
    body: [
      [
        'La force d\'une unité vaut 1, plus 1 par soutien valide.',
        'Quand plusieurs unités visent la même province, la plus forte y entre. En cas d\'égalité, aucune ne bouge : c\'est un rebond.',
        'Une unité attaquée par une force supérieure à la sienne est délogée.',
        'Un soutien est coupé si l\'unité qui soutient est attaquée, sauf si l\'attaque vient de la province visée par ce soutien.',
        'On ne peut jamais déloger sa propre unité.',
      ],
    ],
  },
  {
    title: 'Retraites',
    body: [
      'Une unité délogée doit battre en retraite vers une province voisine libre. Elle ne peut pas aller dans la province d\'où venait son attaquant, ni dans une province restée vide à cause d\'un rebond.',
      'Si deux unités se replient au même endroit, ou si une unité n\'a pas d\'ordre, elles sont licenciées.',
    ],
  },
  {
    title: 'Centres et ajustements',
    body: [
      'Un centre change de propriétaire quand une de vos unités l\'occupe à la fin de l\'automne. Il reste à vous même si vous le quittez, jusqu\'à ce qu\'un autre l\'occupe à son tour en automne.',
      'En hiver, chaque puissance doit avoir autant d\'unités que de centres :',
      [
        'Plus de centres que d\'unités : vous construisez dans vos centres d\'origine libres que vous possédez encore.',
        'Moins de centres que d\'unités : vous licenciez des unités. Sans ordre, les unités les plus éloignées de vos centres d\'origine sont licenciées.',
      ],
    ],
  },
  {
    title: 'Négociations',
    body: [
      'Selon la partie, vous pouvez échanger des messages privés et publics, publics seulement, ou aucun (« gunboat »).',
      'Les accords n\'engagent personne : rien ne vous oblige à tenir parole, ni vos voisins.',
      'Les puissances sans joueur sont en désordre civil : leurs unités tiennent leur position.',
    ],
  },
  {
    title: 'Jouer sur ce site',
    body: [
      [
        'Touchez une de vos unités sur la carte, puis sa destination. Les autres ordres se choisissent dans l\'onglet Ordres.',
        '« Enregistrer » garde vos ordres. « Valider et être prêt » indique en plus que vous avez fini. Vous pouvez les modifier jusqu\'à la résolution.',
        'L\'onglet Historique montre les phases passées, avec les ordres de tous les joueurs et leurs résultats.',
        'L\'onglet Joueurs permet de proposer un match nul.',
      ],
    ],
  },
];
