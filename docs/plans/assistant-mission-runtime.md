# Plan d’implémentation du runtime de missions

Vérifié le 4 septembre 2026 sur `develop` au commit `e0b920db8`, à partir de la spécification
`ai-desktop-studio-assistant-mission-context-spec.md`, de l’audit
`assistant-context-architecture-audit.md` et du code réel.

## Contraintes confirmées

- `ACTION_FAMILIES` et `ACTION_REGISTRY` restent l’unique autorité des 297 actions. L’index SQLite
  est un cache reconstructible ; `actions.find` reste une action compatible pendant la migration.
- `runConfirmedAction` reste l’unique porte d’exécution pour l’assistant et MCP.
- Le runtime de missions ne dépend ni de React, ni du DOM, ni d’un prestataire. Les frontières
  renderer/main restent typées dans `shared/ipc.ts`.
- `better-sqlite3`, FTS et les embeddings non triviaux s’exécutent hors thread UI. Les embeddings
  sont optionnels : la recherche FTS doit rester fonctionnelle sans modèle local chargé.
- Memory conserve son journal NDJSON, son score et son index. Seuls ses ports SQLite, FTS,
  vectoriels et ses patterns de worker peuvent être réutilisés.
- Les métadonnées absentes du registre — lectures, écritures, effets, sorties, idempotence et
  conflits — ne sont pas inférées. Elles seront ajoutées seulement lorsqu’un test observable les
  exige.
- Les scénarios A à D seront des tests d’intégration sur les vraies autorités applicatives. Le
  dépôt n’a pas de harnais E2E. Le banc et le test MCP sur socket gardent leurs responsabilités
  distinctes.
- Une révision commune ne peut pas être déduite de `dirty` ou `updatedAt`. Le contrat sera posé
  d’abord avec une surface pilote, puis étendu moteur par moteur aux points réels de mutation.

## Décision retenue

La spec exige la survie au rerender, à la fermeture du panneau, au changement de workspace et à la
perte de la conversation, mais laisse ouverte la survie au redémarrage de l’application. Le code
actuel ne possède qu’une chaîne Zustand renderer volatile et bloque un second message avec `busy`.

Décision utilisateur : autorité de mission dans le main avec journal local versionné dès la V1, projection
renderer par IPC, et reprise prudente des états non terminaux au démarrage. Cette option rend réelle
la séparation Conversation / Mission / contexte LLM et évite une migration d’autorité en phase 7.
Elle ajoute toutefois dès la phase 2 un schéma persistant et sa migration.

Le journal écrit l’intention avant l’action et son résultat après. Au redémarrage, une action
retrouvée `running` est ambiguë : elle passe en pause avec vérification utilisateur et n’est jamais
rejouée automatiquement. Les steps de raisonnement sans effet peuvent être recalculés ; les jobs
sont réattachés par leur identifiant persistant avant toute reprise.

## Lots ordonnés

1. **Baseline et domaine pur** — mesurer les tests non payants existants ; créer IDs, `Mission`,
   `MissionStep`, `StudioEvent`, machines de transitions centralisées et tests de création,
   hiérarchie, fin, annulation, échec, dépendances et attentes.
2. **Mission Store / Manager** — créer l’autorité main, le stockage choisi, la projection IPC et
   l’intégration UI minimale sans déplacer la conversation existante ; tester migrations,
   restauration et isolation de fenêtres.
3. **Scheduler déterministe** — calculer ready/waiting/resume, limiter la concurrence, rattacher les
   attentes utilisateur et job, annuler proprement ; couvrir missions simples et simultanées.
4. **ActionIndex** — normaliser automatiquement le registre et les traductions, calculer son
   fingerprint, migrer SQLite/FTS dans un worker, rendre la recherche bornée et tolérer l’absence
   d’embeddings ; vérifier exhaustivité des 297 actions et reconstruction.
5. **AssistantContextBuilder** — produire un objet typé avec provenance, fraîcheur et budgets par
   source ; agréger demande, mission, workspace, actions, mémoire, jobs et résultats sans concaténer
   puis tronquer globalement.
6. **Document State / Revision** — définir les providers, implémenter une surface pilote, capturer
   les préconditions et relire/replanifier sur conflit ; étendre ensuite chaque kind avec ses tests.
7. **Branchement LLM progressif** — adapter la boucle existante Mission → ContextBuilder →
   `AssistantBrain` → `runConfirmedAction`, sans réécrire les providers et avec compatibilité
   explicite de l’ancien parcours pendant la comparaison.
8. **Capabilities et contexte visuel** — déclarer fenêtre, streaming, JSON et multimodalité ;
   transporter des captures temporaires uniquement pour les portes capables, sans créer d’asset.
9. **Flux d’activité UI** — projeter les événements corrélés dans la colonne assistant existante,
   avec les composants et jetons du design system et les textes i18n.
10. **Banc comparatif** — ajouter les métriques prévues sans modifier les oracles, puis comparer
    l’ancien et le nouveau parcours sur le même commit, le même modèle et au moins trois passes.

Chaque lot porte ses tests, passe `pnpm check`, la simplification, la mutation et deux revues
adverses. `pnpm validate` ne passe qu’à la fin du lot. Le banc payant n’est exécuté qu’avec une clé
et un accord explicite ; ses échecs ne sont jamais transformés en nouveaux critères de réussite.

## Migrations prévues

- canaux IPC mission, événements, réponses utilisateur et annulation ;
- journal/store de missions versionné selon l’arbitrage ci-dessus ;
- `PersistedJob` enrichi de `missionId` et `stepId` optionnels, rétrocompatible ;
- base ActionIndex versionnée par `user_version`, corpus fingerprinté et reconstructible ;
- `AssistantThought` et `AssistantBrain` enrichis sans dépendance à un provider ;
- rapports du banc enrichis de coûts de contexte, candidats, étapes, replans et conflits.

## Tests existants à conserver

Les tests de briefing, parsing, fenêtres, retries, store assistant, validation/refus, exhaustivité
registre/handlers/couverture, socket MCP et les 461 scénarios du banc restent les oracles. Les tests
nouveaux s’ajoutent au niveau de chaque nouvelle autorité ; ils ne recopient pas les branches des
machines d’état.
