# Chantier C6 — Moteur de rendu Compatible (WebGL) / Avancé (WebGPU/TSL)

Date : 10 septembre 2026. Branche `feat/render-engine`, worktree `worktrees/render-engine`.
Machine : Apple M2 Max, macOS 26.5.2 (Darwin 25.6.0), arm64. three.js 0.185.1.

## Verdict

| Étape | Statut | Motif |
| --- | --- | --- |
| 1 — Gains WebGL indépendants | livrée, 1 MUST refusé sur mesure | Cascades, anisotropie et AgX livrés. `PCFSoftShadowMap` n'est pas le mode doux dans cette version de three : appliquer le MUST 1.1 aurait durci les ombres. |
| 2 — Interface driver + choix moteur | livrée, 1 écart d'emplacement | `RenderDriver`, `glDriver`, `gpuDriver` (stub), repli silencieux, `engines` dans le registre. Le sélecteur est dans les préférences 3D et non à la création de projet — motif plus bas. |
| 3 — Premier contenu GPU réel | livrée | `WebGPURenderer` monté, patch matériau en TSL, GTAO en nœud natif, lecture de pixels GPU, budget qualité partagé. Chiffres mesurés sur cette machine, plus bas. |
| 4 — Compléments (hors spec) | livrée | Parité visuelle GL/GPU mesurée et tenue par une porte, capture d'export Avancée jointe, moteur choisi à la création du document, TRAA porté et bibliothèque d'effets filtrée par moteur. |

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

Le sélecteur était donc dans l'espace 3D des préférences, avec la copie demandée
(« Compatible » / « Avancé »).

**Écart refermé à l'étape 4 : § 4.6.** Le choix est passé dans le monde du document de scène et
la préférence ne fait plus que pré-remplir le champ de « Nouveau document ».

Deux revues sur trois ont demandé de ne pas livrer le réglage tant qu'Avancé ne dessinait rien.
L'étape 3 l'a rendu caduc : le moteur Avancé dessine. Son aide dit maintenant ce qui reste vrai —
une machine sans adaptateur WebGPU retombe d'elle-même sur le Compatible et le note au journal.

### Registre post-processing

`PostEffectMeta.engines`, les trente effets existants en `['gl']`. Les `PostSlot` et la règle
`EXCLUSIVE` ne bougent pas. Le filtrage d'un effet par moteur n'était pas écrit à cette étape : il
n'avait aucun effet tant qu'aucun effet GPU n'existait, et un filtre qu'on ne peut pas voir tourner
est un filtre qu'on ne peut pas relire. **Écrit à l'étape 4, avec `traa` : § 4.8.**

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

**Mesurée à l'étape 4** : la comparaison visuelle GL/GPU du patch, § 4.1 et § 4.3.

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
levier est la correction sous-pixel. **Branchée à l'étape 4**, quand l'effet a été porté :
`GpuBudget.subpixelCorrection`.

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

### 3.6 — TRAA : écarté à l'étape 3, porté à l'étape 4

Le spec le donne en SHOULD, « si le motif GTAO n'a pas révélé de problème ». Il en a révélé un :
`traa` n'existe pas côté Compatible, donc l'ajouter au catalogue publiait un effet que la moitié
des projets ne peuvent pas dessiner — et le rendre visible demandait une bibliothèque d'effets
consciente du moteur, c'est-à-dire l'UX que le spec met hors périmètre.

**Cette UX a été autorisée depuis, et les deux sont livrés ensemble : § 4.8.**

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

## Étape 4 — Compléments (hors périmètre du spec, demandés après)

### 4.1 — Parité visuelle GL/GPU : `pnpm engines:parity`

`engineParity.browser.ts`, piloté par CDP sur `pnpm start:debug`, comme `world:validate`. Six cas,
chacun par la couture que le studio emprunte lui-même — pas une reconstitution.

🛑 **Condition : la fenêtre du studio doit être au premier plan.** Le harnais l'ATTEND (90 s) et
refuse de mesurer sans elle. Motif mesuré le 11 septembre 2026 : masquée, la même révision
rapportait 58 % de pixels différents sur une scène qu'elle dessine à l'identique devant. Une
fenêtre derrière une autre ne reçoit aucune image d'animation ; three fait avancer depuis SA
boucle d'animation le compteur sur lequel sont gardées les mises à jour `NodeUpdateType.FRAME`
(GTAO et TRAA en sont), et le moteur Compatible ne redessine une carte d'ombre que sur une image
qu'il juge périmée — sans image, toute surface reste dans une carte jamais dessinée, c'est-à-dire
noire.

| Cas | Taille | Pixels différents | Écart max sur un canal |
| --- | ---: | ---: | ---: |
| `scene` — la scène nue, sans composition | 128² | **0 %** | 3 |
| `occlusion` — la même sous GTAO | 128² | 2,76 % | 98 |
| `still` — `captureStill`, le chemin d'export | 1024² | 0,22 % | 65 |
| `film` — `renderFilm`, une image | 642 × 362 | **0 %** | 4 |
| `material` — patch matériau, cartes tuilées | 128² | 24,75 % | 126 |
| `temporal` — un effet temporel laissé hors d'une image unique | 1024² | 13,61 % | 74 |

Tolérance : 8 niveaux par canal. Les plafonds du runner sont ces mesures arrondies vers le haut,
jamais des cibles théoriques ; `material` n'en a pas — son écart est CONNU, et transformer une
divergence documentée en réussite ou en échec serait mentir dans les deux sens.

**Ce que ces chiffres disent, sans arrangement** : sur cette machine, les deux moteurs dessinent
la même scène. `scene` et `film` sont à zéro pixel différent — pas « proches » : identiques à la
tolérance d'encodage près. L'export est à 0,22 %.

### 4.2 — Trois défauts que cette comparaison a trouvés, et rien d'autre

1. **L'occlusion sortait ROUGE côté Avancé.** `GTAONode` rend son occlusion dans une cible
   `RedFormat` ; `getTextureNode()` donne donc `(ao, 0, 0, 1)`, et le multiplier tel quel dans
   l'image tuait le vert et le bleu. La fiche de three écrit `colour.mul(vec4(vec3(ao.r), 1))`.
   **Le banc mesurait ce que cette chaîne COÛTE ; personne n'avait regardé ce qu'elle dessine.**
2. **`blend` ne faisait rien côté Avancé.** Le paramètre est dans la fiche `gtao` et le `GTAOPass`
   GL l'applique (`blendIntensity`) ; la chaîne de nœuds l'ignorait — un curseur vivant qui ne
   changeait rien sur la moitié des projets.
3. **Un effet temporel donnait une image PLATE à l'export.** Un nœud qui résout contre les images
   précédentes reçoit un historique vide quand la chaîne est bâtie, dessinée puis libérée : une
   capture d'une scène portant `traa` revenait en un gris uni. `PostEffectMeta.temporal` le
   déclare et `gpuComposer` laisse ces effets hors de la surface `offscreen`.

Le harnais lui-même en a livré un quatrième, sur lui : une capture prise avant toute image lisait
des cartes d'ombre jamais dessinées côté Compatible — image noire — et aurait accusé l'autre moteur.

### 4.3 — L'écart connu, mesuré, non corrigé

La cavité tombe sur la couleur diffuse côté nœuds (§ 3.1). Sur un métal, dont three tire la teinte
spéculaire de cette même couleur, l'Avancé assombrit ce que le Compatible laisse tranquille :
**24,75 % des pixels, 126 d'écart maximal sur un canal**, sur une sphère à métallicité 0,6 portant
une rugosité et une métallicité tuilées quatre fois plus une cavité. Images :
`materiau-compatible.png`, `materiau-avance.png` — la différence se voit sur les faces sombres du
damier, pas sur sa forme.

### 4.4 — Une divergence antérieure à ce lot, mise au jour par le harnais

`temporal` mesure 13,61 % là où l'on attendrait zéro : les deux côtés sont le moteur Avancé, l'un
avec une pile dont la chaîne retire tout, l'autre sans pile. **Même image, deux tons.** Le rendu
droit du composeur passe par `setOutputRenderTarget`, celui du viewport sans composeur n'y passe
pas, et la transformation de sortie ne suit pas le même chemin. Retirer cette pose empire
franchement le résultat — 100 % des pixels, la lecture revient linéaire, mesuré le 11/09/2026 —
donc elle reste.

Cela touche **toute** scène Avancée portant une pile d'effets GLSL que ce moteur ne sait pas bâtir,
c'est-à-dire le cas courant : c'est antérieur à ce lot et hors de son périmètre. La correction
propre est que `SceneComposer.draw` RÉPONDE s'il a composé, et que l'appelant dessine droit
lui-même quand il n'a rien composé — un seul rendu droit dans le dépôt au lieu de trois. À faire
au lot suivant.

Le plafond de cette ligne est à 20 % pour cette raison : ce qu'elle garde est l'absence du gris
uni, qui porterait la ligne à 100 %.

### 4.5 — Capture d'export sur un projet Avancé

`capture-avance.png` (1024², `captureStill`) et `film-avance.png` (642 × 362, `renderFilm`),
toutes deux dessinées par le moteur Avancé, jointes à ce rapport.

642 délibérément : 642 × 4 = 2 568 octets, qui n'est pas un multiple de 256. WebGPU aligne une
copie texture → tampon sur 256 octets par ligne, et un lecteur qui garde le mou cisaille l'image
un peu plus à chaque ligne. 1 024 et 640 divisent proprement et ne prouvent rien là-dessus.

### 4.6 — Le moteur vit dans le DOCUMENT

L'écart de l'étape 2 est refermé. `SceneWorld.engine` : choisi à la création du document, écrit
dans son monde, relu à chaque montage de viewport et porté par l'export jeu (la scène d'ENTRÉE
décide, un jeu ne tenant qu'un renderer). `Settings.three.engine` ne sert plus qu'à pré-remplir le
champ ; son aide le dit, dans les quinze langues.

Le verrou « pas de switch après création » est donc vrai au sens fort : changer la préférence ne
touche aucune scène existante. Un document lu sur une machine dont la préférence dit le contraire
dessine comme son auteur l'a dessiné. Un fichier écrit avant que ce membre existe lit `gl`, qui est
ce avec quoi il a été dessiné.

🛑 **Un onglet monte AVANT que son fichier ait atterri** (`restoreDocument` lit le disque). Un
document enregistré en Avancé ouvre donc en Compatible et **reconstruit son renderer une fois**
quand son monde arrive — `useMountedSceneRenderer` prend le moteur en dépendance pour cela, au
prix d'un contexte graphique jeté. Un document neuf est semé avant que son onglet s'ouvre : il
monte une seule fois.

Attendre l'état plutôt que remonter a été essayé le 11 septembre 2026 et remis en arrière : un
onglet dont le document n'arrive jamais ne dessinerait alors plus rien du tout, ce qui est pire
qu'un contexte gâché (dix tests de `SceneDocument` l'ont montré). La correction propre est de
faire répondre `useRestoredDocument` la prêtitude que `restoreDocument` calcule déjà — à faire au
lot suivant.

Le champ est dans « Nouveau document », sous le modèle de départ et au-dessus de l'emplacement,
pour la seule sorte scène. Chaque option porte sa description ; aucune ligne d'aide sous le champ.

### 4.7 — Ce que `/code-review` a trouvé en plus

Neuf points, dont un **haut** : **un document en Avancé n'obtenait jamais le moteur Avancé dans
la session qui l'ouvre.** Le viewport lançait le chargement du bundle `three/webgpu` et, sur la
ligne suivante, demandait s'il était là — non — donc montait le Compatible, écrivait un repli au
journal qui n'en était pas un, et ne redemandait plus. `useRenderEngineReady` retient le montage
jusqu'à ce que ce chargement ABOUTISSE, y compris sur « cette machine n'a pas d'adaptateur », qui
est un repli et non une attente : rien ne peut donc rester en suspens.

Les huit autres, tous corrigés :

- `GTAONode` possède une cible plein écran `RedFormat` et un matériau que `RenderPipeline.dispose`
  n'atteint pas : chaque chaîne évincée en fuyait une ;
- une surface qui change la forme de sa pile abandonnait sa chaîne précédente jusqu'au balayage ;
- `maxSamples` répondait à DEUX questions — le plafond de la carte et ce à quoi le tampon de
  dessin est lissé — et une capture fixe perdait son anticrénelage ;
- `PostComposer` n'empilait pas d'applicateur pour un effet qu'il ne sait pas bâtir, alors que
  `draw` parcourt les deux listes par le même index : un effet GPU-only dans un créneau plus haut
  aurait donné les paramètres de l'un à la passe de l'autre ;
- supprimer le soleil et en ajouter un autre laissait les cascades debout pour un soleil mort, et
  la scène éclairée deux fois ;
- la liste d'effets lisait un registre non réactif dans un mémo, donc gelait ce qu'il disait au
  premier rendu.

### 4.8 — TRAA, et la bibliothèque filtrée par moteur

`traa()` porté tel quel (`three/addons/tsl/display/TRAANode.js`), catégorie `aa`, créneau `aa`,
`engines: ['gpu']`, sans paramètre — **trois 0.185 n'expose aucun nombre d'échantillons**, ses
échantillons étant des IMAGES d'une séquence de gigues fixe. Son seul levier qualité,
`useSubpixelCorrection`, est branché sur `gpuPostQuality` : le réglage qui coupe des échantillons
ailleurs coupe la correction ici.

La chaîne ajoute la vélocité au MRT **seulement** quand quelque chose reproject, et bâtit sa passe
de scène en `samples: 0` — un `PassNode` prend sinon le multi-échantillonnage du renderer, et
résoudre deux fois étale l'image.

**Ce que TRAA dessine, mesuré** : sur une chaîne persistante rendue une image par image
d'animation, **403 couleurs distinctes contre 101 sans lui** (sphère de 128², 12 mises à jour,
historique 128²) — c'est exactement ce qu'un anticrénelage temporel fait, remplir les teintes
intermédiaires le long des arêtes. Mesuré à la main le 11/09/2026 ; `engines:parity` ne peut pas
le mesurer, ses captures libérant leur chaîne à chaque image.

**La bibliothèque est filtrée par le moteur du document** (`effectsForEngine`) : un effet que la
chaîne laisserait tomber n'est plus proposé. Les lignes DÉJÀ dans une pile ne bougent pas — un
moteur ne rend pas un document faux.

**Angle mort assumé** : le filtre lit le moteur du DOCUMENT, pas celui qui a été monté. Une machine
sans adaptateur WebGPU retombe sur le Compatible et se voit encore proposer les effets Avancés,
que la chaîne écarte ensuite. Le repli est au journal ; cette liste dit ce que le document demande.

## Ce qui reste ouvert

- **La transformation de sortie du rendu droit du composeur** contre celle du viewport : 13,6 %
  d'écart de ton, § 4.4. Antérieure à ce lot, correction nommée, à faire au suivant.
- Les vingt-neuf autres effets, l'aperçu incrusté et la correction de ciel côté Avancé.
- Le switch en direct du moteur : hors périmètre, et désormais impossible par construction.
- SSGI : hors périmètre par décision du spec.
- **TRAA à l'export** : laissé de côté hors écran par construction (§ 4.2), y compris sur un film,
  dont la chaîne vivrait pourtant assez longtemps pour le résoudre à partir de la deuxième image.
  Distinguer un film d'une image fixe demanderait une surface de plus ; non fait.
- **La fenêtre de jeu ne suit pas le moteur du document** qu'elle joue, là où un export du même
  document le suit : son renderer est bâti avant que la scène arrive sur `gameChannel`. Écrit
  dans `GameWindow.tsx`. La correction est de retenir ce montage jusqu'à la première scène.
- Coût réel des cascades et de l'anisotropie : à mesurer sur un banc GPU, qui n'existe pas encore
  dans ce dépôt.
