# Publier une version

Check-list exécutable sans réfléchir. Chaque étape est vérifiable ; aucune ne se saute.

Rappel du modèle de branches ([ADR-15](adr/ADR-15-modele-de-branches.md)) : **`develop` intègre,
`main` publie**. Un tag `v*` posé sur `main` déclenche le pipeline.

> **Les builds ne sont pas signés, et l’auto-update ne vérifie donc rien.**
> Le condensat du manifeste garantit qu’un téléchargement n’a pas été corrompu, pas qu’il vient
> de vous : sans certificat, ni Gatekeeper ni SmartScreen n’ont de signataire à comparer. La
> seule barrière est l’accès en écriture au dépôt.
> **Publier une release, c’est donc autoriser l’exécution de ce binaire sur chaque machine qui
> l’installe.** Réserver ce canal à un cercle de test tant que les certificats de
> [SECRETS.md](SECRETS.md) ne sont pas provisionnés — [ADR-04](adr/ADR-04-strategie-de-signature.md).

---

## Avant la première release — à faire une seule fois

1. **Publier les branches et basculer la branche par défaut.**

   ```bash
   git push origin main develop
   gh repo edit --default-branch develop
   ```

   Tant que ce n’est pas fait, les workflows ne peuvent pas s’exécuter.

2. **Vérifier que le dépôt est public.**

   ```bash
   gh api repos/:owner/:repo --cache 0 --jq .visibility    # attendu : public
   ```

   `gh repo view` répond depuis un cache et a déjà annoncé `PRIVATE` sur un dépôt public :
   demander l’API sans cache est la seule réponse qui vaille. Un dépôt privé n’empêche ni le
   packaging ni la création de la draft — il rend seulement les assets inaccessibles sans jeton,
   donc l’auto-update répond 404 **sans que rien ne s’affiche**
   ([ADR-05](adr/ADR-05-canal-de-distribution.md)).

3. **Basculer GitHub Pages sur le workflow.**

   ```bash
   gh api -X PUT repos/:owner/:repo/pages -f build_type=workflow
   gh api repos/:owner/:repo/pages --jq .build_type        # attendu : workflow
   ```

   Un dépôt configuré depuis l’interface arrive en `build_type: legacy`, où Pages sert la branche
   choisie **directement** et ignore `pages.yml` : `actions/deploy-pages` échoue, le site reste
   sur ce que `main` porte, et `assets/release.json` n’est jamais écrit — donc aucune carte de
   téléchargement ne se remplit. Le symptôme est un 404 sur la page d’accueil, sans le moindre
   run en échec.

4. **Vérifier le pipeline à blanc**, avant tout tag :

   ```bash
   gh workflow run release.yml -f dry_run=true
   gh run watch
   ```

   Attendu : trois artefacts (`installers-mac`, `installers-win`, `installers-linux`), **aucune
   release créée**. Télécharger le `.dmg` et le lancer sur le Mac confirme que le paquet démarre.

---

## Choisir le numéro

**Semver**, et le **tag fait foi**. `package.json` porte le même numéro sans le `v`.

| Incrément | Quand | Exemple |
|---|---|---|
| **Patch** — `0.2.0` → `0.2.1` | correction seule, aucune capacité nouvelle | un export qui échouait passe |
| **Mineure** — `0.2.1` → `0.3.0` | capacité nouvelle, les projets existants s’ouvrent toujours | l’espace Audio devient multipiste |
| **Majeure** — `0.3.0` → `1.0.0` | un projet enregistré par la version d’avant ne s’ouvre plus tel quel, ou l’ergonomie change en profondeur | changement de format de document |

Tant que le premier chiffre est `0`, la promesse de compatibilité est faible par convention —
mais **le format des documents, lui, engage déjà** : quelqu’un a des projets sur son disque.
Une version qui les casse est une majeure, quel que soit le chiffre de gauche.

**Pré-versions** : `v0.3.0-rc.1` pour une candidate. `electron-updater` les traite comme des
versions à part entière ; ne pas publier la draft d’une `-rc` si la base installée ne doit pas
la recevoir.

## Publier

1. **Partir d’un `develop` vert.** `pnpm validate` doit passer, et la CI être au vert sur
   `develop`.

2. **Aligner la version** dans `package.json`. Elle doit correspondre **exactement** au tag, sans
   le `v` :

   ```bash
   # pour publier v0.2.0
   npm version 0.2.0 --no-git-tag-version
   ```

   Un désalignement produit des manifestes d’auto-update dont la version ne correspond pas au nom
   du tag — l’auto-update part alors en boucle ou ne voit rien.

3. **Écrire la section de la version dans [`CHANGELOG.md`](../../CHANGELOG.md)**, puis committer :

   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore(release): 0.2.0"
   ```

   **Ce n’est pas une formalité : c’est le corps de la release.** Le job `release` extrait la
   section `## [0.2.0]` et la passe à `gh release create --notes-file`. Un tag dont la section
   manque **fait échouer la publication** — délibérément, plutôt que de créer une draft vide.
   Le titre reste le nom du tag.

   **Rejouer la garde ici, et pas seulement à l’étape 1** : elle lit la version que porte
   `package.json`, qui vient de changer deux étapes plus haut. Le `pnpm validate` de l’étape 1
   l’a vue avec l’ancien numéro.

   ```bash
   pnpm test src/main/releaseNotes.test.ts
   ```

4. **Fusionner dans `main`.** C’est le seul type de merge que `main` accepte :

   ```bash
   git checkout main
   git merge --no-ff develop -m "Release 0.2.0"
   ```

5. **Taguer et pousser.** Le tag est la source de vérité de la version :

   ```bash
   git tag v0.2.0
   git push origin main develop v0.2.0
   ```

6. **Suivre le run.**

   ```bash
   gh run watch
   ```

   Le job `build` tourne sur les trois OS, puis `release` agrège et crée la draft. Un échec de
   `release` avec « Missing update manifests » signifie qu’une plateforme n’a pas produit son
   `latest*.yml` : c’est une protection, pas un caprice — [ADR-06](adr/ADR-06-publication-des-artefacts.md).

7. **Vérifier la draft** avant de la publier :

   ```bash
   gh release view v0.2.0
   ```

   Attendu, sept fichiers plus les manifestes :

   | Fichier | Plateforme |
   |---|---|
   | `ai-desktop-studio-0.2.0-darwin-arm64.dmg` / `.zip` | macOS Apple Silicon |
   | `ai-desktop-studio-0.2.0-darwin-x64.dmg` / `.zip` | macOS Intel |
   | `ai-desktop-studio-0.2.0-win32-x64.exe` | Windows |
   | `ai-desktop-studio-0.2.0-linux-x86_64.AppImage` | Linux |
   | `ai-desktop-studio-0.2.0-linux-amd64.deb` | Debian, Ubuntu |
   | `latest.yml`, `latest-mac.yml`, `latest-linux.yml` | manifestes d’auto-update |

   > **Ces noms sont relevés sur un vrai run, pas déduits** — dry run du 15 août 2026. Deux pièges,
   > et les deux ont déjà fait écrire une table fausse :
   >
   > **`darwin` et `win32`, pas `mac` et `win`.** `artifactName` d’`electron-builder.yml` interpole
   > `${platform}`, qui vaut `process.platform` — la plateforme de la machine **qui construit**.
   > En CI chaque runner construit sa propre cible, donc les noms tombent juste ; un
   > `pnpm dist --win` lancé depuis le Mac écrirait `darwin-x64.exe`, et les cartes du site ne le
   > reconnaîtraient pas.
   >
   > **`${arch}` n’a pas la même valeur selon la CIBLE**, et Linux en produit deux différentes dans
   > le même run : `x86_64` pour l’AppImage, `amd64` pour le `.deb` — chaque format garde la
   > convention de son écosystème. Ce n’est pas `x64`, qui ne sort nulle part côté Linux.
   >
   > Le site ne s’y trompe pas : le `jq` de `pages.yml` reconnaît ces deux-là par leur extension
   > seule, précisément parce que leur architecture ne s’écrit pas comme ailleurs.

   Contrôler que les tailles sont cohérentes (170–240 Mo par installeur) et que les manifestes
   portent bien `version: 0.2.0`.

   > **Ce que la machine a déjà vérifié, et que vos yeux n'ont donc pas à refaire** : le job de
   > publication refuse de créer la draft si l'un des trois manifestes manque, **ou si un seul
   > fichier qu'ils listent n'a pas son `.blockmap`**. Un blockmap absent ne casse pas le
   > téléchargement : il fige le client sur « Download block maps » au lieu de le faire retomber
   > sur un téléchargement complet — d'où le contrôle, et d'où le fait qu'une draft existante en
   > porte forcément un par installeur.
   >
   > **Ce qui reste à vos yeux** : les tailles, le numéro de version, et que les sept installeurs
   > soient là. Le reste est mécanique.

8. **Publier**, depuis l’interface GitHub ou :

   ```bash
   gh release edit v0.2.0 --draft=false
   ```

   **C’est ce geste, et lui seul, qui déclenche la mise à jour de la base installée.**

---

## Revenir en arrière

Une release publiée par erreur se dépublie ; un tag se retire. Dans cet ordre :

```bash
gh release edit v0.2.0 --draft=true      # la retire de la vue publique et de l'auto-update
gh release delete v0.2.0 --yes           # si elle doit disparaître entièrement
git push origin :refs/tags/v0.2.0        # retire le tag distant
git tag -d v0.2.0                        # et le tag local
```

**Repasser la release en draft suffit à arrêter la diffusion** : `electron-updater` ne voit que
les releases publiées. Le faire d’abord, réfléchir ensuite.

Un client qui a déjà téléchargé la version l’installera au prochain quit — une release retirée ne
rappelle pas ce qui est parti. La parade est de publier **une version supérieure** corrigée, pas
d’espérer que le retrait suffise.

---

## Rotation de ffmpeg

Épinglé par URL versionnée et somme de contrôle ([ADR-12](adr/ADR-12-ffmpeg-epinglage-et-concurrence.md)).
Changer de build est un geste délibéré en trois temps :

```bash
# 1. changer les URL dans scripts/fetch-ffmpeg.mjs (et BTBN_VERSION / BTBN_BUILD)
# 2. recalculer les empreintes des cinq cibles
node scripts/fetch-ffmpeg.mjs --digests
# 3. recopier la sortie dans les champs `digests` de TARGETS, puis
pnpm licences:collect                    # le relevé de licences lit ces mêmes cibles
pnpm validate
```

Changer l’URL sans l’empreinte fait échouer le build au packaging — c’est voulu.

**Changer de version impose de changer `SOURCES` avec.** Le commit BtbN suit tout seul, dérivé de
`BTBN_BUILD` ; la ligne macOS est écrite à la main. Une version sans archive de sources déclarée
fait échouer `fetch-ffmpeg.mjs --sources`, donc la release — voir ci-dessous.

**Les deux archives viennent de `github.com/FFmpeg/FFmpeg`, et cela se garde.** La source macOS
pointait sur `ffmpeg.org`, qui a fait échouer la v0.1.0 deux fois de suite : mesuré le 15 août
2026, il répondait en 5,5 s depuis un poste et **pas du tout** depuis les runners, emportant la
release avec lui. Le miroir du tag amont porte le même arbre et répond en 0,6 s. Une future
rotation ne doit pas revenir à un hôte dont la disponibilité conditionne chaque publication.

---

## Les sources de ffmpeg voyagent avec la release

Distribuer les binaires déclenche l’obligation : GPL-3.0 sur macOS, LGPL-2.1 ailleurs, et les
deux demandent la source **correspondant à ce build précis**
([ADR-16](adr/ADR-16-licence-du-projet.md)).

Le job `release` s’en charge tout seul, avant de créer la draft :

```bash
node scripts/fetch-ffmpeg.mjs --sources dist
```

Deux archives, environ 26 Mo, attachées aux installeurs. Rien à faire à la main — mais **deux
choses à vérifier sur la draft** avant de la publier :

- `ffmpeg-7.1.1-source.tar.gz` et `ffmpeg-n7.1.5-…-source.tar.gz` sont bien dans les assets ;
- leur numéro correspond à celui de `TARGETS`.

Si le téléchargement échoue, la release échoue. C’est délibéré : publier les binaires sans leurs
sources est la violation, pas l’inverse.
