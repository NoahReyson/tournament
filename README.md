# Tournoi des Rois

Application web pour gérer un tournoi de volley-ball en **système suisse** avec **phase finale à deux
tableaux** (principal + consolante). Tu ne saisis que les scores : classement, appariements, arbitres
et horaires se calculent automatiquement. Une vue **présentation** plein écran permet de projeter
l'état du tournoi sur grand écran.

👉 **En ligne : https://noahreyson.github.io/tournament/**

## Fonctionnalités

- **Bibliothèque de tournois** — crée, ouvre, duplique, exporte ou supprime plusieurs tournois.
- **Système suisse automatique** — appariements selon le classement, sans jamais rejouer le même
  adversaire ; la ronde suivante s'ouvre dès que la précédente est terminée.
- **Classement en direct** — victoires, puis différence de points, puis points marqués.
- **Arbitrage réparti** — chaque match est arbitré par une équipe au repos, charge équilibrée.
- **Phase finale** à deux tableaux, têtes de série calculées depuis le classement.
- **Présentation plein écran** — bascule « prochains matchs / classement », mise à jour en temps réel
  depuis la fenêtre de gestion (idéale sur un 2ᵉ écran projeté).
- **Export / import JSON** — sauvegarde un tournoi ou transfère-le sur un autre poste.
- **Thème clair / sombre** et reprise automatique là où tu t'es arrêté.

## Bon à savoir

- Les tournois sont enregistrés **localement dans ton navigateur** : ils ne sont pas partagés entre
  appareils. Pour passer un tournoi d'un poste à l'autre, utilise l'**export / import JSON**.
- Pour **projeter** : ouvre la présentation dans une 2ᵉ fenêtre (bouton « Présentation ») et place-la
  sur l'écran de projection ; elle se synchronise seule pendant que tu saisis les scores.

## Technique

HTML / CSS / JavaScript **vanilla**, sans dépendance ni build. Police Barlow / Barlow Condensed.
