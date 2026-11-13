# Prompt pour la prochaine instance — Orion v4.41

Lis d'abord `README.md` (sections v4.40 et v4.41) puis ce fichier. Réponds en français, court (écran de téléphone), un seul
choix à la fois à l'utilisateur, plan numéroté avant un gros chantier. Ne recommence pas ce qui est fait.

## Ce qui est fait (v4.41)
- Onglet « Compétences », calculateur (temps libre × % → heures par matière), objectifs dérivés du temps libre (jour et semaine),
  sorties dans Planning, Options (% + poids), sommeil dans Aujourd'hui, boîtes de notes avec sous-matières, régularité à fenêtre calendaire.
- Calcul dynamique actif à partir du lundi **2026-11-16** (`dynamicFrom`), avant : anciens objectifs fixes.

## À vérifier / terminer (rien n'a été testé sur le vrai export de l'utilisateur)
1. **Test réel du 16/11** : ouvrir Aujourd'hui (objectif du jour = % du temps libre du jour), Compétences (carte « calcul automatique »),
   quêtes d'heures (objectifs = ceux de la semaine), et « XP vérifiée : tout est cohérent » (backup.js `computeExpectedXp` utilise
   `dailyGoalHours` / `questGoalHours`). Si l'XP est incohérente, regarder d'abord les jours/semaines ≥ dynamicFrom.
2. Les quêtes d'heures stockent un seul `goalHours` (semaine en cours) ; les semaines passées sont recalculées via `questGoalHours(q, wk)`.
   Vérifier `recomputeAutoQuests(wk)` pour une semaine passée (doit passer par `setQuestValue(..., wk)`, déjà adapté).
3. Page Compétences : les boîtes « Verbe » affichent Anglais / Français avec leurs minutes ; `info.parts[i].goal` existe maintenant
   (objectif par sous-matière) mais n'est pas encore affiché dans `hebdo-panels.js` (`partEl`) : à ajouter (ex. « Anglais 1h40 / 2h »).
4. Options : la section « Objectifs de travail » est en place ; vérifier visuellement (dépliée) et le bouton « Par défaut ».
5. Code mort possible : `renderWeeklyQuests` / `_renderOneQuest` (quêtes hebdo) ne sont plus appelés par une page.
6. Idées non demandées, à ne PAS faire sans accord : changer les poids par défaut, rétroactivité avant le 16/11.

## Règles du projet
- Les caractéristiques se recalculent depuis les données brutes (rejouable) ; ne jamais stocker un résultat non reproductible.
- Après toute modification : `node --check` sur les fichiers JS, test Playwright (horloge simulée `pg.clock.install`), README, version
  (`APP_VERSION` dans `js/core/state.js`, `VERSION` dans `sw.js`), zip dans `/mnt/user-data/outputs/`.
