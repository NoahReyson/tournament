# Tournoi des Rois — Spécifications

Document de référence pour le passage de la page HTML unique à un projet **GitHub Pages**.
Il décrit l'existant (fonctionnel et technique), fixe les règles métier à préserver, et définit
l'arborescence des fichiers et la procédure de déploiement.

- **État actuel** : une page HTML autonome (`tournoi.html`), tout en un seul fichier (HTML + CSS + JS en ligne), persistance via `localStorage`.
- **Cible** : un dépôt GitHub statique, publié par GitHub Pages, avec les fichiers séparés (CSS / JS / HTML).
- **Contrainte forte** : l'application reste **100 % front-end, sans serveur ni build obligatoire**. Aucune donnée ne quitte le navigateur.

---

## 1. Objectif de l'application

Gérer un tournoi de volley-ball en **système suisse** avec **phase finale à deux tableaux**, depuis une
simple page web : saisie des scores, calcul automatique du classement, des appariements, des arbitres,
des horaires, et affichage de « présentations » plein écran pour projection.

Public : l'organisateur (saisie sur un poste) + un écran projeté en lecture seule.

---

## 2. L'existant — fonctionnel

### 2.1 Réglages (paramétrables en haut de page)
- **Nombre d'équipes** : pair, de 4 à 24 (défaut 16).
- **Nombre de rondes** : 1 à N−1 (défaut 8).
- **Terrains** : 1 à 5 (plafonné dynamiquement, voir §3.4).
- **Heure de début**, **durée d'un match** (défaut 20 min), **pause entre rondes** (défaut 5 min).

### 2.2 Équipes
- 16 noms fictifs pré-remplis par défaut (thème royal) à titre d'exemple.
- Chaque équipe a un **identifiant interne stable** (sa position 0…N−1). Les appariements et les
  scores sont rattachés à cet id, **jamais au nom** : renommer une équipe en cours de tournoi ne
  casse ni l'organisation ni les scores. L'id n'est pas affiché.

### 2.3 Système suisse
- Chaque équipe joue **un match par ronde**.
- Ronde 1 : appariement **tiré au sort** une seule fois (ordre initial figé et persistant).
- Rondes suivantes : appariement selon le **classement courant**, **sans jamais rejouer** un adversaire déjà rencontré.
- Une ronde se **verrouille** dès qu'un score y est saisi ; les rondes non commencées sont **réappariées en direct** si un résultat antérieur change.
- La ronde suivante n'est calculée **que lorsque la ronde courante est terminée** (tous ses matchs ont un vainqueur). On n'affiche que les rondes passées + la ronde courante.
- États d'une ronde : `terminée` / `en cours` / `à venir` (appariement définitif) / `provisoire`.

### 2.4 Classement (live)
Tri : **victoires** → **différence de points** (marqués − encaissés) → **points marqués** → id.
Colonnes affichées : Place, Équipe, J (joués), V, Diff, Pts.

### 2.5 Arbitrage
Chaque match est arbitré par **une équipe qui ne joue pas sur le même créneau**, jamais deux fois
sur le même créneau, charge répartie le plus équitablement possible sur l'ensemble du tournoi.

### 2.6 Phase finale — deux tableaux
- La **moitié haute** du classement va dans le **Tableau principal** (places 1…N/2), la **moitié basse** dans la **Consolante**.
- Seeding en direct depuis le classement courant (se stabilise une fois les rondes finies).
- Brackets « parfaits » : seeding standard (1 vs plus faible, favoris séparés jusqu'au bout). Si tous les favoris gagnent, chaque équipe finit à sa place théorique.
- Taille non puissance de 2 → **tour de barrage** pour les têtes de série **les plus basses** (les meilleures sont exemptées) ; les plus basses jouent donc plus de matchs.
- Saisie des scores par match, le vainqueur monte automatiquement au tour suivant. Vainqueur de chaque tableau affiché.

### 2.7 Présentations (projection plein écran)
Deux vues en lecture seule, ouvertes via `#presentation-ronde` et `#presentation-classement` :
- **Ronde en cours** : par terrain, jusqu'à 4 prochains matchs **non encore scorés** (heure, équipes, arbitre).
- **Classement** : tableau en grand.

Elles se mettent à jour **en direct** (événement `storage` + rafraîchissement périodique), sont
**autonomes** (recalculent l'avancement elles-mêmes) et parfaitement synchronisées avec la page de saisie.

### 2.8 Divers UI
- Thème clair / sombre (suit l'OS, bascule manuelle possible).
- Horaires colorés, scores des matchs terminés mis en valeur.
- Typographie display (Barlow Condensed) avec espacement de lettres homogène sur titres, horaires, numéros et badges.

---

## 3. L'existant — technique

### 3.1 Pile
HTML + CSS + JavaScript **vanilla**, sans dépendance, sans framework, sans build.
Tout est aujourd'hui en ligne dans un seul fichier.

### 3.2 Persistance
`localStorage`, clé unique **`tournoi_suisse_v1`**. Tout est sérialisé en JSON (voir §3.3).
Toutes les lectures/écritures sont encapsulées dans try/catch ; l'app fonctionne même si le stockage est indisponible.

### 3.3 Modèle de données (objet `S`)
```jsonc
{
  "teams":  ["Les Rois Mages", "...", "..."],   // noms, index = id stable de l'équipe
  "courts": 3,                                    // 1..5 (terrains demandés)
  "cfg": {
    "start": 540,    // heure de début en minutes depuis minuit (9h00)
    "dur":   20,     // durée d'un match (min)
    "rounds": 8,     // nombre de rondes
    "teams": 16,     // nombre d'équipes (pair)
    "brk":   5       // pause entre rondes (min)
  },
  "order0": [ /* permutation initiale des id, fige l'appariement de la ronde 1 */ ],
  "rounds": [ [ [a,b], [a,b], ... ], ... ],       // par ronde : liste de paires d'id
  "sc":  { "r0m2": { "a": "25", "b": "20" }, ... }, // scores de poule, clé = ronde+index de paire
  "fsc": { "FP-1-0": { "a": "25", "b": "18" }, ... } // scores de finale, clé = fid(bracket,round,match)
}
```
Clés de match **stables** : `sc` est indexé par `r{ronde}m{indexAppariement}` (indépendant du nombre de
terrains), `fsc` par `F{P|C}-{round}-{match}`. Changer le nombre de terrains ne déplace donc aucun score.

### 3.4 Algorithmes clés (à conserver tels quels)
- **Appariement suisse** (`pairNoRematch` + repli `pairGreedy`) : recherche exhaustive bornée d'un
  appariement sans réédition ; si impossible (cas extrême : beaucoup de rondes sur petit effectif),
  repli glouton qui apparie tout le monde en acceptant au besoin une revanche. **Jamais de blocage.**
- **Planning** (`schedules`) : pour chaque ronde, `court = p % effCourts`, `slot = floor(p / effCourts)`,
  `heure = start + round·(slotsParRonde·dur + brk) + slot·dur`.
- **Terrains effectifs** : `effCourts = min(courts, floor(N/3), N/2)` — il faut toujours assez d'équipes
  libres pour arbitrer, d'où le plafond ≈ N/3.
- **Arbitres** : par créneau, affectés aux équipes au repos de plus faible charge d'arbitrage, distincts.
- **Bracket parfait** (`bracketSeeding`) : ordre de seeds récursif `[1, n]→[1,n,...]` ; byes aux meilleures
  têtes quand la taille n'est pas une puissance de 2.

### 3.5 Rendu
- **Rendu incrémental** de la liste des rondes et des tableaux de finale : on ne reconstruit **jamais** le
  bloc d'un match déjà commencé (ses champs de saisie sont réutilisés), ce qui **préserve le focus et la
  navigation clavier**. Point d'attention majeur à ne pas régresser lors du découpage en modules.
- Routage par `location.hash` pour les présentations.

### 3.6 Contraintes héritées de l'environnement « artefact » à lever
La page actuelle était servie dans un bac à sable (artefact) qui **injectait** le squelette HTML
(`<!doctype>`, `<head>`, metas, reset CSS) et appliquait une CSP stricte. Sur GitHub Pages, **ce
squelette doit être écrit explicitement** et la CSP ne s'applique plus. Concrètement, au portage :
- ajouter `<!doctype html>`, `<html lang="fr">`, `<head>` avec `<meta charset>`, `<meta name="viewport">`, `<title>`, le `<link>` Google Fonts et le `<link>` vers la CSS ;
- charger la police depuis Google Fonts (autorisé, plus de restriction) ;
- `localStorage` devient fiable et durable (vraie origine) ;
- les metas spécifiques à l'artefact (`claude:viewport-fit-sides`) ne sont plus nécessaires.

---

## 4. Cible — architecture GitHub Pages

### 4.1 Principes
- **Site statique pur** : aucun back-end. GitHub Pages ne sert que des fichiers.
- **Pas de build obligatoire** : on peut livrer du HTML/CSS/JS directement. Les **modules ES**
  (`<script type="module">` + `import`) fonctionnent nativement (servis en HTTPS) — c'est la méthode
  recommandée pour découper le JS proprement, sans bundler.
- **Chemins relatifs uniquement** : un *project site* est servi sous `https://<user>.github.io/<repo>/`.
  Ne jamais utiliser de chemins absolus commençant par `/` (ils pointeraient vers la racine du domaine).
- Comportement, données et règles métier **identiques** à l'existant (mêmes algorithmes, même clé `localStorage`).

### 4.2 Arborescence proposée
```
tournoi-des-rois/
├── index.html              # page de saisie (squelette + conteneurs + imports)
├── .nojekyll               # désactive le traitement Jekyll (sert les fichiers tels quels)
├── README.md               # présentation + lien vers la page publiée
├── SPECS.md                # ce document
├── assets/
│   └── favicon.svg
├── css/
│   └── styles.css          # tout le CSS (tokens de thème, mise en page, composants)
└── js/
    ├── state.js            # S, défauts, load()/save() localStorage, DEMO_TEAMS
    ├── config.js           # helpers NT/RD/Mpr/effCourts/maxRounds, bornes
    ├── standings.js        # calcul du classement, décision d'un match
    ├── swiss.js            # appariement (pairNoRematch, pairGreedy, ensureRounds)
    ├── schedule.js         # terrains, créneaux, arbitres, horaires
    ├── bracket.js          # phase finale (seeding, byes/barrages, vainqueurs)
    ├── render.js           # rendu incrémental équipes/rondes/classement/finale
    ├── projection.js       # vues plein écran + rafraîchissement live
    └── main.js             # point d'entrée : bind des événements, bootstrap, routage hash
```
> Le découpage est indicatif. L'essentiel : séparer **données** (`state`), **logique métier**
> (`swiss`, `schedule`, `bracket`, `standings`), **rendu** (`render`, `projection`) et **orchestration** (`main`).

### 4.3 Contenu de `index.html` (schéma)
```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Tournoi des Rois</title>
  <link rel="icon" href="assets/favicon.svg">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div class="wrap"> … réglages, équipes, classement, rondes, phase finale … </div>
  <div id="proj"></div>            <!-- conteneur des présentations -->
  <script type="module" src="js/main.js"></script>
</body>
</html>
```
`main.js` importe les autres modules. Chaque module **exporte** ses fonctions ; aucun code global implicite.

### 4.4 Chargement des scripts
- **Option recommandée** : modules ES (`import`/`export`). Lisible, pas d'ordre de `<script>` à gérer.
- **Option sans modules** : plusieurs `<script>` classiques dans le bon ordre (state → config → métier → render → main). Possible mais plus fragile.

---

## 5. Déploiement GitHub Pages

### 5.1 Mise en place (dépôt public)
1. Créer le dépôt `tournoi-des-rois` et y pousser l'arborescence du §4.2 sur la branche `main`.
2. Dépôt → **Settings → Pages**.
3. **Source** : « Deploy from a branch ».
4. **Branch** : `main`, dossier `/ (root)`. Enregistrer.
5. Au bout de ~1 min, le site est publié sur `https://<user>.github.io/tournoi-des-rois/`.

### 5.2 `.nojekyll`
Ajouter un fichier vide `.nojekyll` à la racine : GitHub Pages passe sinon les fichiers dans Jekyll,
qui ignore les dossiers/fichiers commençant par `_`. Inutile ici mais sans risque et recommandé pour un site « fichiers bruts ».

### 5.3 Points de vigilance
- **Chemins relatifs** (`css/styles.css`, `js/main.js`, `assets/…`) — jamais `/css/...`.
- **HTTPS** obligatoire pour les modules ES : GitHub Pages est en HTTPS, donc OK.
- **Cache** : GitHub Pages peut mettre en cache ; en cas de MAJ non visible, vider le cache / forcer le rechargement.
- **Domaine personnalisé** (optionnel) : fichier `CNAME` + config DNS.
- **CI (optionnel)** : un workflow GitHub Actions peut remplacer le « deploy from branch » si un build est ajouté plus tard.

### 5.4 Développement local
Les modules ES exigent un vrai serveur HTTP (le protocole `file://` les bloque). En local :
`python3 -m http.server` puis ouvrir `http://localhost:8000/`.

---

## 6. Migration — checklist

- [ ] Extraire le CSS en ligne vers `css/styles.css` (tokens de thème conservés à l'identique).
- [ ] Découper le JS en modules (§4.2) avec `export`/`import`, **sans changer les algorithmes**.
- [ ] Écrire le squelette HTML explicite (§4.3) ; retirer les éléments propres à l'artefact.
- [ ] Vérifier la **clé localStorage** inchangée (`tournoi_suisse_v1`) pour la compatibilité.
- [ ] Vérifier la **non-régression du rendu incrémental** (focus/clavier préservés à la saisie).
- [ ] Tester les deux présentations (`#presentation-ronde`, `#presentation-classement`) et la synchro live entre deux onglets.
- [ ] Ajouter `.nojekyll`, `README.md`, `assets/favicon.svg`.
- [ ] Publier via Settings → Pages et vérifier l'URL en HTTPS.

---

## 7. Évolutions possibles (hors périmètre immédiat)
- Export / import des résultats en JSON (sauvegarde, reprise sur un autre poste).
- Départage par Buchholz (force des adversaires) en système suisse.
- Impression PDF des feuilles de ronde.
- Nombre d'équipes impair (gestion des exempts).
- Synchronisation multi-postes (nécessiterait un back-end, hors « statique pur »).

---

## 8. Évolution — app multi-tournois (implémentée)

Depuis cette version, l'app n'est plus mono-tournoi ni mono-écran. Le modèle `S` (§3.3) est **inchangé**
mais devient le champ `data` d'un tournoi nommé, et le stockage passe à une **bibliothèque** :

- `tdr_index_v1` — index : `{ ids:[...], activeId, lastRoute, migrated }`.
- `tdr_t_<id>` — un tournoi : `{ id, name, createdAt, updatedAt, data:{ teams, courts, cfg, order0,
  rounds, sc, fsc } }`. Les clés de match stables (`r{r}m{p}`, `F{P|C}-{r}-{m}`) sont conservées.
- **Migration** : un ancien `tournoi_suisse_v1` est automatiquement enveloppé en un tournoi de la
  bibliothèque au premier chargement (clé héritée laissée intacte).

Interface : écran d'**accueil** (bibliothèque), **création** paramétrée, **pages par étape** par
tournoi (*Configuration*, *Classement*, une page **par ronde**, *Phase finale*), et **présentation**
plein écran à **bascule ronde/classement**, synchronisée en direct (événement `storage`). **Reprise**
de l'état au rechargement (`activeId` + `lastRoute`). **Export / import JSON** d'un tournoi.
Les algorithmes (§3.4) et le rendu incrémental (§3.5) sont inchangés.
