# 7. Les assets et la Bibliothèque

[← Générer](06-generer.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Espace Image →](08-espace-image.md)

---

## Deux panneaux, deux questions

Vos assets se lisent à **deux endroits**, et savoir lequel répond à quoi est tout ce qu’il faut
retenir de ce chapitre :

| Panneau | Ce qu’il montre | Où |
|---|---|---|
| **Bibliothèque** | ce que votre compte héberge **en ligne**, ce que la communauté publie, et les générations en cours | colonne de gauche, moitié haute |
| **Explorateur** | ce que votre projet contient **sur ce disque** | colonne de gauche, moitié basse |

**Ils tiennent l’écran ensemble, et c’est délibéré** : ce qui entre dans votre projet passe de la
bibliothèque au dossier, jamais autrement.

Le premier est un magasin — on y regarde ce qu’on n’a pas encore, et on le télécharge. Le second
est votre dossier — on y range, on y renomme, on y travaille.

> **La Bibliothèque partageait autrefois l’écran avec le catalogue du projet**, sous le nom
> « Assets ». Les deux panneaux listaient alors les mêmes fichiers avec des mots différents : il
> n’en reste qu’un pour cette question, et c’est l’Explorateur.

**Sans clé API, la Bibliothèque n’apparaît pas du tout** — pas même son icône dans le rail. Elle
n’a rien à montrer : tout ce qu’elle liste vient d’un compte distant. La **Génération**, à côté,
reste offerte : elle a les modèles de votre machine à vous proposer. Voir
[Vos clés](14-reglages.md) pour en renseigner une.

---

## Ce qu’on y trouve

Six types d’assets :

| Type | Ce que c’est | Où il atterrit |
|---|---|---|
| **Image** | une image fixe | `Images/`, ou `Materials/` si elle sert une matière |
| **Vidéo** | un plan animé | `Video/` |
| **Audio** | un son, une musique | `Audio/` |
| **Maille** | un objet en 3D | `Modelling/Models/` |
| **Skybox** | un ciel à 360° | `Skyboxes/` |
| **Animation** | un mouvement, à rejouer sur un personnage | `Modelling/Animations/` |

**Où il atterrit, pas où il vit.** Ces dossiers sont posés à la création du projet, avec
`Materials/` qui n’est le dossier d’aucun type, et ne sont qu’un point de départ : déplacez un
asset où vous voulez, renommez le dossier, videz-le. Ce qu’un fichier EST ne dépend pas de
l’endroit où il est — le studio le retrouve, et sa fiche le suit.

---

## Chercher et filtrer

**Les contrôles sont sur leur propre ligne, sous le titre.**

Dans une colonne étroite, une barre posée sur la ligne de titre pousserait le bouton de fermeture
hors du cadre : elle vit donc **sous** le titre. Le mécanisme existe encore pour les bandes, où la
ligne est large et presque vide, mais ce panneau n’y lit plus.

| Contrôle | Ce qu’il fait |
|---|---|
| **Rechercher…** | interroge la bibliothèque, une fois la frappe arrêtée |
| **Type** | ne garde qu’**une seule** sorte d’assets — en choisir une remplace la précédente |
| **Origine** | **Ma bibliothèque**, ce que votre clé possède ; **Communauté**, ce que les autres ont publié. Rien de coché lit la vôtre ; cocher la communauté l’**ajoute**, elle ne la remplace pas |
| **Icônes** / **Liste** | grille de vignettes, ou liste dense |
| **Réduire les vignettes** / **Agrandir les vignettes** | leur taille |

**Rien n’est filtré ici** : le mot part à l’API, qui le cherche dans le nom, mais aussi dans le
**prompt** et la description — ce qu’aucune recherche locale ne pourrait faire. C’est pour cela
qu’un résultat trouvé sur son prompt reste affiché même si son nom ne contient pas le mot.

**La Communauté coûte une recherche** et n’est donc lue que tant qu’elle est cochée : le fil est
sans fin, et il noierait vos propres assets sous ceux de tout le monde.

La liste se remplit **au fil du défilement** : la bibliothèque livre ses assets par paquets, et
arriver en bas en demande la suite.

> **La recherche ne réclame pas vos accents.** Taper `foret` trouve « Forêt d’hiver », et `ete`
> trouve « Été ». C’est vrai pour les assets du projet et dans la recherche des préférences : on
> cherche en tapant, pas en épelant. Pour la moitié **bibliothèque**, c’est l’API qui répond, et
> elle décide seule — comme dans le panneau **Modèles**, qui ne cherche pas lui-même non plus.
>
> Cela vaut aussi pour les fichiers venus du Finder. macOS écrit les noms sous une forme où
> l’accent est un caractère à part, invisible à l’œil mais différent pour la machine — un asset
> importé ne répondait donc pas toujours à son propre nom retapé ici. Les deux formes sont
> désormais traitées comme une seule.

Les deux vues sont **virtualisées** : seul ce qui est réellement à l’écran est dessiné. Un
projet de plusieurs milliers d’assets défile donc sans à-coups.

**Un son se montre par son onde**, en vignette, et non par un pictogramme de haut-parleur : deux
prises de même durée se ressemblaient trait pour trait tant qu’on ne les avait pas écoutées.
L’onde est celle que le montage dessine, calculée à l’import — elle apparaît donc une fraction de
seconde après la vignette, le temps qu’elle arrive.

### Quand la Bibliothèque est vide

Le message dit lequel des trois cas vous êtes, parce qu’ils appellent des réponses différentes :

| Message | Situation |
|---|---|
| « Rien dans cette bibliothèque distante. » | votre compte n’héberge rien de ce type |
| « Aucun résultat pour ce filtre. » | vos filtres sont trop restrictifs |
| « Votre bibliothèque n’a pas répondu. » | l’API a refusé — un bouton **Réessayer** redemande |

**Le dernier n’est pas une fin, c’est une question restée sans réponse** : une liste vide et un
refus se ressemblent à l’écran, et l’un vaut d’être retenté quand l’autre est un fait.

---

## Télécharger depuis la Bibliothèque

| Geste | Effet |
|---|---|
| **Clic** | choisit la ligne |
| **⌘-clic** *(Ctrl ailleurs)* | ajoute cette ligne au choix, ou l’en retire |
| **Maj-clic** | choisit toute la plage entre la dernière retenue et celle-ci |
| **Chevron** | déplie la ligne, et montre **avec quel prompt** l’asset a été fait |
| **Double-clic** | **télécharge, puis ouvre** ce qui est arrivé |
| **Clic droit** | **Télécharger** — la plage entière si cette ligne en fait partie |
| **Glisser-déposer** | dépose l’asset là où vous le lâchez ; il est rapatrié **au lâcher** |

**Le chevron est ce qui fait de ce panneau autre chose qu’un mur de vignettes.** Déplier une ligne
que vous ne possédez pas montre ce que la bibliothèque en sait — ses dimensions, son poids, sa
date, et surtout le **prompt** qui l’a produite. C’est le champ qu’on pèse avant de dépenser un
téléchargement. Déplier une ligne que vous possédez déjà montre, elle, sa fiche de catalogue.

**Le double-clic ne s’arrête pas au téléchargement** : s’arrêter là obligeait à deviner qu’un
second geste était maintenant nécessaire, et lequel.

**Un seul transfert à la fois.** Pendant qu’un téléchargement court, le double-clic et l’entrée du
menu ne font rien : un second ne se pousserait pas par-dessus le premier.

### Choisir plusieurs assets

La sélection multiple existe pour **télécharger d’un coup** : un clic droit sur une ligne de la
plage descend la plage entière, en un seul transfert.

**Maj-clic étend, ⌘-clic pioche.** Le premier prend tout ce qui se trouve entre le dernier asset
choisi et celui que vous cliquez ; le second n’ajoute — ou ne retire — que celui-là. Un clic nu
recommence à zéro.

**Le point de départ suit vos choix.** Après un ⌘-clic, c’est ce dernier asset qui sert d’ancre au
Maj-clic suivant : vous piochez trois vignettes ici, puis vous étendez à partir de la troisième,
pas de la première.

**La Bibliothèque s’atteint aussi au clavier**, comme les autres listes du studio — voir
[Parcourir une liste au clavier](15-raccourcis.md#parcourir-une-liste-au-clavier).

---

## Se servir d’un asset du projet

Une fois l’asset sur votre disque, tout se passe dans l’**Explorateur**, colonne de gauche,
moitié basse. Le clic droit sur un fichier y offre douze gestes sur le fichier lui-même, puis
**deux groupes** qui s’adressent à l’asset :

| Groupe | Ce qu’il contient |
|---|---|
| **Envoyer vers ▸** | toutes les destinations capables de recevoir ce type d’asset |
| **Asset ▸** | **Nommer**, **Planche-contact**, **Envoyer** au cloud, et **Extraire ses images** pour une maille |

**Deux groupes et non dix lignes** : ce menu offrait déjà douze gestes sur le fichier, et tout
mettre à plat donnait une liste que personne ne lit.

Les trois premières entrées du groupe **Asset** agissent sur la **sélection entière** de
l’Explorateur, pas seulement sur la ligne cliquée ; leur libellé annonce le compte.

**Envoyer vers** liste les destinations, toujours dans le même ordre :

| Ligne | Où elle envoie l’asset | Pour quels types |
|---|---|---|
| **Utiliser comme ciel** | le ciel ouvert, espace Skyboxes | images |
| **Ajouter à la scène** | la scène 3D ouverte | mailles |
| **Faire jouer au personnage** | le personnage choisi dans la scène 3D ouverte | animations |
| **Ouvrir dans l’éditeur audio** | le montage ouvert, espace Audio | sons |
| **Placer comme calque** | l’image ouverte, espace Image | images |
| **Ajouter au montage** | la séquence ouverte, espace Vidéo | tous |
| **Utiliser comme couleur de base** | la matière ouverte, espace Matières | images |
| **Modifier l’image** | un onglet à elle, espace Image | canaux et ciels |


**Renommer, Afficher dans le dossier et Mettre à la corbeille sont ailleurs dans le même menu**,
parmi les douze gestes du fichier : ce sont des gestes sur un fichier, pas sur un asset.

**Renommer ne change le nom que dans ce projet** — celui du compte distant ne bouge pas. Un même
asset est tiré dans plusieurs projets et nommé pour ce que chacun en fait. Le nom est aussi
modifiable dans l’Inspecteur, d’un double-clic sur la ligne **Nom**.

**Le fichier suit, et c’est le même nom partout.** Un asset généré se pose sur le disque sous son
prompt — `Ruelle bleue au crépuscule.png` — et le renommer déplace vraiment le fichier. Ce que
lisent l’Explorateur, l’Inspecteur, l’onglet qui l’édite et votre Finder est donc une seule et même
chose. Un nom que le système de fichiers refuserait est refusé ici aussi, plutôt que corrigé en
silence ; un nom que le dossier tient déjà l’est également, plutôt que d’écraser une autre image.

> Les fichiers arrivés **avant** cette règle gardent le nom technique qu’ils portaient
> — `asset_40f76c36-8ad4-4def-a1b3-9125cba4da98.png`. Ils prennent leur vrai nom le jour où vous
> les renommez, et pas avant : le studio ne remue pas votre dossier tout seul.

**Faire jouer au personnage demande deux choses, et le menu n’en montre qu’une.** La ligne
s’active dès qu’une scène est ouverte quelque part — mais un mouvement se pose SUR un
personnage, et c’est celui que vous avez sélectionné dans la scène. **Sans personnage
sélectionné, la ligne reste active et ne fait rien**, sans message. C’est la seule ligne du menu
qui reste allumée alors qu’il manque quelque chose — partout ailleurs, ce qui manque grise :
choisissez d’abord le personnage dans la scène, puis lancez le mouvement.

**Modifier l’image est la ligne qui ouvre un onglet**, et elle n’apparaît que sur un canal
ou un ciel déjà posés sur le disque : ces deux-là s’assemblent dans leur espace — l’un tient
des canaux, l’autre une projection — et aucun des deux ne réécrit l’image qui est dessous.
C’est donc dans Image qu’on la retouche, et l’onglet ouvert est celui de l’asset lui-même.

**Extraire ses images ne s’adresse qu’à une maille**, et c’est l’autre moitié du même
besoin : les images que le modèle porte à l’intérieur ressortent dans le projet, où elles
deviennent des assets comme les autres — donc retouchables. Elle vit dans le groupe **Asset**, et
reste grisée tant que le modèle n’est pas sur votre disque.

Chaque destination porte l’icône de son espace, la même que dans la barre de titre. Le menu ne
montre que les destinations capables de recevoir **ce type-là** : le clic droit sur un son
n’offre pas de le poser comme ciel.

**En revanche, une destination dont l’espace n’a pas de document ouvert reste affichée, mais
grisée.** C’est délibéré : un menu qui change de longueur selon ce qui est ouvert est un menu
qu’on ne peut pas apprendre. Une ligne grisée vous dit quoi faire — ouvrir un document dans cet
espace — là où une ligne absente ne dit rien du tout.

C’est aussi ce qu’il faut regarder quand un envoi ne mène nulle part : le clic droit montre en une
fois ce que cet asset peut faire, et ce qui manque pour qu’il le fasse — **à la seule réserve de
Faire jouer au personnage**, dite plus haut.

### Le double-clic ouvre l’asset, il ne l’envoie nulle part

Dans l’**Explorateur**, un double-clic ouvre le fichier chez lui. C’est l’autre moitié du partage :
le double-clic sert **l’asset** — il l’ouvre ; le clic droit sert **le document déjà ouvert** — il
y envoie l’asset.

**Un asset ouvert par double-clic a son onglet à lui**, dans l’espace qui édite son type : une
image dans Image, une maille dans 3D, un son dans Audio. Vous n’avez rien à ouvrir avant.

**Il ne regarde jamais l’onglet que vous avez devant vous** : le double-clic ouvre l’asset dans
l’espace de son type, quoi qu’il y ait à l’écran.

**Rouvrir le même asset revient à son onglet**, il n’en naît pas un second : deux onglets sur un
même document sont deux historiques, et la seconde sauvegarde écraserait la première.

**Un refus se dit**, plutôt que de laisser un onglet vide à la place : un asset qu’aucun éditeur
ne prend, ou qui n’est pas encore descendu sur votre disque, vous le fait savoir.

Le type de l’asset désigne son éditeur, et rien d’autre n’entre en compte :

| Ce que vous double-cliquez | Où il s’ouvre |
|---|---|
| une **image** | l’espace Image |
| une **image qui porte un canal** | l’espace Matières |
| un **ciel** | l’espace Skyboxes |
| une **maille** | l’espace Modélisation |
| un **son** | l’espace Audio |
| une **vidéo** | l’espace Vidéo |

**Un double-clic qui ne mène nulle part le dit** : « Cet asset n’a pas pu être ouvert ». C’est le
cas d’un type qu’aucun éditeur ne prend, ou d’un asset qui n’est pas encore descendu sur votre
disque — pas d’un asset abîmé.

> **Le bouton `+` du rail gauche crée un document VIDE**, dans l’espace voulu. Le double-clic, lui,
> ouvre un document **sur un asset**. Ce sont les deux façons de commencer, et le clic droit sert
> ensuite à faire entrer de la matière dans ce qui est ouvert.

### Ce que le glisser-déposer sait faire aujourd’hui

| Vous glissez… | Vers… | Résultat |
|---|---|---|
| n’importe quel asset | la **timeline** | un clip sur une piste qui peut le prendre |
| une scène 3D, depuis l’Explorateur | la **timeline** | elle y devient un clip vivant |
| une image | la **toile** de l’espace Image | elle devient un calque de plus, armé |
| une image | l’aperçu d’une **matière** | elle devient la couleur de base |
| une image | la vignette d’un **canal** précis | elle devient ce canal-là |
| une image panoramique | l’aperçu d’un **ciel** | elle devient le ciel |
| une maille | la **vue 3D** | elle entre dans la scène, à l’origine |
| un son | l’**éditeur audio** | il s’ajoute au montage comme un clip, et c’est lui qu’on édite |
| un asset | un **champ d’asset** d’un formulaire de génération | il devient l’entrée du champ |
| un mouvement, ou une maille qui en porte | une **sous-piste** de la bande, en 3D | il y devient un bloc, là où vous lâchez |
| une image | une ligne d’image de l’**Inspecteur** — les cartes d’une matière, l’image d’un sprite | elle remplit cette ligne-là, et elle seule |
| un ciel | la ligne **Ciel** de l’Inspecteur, en 3D comme en Matières | il éclaire l’aperçu |
| n’importe quel asset | une **ligne de dossier** de l’Explorateur | son fichier y est déplacé |

**La timeline ne trie pas sur la durée** : un asset qui n’en a pas en reçoit une par défaut plutôt
qu’un refus. Elle trie en revanche les **pistes**, et un lâcher qui n’en trouve aucune reste sans
effet — voir [Poser un premier clip](10-espace-video.md#poser-un-premier-clip). Dans la vue 3D, le
dépôt est accepté **partout sur la vue**,
la barre d’outils comprise : un lâcher qui tombe à côté serait un raté qu’on ne voit pas venir.

**Au centre, un lâcher que personne ne prend n’est pas perdu** : sur la zone à onglets, un asset
dont aucun document ne veut s’ouvre dans son propre espace, comme au double-clic — une image
lâchée sur la vue 3D ouvre un document d’image. C’est vrai aussi quand rien n’est ouvert : le
centre vide prend le lâcher.

**Dans les colonnes et dans la bande, un lâcher refusé reste sans effet**, et rien ne le dit : la
vignette d’un canal ne prend que des images, et il n’y a personne derrière elle pour rattraper le
reste.

**L’Explorateur est le seul de ces dépôts qui ne fasse pas entrer l’asset dans un document : il
DÉPLACE son fichier**, comme le ferait le Finder — et un asset de la Bibliothèque est **rapatrié
d’abord**. C’est un autre geste que celui décrit dans
[Le panneau Projets](04-projets.md#les-gestes), qui range une ligne **de** l’Explorateur. Le blanc
compte aussi — sous les cartes il vise le dossier affiché, sous l’arbre la racine du projet — mais
lui ne s’allume pas.

**Et ce dépôt-là porte deux silences.** Un asset dont le studio ne tient aucun fichier ne bouge
pas : la ligne s’allume quand même, le type ne se lisant qu’au lâcher. Le pointeur montre en outre
le `+` d’une copie, alors que le fichier est bel et bien **déplacé**.

---

## L’inspecteur d’un asset

Sélectionnez un asset et regardez l’**Inspecteur**, dans la colonne de droite. Il montre, selon
ce qu’il sait :

| Section | Ce qu’elle contient |
|---|---|
| **Identité** | le nom, le type, la **synchronisation**, la durée, les dimensions, la taille, la date de création |
| **Génération** | le modèle, la graine, le prompt — et deux boutons, **Épingler la recette** et **Régénérer** |
| **Fichier** | l’**Emplacement** sur le disque, et rien d’autre — le groupe n’apparaît que pour un asset présent localement |

**La ligne Synchronisation est la seule qui dise encore où en est votre copie vis-à-vis de la
bibliothèque.** Elle porte le badge décrit plus bas ; c’est ici qu’on le lit pour un asset du
projet, la Bibliothèque ne dessinant plus de ligne locale.

Le bouton **Afficher dans le dossier** sort du studio : il ouvre le Finder, l’Explorateur ou
votre gestionnaire de fichiers, le fichier déjà sélectionné.

> « **Fichier introuvable** » signifie qu’un média lié a été déplacé ou supprimé de son
> emplacement d’origine. Voir la section suivante.

---

## Ce qui circule entre le disque et le compte

Votre projet est un dossier sur votre disque. Votre compte distant, lui, a sa propre
bibliothèque, en ligne. Les deux existent séparément, et **rien ne circule entre eux sans que
vous le demandiez**.

> **« Demander » ne veut pas dire « demander depuis un de ces deux panneaux ».** Deux gestes faits
> ailleurs envoient une image sans passer par les boutons ci-dessous : **lancer une génération**
> qui porte une image de référence, et cliquer sur **Décrire le style des références** dans le
> générateur (chapitre 6). Dans les deux cas l’API doit voir l’image pour répondre, donc le
> studio l’envoie une fois, et son badge passe à **Synchronisé**. Rien n’est envoyé pendant que
> vous tapez.

### Ce que le badge d’une vignette raconte

Une petite marque dit où en est un asset vis-à-vis de la bibliothèque :

| Badge | Ce qu’il veut dire |
|---|---|
| **Local seulement** | le fichier est chez vous, la bibliothèque ne le connaît pas |
| **Synchronisé avec la bibliothèque** | les deux côtés ont la même version |
| **Modifié ici — à envoyer** | votre copie a bougé depuis le dernier envoi |
| **Modifié dans la bibliothèque — à rapatrier** | c’est l’autre côté qui a bougé |
| **Modifié des deux côtés** | les deux versions ont divergé |
| **Le dernier envoi a échoué** | la tentative précédente n’est pas passée |
| **Appartient à un autre projet** | le jumeau en ligne relève d’une autre clé API que celle qui est active |
| **Dans votre bibliothèque — pas sur ce disque** | l’asset existe en ligne sous votre clé, aucun fichier ici |
| **Publié par quelqu’un d’autre — pas sur ce disque** | il ne vous appartient pas ; un double-clic ou un glisser-déposer le rapatrie |

**Où chaque badge se lit a changé avec les panneaux.** La Bibliothèque ne dessine que ceux qui
parlent d’une ligne distante — « pas sur ce disque », « publié par quelqu’un d’autre »,
« synchronisé », « à rapatrier », « modifié des deux côtés », « rapatriement en cours ». Les
autres — « local seulement », « à envoyer », « le dernier envoi a échoué », « appartient à un
autre projet » — parlent d’une ligne du projet, et se lisent sur la **ligne Synchronisation de
l’Inspecteur**.

**« Synchronisé » se dessine désormais sur une vignette**, où il restait muet autrefois. Le
raisonnement s’est inversé avec le panneau : dans une grille qui listait le PROJET, presque tout
est synchronisé et le marquer couvrait l’écran de pastilles inutiles ; dans une grille qui liste
une bibliothèque distante, « vous avez déjà celui-là » est l’exception — et la seule chose à
savoir avant de dépenser un téléchargement.

**« Local seulement » reste muet en vignette**, pour la raison d’origine : c’est l’état ordinaire
d’un fichier qui n’a jamais quitté votre disque.

Ce badge n’est pas stocké, il est **recalculé** : il dépend du compte actif, et une clé API
ouvre sur un projet et un seul. Changez de compte dans la barre de titre, et les badges se
relisent — c’est le même fichier, c’est la bibliothèque d’en face qui a changé.

> **« À rapatrier » et « modifié des deux côtés » se lisent maintenant du côté DISTANT**, sur la
> ligne qu’on téléchargerait — c’est là qu’ils veulent dire quelque chose, et ils ne dépendent
> plus d’une page de la bibliothèque qui se serait trouvée en main. Ils restent rares : tant que
> les transferts se déclenchent à la main, rien ne modifie la version en ligne dans votre dos.
>
> **« Appartient à un autre projet » s’obtient sans rien attendre** : rapatriez un asset avec une
> clé, basculez sur une autre dans la barre de titre, et il porte le badge. C’est le paragraphe
> ci-dessus à l’œuvre, pas un cas de synchronisation.
>
> **Aucun de ces badges n’est un filtre.** La facette **Origine** dit d’où vient une ligne, pas où
> elle en est : narrower par état demandait neuf valeurs dont sept parlaient d’une ligne que ce
> panneau ne dessine plus.

### Envoyer une sélection

L’entrée **Envoyer**, dans le groupe **Asset** du clic droit de l’**Explorateur**, téléverse les
fichiers **sélectionnés** dans la bibliothèque de votre compte.

Trois choses le décrivent mieux qu’une phrase de présentation :

- **il ne part jamais tout seul** — il faut une sélection, et un clic ;
- **il refuse de se lancer deux fois** : pendant un transfert, le bouton est inactif, pour
  qu’un second clic ne pousse pas par-dessus le premier ;
- **il rend compte asset par asset.** Ce qui est passé passe, ce qui a échoué prend le badge
  *échec* et une ligne dans le journal — un envoi n’est pas un tout ou rien.

Une sélection sans fichier laisse l’entrée grisée.

> **Les deux sens sont dans deux panneaux, et c’est le partage de ce chapitre** : on ENVOIE
> depuis l’Explorateur, où sont vos fichiers ; on TÉLÉCHARGE depuis la Bibliothèque, où est ce que
> vous n’avez pas encore.
>
> **Les entrées sont grisées, jamais cachées**, sans projet ouvert ou pendant un transfert : une
> entrée qui va et vient au gré de ce qui est ouvert est une entrée que personne n’apprend.

### Nommer par ce que l’API voit

L’entrée **Nommer**, dans le même groupe, demande à l’API de regarder les images sélectionnées et
de leur donner un nom tiré de leur contenu. Les noms obtenus atterrissent dans le catalogue.

**Il ne voit que les images que la bibliothèque connaît déjà.** L’API décrit ce qu’elle héberge :
une image qui n’a jamais été envoyée est écartée de la demande, sans le dire. Envoyez-la d’abord,
nommez ensuite.

> **Ce bouton n’est pas la seule porte, et c’est la seule chose à retenir ici.** Le réglage
> **Nommer les assets rapatriés**, dans **Génération**, est **coché par défaut** : une image qui
> arrive sans nom utile est envoyée à l’API sans qu’on ait cliqué, et cela **consomme des unités
> créatives**. Le chapitre [Tous les réglages](14-reglages.md) le détaille — c’est le seul endroit
> où le studio dépense de lui-même, et le décocher suffit à l’arrêter.

---

## Importer vos propres médias

Un clic droit sur le **vide** de l’Explorateur offre **Importer un média**. Le geste vise le
PROJET et non une ligne, ce qui est pourquoi il vit sous le blanc, à côté de **Nouveau dossier**.

### Ce qui s’importe

| Type | Extensions acceptées |
|---|---|
| **Vidéo** | `mp4` `mov` `mkv` `webm` `avi` `mxf` `m4v` |
| **Audio** | `wav` `mp3` `aac` `flac` `m4a` `ogg` `aiff` |
| **Image** | `png` `ora` `jpg` `jpeg` `webp` `avif` `gif` `svg` `tif` `tiff` `exr` `hdr` |
| **3D** | `glb` `obj` `fbx` `stl` `ply` `dae` `usdz` — et `bvh` pour une capture de mouvement |
| **Documents** | `ora` `gltf` `otio` `mtlx` |
| **Montage avec médias** | `otioz` |

La liste des assets vaut aussi pour le sélecteur. Le dépôt depuis le bureau, l’icône de
l’application et **Ouvrir avec** acceptent également les documents standard et les montages
groupés du tableau. Un document est copié dans le projet puis ouvert ; un `.otioz` est dépaqueté
avec ses médias comme par **Fichier › Importer**. Une cible compatible se dessine en bleu ; un
format refusé se dessine en rouge et le journal nomme les fichiers qui ne sont pas entrés. Dans un
lot mélangé, les fichiers acceptés entrent et les autres sont signalés ensemble.

**Un fichier 3D devient un `.glb` en entrant.** Le studio ne travaille qu’avec un seul conteneur
3D, le glTF binaire : un `.obj`, un `.fbx`, un `.dae`, un `.usdz`, un `.stl`, un `.ply` ou un
`.bvh` est converti une fois, à l’import, et c’est ce `.glb` que le catalogue, la scène, l’éditeur
de personnage et l’export de jeu lisent ensuite. L’original n’est pas jeté : il est rangé dans un
dossier `.sources` à côté du fichier converti, avec ce qu’il référençait — le `.mtl` et les
textures d’un `.obj`, les images d’un `.dae` — hors du catalogue. Ce que la conversion n’a pas pu
garder est dit dans le journal au moment où le fichier entre : des matières absentes pour un
`.stl`, des textures introuvables, un ombrage qui n’était pas physique et a été approché.

**Modèle ou animation ?** Le dossier où le fichier est déposé décide d’abord — Modèles ou
Animations — puis le contenu corrige ce qui est impossible : un fichier sans aucun clip n’est pas
une animation, un fichier sans aucun maillage n’est pas un modèle. Un `.fbx` Mixamo, qui porte un
personnage et sa marche, reste l’animation qu’il a été rangé comme. Un `.bvh` est toujours une
animation. Les fichiers déjà présents dans un projet avant cette règle ne sont pas touchés.

> Un `.gltf` séparé qui n’est pas un document AI Desktop Studio ne s’importe pas encore comme modèle.

### Les médias audio, vidéo et image ne sont pas copiés — à l’import

**Important.** Pour l’audio, la vidéo et les images, le sélecteur **Importer un média** ne copie pas
votre fichier dans le projet : il crée un **lien** vers l’endroit où il se trouve. Les fichiers 3D
font exception : ils sont copiés puis convertis comme décrit ci-dessus.

Deux conséquences :

- **Avantage** — un rush vidéo de 12 Go n’est pas dupliqué. Votre projet reste léger.
- **Inconvénient** — si vous déplacez, renommez ou supprimez le fichier d’origine, le lien se
  casse **en silence** : rien ne le signale tant que vous n’avez pas cliqué sur **Afficher dans le
  dossier**, et c’est ce clic, ne trouvant rien, qui fait apparaître
  « Fichier introuvable » dans l’inspecteur.

Si vous devez emporter un projet ailleurs, emportez aussi les médias qu’il pointe — ou copiez-les
vous-même dans le dossier du projet avant de les importer.

**Mais l’ÉDITER le fait entrer dans le projet.** Un média lié que vous retouchez puis enregistrez —
`⌘S` sur une image, **Appliquer** sur une prise sonore — est écrit dans le dossier du projet, et
c’est cette copie que le studio montre ensuite partout : l’Explorateur, la scène, l’inspecteur.
Le lien est remplacé par un vrai fichier, et **Afficher dans le dossier** mène
désormais là.

**Le fichier que vous aviez pointé n’est pas touché.** Il reste où il est, dans l’état où vous
l’avez laissé : écrire dans un dossier que vous avez seulement montré au studio serait un autre
geste que celui d’éditer un asset. Si vous vouliez modifier l’original, faites-le dans l’outil qui
l’a produit.

### Ce qui se passe pendant l’import

Un bandeau apparaît en haut de l’**Explorateur** et suit chaque fichier, étape par étape :

| Étape | Ce qui se passe | Pourquoi |
|---|---|---|
| **En attente…** | le fichier fait la queue | |
| **Analyse…** | le studio lit ce que le fichier est réellement | durée, codec, dimensions, images par seconde |
| **Empreinte…** | il calcule une signature du contenu | pour repérer les doublons |
| **Proxy…** | il fabrique une copie allégée de la vidéo | pour naviguer dedans sans à-coups |
| **Forme d’onde…** | il dessine la forme d’onde du son | pour la voir sur la piste audio |
| **Prêt** | terminé | |

**Chaque étape est interruptible.** Le bouton **Interrompre la préparation** l’arrête : vous
n’avez pas à attendre le proxy d’un rush de vingt minutes pour commencer à travailler. Le
fichier reste importé, simplement sans son proxy.

Deux messages particuliers :

| Message | Ce que ça veut dire |
|---|---|
| **Déjà dans le projet** | ce fichier exact y est déjà — c’est l’empreinte qui l’a vu |
| **Fichier illisible** | le fichier est corrompu, ou dans un format que le studio ne décode pas |

### Si la préparation vidéo est indisponible

Le proxy et la forme d’onde sont fabriqués par **ffmpeg**, un utilitaire de traitement vidéo.

**Le studio porte le sien**, sur macOS, Windows et Linux. Vous n’avez rien à installer : c’est
une décision assumée, parce qu’un import qui a besoin d’un proxy n’est pas le moment d’apprendre
à quelqu’un ce qu’est un codec.

Le studio essaie trois candidats, dans cet ordre :

1. le binaire **livré avec l’application** ;
2. le chemin que vous avez indiqué dans **Réglages ▸ Médias ▸ Chemin de ffmpeg** ;
3. ce qui se trouve sur le `PATH` de votre système.

Il retient le **premier qui existe**, et s’arrête là : il ne redescend pas la liste. Le binaire
retenu est bien lancé ensuite, mais pour dire si la préparation vidéo est disponible — pas pour
choisir.

**Deux conséquences, et la seconde surprend.** Le chemin des réglages ne sert que si le binaire
livré est **absent** — c’est le cas quand on lance le studio depuis son code source sans avoir
exécuté `pnpm ffmpeg:fetch`. Et si le binaire retenu est présent mais ne démarre pas, indiquer un
autre chemin dans les réglages **ne le rattrape pas** : le studio annonce l’indisponibilité, il
faut réparer ou remplacer ce binaire-là. Voir
[Quand ça coince](16-depannage.md#le-cas-déroutant--ffmpeg-est-là-et-le-studio-dit-quil-ny-est-pas).

Quand le candidat retenu ne démarre pas — ou qu’il n’y en a aucun — un **triangle d’alerte ambre**
apparaît dans la barre de titre de l’**Explorateur**, à gauche des trois boutons de vue.
Survolez-le, ou atteignez-le au clavier, et il dit : « Préparation vidéo indisponible : ni copie
allégée ni forme d’onde. » `Échap` referme l’infobulle.

**L’import fonctionne quand même.** Vous perdez seulement le confort : la navigation dans les
vidéos sera moins fluide, et les pistes audio n’afficheront pas leur dessin.

**Ce cas est devenu rare.** Il ne concerne guère que qui a lancé le studio depuis son code source
sans avoir exécuté `pnpm ffmpeg:fetch`.

---

## Où sont vraiment vos fichiers

**Là où vous les avez mis.** Un asset généré atterrit dans l’un des sept dossiers de départ — voir
[Ce qu’on y trouve](#ce-quon-y-trouve) — et rien ne l’y retient : déplacez-le, rangez-le dans une
arborescence à vous, l’Explorateur continue de le montrer et sa fiche le suit. La disposition du
dossier de projet est décrite au chapitre [Les projets](04-projets.md#ce-quil-y-a-dedans).

Ce sont de **vrais fichiers, dans de vrais formats**. Vous pouvez les ouvrir avec n’importe quel
autre logiciel, les copier, les envoyer.

**Sauf les médias importés**, qui restent là où ils étaient — c’est tout l’intérêt du lien. Jusqu’à
ce que vous les éditiez : la version enregistrée, elle, est écrite dans le projet.

---

[← Générer](06-generer.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Espace Image →](08-espace-image.md)
