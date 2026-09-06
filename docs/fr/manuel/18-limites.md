# 18. Ce qui n’existe pas encore

[← Glossaire](17-glossaire.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Comment faire pour… →](19-recettes.md)

Les boutons gris, les promesses en cours, et ce qu’il ne faut pas attendre. La liste complète, à
jour, et honnête.

---

## Pourquoi ce chapitre existe

Un logiciel qui cache ce qu’il ne sait pas faire vous fait perdre une heure à chercher un bouton
qui n’existe pas.

Le studio a choisi l’inverse : **il montre ce qui vient**. Les outils qui ne fonctionnent pas
encore sont visibles et grisés, les vues à venir sont dans les panneaux, et ce chapitre dit
exactement où sont les bords.

Trois catégories, à ne pas confondre :

|  |  |
|---|---|
| **Pas encore fait** | c’est prévu, ce sera là un jour |
| **Volontairement absent** | ce ne sera pas fait, et il y a une raison |
| **Défaut connu** | ça marche mal, et c’est identifié |

---

## L’enregistrement : les six types y sont

Les six types s’écrivent dans le dossier du projet et se rouvrent tels quels.

| Document | Extension | S’enregistre ? |
|---|---|---|
| Scène 3D | `.gltf` | **oui** |
| Matière | `.mtlx` | **oui** |
| Image en calques | `.ora` | **oui** |
| Séquence vidéo | `.otio` | **oui** |
| Son édité | `.otio` | **oui** |
| Ciel | `.gltf` | **oui** |

### Les six extensions annoncent le format qu’elles contiennent

Un montage `.otio` est **réellement** de l’OpenTimelineIO : Resolve et Premiere le lisent. Une
image `.ora` est **réellement** de l’OpenRaster : c’est une archive, avec un PNG par calque, la
pile dans `stack.xml` et l’aplat que la spécification exige — GIMP l’ouvre, calque par calque,
avec les noms, les opacités, les modes de fusion et les groupes. Mesuré dans les deux sens avec
GIMP 3.2.4.

Un ciel `.gltf` est **réellement** du glTF 2.0 : le soleil y est une vraie lumière directionnelle
(`KHR_lights_punctual`), la rotation d’horizon une transformation de nœud, et l’image source un
fichier `.hdr` ou `.exr` **référencé à côté** plutôt que recopié dedans. Un lecteur glTF ouvre le
fichier et retrouve la lumière, sa couleur et son intensité.

Une scène 3D `.gltf` en est aussi : l’arbre, les placements, les caméras et les lumières
ponctuelles sont ceux du standard, et ce que glTF n’a pas de champ pour voyage dans les `extras`
que la spécification réserve aux applications.

Une matière `.mtlx` en est également : chaque canal y est un `tiledimage` qui lit un fichier posé
à côté du document, branché sur l’entrée correspondante d’un `standard_surface`, et la teinte, la
répétition et le décalage sont ceux du standard.

**Deux réserves, et elles sont dites plutôt que tues.** L’occlusion ambiante et la cavité ne
rentrent pas : `standard_surface` n’a d’entrée ni pour l’une ni pour l’autre. Elles sont
conservées — le studio les retrouve — mais aucun autre logiciel ne les voit, et c’est le cas
aussi de la rotation des UV, qu’un `tiledimage` ne sait pas porter. Et la conformité de ce format
a été vérifiée contre le **texte** de la spécification MaterialX 1.39 et contre les fichiers que
sa distribution livre, **jamais contre un rendu** : aucun lecteur MaterialX n’a ouvert ces
fichiers.

Ce que le ciel garde en plus du standard — les réglages d’exposition, de contraste, de
température, le flou, l’intensité de l’environnement — voyage dans le fichier à un endroit que
glTF réserve aux applications. Un autre logiciel ne les perd pas : il ne les voit pas. Ouvrir un
ciel écrit ailleurs donne donc ce que le standard porte, et ces réglages-là au neutre.

Ce qu’un `.ora` du studio garde en plus du standard — les calques de réglage, le texte encore
modifiable, les repères — voyage dans le conteneur sous un nom que les autres logiciels ignorent.
Ils ne le perdent pas : ils ne le voient pas.

### Un fichier enrichi ailleurs s’ouvre en lecture seule

Ouvrez une scène du studio dans Blender, posez-y une maille, réenregistrez : le fichier revient
avec des parties que le studio ne compose pas. Il s’ouvre, il s’affiche — et **`⌘S` refuse
d’écrire**, avec la raison en clair. Ce n’est pas une précaution excessive : un glTF est lié par
**index**, donc réécrire la scène depuis ce que le studio en connaît supprimerait ces parties, et
un fichier à demi réécrit ne s’ouvrirait nulle part. Le même refus protège un ciel qui contient
une scène entière, et une matière `.mtlx` qui porte plus que ce que le studio compose — une seconde
matière, ou simplement un réglage de surface que l’éditeur de matières n’a pas, comme un vernis.

**Un montage est protégé de la même façon**, et pour deux raisons distinctes. Un `.otio` qui porte
un marqueur, un effet ou une transition que le studio ne compose pas s’ouvre en lecture seule ; et
un montage dont les médias sont introuvables s’ouvre **sans les clips concernés**, l’enregistrer
les effacerait du fichier. Dans ce second cas, importez les médias dans le projet, puis rouvrez le
montage : le refus tombe de lui-même.

**Le refus se dit deux fois, et jamais entre les deux.** À l’ouverture, le studio annonce ce qu’il
ne sait pas réécrire et le document arrive en lecture seule. Puis c’est `⌘S` qui répond, avec la
raison complète. **L’enregistrement automatique, lui, ne dit RIEN** : il passe, se heurte au même
refus, et se tait — répéter la phrase toutes les trente secondes serait pire que le silence. Un
document refusé n’est donc jamais écrit sur le disque tant que vous n’avez pas tenté `⌘S` vous-même.

Pour sortir malgré tout ce que vous avez modifié, passez par l’**export** de ce document —
**Fichier ▸ Exporter ▸ Scène**, **Ciel**, **Matière**, ou
**Montage (OTIO)…** : l’écriture va dans un fichier NEUF, sans toucher à l’original.

> **N’attendez pas d’*Enregistrer sous…* qu’il contourne le refus** : les deux gestes
> d’enregistrement passent par la même porte, et la copie est refusée pour la même raison que
> l’original. C’est l’export, et lui seul, qui sort le travail d’un document en lecture seule.

> **L’image est la seule des six sans refus, et c’est délibéré.** Un `.ora` est lui aussi
> recomposé en entier à l’enregistrement, mais il s’écrit sans rien vous demander : ce qu’un autre
> logiciel y a mis et que le studio ne compose pas est perdu à la première écriture — et
> **renommer le fichier suffit** à déclencher cette réécriture. Si un `.ora` vous vient d’ailleurs
> et que vous tenez à ce qu’il porte, travaillez sur une copie.

**Ce qui ne s’enregistre pas :**

- **l’historique d’annulation** — rouvrir un document, c’est repartir sans `⌘Z` ;
- **la façon dont on regarde** — zoom, cadrage, vue d’un ciel, sélection : c’est de l’état de
  session, pas ce que le document *est* ;
- **en Audio, l’écoute A/B** : un document rouvert écoute la chaîne, jamais la source.

**Fermer un onglet demande maintenant.** Si le document a du travail non enregistré, le studio
pose la question — Enregistrer, Ne pas enregistrer, Annuler — et *Annuler* est ce que répond une
touche `⎋` frappée sans lire.

**Quitter aussi.** La fenêtre ne part plus en emportant du travail non enregistré : elle refuse
le départ et pose la même question, une fois par document concerné. *Annuler* à n'importe
laquelle annule tout le départ, et **aucun document n'est fermé ni enregistré** — on retrouve le
studio exactement comme on l'a laissé. Répondre à toutes ferme les onglets concernés sans
quitter : le studio s'en va au geste suivant, quand il n'a plus rien à sauver.

Un point qui reste : **changer de projet** ferme les documents ouverts sans poser la question.

---

## Espace Image

### Il n’y a pas de menu « Ouvrir », et il n’en faut pas

Une image de l’Explorateur **entre** dans un document ouvert — glissée sur la toile, envoyée par le
clic droit, ou choisie par l’outil **Image…** : elle y devient un calque. Et **double-cliquée,
elle ouvre un document à elle**. Voir [Espace Image](08-espace-image.md).

Rouvrir un document composé plus tôt passe par le panneau **Explorateur**, qui liste les
documents du projet : un double-clic sur une ligne l’ouvre, en changeant d’espace s’il le faut.
C’est la porte, et il n’y a pas de dialogue de fichiers — le studio n’ouvre que ce qui est dans
le projet.

`⇧⌘E` sort toujours un `.png` aplati ; ce PNG, réimporté, revient comme une image et non comme
ses calques — c’est un export, pas un enregistrement.

### Outils annoncés mais inactifs

Ils sont visibles dans la barre d’outils, en gris.

| Outil | Groupe |
|---|---|
| **Section** | Cadre |
| **Découpe** | Cadre |
| **Plume** | Dessin |
| **Texte sur chemin** | Texte |
| **Commentaire** | seul de son groupe |

**Ils disent tous leur état par leur gris**, et c’est la seule chose qu’on leur demande tant qu’ils
n’existent pas. Le Commentaire a été le dernier à rentrer dans le rang : il s’armait comme les
autres, changeait le curseur, et laissait le moteur jeter chaque clic — un bouton qui avait l’air
vivant sans l’être.

**Aucun des cinq n’a de raccourci clavier**, et c’est voulu : une touche qui n’agit pas se cherche
plus longtemps qu’une touche qui n’existe pas. Le chapitre
[Raccourcis](15-raccourcis.md) ne les nomme donc nulle part.

### En Vidéo, les touches des outils ne sont pas écoutées

La barre du montage affiche `V`, `C` et `H` à côté de ses trois outils. **Aucune n’est active** :
elles apparaissent dans les infobulles, et rien ne les résout — un outil s’y choisit à la souris.

**L’espace Image, lui, a réglé la question** : ses vingt outils sont devenus des commandes à part
entière, donc leurs touches arment vraiment, se remappent, et apparaissent dans l’écran des
raccourcis. C’est le modèle que le montage n’a pas encore suivi.

La règle générale reste la même : ce qui passe par le registre de commandes répond, ce qui n’y
passe pas est une intention affichée.

### Le recadrage ne rend pas ses pixels à l’annulation

**Les cinq sont offerts** — Fusionner, Aplatir, le miroir, le quart de tour, et depuis peu le
**recadrage** (`C`). Ce qui les bloquait était qu’une surface de calque ne suivait pas son
document ; elle le suit maintenant.

Le recadrage a en revanche une limite qu’il faut connaître avant de s’en servir : **rétrécir le
document jette pour de bon ce qui tombe hors du cadre**. `⌘Z` rétablit la taille d’origine, mais
la zone retirée revient vide, et les traits de pinceau qu’elle contenait ne reviennent pas non
plus. C’est le comportement de Photoshop quand « Supprimer les pixels rognés » est coché — sauf
que son historique à lui sait les rendre.

**La raison.** Les pixels ne vivent pas dans le document mais dans des images GPU, et
l’historique n’en garde que des tuiles de 512 px, plafonnées à 256 Mo. Un recadrage sévère
retirerait plus de tuiles que ce plafond n’en autorise. Garder l’intégralité de l’image d’avant
demanderait des instantanés pleine taille dans la pile d’annulation, ce que le studio s’interdit
justement pour que `⌘Z` reste instantané sur des documents lourds.

**Ce qu’il faut faire :** `⇧⌘E` avant un recadrage large, si vous pensez revenir en arrière.

### Le pot de peinture ne s’arrête pas aux contours

**Pot de peinture** (`G`) remplit le calque **entier**, d’un bord à l’autre — ou toute la **zone
sélectionnée**, s’il y en a une. Ce n’est pas le remplissage par zone que vous connaissez peut-être
ailleurs — celui qui s’arrête aux contours du dessin.

Ce n’est pas un défaut : c’est un outil différent, et une sélection est le seul moyen de le borner.

### L’historique s’arrête à 100

La *pile d’annulation* garde les **100 dernières** actions. Au-delà, les plus anciennes
disparaissent définitivement.

### L’export aplatit, l’enregistrement non

`⇧⌘E` écrit le document **aplati** en `.png` où vous voulez : une seule image, les calques fondus
ensemble. Ce n’est pas une sauvegarde — c’est une sortie.

Pour garder la pile de calques, c’est `⌘S` : le document s’écrit en dossier `.ora`, masques
compris, et se rouvre tel quel. Les deux gestes ne servent pas à la même chose et aucun ne
remplace l’autre. Ce qui ne revient dans aucun des deux : l’historique d’annulation.

---

## Espace Modélisation

### L’animation va en ligne droite, et une séquence se joue seule

La timeline de l’espace Modélisation — voir [l’espace Modélisation](09-espace-modelisation.md) — interpole **linéairement**
entre deux clés : pas de courbe d’accélération, donc un mouvement démarre et s’arrête net. Poser
plus de clés est le seul moyen d’adoucir une trajectoire pour l’instant.

**Une séquence d’un modèle se joue seule.** On choisit laquelle, on la lance, on l’arrête — mais
rien ne fond `marche` vers `course` : passer de l’une à l’autre est une coupe.

**Le rendu écrit une seule taille**, 1920 × 1080, et il rend ce que voit une caméra de la scène.
Il n’y a pas encore de réglage de résolution, ni de choix entre plusieurs caméras : c’est la
première de la scène qui rend.

### Le texte 3D n’offre qu’une graisse par famille

**Ajouter ▸ Objet ▸ Texte** fonctionne — voir [l’espace Modélisation](09-espace-modelisation.md). Deux réserves.

**Une seule coupe par famille.** La liste offre le romain de chaque police et rien d’autre : pas
de gras, pas d’italique. Une famille qui installe neuf graisses n’occupe donc qu’une ligne, ce
qui est le bon compromis tant que le studio n’a pas de sélecteur de graisse.

**Une police du système ne voyage pas.** Elle reste écrite dans le document, mais une machine qui
ne l’a pas dessine les lettres dans la police embarquée par défaut, en marquant le nom manquant
dans la liste. Les trois polices que le studio embarque, elles, s’ouvrent partout à l’identique.

**Et quelques polices anciennes ne s’ouvrent pas du tout** : la bibliothèque de lecture de polices
que le studio emploie ne connaît pas tous les formats de table que les faces héritées d’avant les
années 2000 emploient. Sur une machine Apple, cela concerne une police sur dix environ. Le texte
retombe alors sur la police par défaut, et le journal dit laquelle a échoué.

### Les touches de vol ne se remappent pas

`W A S D Q E`, les quatre flèches et la touche d’accélération sont figées. Elles n’apparaissent pas
dans l’écran des raccourcis, et le bouton **Chercher par touche** ne les trouve pas.

---

## Espace Vidéo

### L’export vidéo sort sans le son

Une séquence s’enregistre en `.otio` et se rouvre telle quelle.

**Fichier › Exporter › Vidéo…** écrit bien un fichier final, image par image, scènes 3D comprises.
**Mais il sort muet** : les pistes de son du montage ne sont pas encore encodées dedans. C’est la
limite la plus lourde de cet espace, parce qu’elle oblige à remonter le son ailleurs.

### Un montage étranger ne retrouve que les médias déjà vus

Un montage venu d’ailleurs nomme ses médias par un chemin. Le studio les cherche dans le projet
par ce chemin, puis par le nom du fichier — **parmi les assets que cette fenêtre a déjà vus**. Un
projet qui vient d’être ouvert n’a pas encore lu son catalogue : ouvrir un montage étranger dans
la seconde peut n’en retrouver aucun.

**Un clip dont le média n’est pas retrouvé n’est pas ouvert**, et le journal d’activité dit
lequel. Le montage est alors plus court que ce que le fichier décrit, et **`⌘S` refuse d’écrire**
tant que c’est le cas : sans ce refus, enregistrer effacerait ces clips du fichier. Amenez les
médias manquants dans le projet, rouvrez le montage, et l’enregistrement redevient possible.

Et ce que ce format ne porte pas en standard — fondus, gains, liens image/son, scène 3D d’un clip
vivant — voyage dans le fichier mais **n’est lu que par IA Studio**.

### Les réglages d’une séquence sont figés

Une séquence neuve part toujours sur 1920 × 1080, 25 images par seconde, 48 000 Hz. Ces valeurs ne
se changent pas encore.

### Ce que la lecture ne fait pas encore entendre

Le moniteur Programme joue les pistes de son. Deux bornes restent, toutes assumées :

| Ce qui ne s’entend pas | Pourquoi |
|---|---|
| **Le son d’une vidéo** posée sur une piste image | seules les pistes de genre son sont ordonnancées |
| **Le scrub** — déplacer la tête de lecture à la main | le son n’est planifié que par la boucle de lecture |

**Et une dérive, non mesurée** : sur un montage long, l’image peut s’écarter du son. L’horloge de
sortie prend la main dès qu’elle tourne, ce qui l’évite dans le cas courant — mais la toute
première lecture après l’ouverture de l’application peut démarrer avant que la sortie ne réponde,
et courir alors sur l’horloge système.

---

## Espace Audio

### Ce qui est volontairement absent

Ce ne sont **pas** des oublis :

- pas de **réduction de bruit** ;
- pas de **dé-esseur** ;
- pas de **réparation spectrale** ;
- pas d’**égaliseur**, pas de **compresseur**.

**La raison.** Ces outils répondent à des problèmes de **prise de son réelle** : un micro qui
souffle, une pièce qui résonne, un sifflement sur les « s ». Un son **généré** n’a pas ces
défauts — il est propre par construction.

Ce qui reste utile sur un son généré, c’est de le raccourcir, de l’amener au bon niveau et de le
faire entrer et sortir proprement. C’est exactement ce que fait cet espace, et rien de plus.

### Le document audio ne garde pas l’écoute A/B

Le fichier `.otio` existe et se rouvre — c’est le tableau du haut de ce chapitre qui fait foi. Ce
qu’il tient est **la chaîne d’édition**, pas le son : les coupes, les fondus, le gain, rejoués sur
l’asset d’origine — **et le montage multipiste de la bande basse**. Ce qu’il ne garde pas, c’est
l’**écoute A/B** : un document rouvert écoute la chaîne, jamais la source.

L’espace sait aussi écrire un *asset* directement, par **Appliquer** ou **Enregistrer comme
nouveau** : c’est ce qu’on fait quand le résultat doit servir ailleurs, pas continuer d’être édité.

---

## Espace Matières

### Ce qui manque

- **l’enchaînement des dérivations** — calculer la hauteur depuis la couleur de base ne recalcule
  pas la normale qui en venait : chaque canal se recalcule à la demande, un par un ;
- **l’import d’un fichier du disque** directement dans un canal. Le détour existe : importez
  l’image dans le projet, puis posez-la sur la vignette du canal.

**L’export existe désormais** — glTF/GLB, Unity, Unreal, Roblox et les canaux bruts, par
Fichier → Exporter → Matière. Deux bornes à connaître : **Roblox refuse une carte au-delà de
1024 px**, donc ses quatre fichiers sont ramenés sous ce plafond ; et le `.glb` part avec la
forme de l’aperçu, faute pour un format d’objet de savoir porter une matière toute seule.

Ce qui fonctionne aujourd’hui : générer une matière, poser une image dans chacun de ses huit
canaux, en calculer quatre depuis un autre, juger sa répétition et mesurer ses coutures, régler tout ce
dont elle est faite — rugosité et métal avec leur remappage, relief,
émission, répétition —, la regarder sur cinq formes sous l’éclairage de votre choix, inspecter
chaque canal à plat, l’enregistrer, et la sortir vers cinq destinations.

### L’opacité d’un canal ne se règle pas

Un canal est posé ou il ne l’est pas. Il n’y a pas de mélange partiel entre deux images dans le
même canal, ni de fondu entre la valeur d’ensemble et la carte : le remappage règle la **plage**
dans laquelle la carte est relue, ce qui est une autre question.

---

## Espace Skyboxes

### La section Génération n’a pas ses boutons

Elle affiche bien le modèle, le prompt et la graine qui ont produit le ciel, en lecture seule. Mais
les deux boutons attendus — **Régénérer** et **Réinitialiser** — ne sont posés nulle part dans le
panneau.

En attendant, on recopie le prompt et la graine à la main dans le panneau **Génération**, ce qui
revient au même en trois gestes de plus.

### L’export sort en PNG, donc sans les hautes lumières

Un ciel s’enregistre désormais en `.gltf` — l’exposition, la rotation de l’horizon et la position
du soleil se rouvrent telles quelles. Ce que le document ne garde pas : la vue et le champ de
vision, qui disent comment on le regardait et non ce qu’il est.

Les six faces d’un cube s’exportent depuis **Fichier › Exporter › Ciel**, en 512, 1024 ou 2048.
Ce qui manque encore est le *HDRI* : les faces sortent en PNG, donc en 8 bits par canal, et ce qui
dépasse le blanc est écrêté.

---

## Import

### Ce qui s’importe

| Type | Extensions |
|---|---|
| **Vidéo** | `mp4` `mov` `mkv` `webm` `avi` `mxf` `m4v` |
| **Audio** | `wav` `mp3` `aac` `flac` `m4a` `ogg` `aiff` |
| **Image** | `png` `ora` `jpg` `jpeg` `webp` `avif` `gif` `svg` `tif` `tiff` `exr` `hdr` |
| **3D** | `glb` `obj` `fbx` `stl` `ply` `dae` `usdz` — et `bvh` pour une capture de mouvement |
| **Documents** | `ora` `gltf` `otio` `mtlx` |
| **Montage avec médias** | `otioz` |

### Ce qui ne s’importe pas

- **un `.gltf` séparé qui n’est pas un document IA Studio**, ainsi que `.usd`, `.usda` et `.usdc`
  hors de leur archive `.usdz`.

Tout fichier 3D accepté est converti en `.glb` à l’import ; l’original est gardé dans un dossier
`.sources` à côté, hors catalogue — voir [Les assets](07-assets.md#ce-qui-simporte).

Un `.exr` s’importe, mais il est catalogué comme **image**, pas comme ciel. Il fonctionne quand
même comme source pour une *skybox* : il faut simplement aller le chercher dans les images.

**Trois formats s’importent sans jamais s’afficher dans un moniteur Vidéo** — `.exr`, `.tif` et
`.tiff`. Le clip se pose sur une piste et garde sa durée, mais le moniteur annonce à la place de
l’image « Ce clip n’a pas pu être affiché ». Le studio ne les convertit pas : voir
[L’espace Vidéo](10-espace-video.md#quand-un-clip-ne-peut-pas-safficher).

### Les médias audio, vidéo et image ne sont pas copiés — à l’import

Pour l’audio, la vidéo et les images, le studio crée un **lien** vers votre fichier, là où il se
trouve. Déplacer ou supprimer l’original casse le lien. La 3D fait exception : le fichier est
copié dans le projet avant sa conversion en `.glb`.

Ce n’est pas un défaut mais un choix : copier des rushes de plusieurs gigaoctets dans chaque
projet remplirait votre disque pour rien.

**L’éditer, en revanche, le fait entrer dans le projet** — et votre fichier d’origine n’est pas
touché. Voir [Les assets](07-assets.md).

---

## Git

Le panneau Git n’est pas un client git complet, et quatre de ses limites se remarquent tout de
suite. Elles découlent toutes du même choix : **une fenêtre de studio n’a pas de terminal**.

### git doit déjà être installé sur la machine

Le studio ne l’embarque pas, il lance celui du système. macOS répond souvent en proposant
d’installer les outils de développement en ligne de commande ; une installation Windows neuve n’a
pas de git du tout. **La question est posée à l’ouverture du projet**, et le panneau le dit alors —
plutôt que de vous laisser préparer un enregistrement qui ne pourrait pas aboutir.

### Le studio ne demande jamais de mot de passe

Aucune fenêtre de mot de passe, jamais : c’est un choix, pas un oubli. Une commande qui attend une
réponse dans un terminal inexistant resterait bloquée sans que rien ne puisse l’interrompre.

Pour un serveur qui en réclame un, le jeton se renseigne **dans le panneau, une fois par serveur** —
pas par projet. Un même jeton personnel ouvre tous vos dépôts chez le même hébergeur.

### Une clé SSH à phrase de passe échoue au lieu de la réclamer

C’est la conséquence directe du point précédent, et **la limite la plus susceptible de vous
surprendre** : l’envoi échoue, sans rien demander. Le remède est celui que tout poste déjà
configuré pour ssh possède — charger la clé dans un agent avant d’ouvrir le studio.

### Ce que votre terminal exporte n’a aucun effet ici

Si vous avez l’habitude de régler git par des variables d’environnement — `GIT_EDITOR`, `PAGER`,
et tout ce qui commence par `GIT_` — sachez qu’elles sont **écartées** avant chaque commande. Le
studio impose ses propres réponses plutôt que de discuter avec celles du shell qui l’a lancé. Votre
proxy et votre agent ssh, eux, sont conservés.

## Réglages et raccourcis

### Un projet reste sur votre disque, toujours

Le fichier de réglages prévoit un choix entre « sur votre disque » et « dans le nuage » pour
l’endroit où un projet vit. **Le second n’est pas implémenté**, et le choix n’est donc offert
nulle part dans l’interface. Offrir un bouton qui ne mène nulle part serait une promesse que le
logiciel ne peut pas tenir.

> **À ne pas confondre avec la bibliothèque de votre compte**, qui, elle, existe : vous pouvez
> **envoyer** des assets vers elle depuis l’Explorateur. Ce sont deux choses différentes — l’une est
> l’endroit où le projet lui-même est rangé, l’autre est un stock d’assets en ligne à côté du
> projet. Voir [Les assets](07-assets.md).

### Le rapatriement n’a pas de bouton

L’envoi vers la bibliothèque existe ; le chemin inverse non. Le studio sait rapatrier et sait
comparer les deux côtés — c’est écrit et testé — mais aucun bouton ne le déclenche, et aucun écran
ne montre le contenu de la bibliothèque.

Conséquence directe, et ce n’est pas une panne : sur les sept badges qu’un asset peut porter,
**trois ne peuvent pas apparaître** — « à rapatrier », « modifié des deux côtés » et « appartient
à un autre projet ». Tant que rien ne bouge sans que vous le demandiez, l’autre côté ne peut pas
prendre de l’avance sur le vôtre.

### Sur Windows et Linux, `⌘` s’affiche là où `Ctrl` se presse

Les raccourcis **fonctionnent** : `⌘` se lit `Ctrl` partout, y compris ceux qu’une surface écoute
elle-même. Ce qui reste est l’affichage — les infobulles et l’écran des raccourcis dessinent le
symbole `⌘` du Mac au lieu d’écrire `Ctrl`.

**La touche Windows, elle, ne déclenche rien** : elle appartient au bureau, et le studio ne lui
donne aucune commande.

---

## Ce que le studio ne fera pas

Ce ne sont pas des manques : ce sont des bornes assumées.

### Il ne travaille pas hors ligne pour générer

La fabrication se passe sur les serveurs du fournisseur. Sans connexion, vous pouvez ouvrir,
retoucher, monter, enregistrer — mais pas créer de nouveau contenu.

### Il n’est pas gratuit à l’usage

Chaque génération consomme le crédit de votre compte distant. Le studio ne vous facture rien : il
transmet. Mais votre compte, lui, compte.

**Et il ne peut pas vous dire ce qu’il vous reste.** La fenêtre **Aide ▸ Consommation…** montre ce
qui a été dépensé sur 7, 31 ou 120 jours — jamais un solde, parce que l’API de génération n’en expose
aucun. Le montant en euros qui l’accompagne est calculé sur la grille publique des packs
prépayés : un ordre de grandeur, pas votre facture.

Ce qu’il sait dire, en revanche, c’est ce qu’une génération va coûter : le bouton **Générer**
porte une estimation avant que vous appuyiez. Combien il vous reste pour la payer, c’est votre
compte distant qui le sait, pas le studio.

### Il ne remplace pas Photoshop, Blender ni Premiere

Il en fait une part utile, au même endroit, **autour de la génération**. C’est un outil de
fabrication assistée, pas une suite de production complète.

### La fenêtre ne sera jamais translucide

Pas de vibrancy, pas de fond flouté derrière la fenêtre.

Dans un studio, on juge des couleurs. Un fond translucide fausse la perception de tout ce qui est
affiché au-dessus. C’est une décision de métier, et elle ne changera pas.

### Vos identifiants ne s’afficheront jamais

Il n’y a pas de bouton « voir ma clé API », et il n’y en aura pas. Une fois enregistrée, la clé
est chiffrée par le *trousseau* de votre système, et la partie du logiciel qui dessine l’écran
n’y a **structurellement** pas accès.

Ce n’est pas une gêne à contourner : c’est ce qui garantit qu’une capture d’écran de vos réglages
ne peut pas divulguer votre compte.

---

## Récapitulatif : par ordre d’importance

Si vous ne deviez retenir que quatre choses de ce chapitre :

1. **Les six documents s’enregistrent maintenant**, et fermer un onglet demande avant de perdre
   quoi que ce soit ; ce qui ne revient pas, c’est l’historique d’annulation ;
2. **un recadrage ne se défait qu’à moitié** — `⌘Z` rend le cadre, jamais les pixels rognés ;
   exportez avant de rogner large ;
3. **l’export vidéo sort muet** — le fichier final est livrable, le son du montage n’y est pas ;
4. **un `.gltf` séparé qui n’est pas un document IA Studio** ne s’importe pas comme modèle.

Tout le reste est du confort.

---

[← Glossaire](17-glossaire.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Comment faire pour… →](19-recettes.md)
