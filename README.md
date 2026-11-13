# Tournoi des Rois

Application de gestion de tournois de volley-ball en **système suisse** avec **phase finale à deux
tableaux** (principal + consolante). **100 % front-end**, sans serveur ni build : saisie des scores,
calcul automatique du classement, des appariements, des arbitres et des horaires, et une vue
**présentation** plein écran pour projection.

Aucune donnée ne quitte le navigateur : tout est persisté en local (`localStorage`).

## Fonctionnalités

- **Bibliothèque de tournois** : un écran d'accueil liste tous les tournois enregistrés ; on en ouvre,
  crée, duplique, exporte ou supprime.
- **Création guidée** : formulaire de paramètres (nom, nombre d'équipes, noms, rondes, terrains, heure
  de début, durée des matchs, pause).
- **Pages par étape** dans chaque tournoi : *Configuration*, *Classement*, une page **par ronde**
  (navigation ronde par ronde), *Phase finale*.
- **Reprise automatique** : au rechargement, on revient sur le tournoi et la page où l'on était.
- **Présentation** plein écran avec **bascule Ronde / Classement**, mise à jour **en temps réel**
  depuis la fenêtre de gestion (idéale sur un 2ᵉ écran projeté).
- **Export / Import JSON** : exporter l'état d'un tournoi dans un fichier `.json`, et créer un tournoi
  en important un tel fichier.

## Utilisation

- **En ligne** : page publiée sur GitHub Pages (`https://<utilisateur>.github.io/tournoi-des-rois/`).
- **En local** : ouvrir directement `public/index.html` dans un navigateur (double-clic). Tout
  fonctionne en `file://` — le JavaScript est un script classique, aucun serveur n'est nécessaire.

### Navigation (routage par `#`)

- `#/` — accueil / bibliothèque.
- `#/nouveau` — création d'un tournoi.
- `#/t/<id>/config` · `#/t/<id>/classement` · `#/t/<id>/ronde/<n>` · `#/t/<id>/finale` — pages d'un
  tournoi.
- `#/t/<id>/presentation` — vue projection (bascule ronde/classement). À ouvrir dans une 2ᵉ fenêtre
  pour projeter pendant qu'on saisit dans la 1ʳᵉ ; la synchro est automatique (même origine).

## Structure du projet

```
tournoi-des-rois/
├── .github/
│   └── workflows/
│       └── pages.yml   # déploie public/ sur GitHub Pages (Source = GitHub Actions)
├── README.md
├── SPECS.md            # spécifications détaillées
└── public/             # site publié (contenu servi par Pages)
    ├── index.html      # coquille de l'app (monte l'interface via JS)
    ├── styles.css      # design system (thème clair/sombre, composants)
    ├── app.js          # toute l'app : store, moteur, écrans, routage
    └── favicon.svg
```

### Stockage (localStorage)

- `tdr_index_v1` — index de la bibliothèque : `{ ids, activeId, lastRoute, migrated }`.
- `tdr_t_<id>` — un tournoi : `{ id, name, createdAt, updatedAt, data }`, où `data` reprend le modèle
  historique (`teams, courts, cfg, order0, rounds, sc, fsc`) avec ses clés de match stables
  (`r{ronde}m{paire}`, `F{P|C}-{round}-{match}`).
- Compatibilité : un ancien état mono-tournoi (`tournoi_suisse_v1`) est automatiquement repris dans la
  bibliothèque au premier chargement.

> Le JavaScript tient volontairement en un seul fichier (script classique) pour rester ouvrable en
> `file://`. Un découpage en modules ES imposerait un serveur HTTP local.

## Déploiement GitHub Pages

Le dépôt se déploie via **GitHub Actions** (workflow `.github/workflows/pages.yml`), qui publie le
dossier `public/`.

1. Une seule fois : Dépôt → **Settings → Pages** → **Source** = **« GitHub Actions »**.
2. Chaque `git push` sur `main` déclenche le workflow et redéploie automatiquement le site.

Tous les chemins sont **relatifs** pour fonctionner sous le sous-chemin `/<repo>/`.

## Pile technique

HTML + CSS + JavaScript **vanilla**, sans dépendance ni framework. Police *Barlow* / *Barlow
Condensed* (Google Fonts). Thème clair/sombre (suit l'OS, bascule manuelle mémorisée).
