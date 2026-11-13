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

### v4.17 — Caractéristiques hebdomadaires (carte « Caractéristiques » sur l'Accueil)
- 6 caractéristiques : Dextérité, Maths, Physique, SI / Info, Verbe (anglais + français), Discipline. Indépendantes de l'XP, des malus et des niveaux.
- **Recalcul uniquement à la clôture de chaque semaine** (lundi → dimanche) : aucune valeur provisoire en cours de semaine. Calcul déterministe depuis le 1er septembre 2026, valeur de départ 10.
- valeur(n) = α × valeur(n−1) + (1−α) × S(n) ; α (poids de l'historique, 75 % par défaut) se règle via l'icône balance de la carte : tout l'historique est recalculé à la validation.
- S ∈ [0 ; 24] : objectif atteint = 14, ≈ 1,45 × objectif = 20. Pondérations et objectifs dans `DEFAULT_SETTINGS` (`js/features/caracs.js`, meta `caracSettings`).
- Store `caracHistory` (DB v5), inclus dans export/import. Module : `js/features/caracs.js` ; carte : `js/pages/caracs-card.js` (radar SVG hors ligne, filigrane à −4 semaines, détail au toucher d'un sommet).
- Correctif : l'écouteur `DOMContentLoaded` de `main.js` était enregistré deux fois.

### v4.17 (suite) — Niveaux D&D, Accueil et Options
- **Niveaux façon Donjons & Dragons** : niveau 1 → 20, seuils D&D 5e remis à l'échelle (`LEVEL_THRESHOLDS` dans `js/core/xp.js`). Le niveau 20 est atteint à `LEVEL20_XP` = 145 000 XP, soit les oraux (mi/fin juin 2027) au rythme actuel (≈ 3 600 XP/semaine). Pour décaler la date, modifier uniquement `LEVEL20_XP` : l'XP stockée n'est jamais touchée. Les 43 600 XP actuels (ancien « niveau 35 ») donnent le niveau 12.
- Plus de titres de rang. Les niveaux de compétence (non affichés) gardent l'ancienne courbe (`deriveSkillLevel`).
- **Accueil** : en-tête avec rouage (Options) en haut à droite → niveau → échéance → graphique des caractéristiques → résumés Travail et Sport de la semaine. La liste des compétences est supprimée.
- **Options** (route `options`, `js/pages/options.js`) : bilan hebdo, rappels, sauvegarde/import, numéro de version.

### v4.18 — Réglages des caractéristiques éditables
- Options → « Réglage des caractéristiques » (`js/pages/caracs-settings.js`) : poids de l'historique (α), objectifs d'heures (Maths, Physique, SI, Verbe), jours travaillés attendus, pondérations internes de chacune des 6 caractéristiques, sensibilité de l'allure, points de Discipline retirés par % d'écart. Un bouton « Par défaut » rétablit les valeurs d'origine.
- Chaque validation passe par `saveCaracSettings()` : recalcul complet de l'historique, sans jamais toucher à l'XP, aux malus ni aux données. Les pondérations d'une caractéristique sont normalisées si leur total n'est pas 100.
- Les objectifs d'heures par défaut (Maths 15 h, Physique 11 h, SI 1,5 h, Verbe 4 h) restent des valeurs de départ à valider.

### v4.19
- Caractéristiques : première semaine partielle (31/08, comptée du 01/09) proratisée par jours comptés / 7 : objectifs d'heures, de jours travaillés, de sorties (arrondi, min. 1) et nuits (sur les jours comptés). Réglage `prorateFirstWeek` (case à cocher dans Options, activé par défaut) ; les quêtes stockées ne sont pas modifiées.
- Objectifs d'heures par défaut confirmés : Maths 15 h, Physique 11 h, SI 1,5 h, Verbe 4 h.

### v4.20
- Discipline : les quêtes justifiées (maladie ou autre, `meta.malusExcuses`) sont neutralisées : retirées du dénominateur au lieu d'être comptées ratées. Réglage `neutralizeExcused` (case à cocher dans Options, activé par défaut). Dextérité et heures par matière inchangées.

### v4.21
- Options : « Réglage des caractéristiques » est repliable (fermé par défaut), avec 5 sections dépliables (Historique, Objectifs hebdomadaires, Cas particuliers, Pondérations internes, Sensibilités). La page passe d'environ 2 900 px à environ 950 px de haut (écran de 380 px).
- Correctif : « Par défaut » ne vide plus toute la page Options, seule la section est ré-affichée.

### v4.22
- Validé sur l'export réel (11/11/2026) : `actualValue` en minutes pour les quêtes d'heures et en nombre pour les comptes ; `activities.date` au format ISO UTC (aucune sortie proche de minuit UTC, pas de décalage de jour) ; `best5k` présent sur 29 sorties sur 34, repli sur durée et distance pour les autres ; pas de `best10k` ni `bestSemi` (le calcul s'en passe).
- Correctif Discipline : les cases de sommeil (`sleepLog`) n'existent que depuis le 02/11/2026. Avant, la part Sommeil valait 0 chaque semaine. Désormais nuits = max(cases cochées, compteur de la quête `wq-sleep`).

### v4.23
- Dextérité : une semaine où les sorties sont justifiées (`wq-runs`, ex. maladie) ignore le volume et la régularité (cette semaine sort de la fenêtre de régularité). Si aucune part n'est mesurable, la valeur reste inchangée au lieu de tomber à 0. Même réglage `neutralizeExcused` que pour la Discipline.

### v4.24
- Dextérité : en semaine de sorties justifiées, l'Allure est aussi ignorée (et la sortie ne sert pas de référence VO2max pour les semaines suivantes).

### v4.25
- Radar des caractéristiques : échelle 0 → 20 (anneau extérieur = 20, anneau pointillé de 24 supprimé), toile agrandie (rayon 108 → 126) et icônes rapprochées des sommets. Le calcul n'est pas touché (scores sur 24) ; une valeur supérieure à 20 est écrêtée au bord du graphe.

### v4.26
- Échelle des caractéristiques façon D&D (moyen 8-12, bon ≥ 15, très bon 17-20, mauvais < 7) : objectif atteint = 12 (au lieu de 14), score hebdomadaire borné entre un plancher de 3 et un plafond de 20 (au lieu de 0-24). Réglable dans Options › Échelle des scores (clés `goalScore`, `scoreFloor`, `scoreCap`) ; recalcul complet depuis les données brutes, XP et malus intacts. La carte affiche « / plafond ».

### v4.27
- Échelle des caractéristiques : rien de fait = 4, objectif atteint = 15, objectif dépassé de 25 % = 18, plafond 20 (interpolation linéaire entre ces points). Réglable dans Options › Échelle des scores. Les anciens réglages (échelle 14/12, pondérations, objectifs) sont ignorés au chargement, seuls α et les deux cases de cas particuliers sont conservés (`ver` = 2 dans `caracSettings`).
- Objectifs d'heures : Maths 19 h, Physique 11 h, SI / Info 1 h (Info 0 h), Verbe 3 h (anglais 2 h + français 1 h).
- La to-do et l'allure ne comptent plus. Matières : 100 % heures. Dextérité : 60 % volume (sorties / objectif) + 40 % régularité (moyenne sur 4 semaines des sorties / objectif, semaines justifiées exclues). Discipline : 70 % quêtes + 30 % sommeil (7 nuits sur 7 = objectif atteint) ; remplacé en v4.40 par quêtes 49 / to-do 30 / sommeil 21. Retirés : jours travaillés attendus, sensibilités (l'écart perso reste à 0,1 pt par %).
- Radar : un appui sur un sommet ou une icône ouvre un mini détail (valeur, variation, score et parts de la semaine) ; la liste et le détail sous la toile sont supprimés. Le bouton roue de la carte ouvre Options (ancien bug : changer le poids de l'historique pouvait faire disparaître la toile).
- Options : icône roue (Accueil, titre Options, carte), réglages des caractéristiques en premier, « Cas particuliers » en dernier, cases à cocher en cuivre (`accent-color`).
- Sport : mois repliés par défaut, dernière sortie affichée par défaut.
- To-do : plus de vocabulaire d'anglais le mardi et le mercredi (`VOCAB_DAYS`, semaines à générer).

### v4.28
- Radar : la valeur entière de chaque caractéristique est écrite au bout de sa branche, à côté de l'icône ; le texte au-dessus de la toile est supprimé.
- Hebdo : deux blocs séparés. « Manuel » (sorties, coucher avant 23h30, rigueur) puis « Automatique » (travail), puis la to-do de la semaine.
- To-do de la semaine : plus de détail par jour ; seul reste un récapitulatif dans le style des cartes de quêtes (titre, pourcentage, barre, avancement par matière) et le bouton d'ajout.

### v4.29
- Planning : le jeudi, pause repas de 13h à 14h (travail personnel de 14h à 18h30 ; plus de travail entre 12h30 et 13h).

### v4.30
- Animation : transition entre onglets (fondu + glissement de 22 px dans le sens de la navigation, 0,22 s ; fondu simple depuis ou vers Options ; désactivée si « réduire les animations »).

### v4.31
- Animation : le radar se déploie depuis le centre (0,7 s) puis les icônes et valeurs apparaissent en fondu ; joué une fois par navigation vers l'Accueil, pas à chaque rafraîchissement ; désactivé si « réduire les animations ».

### v4.32
- Animation : case de to-do cochée = « pop » cuivre (agrandissement + halo, 0,38 s) et le libellé passe en gris atténué ; seulement à l'instant du cochage, pas à chaque rafraîchissement ; désactivée si « réduire les animations ». Les quêtes n'ont pas de case à cocher (compteurs) : leur animation relève de la barre de progression.

### v4.33
- Couleur : le chiffre de chaque caractéristique prend la couleur exacte de son icône (`COLORS` de `js/ui/icons.js`) ; le chiffre de Discipline n'était pas de la couleur de la lotus (corrigé aussi dans `CARACS`).
- Transition entre pages refaite (`navigate` dans `js/ui/router.js`) : l'ancienne page s'efface (120 ms), la nouvelle est préparée (données prêtes) puis apparaît en glissant (280 ms) ; retour en haut de page pendant que la vue est invisible (plus de saut). Navigations rapides gérées (la plus récente gagne), icônes d'onglets préchargées, `overflow-x: clip` sur `.app`, désactivée si « réduire les animations ».
- Accueil : le niveau (dégradé) et la prochaine échéance sont côte à côte, le graphique en dessous ; les trois blocs tiennent à l'écran. L'accès aux Options depuis la carte du graphique est supprimé (reste le rouage de l'en-tête). Le radar garde 340 px et ne rétrécit (jusqu'à 230 px) que sur les écrans courts. La carte se peint depuis un cache préchargé : plus de saut de mise en page à l'arrivée.

### v4.34
- Rappels : le bouton « Ajouter au calendrier » (fichier .ics) est remplacé par « Ajouter une notification » (icône cloche) : fenêtre avec un motif (texte libre ou raccourcis), une heure et « Répéter tous les jours ». Stockage : meta `customReminders`. Une notification unique part à l'heure prévue (aujourd'hui, sinon demain) puis disparaît ; les quotidiennes restent. Liste et suppression dans la carte Rappels (Options). Comme les autres rappels, elle ne part que si l'app est ouverte ou récemment en arrière-plan.
- Caractéristiques : ajouter, supprimer ou modifier une sortie (GPX) recalcule l'historique (`recomputeCaracs`), y compris pour une semaine passée. L'import JSON recharge l'app, qui recalcule déjà au démarrage.
- « 15/16 » fixé à 15 : validé.

### v4.35
- To-do : boutons d'ajout restylés (`.add-btn` : pointillés cuivre, pastille « + » en dégradé), utilisés dans Hebdo, Aujourd'hui, Planning et dans le sélecteur d'ajout (le champ libre était blanc : il prend maintenant la classe `.input`).
- Cycle de la to-do éditable (`features/todo-cycle.js`, `ui/cycle-editor.js`, meta `todoCycle`) : bouton « Cycle » dans Hebdo. Matières à cycle libres (Maths et Physique par défaut, reprises de `todo-data.js`), éléments avec poids (1 à 30), ordre modifiable, ajout/suppression/renommage. Deux rythmes par matière : « Points par semaine » (budget fixe) ou « Finir avant le… » (budget recalculé chaque semaine = points restants du tour ÷ semaines de to-do restantes, vacances et révisions exclues ; le tour ne recommence pas avant la date). Les changements s'appliquent aux semaines générées ensuite. Les éléments ponctuels (ajout libre) restent distincts du cycle.
- `todo.js` lit le cycle (plus de constantes `TODO_CATALOG` / `TODO_BUDGET` dans la génération) ; `TODO_SUBJECTS` est tenu à jour par `todo-cycle.js`.

### v4.36
- Hebdo et Aujourd'hui : construites hors écran puis posées d'un bloc (`STAGED` dans `js/ui/router.js`, `renderHebdo` / `renderToday` renvoient une promesse) : plus de cartes qui apparaissent ou se déforment au chargement, ni au rafraîchissement. Stats : graphiques tracés tout de suite (plus de `setTimeout`) et sans animation Chart.js.
- Accueil : en-tête + 3 blocs dans `.home-fit` (hauteur = l'écran, sans « Cette semaine » qui dépasse) ; niveau et échéance plus grands (ils absorbent la place libre, jusqu'à 300 px) ; radar réduit seulement sur écran court. Échéance : le pourcentage de l'année écoulée en grand, « J-X avant échéance » en petit.
- Nouvelle icône `cycle` (deux flèches en boucle avec un +) pour les cycles ; boutons de la to-do distincts : « Ajouter un élément » (plein, cuivre) et « Cycles » (contour sable).

### v4.37
- Les icônes du pack gardent leur couleur dans les boutons : la règle `.btn svg { color: accent-2 }` écrasait la couleur propre de chaque icône (rouage et crayon de l'Accueil plus sombres que celui du titre d'Options, et plus petits). Rouage et crayon de l'en-tête de l'Accueil = 20 px, couleur d'origine.
- Options : section « Bilan hebdo » supprimée (le bilan s'affiche toujours automatiquement au changement de semaine).

### v4.38
- **Objectifs unifiés** : les quêtes d'heures de Hebdo reprennent les objectifs de la toile (`caracSettings.hoursGoal`, réglables dans Options). `syncQuestGoals()` (`features/seed.js`, appelée par `loadAll()` et après chaque réglage) : Verbe = Anglais (2/3) + Français (1/3) ; SI = SI ; Heures de travail = Maths + Physique + SI + Verbe (34 h par défaut). Maths et Physique n'ont pas de quête (voir prompt).
- Nommage : « Lettres » → « Français » (quête), SI partout « SI / Info », Maths/Physique en court dans le cycle par défaut, section « Sommeil » (au lieu de « Coucher avant 23h30 » en doublon), « Avancement » pour la carte de la to-do, sous-titre de Aujourd'hui sans doublon, « Caractéristiques et objectifs » dans Options.
- Durées : `formatHours()` (`features/work.js`) → « 2h », « 1h30 » partout dans Hebdo et Aujourd'hui.
- Couleurs : quêtes, camembert de Stats et matières de la to-do prennent la couleur de l'icône de la matière (`COLORS`).
- Hebdo : avertissement « Malus prévu : −80 % d'XP » discret (gris) du lundi au mercredi ; badge AUTO retiré de Sport et Sommeil.
- Boutons : « Ajouter un écart » et « Ajouter une notification » au style `.add-btn` ; cases des Rappels personnalisées ; message de notifications bloquées plus clair ; libellé « Télécharger une sauvegarde » ; Stats : « Records de travail / sportifs » avec icône, « 0 h » au lieu de « — ».
- To-do : le curseur du cycle suit le nom du chapitre (insérer/déplacer un élément ne décale plus le tour) ; fichiers `tab-profil*.png` supprimés.

### v4.39
- **Notes dans Hebdo** : nouveau bloc « Notes » (`js/pages/hebdo-panels.js`), 6 panneaux (Dextérité, Discipline, Maths, Physique, SI / Info, Verbe) : note actuelle → note projetée si la semaine s'arrêtait maintenant, avec les sources de la semaine (sorties, nuits, quêtes tenues, heures). Calcul : `projectCurrentWeek()` dans `caracs.js` (lecture seule, même `scoreWeek`).
- `caracs.js` : boucle de rejeu factorisée (`replay`), partagée par `run()` et la projection ; `scoreWeek` renvoie en plus `meta` (compteurs) sans changer les scores.
- **Écarts perso / Rigueur supprimés** : section et fenêtre retirées de Hebdo, retrait du calcul de la Discipline (réglage `ecartPointsPerPct` supprimé). Les données `selfMalus` restent stockées, ignorées par les notes. `penalties.js` (XP) inchangé.
- Textes « Malus prévu » / « +X XP bonus » retirés des quêtes de Hebdo ; l'XP, le bilan de fin de semaine et l'historique des malus passés ne changent pas.

### v4.40
- **To-do dans la Discipline** : Discipline = quêtes 49 % + to-do 30 % + sommeil 21 % (`DEFAULT_SETTINGS.weights.disc`). Part to-do = éléments de `planTodo` de la semaine (`weekKey` = lundi, reportés compris) cochés / total. Aucun élément (avant novembre 2026, révisions, concours) : part ignorée, poids renormalisés = ancien 70/30 exact. Les réglages Discipline enregistrés avant v4.40 repassent aux valeurs par défaut (migration dans `getCaracSettings`). Vérifié : sans données de to-do, l'historique est identique à la v4.39 ; avec, seule la semaine concernée change.
- **Sous-matières reliées** : chaque part de `combine()` porte `share` (poids normalisé) et `info` (réalisé / objectif). Les panneaux Notes de Hebdo (`hebdo-panels.js`) affichent pour chaque note ses sous-matières (valeur, poids, sous-note, apport), la somme = score de la semaine, puis note actuelle → projetée (α lu dans les réglages). Verbe détaille Anglais / Français sans changer le total d'heures.
- Hebdo : mention « alimente : … » (couleurs des notes) sur les blocs Sport, Sommeil, Travail et To-do. Options : réglage du poids de la To-do. SW `orion-v109`.
- **Hebdo simplifiée** : la page ne contient plus que les 6 boîtes Notes (`hebdo-panels.js`, styles `.hn-*`). Retirés : cartes Sorties, Sommeil, Travail (heures auto) et To-do de la semaine, tous redondants avec les sous-matières. L'objectif de sorties (− / +) et « Justifier une semaine sans sortie » vivent dans la boîte Dextérité (`buildRunsControls` dans `quests.js`). Chaque sous-matière montre valeur, poids, sous-note, apport (+pt) et une phrase sur l'origine du chiffre ; barre empilée = apports au score de la semaine.
- **Sommeil** : case « Couché avant 23h30 » dans le tableau de bord du jour (Aujourd'hui, jour affiché ± sélecteur de date) ; la case du jour J = la nuit précédente, écrite dans `sleepLog[J]` (`toggleSleepNight`). Plus de compteur + / − dans Hebdo.
- **Régularité** = moyenne, sur les 4 dernières semaines non justifiées (semaine en cours incluse), de sorties faites ÷ sorties visées (plafonné à 125 %).
- **Accueil** : carte Niveau compacte (`.hm-level`), pourcentage d'échéance sur une seule ligne (`.hm-days` nowrap, `%` en `.hm-pct`).
- Code mort possible : `renderWeeklyQuests` / `_renderOneQuest` (cartes quêtes hebdo) ne sont plus appelés depuis une page.

