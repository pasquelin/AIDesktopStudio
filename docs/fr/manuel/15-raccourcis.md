# 15. Tous les raccourcis

[← Tous les réglages](14-reglages.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Quand ça coince →](16-depannage.md)

La liste complète des touches, par contexte, et comment les changer.

---

## Lire un raccourci

Les touches sont écrites avec des symboles, les mêmes partout dans le studio.

| Symbole | Touche | Où |
|---|---|---|
| `⌘` | Commande | macOS. C’est `Ctrl` sur Windows et Linux |
| `⇧` | Majuscule (Shift) | partout |
| `⌥` | Option / Alt | partout |
| `⌃` | Contrôle | macOS |

`⌘Z` se lit donc « Commande + Z » sur un Mac, et « Ctrl + Z » ailleurs. Les symboles s’écrivent
collés : `⇧⌘Z` veut dire les trois touches ensemble.

> **Sur Windows et Linux, `⌘` se lit `Ctrl` partout**, y compris pour les raccourcis qu’une
> surface écoute elle-même. Ce qu’il reste à corriger est l’affichage : l’infobulle et l’écran des
> raccourcis dessinent le symbole du Mac au lieu d’écrire `Ctrl` — voir
> [Ce qui n’existe pas encore](18-limites.md).
>
> **Trois raccourcis diffèrent, parce que le bureau lui-même en décide autrement** :

| Action | macOS | Windows et Linux |
|---|---|---|
| **Plein écran** | `⌃⌘F` | `F11` |
| **Déplacer l’espace à gauche** | `⌥⌘←` | `Ctrl+Page↑` |
| **Déplacer l’espace à droite** | `⌥⌘→` | `Ctrl+Page↓` |

---

## Une notion à comprendre : la lettre gravée

**Un raccourci se nomme par le caractère écrit sur la touche, jamais par sa place.** `⌘Z` est la
touche marquée `Z`, où qu’elle soit sur votre clavier : au milieu à gauche sur un AZERTY, en bas à
gauche sur un QWERTY. Vous appuyez sur ce que vous lisez.

C’est la règle de toutes les autres applications, et elle vaut aussi pour ce que le système
garde pour lui : `⌘Q` quitte le studio, `⌘M` réduit la fenêtre. Aucune commande
d’ici ne peut prendre ces touches-là.

> **Une touche qui n’écrit rien que le studio sache lire garde sa place.** C’est le cas des
> crochets `[` et `]`, qu’un clavier français n’atteint qu’avec `⌥` : on appuie alors au même
> endroit qu’un clavier américain, quel que soit le symbole gravé. Le vol dans la scène suit la
> même logique, et pour une autre raison — voir plus bas.

---

## Une notion à comprendre : le contexte

**Le même raccourci ne fait pas la même chose partout.**

`S` coupe un clip dans le montage, et redimensionne un objet dans la vue 3D. `Suppr` retire un
clip ici, un objet là. Ce n’est pas une collision : c’est **exprès**.

Le studio range chaque action dans un **contexte** — la surface où elle a un sens. Une seule
surface écoute à la fois, celle que vous regardez. Une touche partagée entre deux contextes ne
peut donc jamais être ambiguë.

Neuf contextes :

| Contexte | Où il s’applique |
|---|---|
| **Partout dans l’application** | n’importe quelle fenêtre, n’importe quel espace |
| **Dans la barre des espaces** | la barre du haut, quand le focus est sur l’un de ses onglets |
| **Dans l’explorateur** | le panneau du dossier de projet, dans tous les espaces et à l’accueil |
| **Dans la vue 3D** | le viewport de l’espace Modélisation |
| **Dans le montage** | la timeline de l’espace Vidéo et de l’espace Audio |
| **Dans l’image** | le canvas de l’espace Image |
| **Dans le ciel** | la vue de l’espace Skyboxes |
| **Dans l’éditeur audio** | la forme d’onde de l’espace Audio |
| **Dans la matière** | l’aperçu et les canaux de l’espace Matières |

**Une surface peut écouter une touche sans être un contexte, et la garantie ci-dessus ne la couvre
alors pas.** La bande d’animation de l’espace Modélisation en est le cas, et elle écoute
**quatre** touches : `Suppr` et `Retour arrière` retirent ce qui est choisi — la clé, ou le bloc
d’animation — `⌘D` duplique le bloc choisi bout à bout, et `S` le coupe à la tête de lecture. Les
quatre sont liées à la bande et non au registre des contextes : elles ne figurent pas dans l’écran
des raccourcis, et ne se changent pas. Le clic droit sur un bloc porte les trois gestes qui le
concernent — voir [l’espace Modélisation](09-espace-modelisation.md).

Un seul contexte est spécial : **Partout dans l’application**. Ses touches passent par le menu du
système d’exploitation, qui les attrape avant tout le monde. Elles sont donc les seules à ne
jamais pouvoir être « recouvertes » par un autre contexte — et les seules dont un conflit est
toujours un vrai conflit.

**Une exception, une seule : `⌥D`, la dictée.** Elle se **maintient** au lieu de se taper, et un
menu du système n’a rien pour rapporter un relâchement — c’est donc la fenêtre qui l’entend, et
elle n’a aucune ligne de menu. C’est aussi ce qui lui permet d’écrire dans un champ de saisie,
voir plus bas.

---

## Partout dans l’application

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Nouveau…** | `⌘N` | ouvre la fenêtre qui crée un projet ou un document, depuis n’importe quel écran |
| **Nouveau projet** | `⌥⌘N` | crée un projet vide et l’ouvre, sans passer par la fenêtre |
| **Ouvrir un projet** | `⌘O` | ouvre un projet existant à la place de celui en cours |
| **Enregistrer le document** | `⌘S` | écrit le document en avant dans le projet — **et réécrit l’asset dont il vient**, dans l’espace Image |
| **Enregistrer sous** | `⇧⌘S` | écrit une copie de l’asset à côté de l’original et continue sur elle, sans demander de nom |
| **Réglages** | `⌘,` | ouvre la fenêtre des réglages |
| **Assistant** | `⌘K` | ouvre la fenêtre où l’on dit ce que l’on veut faire, à la voix ou au clavier |
| **Dicter** | `⌥D` | écoute le micro et écrit ce que vous dites au curseur |
| **Plein écran** | `⌃⌘F` (`F11` hors macOS) | fait occuper tout l’écran à la fenêtre |
| **Réinitialiser la disposition** | *aucune* | remet les panneaux là où ils étaient au départ |

**Réinitialiser la disposition** n’a volontairement **pas** de touche par défaut : c’est une action
qu’on cherche une fois tous les six mois, et lui donner un raccourci reviendrait à occuper une
touche pour rien. Elle est dans le menu **Affichage**, et vous pouvez lui en attribuer une (voir
plus bas).

**Dicter est le seul raccourci qui fonctionne alors que vous êtes en train d’écrire dans un
champ** — tous les autres se taisent dans ce cas. Voir
[Générer](06-generer.md#dicter-au-lieu-de-taper).

Il se **maintient** au lieu de se déclencher : on appuie, on parle, on relâche. C’est réglable
en bascule dans les [réglages](14-reglages.md#façon-de-déclencher).

> **Le projet ouvert s’enregistre au fur et à mesure.** `⌘S` ne concerne que le **document** en
> cours — une scène 3D, par exemple — pas le projet lui-même. L’onglet porte un point (`•`) tant
> que ce qui est à l’écran n’est pas ce qui est sur le disque.

### Parcourir une liste au clavier

Les listes du studio se traversent toutes de la même façon : l’Explorateur, la Bibliothèque, les
calques, les modèles, l’arbre de la scène.

| Touche | Effet |
|---|---|
| `Tab` | entre dans la liste, ou en sort |
| `←` `→` | la cellule précédente, la suivante |
| `↑` `↓` | la même colonne, une rangée plus haut ou plus bas |
| `Entrée` | ouvre |
| `Espace` | sélectionne |

**Une ligne qui ne fait qu’ouvrir laisse `Espace` au défilement.** C’est le cas de
l’Explorateur : ouvrir un document peut vous emmener dans un autre espace de travail, et
`Espace` ne promet cela nulle part ailleurs dans le studio.

`Tab` ramène là où vous étiez : la liste garde un seul point d’entrée, celui de votre sélection
s’il y en a une, la première cellule visible sinon.

**Dans l’Explorateur, la sélection se fait aussi à plusieurs** — `⌘` pioche, `Maj` étend. Voir
[Choisir plusieurs assets](07-assets.md#choisir-plusieurs-assets).

### Parcourir un menu au clavier

Les menus se traversent comme les listes, à une différence près : **ils prennent le focus en
s’ouvrant**, sur leur première ligne. Vous n’avez rien à faire pour y entrer.

| Touche | Effet |
|---|---|
| `↑` `↓` | la ligne précédente, la suivante — en boucle aux deux bouts |
| `Début` `Fin` | la première ligne, la dernière |
| `Entrée` | choisit la ligne |
| `Échap` | ferme, et rend le focus là où il était |
| `Tab` | ferme aussi — un menu n’est pas un endroit où l’on tabule |

**Pour ouvrir le menu d’un groupe d’outils : `⌥↓`.** La plupart des menus s’ouvrent d’un clic,
donc d’une `Entrée`. Un groupe **dont un outil est armé** fait exception : le clic y choisit
l’outil, et le menu ne s’ouvrait qu’au survol de la souris. `⌥↓` est le chemin du clavier ;
`Entrée` continue d’armer l’outil, comme le clic.

Un groupe qui n’arme rien — le **Ajouter** de la 3D, qui n’est qu’une liste d’actions —
s’ouvre au clic comme les autres menus : il n’y a pas d’outil à choisir à sa place.

Comme les touches de parcours ci-dessus, `⌥↓` appartient au bouton et non au registre : il ne
se change pas.

**Les lignes grisées sont sautées.** Une ligne qu’on ne peut pas choisir à la souris ne se prend
pas au clavier non plus, et s’y arrêter donnerait un parcours qui semble bloqué.

**Une ligne cochée dit ce que sa coche veut dire.** Certaines sont des alternatives — le mode
d’un outil, le compte actif, la vue d’un quart de l’espace Modélisation : en cocher une décoche les
autres. D’autres se règlent chacune pour soi, comme les deux cadenas d’un calque. Un lecteur
d’écran annonce les premières comme des boutons radio et les secondes comme des cases à cocher.

### Ranger la barre des espaces

| Touche | Effet |
|---|---|
| `⌥⌘←` / `Ctrl+Page↑` | déplace l’espace focalisé d’un cran vers la gauche |
| `⌥⌘→` / `Ctrl+Page↓` | déplace l’espace focalisé d’un cran vers la droite |

**Pas les flèches nues** : celles-ci appartiennent à qui parcourt la barre, et les prendre
échangerait un geste contre un autre. Ce sont les touches que Safari, Chrome et VSCode donnent au
même geste, chacun sur son système. Le glisser et le clic droit font la même chose — voir
[La barre de titre](03-la-fenetre.md#ranger-les-espaces-dans-lordre-qui-vous-arrange).

Ces deux touches se changent comme les autres, sous le contexte **Dans la barre des espaces** de
l’écran des raccourcis.

---

## Dans l’explorateur

Le seul contexte qui ne soit pas un espace : c’est le panneau du dossier de projet, et il écoute
partout où ce panneau est ouvert — dans les six espaces comme à l’accueil. L’écran des raccourcis
le nomme exactement comme ce titre.

**Il n’écoute que si le focus est dedans.** Cliquez une ligne, ou entrez-y au `Tab` : tant que
vous êtes ailleurs, ces touches appartiennent au document ouvert. C’est ce qui permet à `⌘Z`,
`⌘C` et `⌘V` d’exister ici sans jamais marcher sur celles du canevas.

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Nouveau dossier** | `⇧⌘N` | crée un dossier vide dans celui qui est affiché, et ouvre son nom à la saisie |
| **Dupliquer** | `⌘D` | pose une copie de chaque élément choisi à côté de l’original, sous le premier nom libre |
| **Couper** | `⌘X` | retient la sélection pour la déplacer au prochain collage |
| **Copier** | `⌘C` | retient la sélection pour en poser une copie au prochain collage |
| **Coller** | `⌘V` | dépose dans le dossier affiché ce que le presse-papiers retient |
| **Mettre à la corbeille** | `⌘⌫` | envoie la sélection à la corbeille du système |
| **Annuler le dernier geste sur les fichiers** | `⌘Z` | remet à sa place le dernier lot déplacé, renommé, dupliqué ou créé |
| **Rétablir le geste sur les fichiers** | `⇧⌘Z` | refait à l’identique le lot qui vient d’être annulé |

**Couper ne déplace rien** : les lignes retenues s’affichent atténuées, et rien ne bouge tant que
vous n’avez pas collé. **Un dossier se duplique avec tout ce qu’il contient.**

**Un collage refuse au détail, pas en bloc.** Si un nom est déjà pris dans le dossier d’arrivée,
c’est cet élément-là qui est refusé ; les autres passent.

**`⌘⌫` plutôt que `⌫` seul**, et c’est délibéré : c’est le seul geste de ce contexte que le studio
ne sait pas annuler, et une touche de suppression nue est trop proche de ce qu’une main fait en
parcourant une liste.

> **Quatre gestes du menu ne sont pas dans cette table**, et ils ne sont pas dans l’écran des
> raccourcis non plus. **Ouvrir** répond à `Entrée`, mais c’est l’arbre qui écoute cette touche,
> pas le registre : elle ne se change donc pas. **Afficher dans le dossier**, **Informations sur
> le fichier** et **Renommer** ne répondent à aucune touche du tout — ils vivent dans le menu du
> clic droit, et nulle part ailleurs. Voir
> [Les projets](04-projets.md#le-clic-droit--douze-gestes-en-quatre-groupes).

---

## Dans la vue 3D

### Les outils

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Sélectionner** | `V` | l’outil de base : cliquer un objet pour le choisir, sans rien lui faire |
| **Déplacer** | `G` | tirer sur les flèches de couleur pour le glisser |
| **Pivoter** | `R` | tirer sur les cercles de couleur pour le faire tourner |
| **Redimensionner** | `S` | tirer sur les poignées. `⇧` garde les proportions |
| **Tous les magnétismes** | `M` | allume ou éteint d’un coup les quatre magnétismes — surface, grille, angle, échelle. La barre en haut du viewport les règle un par un |
| **Repère local** | `L` | aligne les poignées sur l’orientation de l’objet plutôt que sur celle du monde |
| **Projection** | `O` | bascule entre perspective et projection orthographique |
| **Mode de rendu** | `Z` | fait défiler les neuf façons de dessiner |
| **Quatre vues** | `⇧Q` | partage le viewport en quatre : la vue en cours, dessus, face, profil |
| **Arêtes en quads** | `⇧W` | en filaire, efface les diagonales que la triangulation a ajoutées |
| **Afficher les squelettes** | `B` | dessine les os de chaque modèle à squelette par-dessus la scène |
| **Mode pose** | `P` | le clic choisit alors les **os** d’un squelette au lieu des objets |
| **Cadrer la sélection** | `F` | rapproche la caméra pour que l’objet remplisse la vue |
| **Supprimer** | `Suppr` | retire tout ce qui est sélectionné. `⌘Z` le fait revenir |

### Assembler et dupliquer

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Grouper** | `⌘G` | range les objets sélectionnés sous un même groupe |
| **Dupliquer** | `⌘D` | pose une copie de la sélection au même endroit, et la sélectionne |
| **Copier** | `⌘C` | retient la sélection, sans toucher à la scène |
| **Couper** | `⌘X` | la retient et la retire de la scène |
| **Coller** | `⌘V` | pose ce qui a été retenu dans la scène en cours |

> Ce presse-papiers est celui du studio : il ne touche pas à celui du système, et `⌘C` laisse la
> main dès que du texte est sélectionné à l’écran.

### Annuler et rétablir

| Action | Touche |
|---|---|
| **Annuler** | `⌘Z` |
| **Rétablir** | `⇧⌘Z` |

### Voler dans la scène

Ces touches se **maintiennent** au lieu de se presser : tant que vous appuyez, la caméra bouge.

| Direction | Touche (clavier QWERTY) | Touche (clavier AZERTY) | Flèche |
|---|---|---|---|
| **Avancer** | `W` | `Z` | `↑` |
| **Reculer** | `S` | `S` | `↓` |
| **Gauche** | `A` | `Q` | `←` |
| **Droite** | `D` | `D` | `→` |
| **Monter** | `E` | `E` | — |
| **Descendre** | `Q` | `A` | — |
| **Accélérer** | `⇧` gauche | `⇧` gauche | — |

Les flèches font la même chose que les quatre lettres : elles s’ajoutent, elles ne remplacent rien.
L’altitude n’en a pas, les quatre étant déjà prises par le déplacement au sol.

> **Pourquoi deux colonnes.** Le studio écoute la **position** de la touche sur le clavier, pas la
> lettre écrite dessus. Les quatre touches de direction sont donc toujours le même carré, en haut
> à gauche : `WASD` si votre clavier est américain, `ZQSD` s’il est français. Vous n’avez rien à
> régler.
>
> **Une seule exception : l’Entrée du pavé numérique.** C’est une position distincte de l’Entrée
> principale, mais le studio la lit comme elle. Les deux touches déclenchent donc la même chose,
> et remapper l’une déplace l’autre — vous ne pouvez pas les séparer. Les autres touches du pavé
> gardent leur position propre : selon que le verrou numérique est mis ou non, elles changent de
> sens, et le studio ne peut pas deviner lequel vous vouliez.

La vitesse et l’accélération se règlent dans les [réglages](14-reglages.md#espaces-de-travail).

> **`S` porte deux sens, et c’est le bouton de la souris qui tranche.** Aucun bouton enfoncé,
> `S` choisit l’outil **Redimensionner** ; un bouton maintenu dans la vue — gauche ou droit — il
> fait reculer la caméra et ne touche plus à l’outil. Il en va de même des flèches : pendant un
> vol elles pilotent la caméra, et la liste qui avait le focus ne les reçoit pas.

### Ce que la souris fait, sans raccourci

| Geste | Effet |
|---|---|
| **Clic gauche** | choisit l’objet sous le curseur — ou l’**os** le plus proche, en mode pose (`P`) |
| **Clic droit maintenu + souris** | tourne la tête, sur place |
| **Un bouton maintenu + clavier** | déplace la caméra — voir [l’espace Modélisation](09-espace-modelisation.md) |
| **Molette** | avance ou recule |
| **Clic sur une poignée + glisser** | applique l’outil en cours |

---

## Dans le montage

### Lecture

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Lire / Pause** | `Espace` | lance la lecture, ou l’arrête là où elle en est |
| **Aller au début** | `Début` (`Home`) | ramène la tête de lecture tout au début |
| **Aller à la fin** | `Fin` (`End`) | envoie la tête de lecture après le dernier clip |

> **`Espace` ne se répète pas.** Une touche maintenue répète l’appui trente fois par seconde ; une
> lecture qui démarre et s’arrête trente fois par seconde est un stroboscope, pas un raccourci. Le
> studio ignore les répétitions.

### Montage

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Couper le clip** | `S` | coupe en deux à la tête de lecture |
| **Fenêtre de retour** | `F` | ouvre le montage dans une fenêtre à part, à poser sur un second écran |
| **Supprimer le clip** | `Suppr` | retire le clip du montage. Le fichier d’origine reste dans les assets |

**`F` sert deux fois, et ne se dispute avec rien.** Elle **cadre la sélection** dans la vue 3D.
Les deux appartiennent à des contextes différents, qui ne sont jamais à l’écoute en même temps.

### Zoom

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Zoom avant** | `⌘=` | étale le montage pour voir le détail |
| **Zoom arrière** | `⌘−` | resserre pour en voir davantage d’un coup |
| **Tout afficher** | `⇧Z` | ajuste pour que le montage entier tienne à l’écran |

### Annuler et rétablir

| Action | Touche |
|---|---|
| **Annuler** | `⌘Z` |
| **Rétablir** | `⇧⌘Z` |

---

## Dans l’image

### Armer un outil

Chaque outil de la barre est une commande : sa touche l’arme, et se remappe comme les autres.

| Touche | Outil | | Touche | Outil |
|---|---|---|---|---|
| `V` | Déplacement | | `U` | Rectangle |
| `H` | Main | | `⇧U` | Trait |
| `C` | Recadrage | | `A` | Flèche |
| `M` | Sélection rectangulaire | | `O` | Ellipse |
| `L` | Lasso | | `B` | Pinceau |
| `T` | Texte | | `⇧B` | Crayon |
| `G` | Pot de peinture | | `E` | Gomme |
|  |  | | `I` | Pipette |

**Trois outils n’ont pas de touche par défaut** — sélection elliptique, polygone et étoile — et
vous pouvez leur en donner une dans les réglages. **Image…**, dans le groupe Formes, n’en a pas
non plus, mais pour une autre raison : il n’est pas une commande, et ne figure donc pas dans la
liste à remapper.

> **Cinq outils portent la touche qu’ils portent ailleurs.** Le Pinceau est sur `B` et le Crayon
> sur `⇧B` comme dans tous les éditeurs d’images, le Recadrage sur `C`, les formes sur `U` et
> `⇧U`. `R`, `F` et `P` sont libres dans l’image, et gardent leur sens dans les autres espaces.

### La taille du trait

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Réduire le pinceau** | `[` | rétrécit d’un cran le diamètre |
| **Agrandir le pinceau** | `]` | l’élargit d’un cran |

Un seul diamètre pour trois outils : le pinceau, la gomme et le trait des formes. Le cran est un
rapport, environ ×1,4, jamais un nombre fixe de pixels.

> **Ces deux touches sont repérées par leur position, pas par leur symbole** — le seul cas de
> l’image, et pas un oubli : un clavier français n’atteint `[` et `]` qu’avec `⌥`, donc il n’y a
> pas de lettre gravée à écouter. Vous appuyez au même endroit qu’un clavier américain, sur les
> touches qui portent `^` et `$`.

### Recadrage

Ces deux touches n’agissent **que** tant qu’un cadre de recadrage est posé sur l’image, et
seulement dans l’onglet en avant. Ailleurs elles gardent leur sens habituel.

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Appliquer le recadrage** | `⏎` | rogne le document au cadre. `⌘Z` rend le cadre, pas les pixels |
| **Abandonner le recadrage** | `⎋` | retire le cadre sans rien rogner |

### Zoom et cadrage

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Zoom avant** | `⌘=` | agrandit la vue d’un cran, autour du centre |
| **Zoom arrière** | `⌘−` | réduit la vue d’un cran |
| **Ajuster à la fenêtre** | `⌘0` | cadre l’image entière, avec une marge, sans jamais l’agrandir |
| **Taille réelle** | `⌘1` | un pixel de l’image pour un pixel d’écran |

> **`⌘1` est la seule échelle où l’on juge la netteté.** À n’importe quel autre zoom, ce que vous
> voyez est un calcul, pas l’image.

### Repères

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Règles** | `⌘R` | affiche ou masque les deux règles graduées |
| **Repères** | `⌘;` | affiche ou masque les repères posés sur l’image |
| **Magnétisme** | `⇧⌘;` | fait coller ce qu’on déplace aux repères, aux bords et au centre |
| **Effacer les repères** | *aucune* | retire tous les repères. Annulable |

**Masquer les repères ne les efface pas** : ce sont deux actions différentes, et c’est pour cela
que la seconde n’a pas de raccourci — on ne veut pas l’atteindre par erreur.

### Sélection

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Désélectionner** | `⌘D` | abandonne la région sélectionnée : le pinceau retrouve tout le calque |
| **Faire un masque de la sélection** | *aucune* | masque le calque actif hors de la région sélectionnée |

### Demander au modèle

Cinq commandes qui envoient l’image au service. Aucune n’a de raccourci par défaut : elles coûtent
du crédit, et une touche pressée par mégarde n’a pas à en dépenser.

| Action | Ce qu’elle fait |
|---|---|
| **Régénérer la zone** | fait repeindre la région masquée du calque actif |
| **Étendre** | fait peindre au-delà des bords de l’image |
| **Détourer** | retire l’arrière-plan de l’image aplatie |
| **Agrandir** | augmente la définition de l’image aplatie |
| **Vectoriser** | convertit l’image aplatie en tracés |

**Aucune ne part toute seule.** Chacune aplatit le document, l’envoie, puis **remplit le
formulaire du panneau Génération** et vous le montre. C’est vous qui appuyez sur Générer, après
avoir vu ce qui part et avec quels réglages.

**Elles ont deux portes, et aucune n’est le clavier** : les cinq dernières entrées du menu
**Image**, et le groupe **Retouches par modèle** de la barre d’outils — la même action des deux
côtés. Détourer, Agrandir et Vectoriser demandent chacune un modèle d’une famille qui n’a pas
d’espace à elle ; il se règle dans **Réglages ▸ Modèles d’IA**. Tant qu’aucun n’est réglé, l’édition
ne part pas et ouvre l’écran où en choisir un.

### Exporter

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Exporter l’image** | `⇧⌘E` | écrit le document aplati sur le disque, au format PNG |
| **Fusionner vers le bas** | `⌘E` | réunit le calque actif et celui juste en dessous, au même niveau |

Les cinq autres entrées du menu **Image** — Aplatir, les deux miroirs, les deux rotations — n’ont
pas de touche par défaut. Vous pouvez leur en donner une dans les [réglages](14-reglages.md).

### Annuler et rétablir

| Action | Touche |
|---|---|
| **Annuler** | `⌘Z` |
| **Rétablir** | `⇧⌘Z` |

---

## Dans le ciel

L’espace Skyboxes répond au clavier comme les autres.

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Changer de vue** | `V` | fait défiler les quatre façons de regarder le ciel : immersive, panoramique, croix, faces |
| **Sondes de lumière** | `P` | montre ou cache les sphères témoins |
| **Annuler** | `⌘Z` | |
| **Rétablir** | `⇧⌘Z` | |

> **Les sondes ne sont pas un gadget.** Un ciel se juge à ce qu’il éclaire, pas à sa propre
> image : les sphères témoins montrent ce que votre panorama fait à une surface mate et à une
> surface miroir.

> **`V` défile les quatre vues, et les quatre dessinent.** Les trois vues à plat — Équirect, Croix
> et 6 faces — éteignent le fond et les objets de test pendant qu’elles sont devant, et le champ de
> vision ne joue que sur la vue immersive. Voir [L’espace Skyboxes](13-espace-skyboxes.md).

---

## Dans l’éditeur audio

Le septième contexte : l’éditeur de prises écoute l’annulation, et la barre d’espace.

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Annuler** | `⌘Z` | retire la dernière étape de la chaîne — un fondu, une normalisation, un rognage |
| **Rétablir** | `⇧⌘Z` | |
| **Lire / Pause** | `Espace` | le moniteur du bas, celui de la chaîne — voir [L’espace Audio](11-espace-audio.md) |

> **Rien n’est écrit tant que vous n’avez pas appliqué.** Chaque outil ajoute une étape à une
> chaîne rejouée sur la prise décodée, ce qui rend l’annulation gratuite et l’A/B instantané.
> Voir [L’espace Audio](11-espace-audio.md).

Les outils eux-mêmes — les fondus, la normalisation, la coupe des silences — n’ont pas encore de
touche : ils se prennent à la barre, sous la forme d’onde.

---

## Dans la matière

Le dernier contexte de la liste, et le plus court : l’espace Matières n’écoute que l’annulation.

| Action | Touche | Ce qu’elle fait |
|---|---|---|
| **Annuler** | `⌘Z` | défait la dernière édition de canal, ou le dernier style appliqué |
| **Rétablir** | `⇧⌘Z` | |

> **Un style appliqué est une seule annulation.** `⌘Z` remet exactement ce qui était réglé
> avant, d’un coup — voir [L’espace Matières](12-espace-matieres.md).

---

## Une chose importante sur ⌘Z

**Chaque document a sa propre pile d’annulation.**

`⌘Z` défait la dernière action **de l’onglet en cours**, pas la dernière action que vous avez faite
dans le studio. Si vous retouchez une image, passez à une scène 3D, puis appuyez sur `⌘Z`, c’est
la scène qui recule d’un cran — l’image n’a pas bougé.

> **« ⌘Z semble ne rien faire. »** C’est presque toujours ceci : l’action que vous visez appartient
> à un autre onglet. Activez l’onglet, puis annulez.

**Et il y a une pile qui n’appartient à aucun document : celle des fichiers.** Déplacer, renommer,
dupliquer, créer un dossier ne touche aucun onglet — ces gestes appartiennent au projet, et leur
pile aussi. Elle survit donc à la fermeture d’un document, et elle est la même dans toutes les
fenêtres.

`⌘Z` choisit entre les deux par le focus, et par rien d’autre : **dans l’Explorateur il recule
d’un geste de fichier ; ailleurs il recule d’un cran dans le document devant vous.** La mise à la
corbeille n’entre dans aucune des deux.

**Quand vous tapez du texte, `⌘Z` annule votre texte.** Renommez un calque ou une piste, faites une
faute, appuyez sur `⌘Z` : c’est le mot que vous venez de taper qui recule, pas le dernier trait de
pinceau. Le studio s’efface tant que le curseur est dans un champ de saisie, et reprend la main dès
que vous en sortez.

Cela vaut aussi pour `⌘X`, `⌘C` et `⌘V` : dans un champ, ils travaillent sur le texte ; ailleurs,
sur ce que l’espace a sélectionné.

**Un seul raccourci traverse un champ de saisie** : une commande doit le déclarer pour y être
entendue, et **`⌥D`, la dictée, est la seule à le faire** — elle existe précisément pour écrire
dans le champ où vous êtes déjà. C’est aussi pour cela qu’elle porte un modificateur : sans lui,
elle avalerait une lettre.

---

## Changer un raccourci

Réglages (`⌘,`) → **Raccourcis**.

Chaque action est une ligne : son nom, une phrase qui explique ce qu’elle fait, et un bouton
portant sa touche actuelle.

**Pour la changer :**

1. **cliquez sur le bouton** de la touche. Il devient bleu et affiche « Appuyez… » ;
2. **appuyez sur la combinaison** que vous voulez. Elle est enregistrée aussitôt.

Rien à taper, rien à épeler. C’est délibéré : personne ne sait comment s’appelle `⌘[`, et tout le
monde sait appuyer dessus.

| Situation | Ce qui se passe |
|---|---|
| Vous appuyez sur `Échap` | la capture s’arrête, la touche ne change pas |
| Vous appuyez sur une touche modificatrice seule (`⇧`, `⌘`…) | rien : un modificateur seul n’est pas un raccourci, il se tient pendant qu’on en presse une autre |
| L’action n’a aucune touche | le bouton affiche « Aucune » |

**Pour revenir à la touche d’origine** : la petite flèche circulaire à droite du bouton. Elle est
éteinte tant que vous n’avez rien changé.

> **Un raccourci changé n’est pas enregistré tout de suite.** Comme tous les réglages, il attend
> **Appliquer** ou **OK**. **Annuler** le rend à ce qu’il était.

### Les conflits

Si deux actions du **même contexte** — ou une action et une du contexte **Partout dans
l’application** — se retrouvent sur la même touche, les deux lignes passent en rouge, avec un
triangle d’alerte et le message :

> *Deux actions se disputent cette touche : une seule répondra.*

Le studio **ne vous empêche pas** de le faire. Il vous le montre, et vous laissez ou vous
corrigez.

**Deux contextes différents qui partagent une touche ne sont pas en conflit** et ne s’affichent
jamais en rouge : `S` dans le montage et `S` dans la vue 3D est le fonctionnement voulu, pas une
erreur.

### Retrouver ce qu’une touche fait

En haut de l’écran des raccourcis, un bouton **Chercher par touche**.

Cliquez, appuyez sur la combinaison qui vous intrigue, et la liste ne garde que les actions qui y
répondent. Si aucune ne s’affiche, le studio le dit :

> *Aucune action n’utilise cette touche : elle est libre.*

C’est la question qu’on se pose vraiment — « qu’est-ce que `⌘K` fait déjà ? » — plutôt que
l’inverse. Le bouton **Tout afficher** rend la liste complète.

### Ce qui ne se change pas encore

**Les touches de vol** (`W A S D Q E` et l’accélération) ne sont pas dans cet écran. Elles sont
figées pour l’instant. Voir [Ce qui n’existe pas encore](18-limites.md).

**Les quatre touches de la bande d’animation** non plus — `Suppr`, `Retour arrière`, `⌘D` et `S` —
pour la raison dite plus haut : elles sont liées à la bande, pas à un contexte.

---

## Aide-mémoire, tout sur une page

Les colonnes sont les espaces. **L’Explorateur a sa table à part, en dessous** : c’est le seul
contexte qui n’est pas un espace — il est ouvert dans tous à la fois — et une colonne de plus
laisserait croire que `⌘D` ou `⌘Z` y font ce qu’ils font dans l’espace de la colonne d’à côté.

| Touche | Partout | Barre | Vue 3D | Montage | Image | Ciel | Audio | Matière |
|---|---|---|---|---|---|---|---|---|
| `⌘N` | Nouveau… |  |  |  |  |  |  |  |
| `⌥⌘N` | Nouveau projet |  |  |  |  |  |  |  |
| `⌘O` | Ouvrir un projet |  |  |  |  |  |  |  |
| `⌘S` | Enregistrer |  |  |  |  |  |  |  |
| `⇧⌘S` | Enregistrer sous |  |  |  |  |  |  |  |
| `⌘,` | Réglages |  |  |  |  |  |  |  |
| `⌘K` | Assistant |  |  |  |  |  |  |  |
| `⌥D` | Dicter |  |  |  |  |  |  |  |
| `⌃⌘F` / `F11` | Plein écran |  |  |  |  |  |  |  |
| `⌘Z` |  |  | Annuler | Annuler | Annuler | Annuler | Annuler | Annuler |
| `⇧⌘Z` |  |  | Rétablir | Rétablir | Rétablir | Rétablir | Rétablir | Rétablir |
| `⌘G` |  |  | Grouper |  |  |  |  |  |
| `⌘D` |  |  | Dupliquer |  | Désélectionner |  |  |  |
| `⌘C` / `⌘X` / `⌘V` |  |  | Copier / Couper / Coller |  |  |  |  |  |
| `O` |  |  | Projection |  | Forme Ellipse |  |  |  |
| `Z` |  |  | Mode de rendu |  |  |  |  |  |
| `B` |  |  | Afficher les squelettes |  | Outil Pinceau |  |  |  |
| `V` |  |  | Sélectionner |  | Outil Déplacement | Changer de vue |  |  |
| `P` |  |  | Mode pose |  |  | Sondes de lumière |  |  |
| `G` |  |  | Déplacer |  | Outil Pot de peinture |  |  |  |
| `R` |  |  | Pivoter |  |  |  |  |  |
| `S` |  |  | Redimensionner *(et reculer)* | Couper le clip |  |  |  |  |
| `M` |  |  | Tous les magnétismes |  | Sélection rectangulaire |  |  |  |
| `L` |  |  | Repère local |  | Lasso |  |  |  |
| `F` |  |  | Cadrer la sélection | Fenêtre de retour |  |  |  |  |
| `H` |  |  |  |  | Outil Main |  |  |  |
| `C` |  |  |  |  | Outil Recadrage |  |  |  |
| `U` |  |  |  |  | Forme Rectangle |  |  |  |
| `A` |  |  |  |  | Forme Flèche |  |  |  |
| `T` |  |  |  |  | Outil Texte |  |  |  |
| `I` |  |  |  |  | Outil Pipette |  |  |  |
| `E` |  |  |  |  | Outil Gomme |  |  |  |
| `⇧Q` |  |  | Quatre vues |  |  |  |  |  |
| `⇧W` |  |  | Arêtes en quads |  |  |  |  |  |
| `⇧U` |  |  |  |  | Forme Trait |  |  |  |
| `⇧B` |  |  |  |  | Outil Crayon |  |  |  |
| `[` / `]` |  |  |  |  | Réduire / Agrandir le pinceau |  |  |  |
| `Suppr` |  |  | Supprimer l’objet | Supprimer le clip |  |  |  |  |
| `W A S D` |  |  | Voler |  |  |  |  |  |
| `Q` / `E` |  |  | Descendre / Monter |  |  |  |  |  |
| `⇧` gauche |  |  | Accélérer |  |  |  |  |  |
| `Espace` |  |  |  | Lire / Pause |  |  |  |  |
| `Début` / `Fin` |  |  |  | Début / Fin du montage |  |  |  |  |
| `⌘=` |  |  |  | Zoom avant | Zoom avant |  |  |  |
| `⌘−` |  |  |  | Zoom arrière | Zoom arrière |  |  |  |
| `⇧Z` |  |  |  | Tout afficher |  |  |  |  |
| `⌘L` |  |  |  | Délier l’image et le son |  |  |  |  |
| `⌘0` |  |  |  |  | Ajuster à la fenêtre |  |  |  |
| `⌘1` |  |  |  |  | Taille réelle |  |  |  |
| `⌘E` |  |  |  |  | Fusionner vers le bas |  |  |  |
| `⌘R` |  |  |  |  | Règles |  |  |  |
| `⌘;` |  |  |  |  | Repères |  |  |  |
| `⇧⌘;` |  |  |  |  | Magnétisme |  |  |  |
| `⇧⌘E` |  |  |  |  | Exporter l’image |  |  |  |
| `Entrée` |  |  |  |  | Appliquer le recadrage |  |  |  |
| `Échap` |  |  |  |  | Abandonner le recadrage |  |  |  |
| `⌥⌘←` |  | Déplacer à gauche |  |  |  |  |  |  |
| `⌥⌘→` |  | Déplacer à droite |  |  |  |  |  |  |

**Dans l’explorateur** — quand le focus est dans le panneau, et là seulement :

| Touche | Ce qu’elle fait |
|---|---|
| `⇧⌘N` | Nouveau dossier |
| `⌘D` | Dupliquer |
| `⌘X` / `⌘C` / `⌘V` | Couper / Copier / Coller |
| `⌘⌫` | Mettre à la corbeille |
| `⌘Z` / `⇧⌘Z` | Annuler / Rétablir le geste sur les fichiers |

---

[← Tous les réglages](14-reglages.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Quand ça coince →](16-depannage.md)
