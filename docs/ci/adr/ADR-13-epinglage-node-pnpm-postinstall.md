# ADR-13 — Environnement d’exécution et `postinstall`

- **Statut** : Accepté — décision imposée par l’audit
- **Date** : 2026-08-08

## Contexte

Deux constats de l’audit touchent au démarrage de tout job CI :

1. **Aucune version n’est épinglée.** Ni `.nvmrc`, ni `engines`, ni `packageManager`. Le poste
   tourne sous Node 24.8.0 et pnpm 11.16.0 ; un runner choisirait autre chose.
2. **`postinstall` s’exécute à chaque `pnpm install`, donc en CI.**
   `scripts/dev-app-identity.mjs` renomme le bundle Electron de `node_modules` en « Scenario
   Studio », génère un `.icns` via `sips` et `iconutil`, édite l'`Info.plist` via `PlistBuddy` et
   re-signe en ad-hoc. C’est un confort de développement : le nom de l’application dans le Dock
   et le menu pendant `pnpm start`. En CI, il ne sert à rien — le bundle packagé est produit par
   `electron-builder` à partir d’une copie neuve — et il s’exécute sur le runner macOS.

> Le nom cité ci-dessus est celui du contexte de la décision. Le studio s’appelle
> **AI Desktop Studio** depuis le 07/09, et le script ne l’écrit plus : il lit `productName` dans
> `package.json`.

## Décision

- **Épingler l’environnement** : `.nvmrc` à la version majeure de Node du poste, et
  `packageManager: pnpm@11.16.0` dans `package.json`. Les workflows lisent le premier via
  `actions/setup-node` et le second via `corepack`.
- **`scripts/dev-app-identity.mjs` sort immédiatement si `process.env.CI` est défini**, en
  journalisant la raison.

## Alternatives écartées

- **Écrire la version de Node en dur dans les workflows** : deux vérités à synchroniser, et le
  poste continuerait de n’être épinglé par rien.
- **Retirer le `postinstall`** : c’est du confort réel en développement, et le supprimer serait
  une régression pour l’utilisateur du dépôt.
- **Le neutraliser via `GITHUB_ACTIONS`** : `CI` est posé par toutes les plateformes
  d’intégration, `GITHUB_ACTIONS` par une seule.
- **`--ignore-scripts` dans les workflows** : neutraliserait aussi les scripts d’installation
  légitimes déclarés dans `allowBuilds` (`better-sqlite3`, `electron`, `esbuild`).

## Conséquences

- La modification touche `scripts/dev-app-identity.mjs`, hors `src/` : c’est de l’outillage, pas
  du code applicatif. Le périmètre du cahier de mission est respecté.
- `packageManager` active corepack sur le poste : une version de pnpm différente sera signalée
  au lieu d’être silencieusement utilisée.
- Une mise à jour de Node ou de pnpm devient un changement visible dans un diff, plutôt qu’une
  dérive entre le poste et la CI.
