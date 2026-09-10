# Chantier C6 — Moteur de rendu Compatible (WebGL) / Avancé (WebGPU/TSL)

Date : 10 septembre 2026. Branche `feat/render-engine`, worktree `worktrees/render-engine`.
Machine : Apple M2 Max, macOS 26.5.2 (Darwin 25.6.0), arm64. three.js 0.185.1.

## Verdict

| Étape | Statut | Motif |
| --- | --- | --- |
| 1 — Gains WebGL indépendants | livrée, 1 MUST refusé sur mesure | Cascades, anisotropie et AgX livrés. `PCFSoftShadowMap` n'est pas le mode doux dans cette version de three : appliquer le MUST 1.1 aurait durci les ombres. |
| 2 — Interface driver + choix moteur | livrée, 1 écart d'emplacement | `RenderDriver`, `glDriver`, `gpuDriver` (stub), repli silencieux, `engines` dans le registre. Le sélecteur est dans les préférences 3D et non à la création de projet — motif plus bas. |
| 3 — Premier contenu GPU réel | **non livrée** | Le préalable — un `WebGPURenderer` réellement monté — est le port de toute la chaîne de rendu, pas un spike. Chiffré plus bas. Aucun chiffre, aucune capture : rien n'a été mesuré, donc rien n'est affirmé. |

## Étape 1

### 1.1 — Mode doux des ombres : MUST refusé, avec la mesure

Le spec demande de remplacer `soft: PCFShadowMap` par `PCFSoftShadowMap`. **Ce serait une
régression**, vérifié dans la source livrée le 10 septembre 2026 :

- `node_modules/three/src/renderers/webgl/WebGLProgram.js:345` — `shadowMapTypeDefines` ne nomme
  que `PCFShadowMap → SHADOWMAP_TYPE_PCF` et `VSMShadowMap → SHADOWMAP_TYPE_VSM` ;
  `generateShadowMapTypeDefine` retombe sur `SHADOWMAP_TYPE_BASIC` pour tout le reste,
  `PCFSoftShadowMap` compris.
- `shadowmap_pars_fragment.glsl.js:94` — la branche `SHADOWMAP_TYPE_PCF` est celle qui contient
  le disque de Vogel à cinq taps avec rotation par bruit de gradient entrelacé, et la seule qui
  lise `shadowRadius`.

Autrement dit `PCFShadowMap` **est** le mode doux de three 0.185, et `PCFSoftShadowMap` y compile
une comparaison non filtrée. `WelcomeBackdrop.ts:171` portait déjà cette note ; elle est désormais
sur `MAP_TYPES` dans `shadows.ts`, à l'endroit où quelqu'un rouvrirait le sujet.

Conséquence pour le critère d'acceptation « un projet existant est visuellement identique sauf les
ombres, qui passent en doux » : **les ombres ne changent pas**, elles étaient déjà douces. Un projet
existant est donc identique, point.

### 1.2 — Cascades (CSM)

`RenderPolicy.csm`, faux par défaut. `src/renderer/src/engines/scene/csm.ts` enveloppe
`three/addons/csm/CSM.js` :

- trois bandes, `CASCADES = 3`, non réglable : le nombre est un `define` de matériau, le changer
  recompile toute la scène ;
- la taille des cartes passe par `shadowMapSizeFor`, le même plafond qualité qu'une carte unique ;
- `dress` parcourt la scène une fois : habille les matériaux standard et **retire le soleil du
  document du casting** — sans ça la même occlusion serait assombrie deux fois ;
- `dress` ignore tout matériau portant déjà un `onBeforeCompile` : `setupMaterial` l'écrase et
  `dispose` le supprime, ce qui coûterait son programme au splat de relief ;
- `dress` force `material.needsUpdate` — l'addon ne le fait pas, et un `define` posé sur un
  matériau déjà compilé n'atteint aucun programme ;
- `release` rend au soleil sa carte, retire les trois lumières et fait recompiler les matériaux.

Câblage : construction au montage du renderer, reconstruction dans `configure` quand `csm`,
`shadows` ou la taille des cartes bougent, `follow(camera)` par panneau dans `dressPane` (chaque
vue d'un quadrant veut ses propres bandes), `aim` depuis `tuneShadows`, libération à la fermeture.

**Non mesuré** : le coût réel des trois passes de profondeur. Aucun banc GPU n'a été lancé.

### 1.3 — Anisotropie

Le spec désigne `resourceContent.ts`. Ce fichier n'importe aucune texture : il empreinte des
ressources pour les dédupliquer, et ne fait que **lire** `texture.anisotropy` dans ses métadonnées.
Le seul endroit où le studio importe une texture est `scene/textureCache.ts`, que les trois moteurs
(scène, matériau, ciel) partagent. C'est là que la valeur est écrite, via un fournisseur
`anisotropyOf` demandé à chaque chargement — un cache est construit avant que son viewport ait un
renderer, donc la valeur ne peut pas être capturée une fois pour toutes.

**Impact mémoire : nul, et ce n'est pas une estimation** — le filtrage anisotrope prend plusieurs
échantillons dans la chaîne de mips existante ; il ne crée aucune texture et n'alloue rien. Le coût
est en bande passante d'échantillonnage, sur les surfaces vues en biais. **Non mesuré** : ce coût,
faute de banc GPU dans cet environnement.

### 1.4 — Tone mapping des nouvelles scènes

`AgXToneMapping` **est** disponible en three 0.185 (`three/src/constants.js:472`, valeur 6) : c'est
donc AgX et non ACES. `agx` rejoint l'union `ToneMapping`, la table de `worldBinding` et les quinze
bundles de langue.

`DEFAULT_WORLD.toneMapping` reste `'none'` : c'est le repli d'une scène **relue**. Le nouveau défaut
vit dans `NEW_SCENE_WORLD` (`defaultScene.ts`), lu par `createDefaultScene` et par
`sceneFromTemplate`. Un modèle qui nomme sa propre courbe garde la sienne — les cinq presets
d'environnement demandent explicitement `aces`, ce qui reste un tone mapping actif.

## Étape 2

### Ce qui est derrière l'interface

`src/renderer/src/engines/render/` — même forme que `src/game/ports/` : l'interface d'un côté,
chaque implémentation dans son fichier.

| Point | Avant | Derrière `RenderDriver` |
| --- | --- | --- |
| Construction du renderer | `new WebGLRenderer` dans `ViewportSurface` | `createRenderer(request)` |
| Lecture de pixels | `readRenderPixels(gl, …)` appelé par 3 modules | `readPixels(…): Promise<Uint8Array>` |
| Environnement IBL | `createEnvironment` appelé par 3 moteurs | `createEnvironment(…)` |
| Patch matériau | `onBeforeCompile` posé dans le constructeur de `MaterialRenderer` | `patchMaterial(material, uniforms, onMissingAnchor)` |

`readPixels` rend une promesse **des deux côtés** bien que WebGL réponde immédiatement : la lecture
GPU mappe un buffer et résout une frame plus tard, et une signature qui changerait avec le moteur
remettrait le choix chez chaque appelant. Les trois appelants
(`SceneRendererFilm`, `SceneRendererFlight`, `SceneRendererValidation`) étaient déjà `async`.

Le patch matériau passe du constructeur au `mount` : quel driver tourne est réglé par ce montage.
Le matériau n'a encore rien dessiné, donc aucun programme n'a à être reconstruit pour ça.

### Repli

`mountRenderer` : Compatible si le moteur demandé est `gl`, si aucun adaptateur n'a répondu, ou si
le driver Avancé lève. Jamais d'écran noir. La raison part en trace `render.fallback` — une trace
et non un `LogScope`, donc pas de toast : l'image est juste, rien n'est perdu, et un panneau par
panneau qui se plaint serait la spécification d'une machine présentée comme un défaut du document.

`navigator.gpu?.requestAdapter()` est le seul signal qui décide, interrogé une seule fois par
session (`gpuAdapter.ts`). `adapter.info` n'entre pas dans le choix. Le montage ne peut pas attendre
la réponse : le premier viewport d'une session ouvre en Compatible et la réponse est là pour le
suivant. Six cas couverts par `gpuAdapter.test.ts`, dont l'adaptateur refusé et
`requestAdapter` qui lève ; sept cas de repli par `renderDriver.test.ts`.

### Écart assumé : où vit le sélecteur

Le MUST 7 demande un sélecteur **à la création de projet**, verrouillé ensuite. Deux faits du dépôt
s'y opposent :

1. `RenderPolicy` vit dans `Settings.three` (`settings.ts:178`), un réglage d'application, pas dans
   le manifeste de projet — lequel ne porte que `version`, `createdAt`, `updatedAt`
   (`domain/project.ts:101`).
2. Créer un projet, c'est choisir un dossier (`stores/project.ts:434`, `createPicked`). Il n'y a
   aucun dialogue de création où poser deux options.

Le sélecteur est donc dans l'espace 3D des préférences, avec la copie demandée
(« Compatible » / « Avancé »), le nom de l'API dans le texte d'aide faute de sous-titre dans ce
contrôle. Le verrou « pas de switch en direct » tient **par construction** : le moteur est lu au
montage du viewport et jamais relu ; l'aide le dit. Mettre le choix dans le projet demanderait un
champ de manifeste et sa validation — hors périmètre de cette étape, à décider.

### Registre post-processing

`PostEffectMeta.engines`, les trente effets existants en `['gl']`. Les `PostSlot` et la règle
`EXCLUSIVE` ne bougent pas. Le filtrage d'un effet par moteur n'est pas écrit : il n'a aucun effet
tant qu'aucun effet GPU n'existe, et un filtre qu'on ne peut pas voir tourner est un filtre qu'on
ne peut pas relire.

## Étape 3 — non livrée, et pourquoi

Le point 3.1 (patch matériau en TSL), 3.2 (GTAO en TSL), 3.3 (lecture de pixels GPU) et le
budget qualité `RenderPipeline` sont tous **derrière un préalable** : que `GPUDriver.createRenderer`
rende un `WebGPURenderer` réellement monté. Ce préalable n'est pas un spike.

Mesuré dans ce dépôt et dans three 0.185 :

- `EffectComposer` est **WebGL uniquement**, et three le dit dans sa propre documentation :
  `examples/jsm/postprocessing/EffectComposer.js:18` — « This module can only be used with
  WebGLRenderer ». Toute la chaîne de composition du studio est construite dessus :
  **1 941 lignes** dans `engines/postfx/` hors tests, plus **291 lignes** de passes GLSL dans
  `engines/gpu/`, dont `fuseShader` qui n'a aucun équivalent souhaitable côté TSL.
- **29 fichiers hors tests** nomment `WebGLRenderer`. `ViewportSurface.gl` est typé
  `WebGLRenderer | null` et lu par les passes, les overlays, `TransformControls` et `ViewHelper`.
- Le viewport lit encore `renderer.getContext()` pour la minuterie GPU (`gpuTimer.ts`, extension
  WebGL2) et `renderer.info.autoReset`, qui n'ont pas le même contrat côté WebGPU.

Une chaîne `RenderPipeline` parallèle, un typage `Renderer` propagé sur ces 29 fichiers, et une
seconde implémentation des effets : c'est un chantier, pas une étape. **Il faut le décider, pas le
commencer en fin de lot.**

S'ajoute une limite d'environnement, indépendante du volume : les critères d'acceptation de
l'étape 3 sont un test de non-régression **visuel** GL vs GPU, une **table de chiffres** sur deux
profils et deux moteurs, et une **capture** d'export. Aucun des trois n'est productible ici — la
suite tourne sous jsdom, sans WebGPU ni GPU. Les écrire sans les mesurer serait précisément ce que
le spec interdit.

## Ce qui reste ouvert

- Le port WebGPU lui-même (étape 3), à ouvrir comme chantier avec sa propre branche de banc.
- Le switch en direct du moteur : hors périmètre, et il le reste tant que le patch matériau n'est
  pas porté en TSL.
- SSGI : hors périmètre par décision du spec.
- TRAA : non porté, l'effet n'existe même pas côté GL dans `PostEffectId`.
- Le choix du moteur par PROJET plutôt que par application, si le sélecteur doit vraiment vivre à
  la création : demande un champ de manifeste et sa validation.
- Coût réel des cascades et de l'anisotropie : à mesurer sur un banc GPU, qui n'existe pas encore
  dans ce dépôt.
