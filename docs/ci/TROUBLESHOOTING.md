# Quand le pipeline casse

Symptôme → cause → correction. Les entrées numérotées §9.x reprennent les pièges recensés au
cadrage : ils sont traités dans le code, l’entrée dit **où** et **pourquoi**, pour qu’un
« nettoyage » ne les ramène pas.

---

## Build et dépendances

### §9.1 — Le build renderer échoue sur Windows ou Linux seulement

**Symptôme** : `Cannot find module @rollup/rollup-linux-x64-gnu` (ou `@esbuild/win32-x64`) sur un
runner, alors que tout passe en local.

**Cause** : le lockfile a été généré sur une plateforme et n’embarque pas les `optionalDependencies`
des autres. Les binaires natifs de Rollup, esbuild, Tailwind oxide et lightningcss sont un paquet
par couple OS/architecture.

**Correction** : vérifier que les quatre cibles sont dans `pnpm-lock.yaml`. La commande doit rendre
**4**, et rien d’autre ne se lit :

```bash
grep -oE "rollup-(linux-x64-gnu|win32-x64-msvc|darwin-arm64|darwin-x64)" pnpm-lock.yaml \
  | sort -u | wc -l
```

> **Pourquoi pas un `grep -c`**, qui paraît plus court. Il compte des LIGNES, pas des cibles, et
> il rend donc un nombre que ce paragraphe ne peut pas annoncer d'avance : chaque cible figure
> sur autant de lignes que le lockfile a de sections qui la nomment. **Mesuré le 17/08** sur un
> lockfile complet : `-c` → **12**, quatre cibles sur trois lignes chacune. Le jour où une cible
> manque, `-c` rend un autre nombre tout aussi plausible, et un lecteur n'a rien pour trancher.
> La forme ci-dessus rend **4** ou moins, et 4 est la seule bonne réponse.

**Rollup est le témoin qu'on interroge, pas le seul concerné** : esbuild, Tailwind oxide et
lightningcss ont la même forme de paquet, et la même commande les couvre en remplaçant `rollup-`
par `@esbuild/`, `@tailwindcss/oxide-` ou `lightningcss-`. Les interroger tous les quatre est la
seule façon de le savoir — rien ne garantit qu'ils manquent ou tiennent ensemble.

Si l’une manque, régénérer le lockfile sans filtre de plateforme :
`rm pnpm-lock.yaml && pnpm install`. Ne jamais committer un lockfile produit avec
`--filter-platform` ou une clé `supportedArchitectures` restrictive.

### §9.2 — L’AppImage ne démarre pas sur une distribution un peu ancienne

**Symptôme** : `version 'GLIBC_2.38' not found`.

**Cause** : un AppImage hérite de la glibc de la machine qui l’a construit. Compilé sur Ubuntu
24.04, il refuse de démarrer sur une distribution plus ancienne.

**Correction** : la matrice épingle `ubuntu-22.04`, **jamais `ubuntu-latest`**. Le pin porte un
commentaire dans `.github/workflows/release.yml` précisément pour ne pas être « corrigé ». Le
relever coupe tous les utilisateurs dont la distribution est plus ancienne que le runner.

### §9.3 — L’installeur macOS Intel est en fait un binaire arm64

**Symptôme** : le `.dmg` x64 ne se lance pas sur un Mac Intel, ou pèse le même poids que l’arm64.

**Cause** : `macos-latest` est une machine **arm64**. Un `--mac` nu ne produit que l’architecture
de l’hôte.

**Correction** : les architectures sont déclarées dans `electron-builder.yml`, pas sur la ligne
de commande — `arch: [arm64, x64]` sur les **deux cibles macOS**, `dmg` et `zip`. Windows n'a que
`arch: [x64]`, et c'est voulu. Ne jamais supposer que le défaut couvre les Mac Intel. Vérifier :

```bash
lipo -archs "/Volumes/AI Desktop Studio/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio"
```

### §9.4 — Un binaire `universal` produit une application cassée

**Cause** : l’option `universal` échoue silencieusement en présence de modules natifs sans
prebuild pour les deux architectures.

**Correction** : elle n’est pas utilisée, et [ADR-03](adr/ADR-03-cibles-et-architectures.md)
l’écarte. `scripts/before-pack.mjs` **passe** `arch === 'universal'` sans rien faire, et ce n’est
pas un refus : une build universelle fusionne deux builds mono-architecture, dont chacune est
déjà passée par ce hook — le ffmpeg de chaque architecture est donc déjà là. Ce que le hook
**rejette**, lui, c’est un ordinal d’architecture inconnu : `throw new Error('Unknown
architecture ordinal …')`.

### `better-sqlite3` refuse de se charger dans l’application packagée

**Cause probable** : le `.node` est resté dans l’archive asar. Un module natif ne se charge pas
depuis un asar.

**Correction** : `asarUnpack: ['**/*.node']` est là pour ça. Aucun `electron-rebuild` n’est
nécessaire — `better-sqlite3` v13 livre des prebuilds N-API pour les quatre cibles, et les résout
**avant** `build/Release/` ([ADR-08](adr/ADR-08-modules-natifs.md)).

---

## ffmpeg

### « does not match its recorded digest »

**Symptôme** : le packaging s’arrête avec l’empreinte attendue et l’empreinte obtenue.

**Cause** : la source tierce a remplacé le binaire sous une URL épinglée — ou quelqu’un a changé
l’URL sans changer l’empreinte.

**Correction** : c’est le garde-fou qui fonctionne. Ne **jamais** recopier l’empreinte obtenue
sans savoir pourquoi elle a changé. Rotation délibérée :
voir « Rotation de ffmpeg » dans [RELEASE.md](RELEASE.md).

### « Could not reach https://www.osxexperts.net… » ou 503

**Cause** : `osxexperts.net` est la source la plus fragile des trois, et la seule à servir
`darwin-arm64`. Elle répond 503 sous charge.

**Correction** : relancer le job. Si la panne dure, la seule issue est de changer de source pour
`darwin-arm64` — donc de changer l’URL **et** l’empreinte, et de vérifier que la version reste
sur la série 7.1 ([ADR-12](adr/ADR-12-ffmpeg-epinglage-et-concurrence.md) : les cinq cibles sont
alignées parce que `src/main/media/runner.ts` construit une seule ligne de commande).

### « ffmpeg introuvable » alors que `which ffmpeg` le trouve

**Cause** : le binaire est cherché **puis exécuté** (`binaryRuns`). Un ffmpeg Homebrew dont une
bibliothèque a disparu existe sans démarrer.

**Correction** : `ffmpeg -version` le dit ; `brew reinstall ffmpeg` le répare.

---

## Signature macOS

### `No identity found`

**Cause** : aucun certificat dans le trousseau du runner. C’est le cas **normal** aujourd’hui —
`CSC_IDENTITY_AUTO_DISCOVERY=false` est alors forcé et le build sort non signé, avec un
avertissement dans le résumé du run.

**Correction** : si la signature est attendue, vérifier que `MAC_CERT_P12_BASE64` et
`MAC_CERT_PASSWORD` existent (`gh secret list`) et que le certificat est bien un **Developer ID
Application**, pas un « Mac App Distribution » ni un « Developer ID Installer ».

### `CSSMERR_TP_CERT_REVOKED`

**Cause** : Apple a révoqué le certificat — compte fermé, expiré, ou révocation demandée.

**Correction** : générer un nouveau **Developer ID Application** et remplacer les deux secrets.
Les binaires déjà signés et notarisés restent valides : la notarisation est horodatée.

### `errSecInternalComponent` ou le job macOS se fige à la signature

**Cause** : `electron-builder` importe le `.p12` dans le trousseau par défaut du runner, qui peut
être verrouillé.

**Correction documentée** : créer un trousseau temporaire, déverrouillé, avant le packaging.

```yaml
- name: Import the certificate into a temporary keychain
  if: steps.signing.outputs.signed != 'false'
  env:
    MAC_CERT_P12_BASE64: ${{ secrets.MAC_CERT_P12_BASE64 }}
    MAC_CERT_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
  run: |
    keychain="$RUNNER_TEMP/signing.keychain-db"
    password="$(uuidgen)"
    security create-keychain -p "$password" "$keychain"
    security set-keychain-settings -lut 3600 "$keychain"
    security unlock-keychain -p "$password" "$keychain"
    echo "$MAC_CERT_P12_BASE64" | base64 --decode > "$RUNNER_TEMP/cert.p12"
    security import "$RUNNER_TEMP/cert.p12" -k "$keychain" -P "$MAC_CERT_PASSWORD" \
      -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple: -k "$password" "$keychain"
    security list-keychain -d user -s "$keychain"
    rm "$RUNNER_TEMP/cert.p12"
```

Ce recours n’est pas dans le workflow : `electron-builder` fait le travail seul dans le cas
courant. Il est écrit ici pour ne pas être réinventé le jour où il faut.

### La notarisation dépasse le `timeout-minutes` du job

**Cause** : la notarisation est asynchrone et sa durée dépend d’Apple. Quelques minutes en temps
normal, parfois beaucoup plus lors d’un incident de leur côté.

**Correction** : relancer le job ; les artefacts déjà produits ne sont pas perdus (`fail-fast:
false`). Si l'attente devient chronique, relever `timeout-minutes` du job `build` — il est à 45
et n’a jamais été éprouvé sur une notarisation réelle, puisqu’aucun compte Apple n’est souscrit.
Diagnostiquer l’attente :

```bash
xcrun notarytool history --key AuthKey.p8 --key-id "$KEY_ID" --issuer "$ISSUER"
xcrun notarytool log <submission-id> --key AuthKey.p8 --key-id "$KEY_ID" --issuer "$ISSUER"
```

---

## Publication

### §9.5 — `Resource not accessible by integration` au moment de créer la release

**Cause** : le job publie sans droit d’écriture.

**Correction** : `contents: write` est **scopé au seul job `release`**. Le laisser au niveau du
workflow entier donnerait ce droit aux trois jobs de build, qui n’en ont aucun usage.

### §9.6 — « Missing update manifests » : le job `release` refuse de publier

**Symptôme** : `::error::Missing update manifests: latest-mac.yml`.

**Cause** : une plateforme n’a pas produit son manifeste — job en échec, ou artefact non
téléversé.

**Correction** : **c’est la protection qui fonctionne, ne pas la contourner.** Une release sans
manifeste casse l’auto-update de toute la base installée, sans erreur visible côté serveur : le
client demande le fichier, reçoit un 404, et ne dit rien. Corriger la plateforme fautive et
relancer le run. `latest.yml` = Windows, `latest-mac.yml` = macOS, `latest-linux.yml` = Linux.

### §9.7 — Un asset dépasse la limite de GitHub

**Cause** : une release GitHub refuse tout fichier de plus de **2 Go**.

**État actuel** : le plus gros artefact pèse environ 240 Mo, soit ~12 % de la limite. Aucun risque
aujourd’hui. Si l’on s’en approchait, la parade serait de télécharger les ressources lourdes à la
première exécution plutôt que de les embarquer.

### §9.8 — L’application packagée plante au démarrage sur `Cannot find module 'electron-updater'`

**Cause** : le module est en `devDependencies`. `externalizeDeps` d’electron-vite n’externalise
que les `dependencies`, et electron-builder ne copie que celles-là. L’erreur est invisible en
développement, où `node_modules` est complet.

**Correction** : `electron-updater` est en **dependency de production**, et doit le rester.

```bash
node -p "Object.keys(require('./package.json').dependencies)"
```

### §9.9 — Deux releases créées pour un seul tag, ou des manifestes écrasés

**Cause** : plusieurs jobs publiant en parallèle sur la même release.

**Correction** : l’architecture à deux étages l’empêche
([ADR-06](adr/ADR-06-publication-des-artefacts.md)) — la matrice téléverse des artefacts, un job
unique agrège et publie. Remettre en cause cette architecture ramène le problème.

### Le tag est poussé mais rien ne se déclenche

**Causes possibles**, dans l’ordre de fréquence :

1. Le tag ne correspond pas à `v*` (`0.2.0` au lieu de `v0.2.0`).
2. Le tag a été poussé sans `git push origin <tag>` — pousser la branche ne pousse pas les tags.
3. Les workflows ne sont pas encore sur la branche par défaut du dépôt.

```bash
git ls-remote --tags origin | grep v0.2.0
gh workflow list
```

### `gh` refuse de pousser `.github/workflows/`

**Cause** : le jeton `gh` n’a pas le scope `workflow`.

**Correction** : pousser en SSH (`git push`), qui n’est pas soumis à cette restriction. Ou
`gh auth refresh -s workflow`.

---

## Auto-update côté application

### Rien ne se passe en développement

**Attendu.** `createUpdates` sort immédiatement quand `app.isPackaged` est faux, et
`electron-updater` n’est même pas chargé. Le journal dit `[updater] Development run: updates are
off.` Sans cette garde, `checkForUpdates` échoue sur un `app-update.yml` absent.

### L’application ne voit pas une release publiée

À vérifier dans l’ordre :

1. La release est-elle **publiée** ou encore en draft ? `electron-updater` ne voit que les
   publiées.
2. La version de la release est-elle **supérieure** à celle qui tourne ?
3. `latest-mac.yml` / `latest.yml` / `latest-linux.yml` sont-ils bien dans les assets ?
4. Le fichier `.zip` macOS est-il présent ? C’est lui que `electron-updater` consomme, pas le
   `.dmg` — d’où sa présence dans les cibles alors qu’il n’est pas distribué.
5. Le dépôt est-il toujours **public** ? Un dépôt privé casse l’auto-update de toute la base
   installée ([ADR-05](adr/ADR-05-canal-de-distribution.md)).

Le journal du processus principal porte les lignes `[updater]`, y compris la raison d’un échec.
