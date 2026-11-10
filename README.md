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
  ui/               aides d'interface (DOM, toasts, modales), navigation, pack d'icônes (icons.js)
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

### v4.8
- Service worker : JS/CSS en réseau d'abord (évite un mélange ancien/nouveau code après mise à jour, qui laissait Aujourd'hui/Hebdo vides).

### v4.9
- Aujourd'hui : seule la to-do du jour est affichée (la semaine complète reste dans Hebdo).

### v4.10
- To-do : remise à zéro unique (`todoState.v = 2`), démarrage à la date du jour (pas de reports d'avant) ; report quotidien des éléments non faits au jour courant (badge « reporté ») ; vocabulaire quotidien non reporté.
- Style unifié : cartes Sport/Travail/jour au même langage que la to-do (bandeau, barre en dégradé, boutons).
- Agenda : cours/colles/DS teintés (`--ev-cours/--ev-colle/--ev-ds`), temps libre et pauses sobres, légende, marges.

### v4.11
- Nouvelle palette « Graphite et cuivre » appliquée à tout le thème (variables :root + couleurs en dur remplacées).

### v4.12
- Icônes (app, favicon, logo, barre d'onglets) recolorées en cuivre pour la palette « Graphite et cuivre ».

### v4.13
- Balayage horizontal pour changer d'onglet (ignoré sur carte, graphiques, champs, zones défilantes et fenêtres ouvertes).

### v4.14
- Icône d'app : nouveaux noms de fichiers versionnés (`orion-192.png`, `orion-512.png`, `orion-maskable-512.png`, `orion-favicon.png`, `?v=5`) pour empêcher le retour de l'ancienne icône après l'installation (cache navigateur / WebAPK). Le manifeste porte un `id`, des icônes `any` et `maskable` séparées, et passe en réseau d'abord dans le service worker.
- Onglet Hebdo : nouvelle icône (drapeau) distincte de l'onglet Aujourd'hui (cible) : `tab-hebdo(.png|-mono.png)`.
- To-do : titres de groupes en blanc, emoji ✅ remplacé par l'icône « check » du pack.
- Pack d'icônes `js/ui/icons.js` : 36 icônes SVG, une couleur chaude par icône (jaunes, ambres, orangés, terres, rosés, sans bleu/violet/vert). `installIconizer()` remplace automatiquement tout emoji connu du DOM ; pour ajouter une icône, compléter `ICONS`, `COLORS` et `EMOJI`. Les emojis restent dans les données (ils servent de clé) et ne sont affichés nulle part tels quels. Les boîtes natives (`confirm`, `<option>`) gardent du texte.

### v4.15
- Protection des données : le stockage persistant est demandé au navigateur ; le Profil indique s'il est actif et la date du dernier export ; rappel (au plus un par jour) si aucun export depuis 14 jours.
- Hors ligne : MapLibre, Chart.js et les polices sont mis dans un cache dédié `orion-cdn-v1` (non effacé à chaque mise à jour) et préchargés à l'installation.
- Le zoom par pincement est de nouveau autorisé (le double-tap ne zoome pas sur les boutons).
- Icône de notification : `badge.png` est bien la silhouette monochrome (rien à changer).

### v4.16
- Icônes : les données et le code utilisent désormais des **noms d'icônes** du pack (`icon: 'run'`) au lieu d'emojis. L'« iconizer » (remplacement automatique d'emojis dans le DOM) est supprimé ; `iconHtml(nom)` dans `js/ui/icons.js` produit l'icône, `data-ico` remplit les emplacements statiques du HTML.
- Migration silencieuse : les icônes stockées sous forme d'emoji dans les quêtes et les examens sont converties en noms au démarrage (idempotent).
