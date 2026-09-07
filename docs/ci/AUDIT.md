# Audit de cadrage — pipeline de packaging et de distribution

État du dépôt au **8 août 2026**, relevé avant toute écriture. Ce document fige le point de
départ : les ADR de `docs/ci/adr/` s’y réfèrent au lieu de le reparaphraser.

> **Ce document ne décrit pas le dépôt d’aujourd’hui, et ne doit pas être corrigé pour le faire.**
> C’est une photographie, prise pour justifier les décisions qui l’ont suivie. La mettre à jour
> reviendrait à effacer ce que les ADR ont résolu — leur raison d’être deviendrait illisible.
>
> **La preuve que l’audit a servi, c’est justement que ses constats sont périmés.** Les neuf que
> le dépôt a démentis, relevés un par un le 11 août 2026 :
>
> | Ce que l’audit relevait | Depuis | Traité par |
> |---|---|---|
> | ni `packageManager`, ni `.nvmrc` | les deux existent — `pnpm@11.16.0`, Node 24 | ADR-13 |
> | `publish:` absent | configuré | ADR-05, ADR-06 |
> | `electron-updater` absent | `^6.8.9` | ADR-05 |
> | `.github/` n’existait pas | `ci.yml` et `release.yml` | ADR-02, ADR-14 |
> | branche par défaut `feat/scenario-pipeline`, pas de `develop` | `develop` intègre, `main` publie | ADR-15 |
> | entitlements : une seule clé, `allow-jit` | **deux** — la dictée a ajouté `device.audio-input` | ADR-11, amendée |
> | `better-sqlite3` seule dépendance native | **deux** — `sherpa-onnx-node` s’ajoute, d’où l’`asarUnpack` | ADR-17 |
> | main à **3 entrées** | **quatre** — `sttWorker` s’ajoute | ADR-17 |
> | `resources/ffmpeg/` = 96 Mo · aucun Toast · `react-toastify` inutilisé | 152 Mo · `ActivityToasts` existe · paquet retiré | — |
>
> **Ce qui n’a pas bougé** : les cibles de packaging, l’`appId`, les fuses, et le point marqué
> « état assumé » — `CLAUDE.md` gitignoré, qui l’est toujours.
>
> **Ce tableau se relit quand une ADR change**, pas à date fixe : c’est la seule chose qui le
> rende utile plutôt que rassurant.

## L’existant

| Point | Constat | Chemin |
|---|---|---|
| Structure | Paquet unique. `pnpm-workspace.yaml` sans `packages:` — sert uniquement à `allowBuilds` | `pnpm-workspace.yaml` |
| Gestionnaire | pnpm, lockfile v9 commité. Ni `packageManager`, ni `.nvmrc`, ni `engines` | `pnpm-lock.yaml` |
| Node / pnpm | Node v24.8.0, pnpm 11.16.0 sur le poste — non épinglés | — |
| Electron | 43.3.0 ; `LSMinimumSystemVersion` = **12.0** | `node_modules/electron/dist/Electron.app/Contents/Info.plist` |
| Bundling | electron-vite 5. Main à **4 entrées** (`index`, `catalogWorker`, `peaksWorker`, `sttWorker`), preload forcé CJS, renderer à 2 HTML. Sortie `out/` | `electron.vite.config.ts` |
| Build vs packaging | `pnpm build` = sources → `out/`. **`pnpm dist` packageait déjà** et produit un `.dmg` | `scripts/dist.sh` |
| Packaging | `electron-builder 26.15.3`, configuration externalisée et complète | `electron-builder.yml` |
| `appId` | `com.pasquelin.iastudio` — déjà arrêté | `electron-builder.yml:1` |
| `productName` | `IA Studio`, dans `package.json` seulement, volontairement absent du YAML | `src/shared/constants.test.ts` |
| Cibles déclarées | mac `dmg`+`zip` `[arm64, x64]`, win `nsis` `[x64]`, linux `AppImage`+`deb` | `electron-builder.yml` |
| Icônes | `build/icon.svg` et `build/icon.png` 1024×1024. Pas de `.icns`/`.ico` — sans conséquence : electron-builder 26 rasterise le SVG à 1024 | `iconConverter.js:242` |
| Entitlements | Une seule clé, `allow-jit`, avec justification écrite du refus des deux autres | `build/entitlements.mac.plist` |
| Fuses | Complets, dont `onlyLoadAppFromAsar` et `enableEmbeddedAsarIntegrityValidation` | `electron-builder.yml` |
| `publish:` | **Absent** — aucun canal de mise à jour configuré | — |
| `electron-updater` | **Absent** du projet | — |
| CI | **`.github/` n’existait pas.** Aucun workflow, aucune release publiée | — |
| Dépôt | `git@github.com:pasquelin/IAStudio.git` — **public** | — |
| Branche par défaut | `feat/scenario-pipeline` ; `main` local en avance de **83 commits** sur `origin/main` | — |
| Dépendances natives | **`better-sqlite3` 13.0.3 seule.** 8 prebuilds N-API, les 4 cibles couvertes. `fsevents` en dev/darwin | — |
| Lockfile multi-OS | Rollup, esbuild, Tailwind oxide, lightningcss : les 4 cibles présentes | `pnpm-lock.yaml` |
| Ressources | `resources/ffmpeg/` = 96 Mo, gitignoré, téléchargé par `beforePack` selon la cible | `scripts/before-pack.mjs` |
| Taille estimée | dmg ≈ 190–240 Mo, nsis ≈ 170–220 Mo, AppImage ≈ 180–230 Mo — **~12 % de la limite de 2 Go** | — |
| IPC | `shared/ipc.ts` : `CHANNELS` (invoke) + `EVENTS` (push) + `StudioBridge`. Un canal = 3 éditions coordonnées | `src/main/ipc/handle.ts` |
| Logger | `log.info/warn/error(scope, message)`. `electron-log` non utilisé | `src/main/log.ts` |
| UI | Aucun Toast. Précédent structurel exact : `JobsStatus` monté dans le slot `right` de `Footer` | `src/renderer/src/app/JobsStatus.tsx` |

## Risques relevés

**BLOQUANT**

1. **Modèle de branches incohérent avec un pipeline de release.** Branche par défaut du remote
   `feat/scenario-pipeline`, 83 commits jamais poussés sur `main`, pas de `develop`. Traité par
   [ADR-15](adr/ADR-15-modele-de-branches.md).
2. **`CLAUDE.md` est gitignoré.** Sa mise à jour n’est pas versionnée : elle n’apparaît dans
   aucun commit et manque à tout worktree neuf. État assumé du dépôt, signalé pour mémoire.

**MAJEUR**

3. **`postinstall` s’exécute en CI.** `scripts/dev-app-identity.mjs` réécrit le bundle Electron
   de `node_modules` (`PlistBuddy`, `sips`, `iconutil`, `codesign`) à chaque `pnpm install`.
   Traité par [ADR-13](adr/ADR-13-epinglage-node-pnpm-postinstall.md).
4. **ffmpeg non reproductible.** Téléchargé depuis osxexperts.net, evermeet.cx (`getrelease`,
   non versionné) et BtbN `master-latest`. Aggravant : `fetch-ffmpeg.mjs` vide le dossier avant
   chaque fetch — deux packagings concurrents se corrompraient. Traité par
   [ADR-12](adr/ADR-12-ffmpeg-epinglage-et-concurrence.md).
5. **Licence ffmpeg macOS = GPL-3.0-or-later** (Windows et Linux en LGPL). Publier sur GitHub
   Releases est l’acte de distribution qui déclenche l’obligation de fournir les sources
   correspondantes. Décision prise en connaissance de cause, cf. ADR-12.
6. **Budgets de couverture absolus.** `vitest.config.ts` fixait des seuils négatifs par glob,
   sensibles à la plateforme. Traité par [ADR-14](adr/ADR-14-portee-de-la-validation-continue.md),
   puis clos autrement le 2026-08-13 : toute la mesure de couverture a été retirée du dépôt.
7. **Le token `gh` n’a pas le scope `workflow`** (`admin:public_key, gist, read:org, repo`).
   Pousser `.github/workflows/` via l’API `gh` échoue ; via SSH, aucune restriction.

**MINEUR**

8. `.gitignore` sans exclusion de certificats — corrigé en Phase F.
9. Les 8 prebuilds de `better-sqlite3` (16 Mo) sont embarqués sur chaque plateforme : ~14 Mo
   inutiles par installeur. Non traité, cf. ADR-08.
10. Refs orphelines `refs/remotes/local/main` et `refs/remotes/localmain` — supprimées après
    vérification qu’elles ne portaient aucun commit absent de `main`.
11. `react-toastify` en devDependency, importé nulle part.
12. `productName` dupliqué dans `scripts/dev-app-identity.mjs`, non couvert par un test.

## Ce que l’audit tranche seul

- **Aucun rebuild natif n’est nécessaire.** `better-sqlite3` v13 résout
  `prebuilds/<platform>-<arch>.node` **avant** `build/Release/` (`lib/binding.js`), les quatre
  cibles sont couvertes, et `rebuild:native` n’est appelé par aucun script de build.
- **Le budget de minutes CI n’est pas une contrainte** : le dépôt est public, les runners
  hébergés sont gratuits.
- **Les icônes ne bloquent pas.** L’absence de `.icns` et `.ico` est sans effet, le SVG source
  étant accepté et rasterisé.
