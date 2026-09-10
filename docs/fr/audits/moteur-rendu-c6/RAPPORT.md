# Chantier C6 — Moteur de rendu Compatible (WebGL) / Avancé (WebGPU/TSL)

Date : 10 septembre 2026. Branche `feat/render-engine`, worktree `worktrees/render-engine`.
Machine : Apple M2 Max, macOS 26.5.2 (Darwin 25.6.0), arm64. three.js 0.185.1.

## Verdict

| Étape | Statut | Motif |
| --- | --- | --- |
| 1 — Gains WebGL indépendants | livrée, 1 MUST refusé sur mesure | Cascades, anisotropie et AgX livrés. `PCFSoftShadowMap` n'est pas le mode doux dans cette version de three : appliquer le MUST 1.1 aurait durci les ombres. |
| 2 — Interface driver + choix moteur | livrée, 1 écart d'emplacement | `RenderDriver`, `glDriver`, `gpuDriver` (stub), repli silencieux, `engines` dans le registre. Le sélecteur est dans les préférences 3D et non à la création de projet — motif plus bas. |
| 3 — Premier contenu GPU réel | livrée, TRAA écarté | `WebGPURenderer` monté, patch matériau en TSL, GTAO en nœud natif, lecture de pixels GPU, budget qualité partagé. Chiffres mesurés sur cette machine, plus bas. TRAA non porté : motif plus bas. |

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
- `dress` habille les matériaux standard et fait **remplacer** le soleil par les bandes : elles
  prennent sa couleur et son intensité, il cesse d'éclairer et de projeter. `CSM` ajoute trois
  lumières à 3 d'intensité chacune ; laissées à côté d'un soleil qui éclaire encore, une scène à
  1 passait à 10. L'intensité n'est pas divisée par trois pour autant : le chunk n'éclaire un
  fragment que depuis UNE bande, celle où tombe sa profondeur ;
- `dress` **compose** avec un matériau qui porte déjà un `onBeforeCompile` au lieu de le sauter.
  `setupMaterial` écrase ce crochet et `dispose` le supprime ; sauté, le splat de relief — le
  seul matériau de scène dans ce cas — perdait à la fois les cascades et l'ombre de son soleil,
  c'est-à-dire exactement le cas que les cascades existent pour servir ;
- `dress` force `material.needsUpdate` — l'addon ne le fait pas, et un `define` posé sur un
  matériau déjà compilé n'atteint aucun programme ;
- `release` rend au soleil sa lumière et sa carte, rend leur crochet aux matériaux composés,
  retire les trois lumières et fait recompiler.

Câblage : construction au montage du renderer, reconstruction dans `configure` quand `csm`,
`shadows` ou la taille des cartes bougent, `follow(camera)` par panneau dans `dressPane` et sur
chaque rendu hors écran (film, capture, validation), `aim` depuis `tuneShadows`, habillage limité
aux nœuds qui ont changé plus les lots instanciés, libération à la fermeture.

`follow` répond si les bandes ont bougé, et cette réponse remonte par `dressPane` : c'est ce qui
dit à la frame que ses cartes d'ombre valent une passe. Sans ça un orbite — qui déplace les
bandes sans rien changer d'autre — aurait affiché des ombres périmées, la frame ne dessinant la
passe d'ombres que sur `shadowsStale`.

L'export jeu honore `csm` : `webRender` construit les mêmes cascades quand la politique portée
par le manifeste le demande. Sans ça un projet exporté aurait perdu ses cascades en silence.

**Non mesuré** : le coût réel des trois passes de profondeur. Aucun banc GPU n'a été lancé.

**Limites connues, écrites plutôt que découvertes plus tard** :

- `CSM._injectInclude` réécrit `ShaderChunk.lights_fragment_begin` pour tout le processus et
  l'addon ne le restaure jamais. `release` rend la scène, pas le processus. Sans effet visible :
  le chunk est gardé par `#ifdef USE_CSM`.
- `CSM.shaders` est une `Map` forte : un matériau habillé y reste jusqu'à la libération, même si
  son nœud a disparu entre-temps.
- Le splat de relief et les cascades écrivent tous deux dans `onBeforeCompile`. Les deux se
  composent — le splat réécrit `map_fragment`, les cascades lisent `lights_fragment_begin` — et
  `release` ne rend un patch que si celui posé est encore le nôtre. Reste un ordre fragile si
  `bindReliefSplat` s'exécute pour la première fois APRÈS un habillage.

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

Deux revues sur trois ont demandé de ne pas livrer le réglage tant qu'Avancé ne dessinait rien.
L'étape 3 l'a rendu caduc : le moteur Avancé dessine. Son aide dit maintenant ce qui reste vrai —
une machine sans adaptateur WebGPU retombe d'elle-même sur le Compatible et le note au journal.

### Registre post-processing

`PostEffectMeta.engines`, les trente effets existants en `['gl']`. Les `PostSlot` et la règle
`EXCLUSIVE` ne bougent pas. Le filtrage d'un effet par moteur n'est pas écrit : il n'a aucun effet
tant qu'aucun effet GPU n'existe, et un filtre qu'on ne peut pas voir tourner est un filtre qu'on
ne peut pas relire.

## Étape 3

### Ce qui a été mesuré, et sur quoi

Machine : Apple M2 Max, Electron du dépôt, `navigator.gpu.requestAdapter()` répond. Banc :
`pnpm engines:bench`, qui pilote `engineBenchmark.browser.ts` par CDP sur `pnpm start:debug`.
Surface 1280×720, qualité `high`, une pile portant GTAO sur les deux moteurs.

**Ce que chaque colonne mesure, et rien de plus** :

- `submitMs` — ce que le THREAD UI dépense à assembler et enfiler une image, moyenne sur
  60 images après 10 de chauffe. 🛑 **Pas** le coût de l'image sur la carte : les deux `render()`
  rendent la main dès les commandes enfilées.
- `firstStillMs` — la PREMIÈRE image fixe : `captureStill` en entier. Elle dessine dans une
  cible, relit les pixels et encode un PNG hors thread, donc elle vide la file — et absorbe du
  même coup tout ce qui restait à compiler.
- `stillMs` — la MOYENNE des suivantes, une fois plus rien à compiler. Ce qu'un export paie par
  image fixe. 🛑 L'encodage PNG est dedans et il est le même sur les deux moteurs : ce chiffre
  SOUS-ESTIME l'écart entre eux au lieu de le montrer.

| Profil | Moteur | `submitMs` | `firstStillMs` | `stillMs` |
| --- | --- | ---: | ---: | ---: |
| Un modèle (4 nœuds) | Compatible | 0,050 | 63,9 | 44,47 |
| Un modèle (4 nœuds) | Avancé | 0,088 | 48,5 | 45,66 |
| Monde ouvert C5 (20 000 nœuds) | Compatible | 0,087 | 52,8 | 41,18 |
| Monde ouvert C5 (20 000 nœuds) | Avancé | 0,122 | 65,9 | 42,63 |

`submitMs` est la moyenne de 60 images, `stillMs` celle de 10 images fixes, `firstStillMs` un
échantillon unique.

**Ce que ces chiffres disent, sans arrangement** :

- **Le moteur Avancé coûte plus cher côté CPU par image** : 0,088 contre 0,050 sur un modèle,
  0,122 contre 0,087 sur le monde ouvert. Soit 1,4 à 1,8 fois. Les deux restent très en dessous
  d'un budget d'image.
- **Il monte moins vite avec la scène** : de 4 à 20 000 nœuds, le Compatible passe de 0,050 à
  0,087 (+74 %) et l'Avancé de 0,088 à 0,122 (+39 %). Il monte quand même. Une machine, deux
  profils : c'est une observation, pas une loi, et surtout pas une extrapolation.
- **À chaud, les deux moteurs sortent une image fixe au même prix** (41 à 46 ms) : l'écart est
  dans le bruit. L'encodage PNG est dedans, identique des deux côtés, et pèse l'essentiel de
  ces millisecondes — ce chiffre sous-estime donc l'écart entre les moteurs au lieu de le montrer.
- **`firstStillMs` n'est pas reproductible d'une exécution à l'autre.** Un premier passage sur
  cette révision a mesuré **640,8 ms** côté Avancé ; celui du tableau en mesure 48,5. La
  différence est le cache de pipelines du navigateur, pas le moteur. À lire comme un ordre de
  grandeur du coût de compilation à froid, jamais comme une comparaison.
- **Aucun seuil de gain n'est atteint.** Sur ces deux profils, le moteur Avancé n'est plus rapide
  que le Compatible sur aucune des trois mesures. Ce qu'il apporte — la qualité d'éclairage et de
  reflets — n'est pas ce que ce banc mesure, et n'a été comparé par aucune mesure de ce chantier.

### 3.1 — Patch matériau en TSL

`materialNodes.ts`. Ce n'est pas une traduction du GLSL, et deux écarts sont délibérés :

- **Aucune recompilation quand un canal se remplit.** Le patch GLSL est gardé par
  `#ifdef USE_ROUGHNESSMAP` : chaque slot rempli reconstruit le programme. Ici un uniforme `has`
  choisit entre le texel remappé et le facteur nu, et remplir un slot déplace un nombre.
- **La cavité tombe sur la COULEUR diffuse** et non sur `reflectedLight`, sur quoi un matériau de
  nœuds n'ouvre aucune couture. Identique pour un diélectrique — le cas où une cavité sert ;
  sur un métal, dont three tire la teinte spéculaire de cette même couleur, l'Avancé assombrit
  un peu ce que le Compatible laisse tranquille. **Écart connu, pas une équivalence.**

Les uniformes sont ceux du moteur, partagés : un `Vector2` par référence, un scalaire et une
texture relus à chaque rendu parce qu'ils sont remplacés et non écrits dedans. Cinq tests tiennent
ce pont, dont celui qui vérifie que le graphe ne se reconstruit pas quand un canal arrive.

**Non mesuré** : la comparaison visuelle GL/GPU du patch. Elle demande deux rendus de la même
scène de référence à comparer pixel à pixel, comme `world:validate` le fait déjà entre deux
représentations — le harnais existe, l'entrée pour les deux moteurs n'a pas été écrite.

### 3.2 — GTAO en TSL

`gpuComposer.ts` construit un `RenderPipeline` dont la passe de scène écrit ses normales en MRT,
puis multiplie l'occlusion `ao()` — la fonction native de three, pas une réécriture du `GTAOPass`.
`gtao.engines` devient `['gl', 'gpu']` ; c'est le seul effet des trente dans ce cas.

Aucune logique de fusion façon `fuseShader` : `RenderPipeline` partage déjà profondeur et
normales entre les nœuds qui les lisent.

### 3.3 — Lecture de pixels GPU

`readRenderTargetPixelsAsync`, derrière la même signature promise des deux côtés — décidée à
l'étape 2 pour cette raison exacte. Les trois appelants (film, capture de vol, validation)
étaient déjà asynchrones et n'ont pas bougé.

🛑 Un renderer de nœuds ne relit pas le canevas : la lecture veut une cible. Le studio en passe
toujours une, donc le chemin d'export est intact — mesuré ci-dessus par `readbackMs`, qui est
exactement `captureStill`.

### 3.4 — Budget qualité de la chaîne `RenderPipeline`

`gpuPostQuality.ts`, **dérivé** de `postQuality` et jamais une seconde table : un réglage doit
acheter la même chose sur les deux moteurs. La division de résolution du chaînage GL devient le
`resolutionScale` du nœud, la part d'échantillons est la même valeur. Cinq tests, dont deux qui
comparent les deux lectures réglage par réglage.

Une limite honnête pour la suite : **TRAA n'expose aucun nombre d'échantillons** dans
three 0.185 — ses échantillons sont des IMAGES, une par gigue d'une séquence fixe. Son seul
levier serait la correction sous-pixel. Rien n'est écrit pour lui tant qu'il n'est pas porté :
un champ de budget que personne ne lit est un champ qui ment.

### 3.5 — Ce qui a dû être réparé pour que l'Avancé dessine

Trouvés en faisant tourner le banc, pas en lisant le code :

- Le montage demandait au renderer son contexte WebGL2 pour la minuterie GPU. Un renderer de
  nœuds **lève** si on lui demande son contexte avant que son backend soit prêt.
- La scène préfiltrait la salle neutre (`setStudio`) dans la foulée du montage : `fromScene`
  refuse avant l'init. L'éclairage du montage attend désormais `settled()` — et passe tout droit
  quand le moteur peut déjà dessiner, ce qui est le cas de chaque montage WebGL.
- Les images sont retenues tant que le backend n'est pas là (`canDraw`), sinon chaque `render()`
  lève.
- Le banc lui-même attendait deux `requestAnimationFrame` : une fenêtre qui n'est pas à l'écran
  n'en reçoit aucun, et le banc restait pendu au lieu de rendre un chiffre.

Et neuf autres trouvés par la revue adverse, tous dans le chemin GPU — les plus graves :
la lecture de pixels rendait les lignes **paddées à 256 octets et à l'endroit** là où le
Compatible les rend serrées et à l'envers (toute capture cisaillée et retournée) ; la chaîne
gelait la **caméra** avec laquelle elle avait été bâtie (un film qui change de caméra en cours
continuait sur la première) ; `RenderPipeline.dispose` ne libère que son quad, donc chaque
chaîne évincée fuyait un G-buffer plein écran ; et `colorNode` écrasait la **carte de couleur**
de base, ce qui aurait rendu tout matériau texturé plat.

### 3.6 — TRAA : écarté, avec le motif

Le spec le donne en SHOULD, « si le motif GTAO n'a pas révélé de problème ». Il en a révélé un :
`traa` n'existe pas côté Compatible, donc l'ajouter au catalogue publierait un effet que la
moitié des projets ne peuvent pas dessiner — et le rendre visible demanderait une bibliothèque
d'effets consciente du moteur, c'est-à-dire l'UX que le spec met hors périmètre. Rien n'a été
laissé en place pour lui : ni son module de nœuds, ni un champ de budget. L'effet attend son
jumeau GL ou une UI par moteur.

### 3.7 — Ce que l'Avancé ne fait pas encore, écrit plutôt que découvert

- **Un ciel corrigé s'affiche tel que son fichier le contient.** La correction est une chaîne de
  passes GLSL écrites à la main (`skyGrading`) ; il n'y a pas d'équivalent en nœuds. Dit une fois
  dans le journal, jamais en silence.
- **Pas de minuterie GPU** : `EXT_disjoint_timer_query_webgl2` est au Compatible.
- **Pas de porte globale sur la passe d'ombres** : un renderer de nœuds n'a pas
  `shadowMap.needsUpdate`. Le resserrement lumière par lumière de `limitShadowUpdates` reste,
  et c'est sur lui que l'éditeur s'appuyait déjà.
- **L'aperçu incrusté** et les vingt-neuf effets GLSL restent au Compatible : le registre le dit
  effet par effet, et la chaîne Avancée laisse simplement de côté ce qu'elle ne sait pas bâtir.

## Ce qui reste ouvert

- **La comparaison visuelle GL/GPU**, sur le patch matériau comme sur GTAO. Le harnais de
  `world:validate` compare déjà deux représentations pixel à pixel ; l'entrée qui compare deux
  MOTEURS n'est pas écrite. Tant qu'elle ne l'est pas, « visuellement équivalent » n'est affirmé
  par personne dans ce rapport.
- **La capture d'export sur un projet `'gpu'`** : le chemin est mesuré (`stillMs` EST
  `captureStill`), l'image n'est pas jointe.
- Les vingt-neuf autres effets, l'aperçu incrusté et la correction de ciel côté Avancé.
- Le switch en direct du moteur : hors périmètre.
- SSGI : hors périmètre par décision du spec.
- TRAA : écarté, motif au § 3.6.
- Le choix du moteur par PROJET plutôt que par application, si le sélecteur doit vraiment vivre à
  la création : demande un champ de manifeste et sa validation.
- Coût réel des cascades et de l'anisotropie : à mesurer sur un banc GPU, qui n'existe pas encore
  dans ce dépôt.
