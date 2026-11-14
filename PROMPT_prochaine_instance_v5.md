# Prompt pour la prochaine instance — DailyUp (ex-Orion) → v5 (à partir de la v4.51)

Contexte : PWA mobile « Orion » (JS modules, IndexedDB, sans build), projet dans `DailyUp-v4_51.zip`. Lis `README.md` (sections v4.42 à v4.51). L'utilisateur est étudiant en prépa MP*, il dicte ses demandes en français : réponds en français, court, sans jargon, une question à la fois, plan numéroté court avant de travailler. Style : sobre, sombre, cuivre/kaki, aucun néon ni dégradé vif, pas de bleu/violet/vert (rouge = erreurs/malus). Tests : serveur `python3 -m http.server` et Playwright (390×800, `service_workers='block'`, `page.clock.install(time='2026-11-16T10:00:00')`, fermer le bilan hebdo `.gpx-preview-overlay` via `.gpx-preview-close`) ; un serveur lancé dans une commande bash ne survit pas à la suivante : le démarrer et tester dans le même appel. Après chaque tâche : `node --input-type=module --check`, test, README, `APP_VERSION` (`js/core/state.js`) et `VERSION` (`sw.js`), zip.

## Déjà fait en v4.48
Éléments d'anglais et de français sortis des cycles (désormais vides/désactivés) et devenus des **récurrents** avec valeurs par défaut ; option **semaine A/B** (`phase`, `weekParity`, `AB_REF`). Voir README v4.48.

## Objectif de la v5
Rendre l'app utilisable par **un autre élève de prépa** (mêmes matières et compétences que l'utilisateur actuel) qui veut travailler **et/ou** faire du sport. Le sport est facultatif. Si aucune autre demande : **ne rien changer** au reste de l'app. Exécuter dans l'ordre ci-dessous, s'arrêter proprement s'il manque de la place, et laisser un nouveau prompt pour la suite.

### 1. Nom et logo — nom choisi : **DailyUp** (renommage visible déjà fait en v4.49)
- Reste à faire : intégrer le logo que l'utilisateur enverra (`icons/orion-192.png`, `orion-512.png`, `orion-maskable-512.png`, `orion-favicon.png`, `badge.png`, `logo.png`). Idée de logo transmise : anneau cuivré ouvert (jauge de progression) avec une ligne qui monte en 3 marches, fond sombre kaki, sans silhouette de coureur.

### 2. Tutoriel d'inscription (pages, rapide, sans saisie lourde)
Mode d'accès **admin** : pouvoir le relancer à tout moment (bouton dans Profil/Options) pour tester, sans perdre les données. Pages dans l'ordre :
1. **Sport ?** « Veux-tu suivre ton sport ? » oui / non. Non → retirer la compétence Dextérité/sport, l'onglet Sport, le sixième sommet du radar et toute mention du sport pour cet utilisateur (accueil, stats, quêtes, to-do…).
2. **Gamifier ?** « Veux-tu gamifier ton travail ? » Oui → système de notes des compétences actif. Non → les notes ne s'affichent pas (elles restent calculées et stockées dans le JSON), pas de toile/radar (5 branches sans sport, 6 avec), mais on garde toujours dessous la liste des compétences avec leur avancée en **barres de progression sans note**. Non → on retire aussi le niveau et on ne garde que l'échéance dans l'accueil, entre les deux boîtes.
3. **Horaires** : heure de coucher **et** heure de fin de travail (= fin du temps libre, pas forcément égale au coucher ; le coucher sert la discipline), **par jour de la semaine**, avec une saisie dynamique et rapide (curseurs / pastilles, pas de clavier).
4. **Volume de travail** : pourcentage du temps libre disponible (entre le réveil et l'heure de fin de travail) consacré au travail.
5. L'utilisateur reçoit **l'emploi du temps par défaut de l'utilisateur actuel, sans les colles** (elles ne concernent que lui).
Réglages modifiables ensuite dans les options : activer/désactiver sport et gamification. Le réglage Sport (`prefs.js`) existe déjà : la page 1 du tutoriel n'a qu'à l'appeler (`savePrefs({ sport })`, `onboarded`).

### 3. Refonte des Options — FAIT en v4.51 (catégories dépliantes, chacune avec logo et style attractif mais sobre)
- Sans dépliant (simples cases à cocher) : **Gamification**, **Sport**.
- Dépliant **Objectifs** : part de temps libre travaillée, et part par matière. On supprime l'échelle des scores actuelle (plus modifiable, en dur dans l'app), le poids de l'historique fixé à 70 %, les pondérations et les cas particuliers cochés : tout cela devient fixe et n'est plus affiché.
- Dépliant **Sauvegarde** : sauvegarde et paramètres (export/import JSON).

## Déjà fait en v4.49 (début de la v5)
- Nom DailyUp ; `features/prefs.js` + case « Sport » dans Options (sport désactivé = onglet, radar 5 branches, quête et malus de sorties, stats sportives masqués). La case `gamify` existe dans les préférences mais n'agit pas encore.

## Déjà fait en v4.51
- Gamification réellement active (accueil sans niveau/toile, barres sans note) ; Options refondues (interrupteurs Gamification et Sport, dépliants Objectifs / Rappels / Sauvegarde) ; poids de l'historique 70 % et échelle/pondérations fixes. Voir README v4.51.

## Déjà fait en v4.52
- Tutoriel complet (pages 1 à 5) : horaires par jour (`prefs.hours`), volume de travail (`workPct`), EDT sans colles (`prefs.colles`), bouton de relance dans Options. Voir README v4.52.

## Reste à faire, dans l'ordre
1. (FAIT en v4.53 : coucher branché sur la case sommeil et le rappel.)
2. Logo (fichiers à fournir par l'utilisateur).
3. Vérifier encore les Stats et le Profil avec la gamification désactivée (notes /20 éventuellement visibles).
4. Tester sur les vraies données de l'utilisateur (la fin de travail par jour modifie le temps libre, donc les objectifs).

## À vérifier avec l'utilisateur
- Le bilan hebdomadaire du lundi reste intact tant qu'il n'a rien demandé.
- Rien n'est encore testé sur ses vraies données (cycles, to-do de la semaine suivante).
