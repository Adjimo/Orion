# Orion

PWA personnelle qui gamifie la prépa MP\* et la course à pied / trail : XP, niveaux, quêtes hebdomadaires, malus et bonus, import GPX. JavaScript pur (modules ES natifs), sans framework ni étape de build. Les données restent sur l'appareil (IndexedDB).

## Fonctionnalités

- XP, niveaux, rangs et compétences (Endurance, Allure, Maths, Physique, SI, Anglais, Lettres, Discipline)
- Saisie du temps de travail par matière, avec recalcul automatique de l'XP
- Quêtes hebdomadaires : principales (sorties, travail, sommeil) et secondaires (Anglais, Lettres, SI)
- Malus si un objectif n'est pas atteint, bonus s'il est dépassé ; total des malus plafonné à 100 % de l'XP de la semaine
- Justification d'une semaine (maladie, autre) et déclaration d'écarts personnels
- Import GPX, carte, découpage par kilomètre, records, VDOT
- Statistiques et bilan hebdomadaire, contrôle automatique de cohérence de l'XP
- Compte à rebours des concours
- Sauvegarde automatique quotidienne, export et import JSON
- Installable (PWA), fonctionne hors ligne, mise à jour automatique

## Structure

```
index.html          page unique, charge js/main.js
style.css           styles
sw.js               service worker (cache hors ligne, versionné)
manifest.json       manifeste PWA
icons/              icônes
js/
  main.js           point d'entrée : splash, initialisation
  core/             état, base IndexedDB, dates, XP et niveaux
  features/         logique métier : travail, quêtes, malus, GPX, records, sauvegarde…
  ui/               aides d'interface (DOM, toasts, modales), navigation
  pages/            une page par onglet : accueil, quêtes, sport, stats, profil
```

Règle de dépendance : `pages/` utilise `features/`, `ui/` et `core/` ; `features/` utilise `core/` ; `core/` ne dépend de rien d'autre.

## Développement

Les modules ES exigent un serveur HTTP (pas de `file://`) :

```
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000.

## Publication sur GitHub Pages

Déposer le contenu du dossier à la racine du dépôt (ou dans `/docs`) et activer Pages. Tous les chemins sont relatifs, aucun build n'est nécessaire.

À chaque modification livrée :

1. incrémenter `APP_VERSION` dans `js/core/state.js` ;
2. incrémenter `VERSION` dans `sw.js` ;
3. si un fichier JS est ajouté ou renommé, mettre à jour la liste `ASSETS` de `sw.js`.

## Sauvegarder ses données

Les données vivent uniquement dans le navigateur. Profil → Sauvegarde → Exporter produit `orion-backup-AAAA-MM-JJ.json` ; Importer une sauvegarde le restaure.

## v4.7 — To-do hebdomadaire (Planning › À faire)
- Store `planTodo` + meta `todoState` (curseurs de rotation, derniers éléments faits, dernière semaine générée).
- `features/todo-data.js` : catalogue (maths pondérées, budget 10 pts/semaine ; physique : 23 chapitres pondérés).
- `features/todo.js` : génération par rotation, report automatique des éléments non cochés (rattrapage multi-semaines), aucune XP.
- Les semaines passées sont en lecture seule ; les éléments reportés y restent marqués « reporté au … ».
- Pas de to-do pendant les révisions et les concours ; oraux blancs de Thomas (M0 lundi 7h20, M1 jeudi 7h20).
- Temps libre : plages de travail et pauses repas définies par jour (`DAY_RULES` dans `features/planning.js`).

### v4.7 — Refonte des pages
- Onglets : Accueil (ex-Profil fusionné), Planning (agenda seul), Aujourd'hui, Hebdo, Sport, Stats.
- Aujourd'hui : tableau de bord du jour inchangé + to-do du jour (retards de la semaine inclus). Hebdo : quêtes hebdomadaires inchangées + to-do de la semaine par jour.
- To-do par jour : un chapitre de maths et de physique par jour à partir du lundi, vocabulaire d'anglais tous les jours, SI le vendredi, anglais (grammaire/rotation) le samedi, français le dimanche (`DAY_PLAN` dans `features/todo-data.js`).
- Les anciennes données de to-do sans jour sont réparties automatiquement.
