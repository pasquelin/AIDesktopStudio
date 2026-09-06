# Batterie de tests — l'assistant face à l'application

La liste que l'assistant doit finir par passer, décidée par Alban le 2026-08-26. Elle vit ici
plutôt que dans `docs/` parce qu'elle est la **feuille de route du banc** (`pnpm banc`) : chaque
case cochée doit devenir un scénario mesurable, pas une impression.

## Lancer le banc

```bash
pnpm banc                 # trois passes par scénario
EVAL_RUNS=1 pnpm banc     # une seule, pour un aller-retour rapide
```

La clé se met **une fois** dans `secret/.env` — `EVAL_KEY=sk-…`. Le dossier entier est ignoré par
git et doit le rester : une clé commitée survit dans l'historique au commit qui la retire.

## Où en est le banc

La liste ci-dessous compte **472 demandes, et le banc en joue 472** (compté le 2026-09-07) — une par case, dans cet ordre.
`batterie.test.ts` tient les deux listes à la même longueur et dans le même ordre : une demande
ajoutée ici sans scénario fait rougir la porte, et un scénario écrit pour rien aussi. C'est ce qui
rend « on en est où ? » répondable.

## Ce que la batterie mesure

Le banc appelle `runConfirmedAction`, la porte que la fenêtre ET le serveur MCP franchissent, donc
il mesure le registre **entier**, que le fil porte désormais en entier lui aussi. `coverage.ts`
dit, action par action, quelle demande l'exerce, et le compilateur refuse une action qui n'y
répond pas. **Le compte se rejoue, il ne se recopie pas.**

🛑 **Un outil qu'aucune phrase n'atteint est un outil que personne n'a vu marcher.** La table est
un `Record<ActionName, …>` : une action ajoutée au registre **ne compile plus** tant qu'elle n'y
répond pas, fût-ce par une liste vide. `coverage.test.ts` tient le reste — un rang cité qui ne
nomme aucun scénario, et le rôle de ce qui reste sans mesure, **écrit en toutes lettres plutôt que
compté** : un compte reste vert le jour où un trou se comble pendant qu'un autre se creuse.

**Déclaré n'est pas mesuré**, et le rapport du banc écrit les deux : `MCP reached: N/305` compte ce
qu'une passe a vraiment appelé, et la ligne `declared covered, never reached` nomme les actions que
`coverage.ts` promettait et qu'aucun run n'a touchées.

**Ajouter une action au registre, c'est ajouter ses scénarios dans le même mouvement** : écrire
la ou les demandes ici, le scénario en face, et la brancher dans `coverage.ts`. Une famille livrée
sans cela part sur le fil MCP sans qu'aucune mesure ne la couvre.

## Le banc pilote le VRAI studio — 2026-08-25

**Les onze modules `fake*.ts` n'existent plus.** Ils réimplémentaient le studio et en divergeaient :
cinq mensonges comptés en une session, et sept autres trouvés le jour où le vrai exécuteur a pris
leur place. Ce qui reste est un décor de PORTS — le disque, le catalogue, l'API, git, l'atelier —
plus trois surfaces qu'une exécution sans fenêtre n'a pas : le dock, la modale de confirmation et
le panneau de génération.

🛑 **Un port n'est pas une règle.** Ce que le banc tient en mémoire, c'est ce que `better-sqlite3`,
le disque et le réseau répondraient ; ce qu'un geste VEUT DIRE vient toujours du studio.

**Cinq mensonges du banc ont été trouvés et réparés le 2026-08-26**, et chacun rendait un
scénario impassable ou récompensait une mauvaise réponse :

- **La rotation d'un NŒUD est en radians** — le banc la lisait en degrés (voir ci-dessous).
- **Les actions fichier répondaient `ok` nu** sur un chemin absent, là où le studio répond un
  `FileOutcome` qui NOMME le refus. Le modèle annonçait un déplacement qui n'avait pas eu lieu.
- **`command.runStudioCommand` n'était pas modélisée** : `scene.undo` et `scene.duplicate` répondaient `ok` et
  ne faisaient rien. Huit scénarios étaient scorés sur du vide. 🛑 **Le remède a créé l'inverse** —
  la passe du 25/08 le mesure plus haut : le vrai routeur refuse tout, faute de surface armée.
- **`target.select` lisait `targetId`**, un champ que le registre ne déclare pas — l'appel correct
  (`aimId`) armait donc l'id vide et répondait `ok`.
- **`models.readGenerationModelFields` ne nommait que `prompt`** : « utilise cette image comme référence » était
  littéralement impossible, et quatre demandes tournaient dessus.

**Les cibles étaient l'inverse — le banc en donnait PLUS que l'app.** `TARGETS_BY_KIND` n'en
publiait que pour l'image ; la scène et le montage n'en nommaient aucune, et le modèle inventait
`track-1`, `track-2` et la chaîne vide, huit refus sur une seule phrase. C'est l'**app** qui a
rattrapé : la scène publie ses nœuds, le montage ses pistes et ses clips.

**Les motifs comptés sur la passe du 25/08 sont plus haut, avec leurs chiffres.** Ceux d'avant
sont retirés d'ici : ils venaient des passes contre les `fake*.ts` et ne se comparent à rien.

🛑 **Un pourcentage global de ce banc ne se compare à rien tant qu'il tient sur quinze tirages.**
Ce qui se lit est la ligne d'UN scénario, et la seule comparaison qui vaut est celle qu'on peut
expliquer : « ce scénario ne pouvait pas passer, il passe ».

**Sept autres mensonges sont tombés avec les `fake*.ts`, et chacun a été trouvé par une garde,
pas par une relecture** — « le décor pose son décor sans un refus » et « aucun scénario ne se
passe en ne faisant rien » :

- **Une scène neuve n'est PAS vide.** Le modèle `empty` pose déjà trois lumières, et `basic` y
  ajoute un sol, une boîte et une caméra. « Ajoute une lumière directionnelle » était donc vrai
  avant que la personne parle, et un décor qui indexait « le nœud 0 » écrivait sur une lumière.
- **Une caméra naît à (0, 2, 6)**, une lumière à (5, 10, 7,5). Tout oracle qui lisait « déplacée
  hors de l'origine » était vrai d'emblée : ce qui se lit est la pose au moment où la personne a
  parlé, que le banc retient au `settle`.
- **Ouvrir une image crée DÉJÀ son calque.** Le décor en ajoutait un second, et tous les comptes
  de calques étaient décalés de un.
- **Un rail naît avec deux points**, donc « ajoute un point » se lit à trois.
- **Un squelette posé nomme déjà `LeftHand` et `RightHand`** : ce que `rig.configureHands` ajoute, ce sont
  les doigts.
- **Une copie s'appelle « … 2 »**, jamais « copie de … » : c'est `planFiles` qui la nomme.
- **`path.addPoint` prend les trois axes ou aucun** — en nommer un seul est un `badInput`.

🛑 **Ce qu'aucun décor ne peut poser sans fenêtre est dit plutôt que simulé** : `rig.fit` lit les
bornes que le MOTEUR mesure, et la dictée n'a ni micro ni moteur. Ces scénarios sont scorés sur
l'appel que le studio a ACCEPTÉ, et leur oracle le dit.

🛑 **Ce que le banc tient pour le dock est un ABONNEMENT, jamais une enveloppe autour d'un appel.**
La chaîne de la fenêtre (`useAssistant.say` → `ranAll`) atteint `runConfirmedAction` directement :
une enveloppe autour de `studio.run` voit les appels du DÉCOR et aucun de ceux du modèle. Écrite
ainsi, elle laissait tout « ouvre puis agis » refuser `wrongSurface` et `références` vide — donc
quatre demandes de la section 21 impassables, en silence. `batterie.test.ts` en fait foi
désormais, sur le chemin du modèle.

🛑 **Une case cochée à la main ne vaut rien.** Toutes les erreurs de la session du 25/08 étaient
annoncées comme des succès par le modèle lui-même, et une passe unique a donné 60 % là où trois
passes donnaient 0 %. Ce qui compte est ce que le studio CONTIENT après coup — et c'est la seule
chose qu'un oracle lit ici.

## La première passe contre le vrai studio — 2026-08-25

DeepSeek (`deepseek-chat`), `EVAL_RUNS=3`, 364 scénarios : **58 %**. **163 scénarios à 3/3**, 51 à
2/3, 41 à 1/3, et **109 à 0/3** — ces derniers sont les seuls qui se lisent, un 0/3 étant une panne
et non un tirage.

**Coût RÉEL, à substituer à toute extrapolation** : **1 h 26** (21 h 51 → 23 h 17), 3 187 rounds,
583 refus, **19 247 tokens par round dont 90 % servis par le cache**, soit ~61 M de tokens envoyés.
L'estimation qui annonçait 3 h 20 se trompait d'un facteur deux, et c'est le cache qui l'explique :
le briefing est identique d'un round à l'autre.

🛑 **Ce 58 % ne se compare à AUCUN chiffre antérieur.** Les quatre passes du 2026-08-26 (58, 63, 62,
61 %) ont été jouées contre les `fake*.ts`. Les seize cases qu'elles avaient cochées ont toutes été
remises à `[ ]` avant cette passe, et les 163 cochées ici le sont sur un **3/3 de cette passe-ci**,
rien d'autre. Un 3/3 est trois tirages, pas trois passes : il sépare 0/1 de 1/1, il ne dit pas
qu'un scénario tiendra demain.

**`MCP reached: 200/230`.** Les trente actions que `coverage.ts` déclarait couvertes et qu'aucun
run n'a touchées — chacune est un outil publié sur le fil MCP que personne n'a vu marcher :
`prompt.describeStyle`, `actions.find`, `files.undoFileOperation`, `files.redoFileOperation`, `files.canUndoRedo`,
`cost.estimate`, `job.cancelCloudGeneration`, `asset.reveal`, `layer.editShapeLayer`, `guide.remove`, `clip.speed`,
`track.add`, `skybox.setSourceImage`, `cloud.explorePublicFeed`, `cloud.pull`, `node.setPrimitiveParameters`, `model.textures`,
`bone.remove`, `animation.removeBlock`, `animation.setBlockSettings`, `key.writeKeysOnOpenChannels`, `git.diff`, `git.stage`,
`git.unstage`, `git.restore`, `git.stashPop`, `git.stashDrop`, `context.deleteProjectCard`, `settings.triggerAction`,
`accounts.activate`.

### Ce que les chaînes disent, par volume

Ces comptes portent sur les **runs RATÉS seuls** — le rapport n'imprime la chaîne que d'un run qui
échoue. 1 440 appels y sont visibles, 769 `ok` et 390 refusés.

- **133 runs ratés n'ont fait AUCUN appel**, répartis sur **80 scénarios**. C'est le premier défaut,
  et de loin : le modèle répond en prose au lieu d'agir. 18 posent une question, 29 affirment ne pas
  trouver, le reste affirme autre chose. « Quelle piste audio ? Je vois deux pistes audio dans le
  document » est la forme pure du motif — il VOIT la réponse et demande quand même.
- **384 appels sont le rejeu mot pour mot d'un appel déjà REFUSÉ**, soit 27 % des appels visibles.
  **Zéro** appel est rejoué après un `ok` : des deux moitiés de la règle ajoutée à `WIDE_RULES`,
  celle qui vise le `ok` a mordu, celle qui vise le refus n'a rien changé.
- **178 `badInput` et 143 `wrongSurface`** dans les chaînes. Les deux plus gros nids sont écrits
  ci-dessous : ce sont des défauts du banc et du produit, pas du modèle.
- **Sept `<placeholder>` entre chevrons** subsistent (`<modelNodeId>`, `<shotId>`…), mais le motif a
  changé de forme plutôt que de disparaître : le modèle écrit maintenant des noms de VARIABLE nus —
  `nodeId=rimLightId`, `shotId=shotId`, `assetIds=asset-4`. 🛑 **Non comparable aux 23 d'avant** :
  cinq passes de 192 scénarios à un run contre une passe de 364 à trois runs.
- **Non mesuré** : « il écrit une valeur absolue là où la phrase dit _de plus_ ». Le compter
  demande de croiser chaque énoncé avec son état de départ, ce que le log ne porte pas.

### Trois nids de refus, et aucun n'est la faute du modèle

🛑 **`command.runStudioCommand` ne peut PAS marcher au banc, et c'est un mensonge du banc, pas un progrès.**
86 refus `wrongSurface` sur 13 scénarios, **2 succès sur 88 appels** — et les deux étaient
`window.fullScreen`. Le fake d'avant répondait `ok` sans rien faire ; le vrai passe par
`commandRouter`, qui publie sur un bus auquel les **surfaces montées** s'abonnent. Sans fenêtre,
rien n'est armé : `noSurface` → `wrongSurface`, pour `scene.undo`, `scene.capture`, `scene.snap`,
`scene.space` comme pour toute commande qu'un document possède. **Toute la section 29 (annuler,
refaire) est donc impassable au banc.** Qu'elle marche en production, dock monté, est une
déduction que rien ici ne mesure. Ce qui reste mesurable de ces scénarios est ce que le modèle
CHOISIT, et il choisit juste.

🛑 **`rigHandlers.model()` dit `wrongSurface` pour « ce nœud n'est pas un modèle » — défaut de
PRODUCTION.** Le helper rend `null` pour deux causes distinctes : aucune scène devant, ou un nœud
qui n'est pas un `ModelNode`. Les deux retombent sur le même refus. Mesuré sur `13.5` :
`scene.state` répond `ok` — la scène EST devant — et `animations.list` refuse `wrongSurface` seize fois de suite
parce que la cible est une sphère. Le refus envoie le modèle réparer ce qui n'est pas cassé : il
réactive le document, rouvre l'espace 3D, recommence. `notFound` est le mot juste et il existe
déjà. 36 refus sur 4 scénarios.

**`camera.aimShotAt` exige un `shotId` que rien ne publie.** Même motif que celui qui a fait publier
les nœuds et les pistes : le briefing ne nomme aucun plan de caméra, donc le modèle envoie l'id du
nœud caméra, ou `shotId=shotId`. 15 `badInput`. Les plans sont restés hors de ce qui a été
publié avec les nœuds et les clips — à arbitrer.

### Ce que la passe a fait corriger, dans le PRODUIT

Neuf défauts trouvés par ces chaînes, tous côté studio et non côté banc. Ils sont dans le même lot
que cette mesure, donc **les 163 cases ci-dessous datent d'AVANT eux** : la passe suivante les
réécrit.

- **Un champ de LISTE refusait une valeur seule** (`readInput`). `assetIds: "asset-4"` valait
  `badInput`, dix-huit fois dans une seule demande.
- **`badInput` ne nommait rien** (`inputProblem`). Un refus dit désormais QUEL champ et CE QU'IL
  PREND, jusqu'au client MCP et jusque dans l'historique que le modèle relit. C'est le remède aux
  384 rejeux mot pour mot.
- **Un nœud ne se désignait que par son id** (`nodeAimed`). Il s'atteint maintenant par son NOM
  quand un seul nœud le porte — deux qui le partagent n'en désignent aucun, un choix silencieux
  éditant le mauvais objet.
- **`wrongSurface` disait « ce nœud n'est pas un modèle »** (`rigHandlers`). C'est `notFound`.
- **`node.addModel` et `world.setSceneLighting` acceptaient un asset INEXISTANT** — `<skyboxId>`, le
  placeholder épelé, était écrit dans la scène et le client répondu `ok`. Les deux passent par
  `withAsset`.
- **`scene.undo` et `scene.redo` vivaient dans le composant du viewport** : hors de portée du menu
  natif comme d'un client MCP. Ils sont dans `runSceneCommand`, avec le reste.
- **Une édition qui n'écrit rien de neuf s'empilait dans l'historique** (`editNode.refuses`) : un
  transform envoyé trois fois coûtait trois ⌘Z pour reprendre un seul changement.
- **Le décor ne branchait ni la copie de fichiers ni l'écriture d'un asset** : `files.copy`
  répondait `ok` avec un lot VIDE — le stub — et taguer un asset ne gardait rien.
- **`read.openedFile` lisait `path || title`** : ouvrir une image fait un document image, dont le
  chemin est `documents/<nom>.ora`. Le scénario `2.1` ne pouvait pas passer.

🛑 **Ce qui reste et qui n'a pas été tranché** — chacun est une décision, pas un oubli :

- **`command.runStudioCommand` répond `ok` quand la commande n'a rien à faire.** `scene.undo` sur une pile vide
  est un `ok`, donc un modèle en envoie neuf et défait le décor. Le faire savoir demande que le
  BUS de commandes remonte une réponse, ce qu'il ne fait pas : il publie et n'écoute rien.
- **Les autres scopes du bus restent hors de portée sans fenêtre** — `canvas`, `sequence`,
  `material`, `skybox`. Leur logique vit dans des composants, contrairement à `runSceneCommand`.
- **Les plans de caméra ne sont publiés nulle part**, d'où `camera.aimShotAt shotId=shotId`.
- **Une skybox du dossier `Skyboxes/` est indexée `image`** — son extension est `.png`, et
  `assets.searchProjectCatalogue type=skybox` ne trouve rien. Vrai dans le studio comme au banc.
- **`activity.read`, `assets.captionImages` et les canaux `provider.*` ne sont pas modélisés** : les
  scénarios qui les exercent mesurent un port vide.

## Ce que le banc ne mesure pas — le second cloud, 2026-08-31

**Aucun scénario n'atteint Tripo, et c'est un trou déclaré plutôt qu'une couverture.** Ses modèles
ne viennent pas du port API que le décor fake : ils viennent d'un catalogue en DONNÉES
(`shared/domain/tripo.ts`), publié au registre seulement si un compte Tripo est actif. Le décor
n'en tient aucun, donc `models.search` n'en rend aucun et aucune phrase ne peut nommer un
identifiant `tripo:`.

Ce que la porte tient quand même : les 251 actions sont inchangées — la génération passe par
`models.search`, `generator.prepare` et `generator.submit`, qui existaient déjà — et le chemin
complet est couvert par des tests unitaires, du catalogue jusqu'au routeur. Ce qu'aucune mesure ne
dit : qu'un vrai modèle, mis devant cette application, choisisse Tripo quand on le lui demande.

## Quatre unités que le banc a d'abord lues de travers

Elles sont écrites ici parce qu'aucune ne se devine et que chacune a rendu une section entière
fausse — un modèle qui répondait JUSTE échouait, et un qui répondait faux passait.

- **Le montage compte en MICROSECONDES**, pas en secondes (`sequenceActions.ts`, en-tête). Trois
  secondes s'écrivent `3_000_000`.
- **Un gain est en DÉCIBELS**, borné `GAIN_MIN`/`GAIN_MAX`, neutre à **0** — pas une fraction.
  « Mets le son à 50 % » vaut **−6 dB**, et un banc lisant `0.5` récompensait +0,5 dB.
- **Une rotation est en RADIANS dans l'ÉTAT, des deux côtés** — et c'est l'ACTION qui diffère.
  `node.transform` prend des radians et l'écrit dans son libellé ; `layer.transform` prend des
  DEGRÉS et convertit exprès, « a client writing 90 for a quarter turn is right more often than
  one writing 1.5707963 ». Un oracle lit l'état : il compare donc en radians dans les deux cas,
  et l'ancien banc, qui stockait des degrés pour un calque, récompensait la mauvaise réponse.
- **La pile de calques a l'index 0 EN BAS** (`engines/canvas/commands.ts`), à l'inverse du
  réflexe. « Passe ce calque derrière » est donc `index: 0`.

## Comment un scénario est écrit

Un scénario porte **ce que la personne dit** (une phrase, ou plusieurs quand l'enchaînement EST le
sujet — sections 25 et 26), un **décor** posé par le banc lui-même, et un **oracle** qui lit l'état
du studio simulé.

Le décor n'est pas une facilité : « Dans la scène Test MCP » est une phrase de la batterie, pas une
demande. Le faire rejouer au modèle à chaque case scorerait quarante fois la même étape et ferait
tomber une section entière sur son premier échec.

**Ce qu'un oracle ne lit JAMAIS, ce sont les mots du modèle.** `said` ne sert qu'à deux choses :
vérifier qu'une question a bien été **renvoyée** à la personne (section 30), et qu'une demande de
lecture a reçu **une** réponse. Jamais comme preuve qu'une action a eu lieu.

🛑 **Le décor est neutralisé avant que la personne parle** (`studio.settle()`). Sans cela, un décor
qui construit quoi que ce soit marquait le document modifié et remplissait la pile d'annulation :
les dix-sept scénarios en lecture seule — toute la section 30 comprise — étaient **impassables**,
et rien ne le disait.

🛑 **Un décor ne doit jamais poser la conclusion.** `batterie.test.ts` vérifie qu'aucun de ses
appels n'est refusé — un décor refusé en silence laisse le scénario jouer sur un studio vide, et
l'échec est imputé au modèle. Ce qu'il ne peut PAS voir, en revanche, c'est un décor qui pose déjà
le résultat : ça se relit à la main, et sept l'avaient fait.

---

## 1. Compréhension du projet — lecture seule

- [ ] « Quel projet est actuellement ouvert et quels documents sont ouverts ? »
- [x] « Liste-moi les fichiers présents dans mon projet, classés par type. »
- [x] « Combien ai-je d'images, de vidéos, de fichiers audio, de modèles 3D et de skyboxes ? »
- [x] « Quel document est actuellement actif ? »
- [ ] « Quels sont les éléments présents dans la scène 3D actuellement ouverte ? »
- [ ] « Quelles caméras et quelles lumières sont présentes dans ma scène ? »
- [x] « Donne-moi les propriétés de la caméra de la scène. »
- [x] « Quelle est la durée actuelle de ma timeline ? »
- [x] « Quels éléments sont actuellement sélectionnés ? »

## 2. Navigation dans l'application

- [ ] « Ouvre mon image du bateau. »
- [ ] « Ouvre ma première vidéo. »
- [x] « Ouvre mon premier fichier audio. »
- [ ] « Ouvre ma scène 3D. »
- [ ] « Ouvre la texture utilisée par mon premier modèle 3D. »
- [ ] « Ouvre ma première skybox. »
- [x] « Reviens sur la scène 3D. »

## 3. Recherche intelligente d'assets

- [x] « Trouve-moi l'image qui représente un bateau. »
- [x] « Trouve-moi tous les modèles 3D de personnages. »
- [ ] « Trouve-moi les fichiers qui pourraient être utilisés comme environnement. »
- [x] « Trouve-moi toutes les textures associées à mon modèle 3D actuel. »
- [x] « Trouve-moi tous les fichiers audio utilisables dans un montage vidéo. »
- [x] « Trouve-moi les assets générés par IA qui concernent une voiture. »

## 4. Gestion des fichiers et dossiers

- [x] « Crée un dossier Tests Assistant dans mon projet. »
- [x] « Dans Tests Assistant, crée un sous-dossier Images. »
- [x] « Duplique l'image du bateau dans ce dossier. »
- [ ] « Renomme cette copie bateau-test.png. »
- [ ] « Déplace bateau-test.png dans le sous-dossier Images. »
- [x] « Vérifie que le fichier existe bien à son nouvel emplacement. »
- [x] « Supprime bateau-test.png. »
- [ ] « Supprime les dossiers de test que nous venons de créer. »

## 5. Création de documents

- [x] « Crée une nouvelle scène 3D vide appelée Test MCP. »
- [x] « Crée un nouveau montage vidéo appelé Test Video. »
- [x] « Crée un nouveau montage audio appelé Test Audio. »
- [ ] « Ferme Test Audio sans supprimer le fichier. »
- [x] « Rouvre Test MCP. »

## 6. Manipulation simple d'une scène 3D

Dans la scène Test MCP :

- [ ] « Ajoute un cube au centre de la scène. »
- [x] « Renomme le cube Cube Test. »
- [x] « Place Cube Test à X 2, Y 1, Z -3. »
- [x] « Double sa taille. »
- [x] « Fais-le pivoter de 45 degrés sur l'axe Y. »
- [x] « Ajoute une sphère à droite du cube. »
- [ ] « Place la sphère exactement 2 mètres à droite du cube. »
- [ ] « Duplique la sphère et place la copie à gauche du cube. »
- [x] « Renomme les deux sphères Sphere Droite et Sphere Gauche. »
- [x] « Perce une fenêtre dans le mur avec le cube. »
- [x] « Fusionne le mur et le cube en une seule forme. »
- [x] « Ne garde que la partie où le mur et le cube se chevauchent. »
- [x] « Sépare ce solide et rends-moi les formes d'origine. »
- [ ] « Marque le cube comme outil, puis fusionne-le avec le mur. »
- [ ] « Retire au cube sa marque d'outil. »
- [ ] « Ce pli est parti à l'envers, refais-le dans l'autre sens. »

## 7. Manipulation relative — important

- [ ] « Déplace Cube Test d'un mètre vers le haut. »
- [ ] « Déplace Sphere Droite de 50 cm vers la droite. »
- [ ] « Fais tourner Cube Test de 20 degrés supplémentaires sur Y. »
- [ ] « Réduis Sphere Gauche de moitié. »
- [ ] « Place Sphere Gauche exactement au-dessus de Cube Test. »

L'assistant doit lire les valeurs **actuelles** avant d'appliquer une transformation relative.

## 8. Lumières

- [ ] « Ajoute une lumière directionnelle à la scène. »
- [x] « Renomme-la Soleil Test. »
- [ ] « Augmente son intensité de 25 %. »
- [ ] « Ajoute une lumière ponctuelle au-dessus du cube. »
- [ ] « Réduis son intensité de moitié. »
- [x] « Désactive Soleil Test. »
- [ ] « Réactive Soleil Test. »

## 9. Caméras

- [x] « Ajoute une nouvelle caméra appelée Camera Test. »
- [ ] « Place Camera Test face au cube. »
- [ ] « Oriente Camera Test pour qu'elle regarde Cube Test. »
- [ ] « Éloigne Camera Test de 2 mètres sans changer la cible qu'elle regarde. »
- [ ] « Fais de Camera Test la caméra active. »
- [x] « Donne-moi maintenant sa position et sa rotation. »

## 10. Environnement 3D

- [ ] « Active la grille de la scène. »
- [ ] « Change l'environnement pour utiliser ma première skybox. »
- [x] « Réduis l'intensité de l'environnement à 0,7. »
- [x] « Active les ombres. »
- [ ] « Mets la qualité des ombres au niveau le plus élevé disponible. »
- [ ] « Change l'arrière-plan sans changer l'éclairage de la scène. »
- [ ] « Éclaire ma scène avec mon ciel Ciel Test. »
- [ ] « Passe la navigation 3D en schéma Blender. »
- [ ] « Cadre le cube et garde-le dans la vue même s'il bouge. »

## 11. Import d'assets dans une scène

- [ ] « Ajoute mon premier modèle 3D dans Test MCP. »
- [x] « Place-le au centre de la scène. »
- [x] « Adapte automatiquement sa taille pour qu'il soit visible correctement. »
- [x] « Place Camera Test pour cadrer entièrement ce modèle. »
- [ ] « Ajoute une deuxième instance du même modèle à sa droite. »

## 12. Matières et matériaux d'un modèle

- [x] « Sélectionne le modèle 3D que nous venons d'ajouter et donne-moi ses matériaux. »
- [x] « Change la couleur de base de son premier matériau en rouge. »
- [x] « Mets sa rugosité à 0,25. »
- [x] « Mets son métal à 0,8. »
- [ ] « Assigne une texture de mon projet à sa couleur de base. »
- [ ] « Ajoute une normal map si une texture compatible existe dans le projet. »
- [x] « Remets le matériau dans son état précédent. »
- [ ] « Habille ce modèle importé avec la matière nommée Pierre. »
- [ ] « Mets la matière Pierre sur son deuxième emplacement de matière. »
- [ ] « Recouvre plutôt ce modèle de l'image de planches de chêne, sans matière. »
- [ ] « Finalement retire-lui son habillage : qu'il reprenne celui de son propre fichier. »

## 13. Timeline 3D

- [ ] « Mets la durée de la scène à 10 secondes. »
- [ ] « Anime Cube Test pour qu'il parte de sa position actuelle à 0 seconde et arrive 5 mètres plus haut à 5 secondes. »
- [ ] « À 10 secondes, fais-le revenir à sa position initiale. »
- [x] « Ajoute une rotation complète du cube entre 0 et 10 secondes. »
- [ ] « Fais commencer l'animation de Sphere Droite à 2 secondes. »
- [ ] « Supprime uniquement l'animation de rotation du cube sans supprimer son animation de position. »

## 14. Animation de caméra

- [x] « Anime Camera Test pour qu'elle se rapproche progressivement du cube entre 0 et 5 secondes. »
- [ ] « Pendant son déplacement, garde la caméra orientée vers Cube Test. »
- [ ] « Entre 5 et 10 secondes, fais tourner la caméra autour du cube. »
- [x] « Vérifie qu'à aucun moment la caméra ne perd Cube Test de vue. »

## 15. Montage vidéo

Dans Test Video :

- [ ] « Ajoute ma première vidéo sur la piste V1 au début de la timeline. »
- [ ] « Ajoute une deuxième vidéo juste après la première. »
- [ ] « Coupe les deux premières secondes du premier clip. »
- [ ] « Déplace le deuxième clip pour qu'il commence immédiatement après le premier. »
- [ ] « Ajoute mon image du bateau pendant 3 secondes après les vidéos. »
- [ ] « Mets l'image du bateau à l'échelle pour remplir le cadre sans la déformer. »

## 16. Audio dans le montage vidéo

- [ ] « Ajoute mon premier fichier audio sur A1 au début du montage. »
- [x] « Réduis son volume à 50 %. »
- [x] « Fais un fondu d'entrée d'une seconde. »
- [x] « Fais un fondu de sortie de deux secondes. »
- [x] « Coupe l'audio exactement à la durée du montage vidéo. »

## 17. Montage audio

Dans Test Audio :

- [ ] « Ajoute mes deux fichiers audio sur deux pistes différentes. »
- [ ] « Fais commencer le deuxième à 3 secondes. »
- [ ] « Mets le premier à 70 % de volume. »
- [ ] « Mets le deuxième à 40 %. »
- [ ] « Fais un fondu entre les deux morceaux. »

## 18. Édition d'image

Sur une copie de l'image du bateau :

- [x] « Duplique cette image avant de la modifier. »
- [ ] « Renomme la copie bateau-edition-test. »
- [x] « Réduis son opacité à 70 %. »
- [ ] « Déplace-la de 100 pixels vers la droite. »
- [ ] « Augmente sa taille de 20 %. »
- [x] « Fais-la pivoter de 15 degrés. »
- [x] « Remets uniquement la rotation à zéro. »

## 19. Calques image

- [ ] « Ajoute une deuxième image comme nouveau calque au-dessus du bateau. »
- [x] « Renomme ce calque Overlay Test. »
- [x] « Mets Overlay Test à 50 % d'opacité. »
- [x] « Passe Overlay Test derrière le bateau. »
- [ ] « Masque Overlay Test. »
- [ ] « Réaffiche Overlay Test. »
- [x] « Supprime uniquement Overlay Test. »

## 20. Génération IA simple

- [ ] « Génère une image photoréaliste d'une voiture rouge dans une rue de Paris. »
- [ ] « Enregistre le résultat dans Images. »
- [ ] « Génère une deuxième variante à partir de cette image. »
- [ ] « Utilise l'image générée comme référence et transforme la voiture rouge en voiture bleue. »
- [ ] « Conserve les deux versions dans le projet. »

## 21. Génération IA avec contexte du projet

- [ ] « Utilise l'image du bateau de mon projet comme référence et génère une variante de nuit. »
- [ ] « Utilise cette nouvelle image comme référence pour créer une version sous une tempête. »
- [ ] « Génère une texture inspirée des couleurs du bateau actuellement ouvert. »
- [ ] « Génère un environnement cohérent avec l'image du bateau. »

## 22. Génération 3D

- [ ] « Génère un modèle 3D d'un coffre en bois. »
- [x] « Ajoute le résultat dans mon projet. »
- [ ] « Ouvre le modèle généré. »
- [ ] « Ajoute-le à Test MCP. »
- [ ] « Place-le devant Cube Test. »
- [ ] « Adapte sa taille pour qu'il fasse environ un mètre de large. »

## 23. Raisonnement multi-documents

- [ ] « Prends l'image du bateau, ajoute-la au montage vidéo Test Video pendant 5 secondes et ajoute un de mes fichiers audio en fond sonore. »
- [ ] « Utilise ma skybox actuelle comme environnement de Test MCP puis place mon modèle 3D principal dans la scène. »
- [ ] « Trouve une texture compatible avec le modèle actuellement sélectionné et applique-la sans modifier les autres matériaux. »

## 24. Commandes naturelles volontairement imprécises

Ne rien donner de plus au modèle.

- [ ] « Mets le bateau dans ma vidéo. »
- [ ] « Mets la voiture dans la scène. »
- [x] « Fais le cube un peu plus gros. »
- [ ] « Éclaire mieux mon modèle. »
- [ ] « Cadre correctement le personnage. »
- [ ] « Fais durer ça deux secondes de plus. »
- [ ] « Mets le son moins fort. »
- [ ] « Fais regarder la caméra vers le personnage. »
- [x] « Utilise cette image comme texture. »
- [x] « Fais une variante de ça. »

On vérifie qu'il exploite le contexte, et qu'il ne demande une précision que lorsque
l'ambiguïté empêche réellement d'agir.

## 25. Références conversationnelles

À la suite, sans repartir de zéro :

- [ ] « Ajoute un cube. »
- [x] « Mets-le à droite. »
- [ ] « Duplique-le. »
- [ ] « Mets la copie à gauche. »
- [x] « Agrandis-la. »
- [ ] « Fais-les tourner de 45 degrés. »
- [ ] « Supprime le premier. »
- [ ] « Centre celui qui reste. »

`le`, `la`, `les`, `celui qui reste` doivent garder la bonne référence d'un tour à l'autre.

## 26. Modification après interrogation

- [x] « Quelle est la position de Cube Test ? »
- [ ] « Ajoute 2 à sa valeur Y. »
- [ ] « Quelle est maintenant sa position ? »

Puis :

- [x] « Quelle est l'intensité de Soleil Test ? »
- [ ] « Multiplie-la par deux. »
- [ ] « Vérifie la nouvelle valeur. »

Lecture → calcul → écriture → relecture.

## 27. Actions conditionnelles

- [ ] « Si Test MCP contient déjà une caméra appelée Camera Test, ne la recrée pas ; sinon crée-la. »
- [x] « Si le cube existe, mets-le à Y = 0 ; sinon crée un cube à Y = 0. »
- [ ] « Si une skybox est déjà utilisée, donne-moi son nom avant de la remplacer par ma deuxième skybox. »
- [ ] « Ajoute une lumière seulement s'il n'y a actuellement aucune lumière directionnelle. »

## 28. Actions en masse

- [x] « Sélectionne tous les objets 3D sauf les caméras et les lumières. »
- [x] « Déplace tous ces objets d'un mètre vers le haut. »
- [ ] « Réduis tous les fichiers audio du montage à 60 % de volume. »
- [ ] « Masque tous les calques image sauf celui du bateau. »
- [x] « Donne-moi la liste des éléments que tu viens de modifier. »

## 29. Undo / sécurité

- [x] « Déplace Cube Test à X = 50. »
- [ ] « Annule ma dernière modification. »
- [ ] « Vérifie que Cube Test est revenu à sa position précédente. »
- [x] « Supprime Sphere Droite. »
- [ ] « Annule la suppression. »
- [ ] « Vérifie que Sphere Droite existe de nouveau. »

## 30. Protection contre les mauvaises interprétations

- [ ] « Supprime le bateau. » — asset, calque, instance, document ou fichier : il doit distinguer.
- [ ] « Supprime tout. » — une destruction globale de portée ambiguë ne s'exécute pas à l'aveugle.
- [ ] « Remplace toutes mes textures. » — il doit savoir par quoi avant de toucher à quoi que ce soit.
- [ ] « Mets le fichier Images/fais moi un bateau.png à la corbeille. » — la personne répond NON à la carte : le fichier reste.

## 31. Planification complexe

En une seule phrase :

- [ ] « Crée une scène 3D vide appelée Demo Assistant, ajoute mon modèle 3D principal au centre, ajoute une caméra qui le cadre entièrement, utilise ma première skybox comme environnement, ajoute une lumière directionnelle, règle la durée à 10 secondes et fais faire un tour complet au modèle pendant ces 10 secondes. »

## 32. Cross-media complexe

En une seule phrase :

- [ ] « Crée un montage vidéo de test avec mon image du bateau pendant 5 secondes, ajoute ensuite ma première vidéo, ajoute un fond sonore depuis mes fichiers audio, règle le son à 40 %, ajoute un fondu au début et assure-toi que le montage se termine exactement à la fin du dernier clip vidéo. »

## 33. IA + projet + édition

En une seule phrase :

- [ ] « Utilise mon image du bateau comme référence pour générer une version de nuit, ajoute le résultat dans mon projet, crée un nouveau montage vidéo, affiche l'image originale pendant 3 secondes puis la version de nuit pendant 3 secondes et ajoute un de mes fichiers audio en fond. »

## 34. Compréhension autonome d'une scène

- [x] « Analyse la scène 3D actuelle et dis-moi ce qui pourrait poser problème avant de modifier quoi que ce soit. »
- [ ] « Corrige automatiquement les problèmes simples que tu peux résoudre sans changer l'intention de la scène. »
- [x] « Dis-moi précisément ce que tu as changé. »

## 35. Vérification après action

- [ ] « Vérifie que toutes les actions que je t'ai demandé d'effectuer sur Test MCP ont réellement été appliquées. »
- [x] « Compare l'état actuel de la scène avec ce que je t'ai demandé. »
- [x] « Liste uniquement les actions qui n'ont pas produit le résultat attendu. »

## 36. Final — « directeur de studio »

Dans une scène neuve :

- [ ] « Je veux une petite scène avec mon personnage principal au centre, un éclairage de studio, une caméra qui le cadre entièrement et un environnement adapté. Fais la scène toi-même en utilisant ce qui existe déjà dans mon projet. Ajoute ensuite une animation de caméra de 5 secondes qui se rapproche doucement du personnage tout en continuant à le regarder. Ne génère aucun nouvel asset si ce n'est pas nécessaire. »

Puis, sans autre contexte :

- [ ] « Transforme maintenant cette scène en un montage vidéo de 10 secondes, ajoute une musique de mon projet adaptée et prépare le montage pour l'export. »

Enfin :

- [x] « Vérifie tout ce que tu viens de faire et indique-moi les éventuelles erreurs ou incohérences restantes. »

## 37. Le ciel

Un ciel ouvert, `Ciel Test` — **l'espace, jamais le fichier** : un `.png` de `Skyboxes/` s'ouvre en
document IMAGE, et tout `skybox.*` est alors refusé avant d'atteindre un gestionnaire.

- [x] « Quelle image sert de ciel en ce moment, et à quelle intensité ? »
- [ ] « Utilise ma première skybox comme image de ce ciel. »
- [x] « Monte l'intensité du soleil à 3. »
- [x] « Réduis l'intensité de l'environnement du ciel à 0,4. »
- [x] « Augmente le contraste et la saturation de ce ciel. »
- [x] « Remets les réglages colorimétriques du ciel à zéro. »
- [x] « Affiche les sondes de lumière de ce ciel. »

## 38. La matière

Une matière ouverte, `Matière Test` — même remarque que pour le ciel : c'est l'espace qui l'ouvre.

- [x] « De quoi est faite cette matière et quelles images porte-t-elle ? »
- [x] « Mets sa couleur de base en bleu. »
- [ ] « Assigne ma texture de planches à son canal de couleur de base. »
- [ ] « Ajoute la normal map correspondante sur son canal de relief. »
- [ ] « Fais tourner l'aperçu de la matière et monte l'intensité de son environnement. »
- [ ] « Éclaire cet aperçu avec mon ciel Ciel Test. »

## 39. Le document image, au-delà des calques

Sur l'image du bateau ouverte :

- [x] « Quelle est la taille de ce document et combien de calques porte-t-il ? »
- [x] « Passe ce document en 1080 sur 1080. »
- [x] « Sélectionne le calque Bateau. »
- [x] « Duplique le calque Bateau. »
- [x] « Verrouille le calque Bateau pour ne plus y toucher. »
- [x] « Ajoute un calque de texte qui dit Bonjour. »

## 40. Les pistes et la tête de lecture

Sur un montage vidéo portant deux plans et un fond sonore :

- [x] « Place la tête de lecture à 3 secondes. »
- [ ] « Coupe le premier plan en deux à 3 secondes. »
- [x] « Supprime le deuxième plan du montage. »
- [ ] « Sélectionne le premier plan. »
- [ ] « Renomme la piste audio Ambiance. »
- [x] « Coupe le son de la piste audio. »
- [ ] « Supprime la piste audio et tout ce qu'elle porte. »

## 41. Documents et projet

- [x] « Ouvre le document Scène 1 qui est dans mon dossier documents. »
- [ ] « Renomme ce document Scène Finale. »
- [x] « Enregistre le document ouvert. »
- [x] « Ferme Scène Finale et supprime son fichier du projet. »
- [ ] « Exporte la scène ouverte dans mon dossier documents. »
- [x] « Crée un nouveau projet appelé Démo Assistant. »
- [ ] « Rouvre mon projet Démo. »
- [ ] « Renomme mon projet Démo Assistant. »
- [ ] « Ferme le projet ouvert. »
- [ ] « Crée un nouveau projet. »
- [ ] « Ouvre un projet récent. »
- [ ] « Retire le projet Voilier de mes projets récents. »
- [ ] « Mets le projet Voilier à la corbeille. »

## 42. Fichiers — le reste

- [ ] « Copie l'image du bateau dans mon dossier Materials sans la déplacer. »
- [ ] « Montre-moi l'historique de mes dernières opérations sur les fichiers. »
- [x] « Qu'est-ce que j'ai ouvert récemment dans ce projet ? »
- [ ] « Refais l'opération que je viens d'annuler. »
- [x] « Montre-moi l'image du bateau dans le Finder. »
- [x] « Ouvre la fiche d'informations de l'image du bateau. »

## 43. Bibliothèque et compte

- [ ] « Donne-moi les informations que tu as sur l'image du bateau. »
- [ ] « Supprime de ma bibliothèque l'image que tu viens de générer. »
- [x] « Y a-t-il des assets de ma bibliothèque dont le fichier a disparu ? »
- [ ] « Décris-moi ce que représente l'image du bateau et range-la avec des mots-clés. »
- [x] « Montre-moi le fichier de l'image du bateau sur mon disque. »
- [x] « Suis-je connecté à mon compte Scenario ? »
- [ ] « Combien de crédits me reste-t-il ce mois-ci ? »
- [x] « Quels comptes ai-je enregistrés ? »
- [ ] « Bascule sur mon deuxième compte. »
- [ ] « Renomme ce compte Studio Perso. »

## 44. Générations en cours

Après une génération lancée :

- [x] « Où en sont mes générations ? »
- [ ] « Donne-moi le résultat de ma dernière génération. »
- [ ] « Annule la génération en cours. »
- [ ] « Arrête la tâche d'indexation qui tourne. »
- [x] « Quels réglages accepte le modèle image que j'ai armé ? »
- [ ] « Combien me coûterait cette génération avant que je la lance ? »

## 45. Le vocabulaire de l'assistant

- [x] « Ouvre les préférences par le menu, comme si je cliquais dessus. »
- [ ] « De quoi es-tu capable au sujet des calques ? »
- [x] « Ferme la fenêtre de discussion. »
- [x] « Prends le calque Bateau comme cible de mes prochaines demandes. »
- [ ] « Propose-moi trois prompts pour générer un port au coucher du soleil. »
- [x] « Traduis ce prompt en anglais avant de le lancer : un bateau en bois sur une mer calme. »
- [ ] « Décris-moi le style de mon image du bateau, en une phrase réutilisable comme prompt. »
- [ ] « Demande-moi dans quel espace travailler, en me proposant Image, Vidéo ou Audio. »

## 46. Formes, chemins et texte 3D

Dans la scène Test MCP :

- [ ] « Change le cube en cylindre. »
- [x] « Ajoute un panneau plat qui porte l'image du bateau et qui fait toujours face à la caméra. »
- [x] « Ajoute un texte 3D qui dit Studio au-dessus du cube. »
- [ ] « Trace un chemin fermé qui part du cube et va vers la droite. »
- [ ] « Ajoute un point à ce chemin, deux mètres plus loin. »
- [ ] « Déplace le deuxième point du chemin d'un mètre vers le haut. »
- [ ] « Supprime le dernier point du chemin. »
- [ ] « Range la sphère sous le cube, pour qu'elle le suive quand je le déplace. »
- [ ] « Mets la sphère tout en haut de la liste de la scène. »

## 47. Caméras et vue

Dans la scène Test MCP, avec Camera Test :

- [x] « Crée un rail de caméra qui part de la gauche et arrive à droite du cube. »
- [ ] « Fais suivre ce rail à Camera Test. »
- [ ] « Mets Camera Test en premier dans la liste des caméras. »
- [ ] « Passe la vue en vue de dessus. »
- [x] « Affiche la scène en fil de fer. »
- [ ] « Prends une capture de la vue actuelle et range-la dans mes images. »

## 48. Le monde

- [x] « Applique un préréglage d'éclairage de studio à la scène. »
- [x] « Ajoute un brouillard léger. »
- [ ] « Ajoute un sol sous mes objets. »
- [ ] « Passe le rendu en qualité maximale. »

## 49. Animation — le reste

Dans la scène Test MCP, avec une animation déjà posée :

- [ ] « Quelles animations porte cette scène ? »
- [ ] « Découpe cette animation en un bloc de 0 à 5 secondes. »
- [x] « Active la pose automatique de clés pendant que je travaille. »
- [ ] « Efface la clé posée à 5 secondes. »
- [ ] « Efface toutes les clés de Cube Test. »
- [ ] « Décale toutes les clés de Cube Test de 2 secondes vers la droite. »
- [ ] « Boucle le canal de rotation de Cube Test. »

## 50. Le squelette

Sur mon personnage principal, dans la scène Test MCP :

- [x] « Ce personnage a-t-il déjà un squelette ? »
- [x] « Pose un squelette adapté à sa taille. »
- [x] « Ajoute les mains à ce squelette. »
- [ ] « Ajoute un os supplémentaire au bout de son bras droit. »
- [ ] « Renomme cet os Main Droite. »
- [ ] « Dis que cet os est la main droite du personnage. »
- [ ] « Supprime l'os que je viens d'ajouter. »
- [ ] « Ajoute une contrainte IK sur sa jambe gauche. »
- [ ] « Retire cette contrainte IK. »
- [x] « Enlève complètement le squelette de ce personnage. »
- [ ] « Pose un point d'attache sur sa main droite, appelé Main Droite. »
- [ ] « Accroche le cube à Main Droite. »
- [ ] « Retire le point d'attache Main Droite. »

## 51. Calques avancés et repères

Sur l'image du bateau, avec deux calques :

- [x] « Regroupe mes deux calques dans un groupe appelé Fond. »
- [x] « Dégroupe le groupe Fond. »
- [x] « Fusionne le calque du dessus avec celui d'en dessous. »
- [x] « Ajoute un rectangle rouge en bas de l'image. »
- [x] « Ajoute un calque de réglage qui monte le contraste. »
- [ ] « Ajoute un masque au calque Bateau. »
- [ ] « Recadre l'image sur un carré centré. »
- [x] « Fais pivoter le document de 90 degrés vers la droite. »
- [x] « Pose un repère vertical au milieu de l'image. »
- [ ] « Déplace ce repère au tiers de la largeur. »
- [ ] « Supprime ce repère. »

## 52. Le montage — liens et ordre des pistes

- [x] « Détache le son de ma première vidéo pour pouvoir le déplacer seul. »
- [ ] « Fais passer la piste audio au-dessus de la piste vidéo. »

## 53. Styles de génération

- [x] « Quels styles ai-je enregistrés ? »
- [ ] « Enregistre le style de mon image du bateau sous le nom Marine. »
- [x] « Renomme ce style Marine Nuit. »
- [x] « Supprime le style Marine Nuit. »

## 54. Le nuage Scenario

- [x] « Montre-moi ce que contient ma bibliothèque en ligne. »
- [ ] « Cherche des voitures rouges dans ma bibliothèque en ligne. »
- [ ] « Trouve-moi en ligne des images qui ressemblent à mon bateau. »
- [ ] « Dis-moi ce que téléchargerait une synchronisation, avant de la lancer. »
- [ ] « Télécharge dans mon projet les images en ligne qui manquent ici. »
- [x] « Envoie l'image du bateau dans ma bibliothèque en ligne. »

## 55. La fenêtre et les panneaux

- [x] « Dans quel état est ma fenêtre en ce moment ? »
- [ ] « Passe en plein écran. »
- [x] « Ouvre les préférences. »
- [ ] « Quels panneaux puis-je ouvrir ? »
- [x] « Ouvre le panneau des calques. »
- [x] « Ferme le panneau des calques. »
- [ ] « Ouvre un miroir de la vue sur mon second écran. »
- [x] « Ouvre le manuel au chapitre du montage vidéo. »
- [x] « Quels sont mes favoris ? »
- [x] « Mets l'image du bateau en favori. »
- [ ] « Retire l'image du bateau de mes favoris. »
- [ ] « Ouvre le journal du studio dans sa fenêtre. »

## 56. Le système

- [x] « Une mise à jour est-elle disponible ? »
- [ ] « Installe la mise à jour et redémarre. »
- [x] « La dictée est-elle prête à être utilisée ? »
- [x] « Lance la dictée. »
- [x] « Arrête la dictée. »
- [x] « Mon ordinateur peut-il encoder de la vidéo en accéléré matériel ? »
- [ ] « Ajoute à mon projet la vidéo que je viens de déposer sur la fenêtre. »
- [x] « Quelles polices puis-je utiliser pour un texte ? »

## 57. Réglages et mémoire du projet

- [ ] « Quels sont mes réglages 3D actuels ? »
- [ ] « Remets les réglages d'affichage à leurs valeurs par défaut. »
- [ ] « Qu'as-tu retenu de ce projet jusqu'ici ? »
- [ ] « Retiens que ce projet vise un rendu photoréaliste marine. »
- [ ] « Oublie ce que tu avais retenu sur le style de ce projet. »

## 58. Le versionnement du projet

Sur un projet suivi par git :

- [ ] « Où en est mon projet côté versions ? »
- [ ] « Montre-moi mes dernières versions enregistrées. »
- [ ] « Quels fichiers a changé ma dernière version ? »
- [ ] « Montre-moi ce qui a changé dans l'image du bateau depuis la dernière version. »
- [x] « Quelles branches ai-je dans ce projet ? »
- [x] « Quelles mises de côté ai-je en attente ? »
- [x] « Mets ce projet sous suivi de versions. »
- [ ] « Prépare l'image du bateau pour la prochaine version. »
- [ ] « Retire l'image du bateau de ce qui est préparé. »
- [ ] « Annule mes modifications sur l'image du bateau et reviens à la dernière version. »
- [x] « Enregistre une version appelée Premier jet. »
- [x] « Crée une branche appelée essai-couleurs. »
- [x] « Bascule sur la branche essai-couleurs. »
- [x] « Mets mon travail en cours de côté. »
- [ ] « Reprends le travail que j'avais mis de côté. »
- [ ] « Jette la mise de côté que je n'utiliserai pas. »
- [x] « Pose une étiquette v1 sur la version actuelle. »
- [ ] « J'ai un conflit sur l'image du bateau : garde ma version. »
- [ ] « Abandonne la fusion en cours. »
- [x] « Quels dépôts distants sont configurés ? »
- [x] « Ajoute mon dépôt distant origin, sur https://example.com/demo.git. »
- [x] « Récupère ce qui a changé sur le dépôt distant. »
- [x] « Récupère et applique les changements du dépôt distant. »
- [ ] « Envoie mes versions sur le dépôt distant. »

## 59. Le post-traitement

Dans la scène Test MCP :

- [ ] « Quels effets de post-traitement porte cette scène ? »
- [ ] « Ajoute un halo lumineux au post-traitement de la scène. »
- [ ] « Monte la force du halo lumineux à 1,5. »
- [ ] « Désactive le halo lumineux sans le retirer. »
- [ ] « Retire le halo lumineux de la composition. »
- [ ] « Applique le préréglage cinéma au post-traitement de la scène. »
- [ ] « Coupe tout le post-traitement de la scène pour comparer. »
- [ ] « Fais passer le vignettage avant le halo lumineux. »
- [ ] « Donne à Camera 01 son propre post-traitement, indépendant de la scène. »
- [ ] « Rends Camera 01 sans aucun post-traitement. »
- [ ] « Remets Camera 01 sur le post-traitement de la scène. »
- [ ] « Applique le préréglage horreur au post-traitement de Camera 01 seule. »
- [ ] « Duplique le halo lumineux pour en avoir un second. »
- [ ] « Remets le halo lumineux à ses réglages par défaut. »
- [ ] « Pose une clé sur la force du halo lumineux, à 2. »
- [ ] « Retire la clé posée sur la force du halo lumineux. »
- [ ] « Quels préréglages de post-traitement puis-je appliquer ? »
- [ ] « Enregistre cette composition sous le nom Aube grise. »
- [ ] « Renomme le préréglage Nuit froide en Nuit polaire. »
- [ ] « Supprime le préréglage Nuit froide de cette machine. »

## 60. Ce qu'un objet FAIT pendant la partie

- [ ] « Donne de la santé à Cube Test. »
- [ ] « Monte la santé maximum de Cube Test à 250. »
- [ ] « Fais aller Cube Test de gauche à droite. »
- [ ] « Retire la santé de Cube Test. »

## 61. Jouer, lire ce qui ne va pas, réparer

- [ ] « Lance la partie. »
- [ ] « Où en est la partie ? »
- [ ] « Mets la partie en pause. »
- [ ] « Avance de dix pas. »
- [ ] « Reprends la partie. »
- [ ] « Y a-t-il des erreurs dans la partie ? »
- [ ] « Arrête la partie. »
- [ ] « Quels scripts ce projet contient-il ? »
- [ ] « Montre-moi le script Walk.ts. »
- [ ] « Écris un script Patrol.ts qui fait avancer l’objet. »
- [ ] « Décris-moi Cube Test. »
- [ ] « Qu’est-ce que je peux régler sur un composant Santé ? »
- [ ] « Donne de la santé à Cube Test et monte son maximum à 250, en une seule fois. »

## 62. Ce qu'une timeline fait pendant la partie

- [ ] « Fais s’ouvrir la porte à deux secondes de cinématique. »
- [ ] « Mets un fondu d’une seconde à trois secondes. »
- [ ] « Retire le fondu que tu viens de poser. »
- [ ] « Cette timeline est une intro : ne me propose que ce qu’il faut. »

## 63. Monter un jeu d'un seul geste

- [ ] « Fais-moi un jeu à la troisième personne. »
- [ ] « Fais-moi un jeu vu de dessus. »
- [ ] « Appelle cette scène un prefab nommé Caisse. »
- [ ] « Pose le prefab Scène 1 dans cette scène. »
- [ ] « Pose le prefab Scène 1 à trois mètres sur la droite. »

## 64. Passer d'une scène à l'autre

- [ ] « Envoie la partie dans la scène Scène 1. »
- [ ] « À deux secondes, fais un fondu d’une seconde vers Scène 1. »

## 65. Sortir le jeu du studio

- [ ] « Exporte le jeu. »

## 66. Faire écrire un script par un modèle

Là où la section 61 fait écrire le script par l'assistant lui-même (`script.write`), celle-ci le
fait écrire par un **modèle** — un cloud de discussion ou un modèle de code de cette machine —
à travers le générateur, comme toute autre section du studio.

- [ ] « Fais écrire par un modèle un script qui fait tourner l'objet. »
- [ ] « Demande au modèle de réécrire ce script pour qu'il aille deux fois plus vite. »
- [ ] « Avant de dépenser quoi que ce soit, dis-moi ce qui est armé dans le générateur. »
- [ ] « Fais écrire un nouveau script de saut, sans toucher à celui qui est ouvert. »

## 67. Retenir ce qu'on lui apprend d'un projet

Ce que l'assistant a appris vit dans `<projet>/.ia-studio/memory.ndjson` et voyage avec le
dossier. 🛑 **Rien n'est injecté dans le briefing** : il ne porte qu'un signal d'une ligne, et
seulement si la mémoire n'est pas vide — c'est le modèle qui va la chercher. Les cinq actions
sont en `reach: 'mcp'` : elles ne sont pas dans la part courte, donc une porte étroite les atteint
par `actions.find`.

Ce que la section mesure au-delà de son décor : que le modèle DEMANDE ce qu'il ne sait pas.

- [ ] « Retiens que les caméras suivent le rail, jamais la cible. »
- [ ] « Qu'est-ce que tu sais des caméras de ce projet ? »
- [ ] « Donne-moi le détail de ce que tu sais sur les caméras. »
- [ ] « Oublie ce que tu as retenu sur les caméras. »
- [ ] « Relie ce que tu sais des caméras à ce que tu sais du script. »

## 68. Le pixel art

Une grille se règle en CELLULES — « une grille de 32 sur 32 » — et le studio en déduit la taille
du document. Les coordonnées d'un dessin sont en cellules, jamais en pixels du document : c'est
la seule chose qu'un modèle ne peut pas déduire, et `canvas.state` la lui rend.

🛑 **Ce que la section ne mesure pas** : ce qu'un modèle d'image REND. Ajouter « pixel art » au
prompt obtient un 1024 « façon pixel art », pas un vrai 32 × 32. 68.8 mesure les mots envoyés,
rien d'autre.

- [ ] « Passe ce document en pixel art, avec une grille de 32 sur 32. »
- [ ] « Le mode pixel art est-il actif, et quelle est la taille de la grille ? »
- [ ] « Pose un pixel rouge en 3, 4. »
- [ ] « Trace une ligne noire du coin haut gauche au coin bas droit. »
- [ ] « Dessine un carré bleu plein de 8 sur 8 au centre de la grille. »
- [ ] « Remplis tout le calque en blanc. »
- [ ] « Efface le pixel en 3, 4. »
- [ ] « Génère un sprite de personnage. »
- [ ] « Enlève la grille de pixel art de ce document. »

## 69. Optimiser une scène 3D

- [ ] « Analyse les possibilités d’optimisation de cette scène sans la modifier. »
- [ ] « Optimise les objets sélectionnés sans aucune perte visuelle. »
- [ ] « Prépare toute cette scène pour le jeu avec les optimisations sûres. »
- [ ] « Trouve ce qui provoque le plus de draw calls et donne-moi le rapport. »
- [ ] « Vide le cache d’optimisation de cette scène. »
- [ ] « Optimise tout sauf Cube Test. »
- [ ] « Force les deux sphères à utiliser des instances. »

## 70. Annoter une image pour la prochaine génération

Ces notes sont un brouillon de session : elles apparaissent sur l’image et dans le générateur,
visent l’image entière ou un calque, puis disparaissent après l’envoi.

- [ ] « Ajoute une note pour la prochaine génération : rends l'arrière-plan nocturne. »
- [ ] « Sur le calque Bateau, note pour la génération : garde exactement cette coque. »
- [ ] « Remplace la note de génération par : éclaire seulement l'arrière-plan. »
- [ ] « Retire la note de génération en attente. »

## 71. Contrôler les entrées, graphes et retargeting d’animation

- [ ] « Liste les cartes de contrôles du projet, avec les commandes clavier et manette. »
- [ ] « Lis la carte de contrôles Controls/character.input.json. »
- [ ] « Écris cette carte de contrôles dans Controls/character.input.json. »
- [ ] « Liste les graphes d’animation du projet. »
- [ ] « Lis le graphe d’animation Animation/character.anim.json. »
- [ ] « Écris ce graphe d’animation dans Animation/character.anim.json. »
- [ ] « Vérifie comment le mouvement bundled idle s’adapte au personnage sélectionné. »
