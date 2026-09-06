# 9. Espace Modélisation

[← Espace Image](08-espace-image.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Espace Vidéo →](10-espace-video.md)

L’espace où l’on construit une scène en volume : des objets, des lumières, une caméra qui s’y
promène.

---

## Ouvrir une scène

Le bouton **+** du rail gauche crée une scène neuve. Un projet doit être ouvert.

La fenêtre qui s’ouvre demande un nom, puis **sur quoi la scène ouvre** : dix modèles, sous le
nom. Le choix ne s’applique qu’à la création — une scène déjà ouverte ne change pas de modèle.

| Modèle                                               | Ce qu’il pose                                                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vide**                                             | trois lumières, rien d’autre. Le point de départ pour tout construire soi-même                                                                                                               |
| **Base**                                             | un sol, un soleil, une lumière d’appoint, une caméra, et un cube d’un mètre — le cube dit l’échelle, supprimez-le dès qu’un objet à vous arrive                                              |
| **Studio photo**                                     | un fond blanc incurvé, un sol, et trois lumières placées comme en studio                                                                                                                     |
| **Cinéma**                                           | un grand sol, une lumière rasante, une caméra et son **rail** — le plan est déjà un mouvement                                                                                                |
| **Architecture**                                     | un sol très large, un soleil bas, un ciel, et une caméra à hauteur d’œil                                                                                                                     |
| **1re personne**, **3e personne**, **Vue de dessus** | les trois ouvrent sur le **niveau de test** ci-dessous, et ne diffèrent que par où se place la caméra                                                                                        |
| **Voiture**                                          | le même niveau de test, avec une voiture posée au départ — quatre roues suspendues, un moteur, une direction. `W` `S` accélèrent et freinent, `A` `D` braquent, `Espace` est le frein à main |
| **Avion**                                            | un terrain, une piste, et un avion **déjà en vol** à 120 m. `W` `S` piquent et cabrent, `A` `D` inclinent, `Q` `E` lacent, `⇧ Maj` et `Ctrl` ouvrent et ferment les gaz                      |

Une scène est noire tant qu’aucune lumière n’y est posée : c’est normal, et le panneau Lumières
le dit. Seul le modèle **Vide** peut vous y amener, en supprimant ses lumières.

### Le niveau de test

Les trois modèles de personnage ouvrent sur un décor fait pour être **parcouru** : un sol de
40 m sur 32, une enceinte, une cour en contrebas avec son escalier, une planche qui la traverse,
une terrasse et sa rampe, une passerelle qui enjambe la cour, trois blocs de saut aux écarts
croissants, des piliers, et un repère bleu au sol qui marque le départ.

Chaque partie est une forme du studio, rangée sous trois groupes — **Ground**, **Enclosure**,
**Course** — dans le panneau Scène. Tout s’y déplace, s’y redimensionne et s’y supprime comme
n’importe quel objet : c’est un décor de travail, pas un décor figé.

Les couleurs disent un rôle : gris pour ce qui se marche, gris sombre pour les murs et ce qui se
contourne, **orange pour tout ce qui se grimpe** — rampe, marches, blocs, passerelle.

---

## Se déplacer dans la scène

Trois façons de se déplacer, qui coexistent.

### Tourner autour de la scène — la souris seule

| Geste                                        | Effet                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------- |
| **Alt + clic gauche + glisser**              | fait tourner la vue                                                   |
| **Clic gauche + glisser**                    | trace un **rectangle de sélection** — voir _Choisir plusieurs objets_ |
| **Bouton du milieu + glisser**               | déplace la vue latéralement                                           |
| **Maj + Alt + clic gauche + glisser**        | la même chose, pour un trackpad qui n’a pas de bouton du milieu       |
| **Molette**                                  | avance et recule **vers ce que vise le pointeur**                     |
| **Alt + clic droit + glisser**               | avance et recule, vers le point autour duquel la vue tourne           |
| **Deux doigts** sur un écran tactile         | pincer avance et recule, glisser déplace latéralement                 |
| **Clic droit + glisser** _(voir ci-dessous)_ | fait voler                                                            |

C’est le mode par défaut. On tourne **autour** de la scène, comme si on en faisait le tour. Ces
gestes sont ceux d’Unity, d’Unreal et de Maya : si vous venez de l’un des trois, vous n’avez rien
à réapprendre.

> **La molette avance vers ce que vous visez, et ne bute sur rien.** Le point autour duquel la vue
> tourne se replace sur ce que le pointeur désigne, et la caméra le **traverse** si vous continuez
> — il n’y a pas de mur invisible devant lequel on ralentit sans jamais arriver. Le pas suit la
> distance de ce que vous visez : vaste au loin, fin de près.

#### Autour de quoi la vue tourne

C’est la question qui fait perdre sa scène quand on ne s’en occupe pas. Trois réponses, dans
l’ordre :

1. **Ce qui est sélectionné**, si c’est visible à l’écran — le point même où se pose le gizmo.
   C’est le réglage _Tourner autour de la sélection_, activé d’origine ;
2. **Ce que le pointeur survole** au début du geste, si vous avez activé _Tourner sous le
   curseur_ dans les réglages ;
3. sinon, **le dernier point regardé** — celui que la molette, un déplacement latéral ou
   <kbd>F</kbd> ont posé.

Les deux réglages sont dans **Réglages ▸ Espaces de travail ▸ Modélisation**. Une sélection hors de l’écran ne sert
jamais de point de rotation : la vue partirait la chercher.

> **<kbd>F</kbd> cadre la sélection**, et repose le point de rotation dessus. C’est le geste à
> retenir quand on ne sait plus où l’on est — il est le même dans Blender, Unity, Unreal et Maya.

> **<kbd>⇧F</kbd> la cadre ET la suit.** Tant que le suivi tient, ce qui bouge emmène la vue avec
> lui, sans changer l’angle ni la distance que vous avez choisis : de quoi regarder un personnage
> marcher sans courir derrière lui. Une seconde pression lâche prise, et une sélection vidée
> aussi.

### Conduire la vue comme une autre application

Si vous venez d’Unreal, d’Unity, de Blender ou de Roblox Studio, vous n’avez rien à réapprendre :
**Affichage ▸ Navigation** dans le menu, ou **Réglages ▸ Espaces de travail ▸ Modélisation**, change le
schéma de gestes ET de raccourcis d’un coup.

| Schéma            | Tourner      | Déplacer latéralement                 | Avancer / reculer | ZQSD                                          | Déplacer / Tourner / Redimensionner |
| ----------------- | ------------ | ------------------------------------- | ----------------- | --------------------------------------------- | ----------------------------------- |
| **IA Studio**     | Alt + gauche | milieu                                | Alt + droit       | un bouton tenu                                | `G` `R` `S`                         |
| **Unreal**        | Alt + gauche | milieu, ou **droit ajouté au gauche** | Alt + droit       | **bouton droit tenu**                         | `W` `E` `R`                         |
| **Unity**         | Alt + gauche | milieu                                | Alt + droit       | **bouton droit tenu**                         | `W` `E` `R`                         |
| **Blender**       | **milieu**   | **Maj + milieu**                      | **Ctrl + milieu** | mode Walk/Fly, en <kbd>Maj</kbd>+<kbd>`</kbd> | `G` `R` `S`                         |
| **Roblox Studio** | Alt + gauche | milieu                                | Alt + droit       | **en permanence**                             | `G` `R` `T`                         |
| **Personnalisé**  | au choix     | au choix                              | au choix          | au choix                                      | les vôtres                          |

**Le clic gauche seul ne tourne plus la vue, dans aucun schéma** : il trace le rectangle de
sélection, comme chez Unity et Blender. Pour tourner, c’est Alt + gauche — le geste que trois des
cinq donnent déjà.

**Pan à deux boutons d’Unreal** : pressez d’abord le **gauche**, puis ajoutez le **droit**. Dans
cet ordre et pas l’autre — chez nous le bouton droit fait voler la caméra, et un vol déjà armé ne
rend pas la main au déplacement latéral.

> **Un schéma ne remplace que ce que son application fait autrement.** Tout ce dont il ne dit
> rien garde les touches d’IA Studio — y compris les commandes dont les autres logiciels n’ont
> aucun équivalent. Et vos propres remappages, faits dans **Réglages ▸ Raccourcis**, passent
> toujours devant le schéma.

> **Revenir à « IA Studio » remet les raccourcis à zéro.** C’est le schéma sur lequel tous les
> autres retombent : le choisir rend à chaque commande la touche que le logiciel déclare.

**Roblox déplace deux raccourcis, et c’est inévitable.** Chez lui les lettres appartiennent à la
caméra sans qu’on tienne rien, donc `S` ne peut plus redimensionner : il passe sur `T`, et
_Ajouter_ passe de <kbd>⇧A</kbd> à <kbd>⇧N</kbd>. C’est exactement pour éviter ça qu’Unity et
Unreal exigent le bouton droit. Les flèches, elles, restent à l’interface dans tous les cas.

**Blender donne aussi son pavé numérique.** Sous ce schéma seul :
<kbd>1</kbd> de face, <kbd>3</kbd> de droite, <kbd>7</kbd> de dessus, chacun avec <kbd>Ctrl</kbd>
pour le côté opposé ; <kbd>5</kbd> bascule perspective et orthographique, <kbd>0</kbd> fait passer
la vue par la caméra choisie et l’en ressort au second appel, et <kbd>.</kbd> cadre la sélection.
Ce sont bien les touches **du pavé**, distinctes des chiffres de la rangée du haut, verrou
numérique mis ou non.

**Le schéma personnalisé** ouvre quatre choix de plus dans les réglages — avec quoi tourner, avec
quoi déplacer latéralement, avec quoi avancer et reculer, et quand les lettres appartiennent à la
caméra. Le clavier, lui, se personnalise depuis l’écran des raccourcis, quel que soit le schéma.

### Voler dans la scène — un bouton maintenu

**Maintenez un bouton de la souris**, gauche ou droit, et les touches ci-dessous déplacent la
caméra. Sans lâcher :

| Touche          | Mouvement                        |
| --------------- | -------------------------------- |
| `W` `A` `S` `D` | avancer, gauche, reculer, droite |
| `↑` `←` `↓` `→` | les mêmes quatre directions      |
| `E`             | monter                           |
| `Q`             | descendre                        |
| `⇧ Maj`         | accélérer                        |

On se déplace **à travers** la scène au lieu d’en faire le tour, comme dans un jeu vidéo.
Relâchez le bouton, la caméra reprend son mode normal.

Le bouton garde par ailleurs ce qu’il faisait : le gauche continue de tourner autour de la scène
et de sélectionner au relâchement. Le clavier s’ajoute, il ne remplace rien. Une seule réserve : tant que vous tenez la poignée d’un outil, les touches ne
déplacent pas la caméra — sans quoi le même geste bougerait l’objet et le point de vue.

> **Les touches sont lues à leur position physique.** WASD sur un clavier QWERTY et ZQSD sur un
> clavier AZERTY sont **les mêmes quatre touches**. Il n’y a rien à reconfigurer.

### Naviguer en continu — le mode, sans rien tenir

Le bouton **Naviguer** de la barre d’outils, ou la touche <kbd>`</kbd> (celle sous Échap,
<kbd>²</kbd> sur un clavier français), arme un mode où l’on n’a **plus rien à maintenir** :

- la **souris devient le regard** — elle disparaît, et la vue suit ses mouvements ;
- les **mêmes touches** que ci-dessus déplacent la caméra ;
- la **molette règle la vitesse** au lieu d’avancer, le temps de la session ;
- <kbd>Échap</kbd> rend la souris et quitte le mode.

Les touches sont rappelées quelques secondes en bas du viewport à chaque fois que le mode s’arme.

> **Tant que le mode est armé, les lettres appartiennent à la caméra.** <kbd>S</kbd> fait reculer
> et n’appelle pas l’outil Redimensionner ; les outils reprennent leurs touches dès la sortie.

Trois réglages gouvernent le vol : **Réglages ▸ Espaces de travail ▸ Modélisation**

| Réglage                    | Ce qu’il fait                        | Défaut |
| -------------------------- | ------------------------------------ | ------ |
| **Vitesse de déplacement** | mètres par seconde                   | 4      |
| **Accélération**           | par combien Maj multiplie la vitesse | 3      |
| **Angle de vue**           | ce que la caméra embrasse, en degrés | 60     |

---

## La barre d’outils

| Outil                    | Raccourci | Ce qu’il fait                                                                                          |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------ |
| **Sélectionner**         | `V`       | choisit un objet sans armer de poignée                                                                 |
| **Déplacer**             | `G`       | tire l’objet le long des flèches de couleur                                                            |
| **Pivoter**              | `R`       | fait pivoter l’objet avec les cercles de couleur                                                       |
| **Redimensionner**       | `S`       | agrandit ou rétrécit avec les poignées                                                                 |
| **Tous les magnétismes** | `M`       | allume ou éteint les quatre magnétismes d’un coup ; une seconde pression rend ceux qui étaient allumés |
| **Repère local**         | `L`       | aligne les poignées sur l’orientation de **l’objet** plutôt que sur celle du monde                     |
| **Mode de rendu**        | `Z`       | fait défiler les neuf façons de dessiner ; le survol les offre une à une                               |
| **Cadrer la sélection**  | `F`       | recentre la caméra sur l’objet choisi                                                                  |
| **Naviguer**             | `` ` ``   | arme le vol continu : la souris tient le regard, les touches déplacent                                 |

La barre ne porte que ce qui se réclame **sans lâcher la souris**. Le reste est au menu natif :

| Ce qui n’est pas dans la barre                                  | Où le trouver                                       |
| --------------------------------------------------------------- | --------------------------------------------------- |
| Projection, quatre vues, arêtes de quads, squelettes, mode pose | **Affichage**, en cases à cocher                    |
| Les six côtés, les neuf modes de rendu                          | **Affichage ▸ Point de vue** et **▸ Mode de rendu** |
| Ajouter une maille, une lumière, un objet                       | **Ajouter**                                         |
| Dupliquer, grouper, supprimer                                   | **Édition**                                         |
| Copier, couper, coller                                          | **les touches seules** — voir plus bas              |

**Le magnétisme sert à aligner.** Sans lui, un objet se pose à 1,0374 m du précédent ; avec lui,
à 1 m tout rond.

### La barre du haut — ce qui se règle en manipulant

Une seconde barre flotte **en haut du viewport**, horizontale. Elle ne porte pas des outils mais
des **comportements** : ce qu’on change _pendant_ qu’on manipule, sans lâcher la souris.

Chaque entrée est un groupe de **deux zones**. L’icône, à gauche, **allume ou éteint** ce
magnétisme-là et rien d’autre. La valeur, à droite, **ouvre un menu** au survol, comme les menus
de la barre d’outils — un clic dessus le referme. Choisir un cran **allume ce magnétisme au
passage** : aller chercher un pas, c’est demander ce magnétisme, et le laisser éteint coûtait un
second clic à chaque première utilisation.

Les crans s’affichent **en colonnes**, pas en liste : une valeur se cherche du regard, et une
colonne de neuf pas recouvrait la scène qu’on s’apprête à changer. Le cran actif est **peint**,
là où il est — pas signalé par une coche à l’autre bout de la liste.

| Entrée                    | Ce que l’icône bascule                                    | Ce que le menu règle                                       |
| ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| **Vitesse de caméra**     | _(rien : elle n’a pas de bascule)_                        | des paliers de 0,5 à 20 m/s, et un curseur libre entre eux |
| **Magnétisme de surface** | poser ce qu’on déplace sur la première surface en dessous | s’orienter selon la pente, et de combien flotter au-dessus |
| **Magnétisme de grille**  | faire avancer un déplacement par pas réguliers            | le pas, de 1 cm à 10 m                                     |
| **Magnétisme d’angle**    | faire tourner par crans                                   | l’angle, en incréments ou en divisions du tour             |
| **Magnétisme d’échelle**  | faire varier l’échelle par crans                          | le ratio                                                   |

La barre est en **haut à droite** du viewport ; la colonne d’outils tient déjà le côté gauche.

**Les quatre sont indépendants.** Poser un accessoire sur une table pendant que son angle reste
libre est le geste que la bascule unique ne savait pas dire. Le bouton **Tous les magnétismes**
de la barre verticale, et la touche `M`, les éteignent tous d’un coup — et une seconde pression
rend exactement ceux qui étaient allumés.

**La vitesse de la barre est celle du vol.** C’est la même valeur que la molette règle quand le
mode Naviguer est armé : les deux ne peuvent pas se contredire.

Les crans eux-mêmes sont des **réglages**, partagés par tous les documents ; les quatre
interrupteurs, eux, appartiennent au document en cours. Les mêmes crans se retrouvent dans
**Réglages ▸ Espaces de travail ▸ Modélisation** et dans le panneau **Environnement**.

**Le magnétisme de surface est le seul qui ne compte pas en crans** : il lance un rayon vers le
bas depuis ce que vous tirez et le pose sur ce qu’il rencontre. Il n’agit que pendant un
**déplacement** — pas pendant une rotation ni un redimensionnement.

**Les poignées ne dépassent jamais l’objet qu’elles tiennent.** Sur une petite pièce elles
suivent sa taille et rétrécissent avec elle quand on recule ; au-delà, elles gardent une taille
constante à l’écran plutôt que de grandir sans fin — sans quoi elles deviendraient impossibles à
attraper de loin. Le plafond se règle dans **Réglages ▸ Espaces de travail ▸ Modélisation ▸
Taille des poignées**.

Une lumière et une caméra n’ont pas de volume à mesurer : leurs poignées gardent la taille du
réglage, sans quoi il n’y aurait plus rien à attraper.

**Le repère local se voit sur un objet tourné.** Poignées en repère monde, la flèche rouge pointe
toujours vers l’est. En repère local, elle pointe vers la droite **de l’objet** : c’est ce qu’on
veut pour avancer une voiture dans le sens où elle roule.

### Les poignées de couleur

Quand un outil de manipulation est armé et qu’un objet est choisi, des poignées apparaissent
autour de lui. Le code de couleur est universel :

| Couleur   | Axe | Direction       |
| --------- | --- | --------------- |
| **Rouge** | X   | gauche ↔ droite |
| **Vert**  | Y   | bas ↔ haut      |
| **Bleu**  | Z   | avant ↔ arrière |

Tirez sur une flèche pour déplacer le long de cet axe seulement.

> Un déplacement complet — de l’appui au relâchement — compte pour **une seule** action dans
> l’historique. `⌘Z` le défait d’un coup.

---

## Poser des objets

Trois chemins mènent au même endroit :

- le menu **Ajouter**, qui range les trois familles — maille, lumière, objet ;
- les boutons **+** des panneaux **Mailles** et **Lumières** ;
- le glisser-déposer, pour un modèle qui vient de l'Explorateur.

L’objet se pose à **l’origine de la scène** — le centre du monde, là où les axes se croisent.

### Faire entrer un modèle existant

Les formes ci-dessous sont celles que le studio sait **construire**. Un modèle qui vient
d’ailleurs — généré par un modèle _texte vers 3D_, ou importé depuis un `.glb` — entre par
l’Explorateur :

| Geste                                             | Résultat                                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Double-clic** sur une maille dans l’Explorateur | l’**onglet Modèle** s’ouvre sur le fichier — `.glb`, `.fbx`, `.obj`, `.stl`, `.ply` ou `.usdz`. Un `.gltf` est une **scène**, et s’ouvre comme telle |
| **Glisser-déposer** sur la vue 3D                 | elle entre dans la scène **ouverte devant vous** — n’importe où sur la vue, la barre d’outils comprise                                               |
| **Clic droit ▸ Ajouter à la scène**               | idem, sans viser la vue — il suffit qu’une scène soit ouverte quelque part                                                                           |

**Le double-clic ne regarde jamais l’onglet en avant** : il ouvre l’asset dans l’espace de son
type, quoi qu’il y ait à l’écran. C’est la règle de tout le studio, décrite dans
[Les assets](07-assets.md) — pour faire entrer une maille dans la scène que vous avez devant vous,
c’est le glisser-déposer ou le clic droit.

**Seules les mailles entrent dans la scène** — mais un lâcher raté n’est pas un lâcher perdu. Une
image, un son ou une vidéo lâchés sur la vue 3D **s’ouvrent dans leur propre espace**, exactement
comme au double-clic. Rien ne l’annonce avant que vous lâchiez : le pointeur montre le même `+`
que pour une maille.

Comme le reste, le modèle se pose **à l’origine**. Il arrive parfois minuscule ou gigantesque —
un `.glb` porte son échelle d’origine, qui n’a aucune raison d’être la vôtre. La poignée
d’échelle (`S`) règle cela en un geste, et `F` recadre la caméra dessus.

### Les mailles disponibles

Une _maille_ (ou _mesh_) est un objet géométrique.

| Forme            | À quoi ça ressemble                            |
| ---------------- | ---------------------------------------------- |
| **Cube**         | une boîte                                      |
| **Sphère**       | une balle                                      |
| **Capsule**      | un cylindre à bouts arrondis, comme une gélule |
| **Cercle**       | un disque plat                                 |
| **Cylindre**     | un tube plein                                  |
| **Plan**         | une feuille plate                              |
| **Anneau**       | un disque percé                                |
| **Tore**         | un donut                                       |
| **Nœud de tore** | un donut entrelacé                             |
| **Tube**         | un tuyau courbé                                |
| **Révolution**   | une forme obtenue en faisant tourner un profil |
| **Tétraèdre**    | 4 faces triangulaires                          |
| **Octaèdre**     | 8 faces                                        |
| **Dodécaèdre**   | 12 faces                                       |
| **Icosaèdre**    | 20 faces                                       |

### Le texte — des mots en volume

**Ajouter ▸ Objet ▸ Texte** pose un texte dans la scène, déjà écrit et déjà lisible. L’inspecteur
en montre trois choses : le **contenu**, la **police**, et les nombres qui donnent sa forme aux
lettres — le **corps**, la **profondeur** (mettez-la à zéro pour des lettres plates) et les
**segments de courbe**, qui décident de la finesse des arrondis.

Un texte est éclairé comme une maille, et porte la même **matière** : couleur, rugosité, métal,
et les cinq images. Il projette et reçoit les ombres.

#### Les polices offertes

La liste s’ouvre sur les **trois polices que le studio embarque** — Lato, IBM Plex Serif, IBM Plex
Mono — puis sur **celles que votre machine a installées**. Les trois premières sont dans
l’application : une scène qui les emploie s’ouvre à l’identique sur n’importe quelle machine.

Une police du système, non. Elle reste écrite dans le document, mais si vous ouvrez la scène
ailleurs et que la police n’y est pas, deux choses se produisent : la liste affiche son nom suivi
de **« (absente) »**, et les lettres sont dessinées dans la police embarquée par défaut pour que
le texte reste visible. Le document, lui, n’est pas réécrit — retrouvez la machine qui a la
police, et la scène redevient ce qu’elle était.

> Certaines polices anciennes du système ne s’ouvrent pas : la bibliothèque que le studio emploie
> ne lit pas tous les formats de table qu’elles emploient. Le nom reste dans la liste, le texte
> retombe sur la police par défaut, et le journal dit laquelle a échoué.

### Le sprite — une image face à la caméra

Un _sprite_ n’est pas une maille : c’est une image plate qui se tourne toujours vers vous, quel
que soit l’angle de la vue. C’est ce qu’on emploie pour une étincelle, une lueur, un repère, une
étiquette au-dessus d’un objet — tout ce qui doit rester lisible d’où qu’on regarde.

**Ajouter ▸ Objet ▸ Sprite** en pose un à l’origine. Il arrive sans image : choisissez-la dans
l’Inspecteur, section **Sprite**, parmi les images du projet — les mêmes que celles qu’une
matière accepte dans un canal.

| Réglage     | Ce qu’il fait                                                                |
| ----------- | ---------------------------------------------------------------------------- |
| **Couleur** | teinte l’image. Sur un sprite sans image, c’est la couleur du carré lui-même |
| **Opacité** | de transparent à opaque                                                      |
| **Image**   | l’image affichée, prise dans les assets du projet                            |

Quatre choses à savoir :

- **Sa taille est son échelle.** Un sprite n’a pas de largeur propre : on le redimensionne avec la
  poignée d’échelle, comme n’importe quel objet. Il rapetisse avec la distance, comme le reste de
  la scène.
- **Il ne tourne pas.** Sélectionné seul, il n’a ni poignée **Pivoter**, ni ligne **Rotation**
  dans l’Inspecteur. Deux cas le font tourner pour de vrai :
  - **Des objets descendent de lui.** Il retrouve sa poignée et sa ligne : tourner l’ensemble fait
    pivoter les enfants autour de lui.
  - **Il est pris dans une sélection de plusieurs objets, et on tire la poignée.** Elle fait
    tourner le groupe autour d’un pivot commun, ce qui déplace le sprite dans l’espace. **La ligne
    Rotation de l’Inspecteur ne fait pas la même chose** : un angle tapé est **absolu** et
    s’applique à chaque objet autour du sien propre, sans pivot commun — le sprite, lui, ne bouge
    pas. La ligne reste affichée tant qu’un objet de la sélection tourne, et l’angle tapé va sur
    ceux-là.
- **Il ne joue pas avec les ombres.** Il n’en projette pas et n’en reçoit pas ; l’Inspecteur ne
  lui montre donc aucune section Ombres.
- **Il n’est pas éclairé.** Sa couleur est celle qu’on lui donne, pas celle que les lumières de la
  scène en font.

### Le chemin — le rail d’une caméra

Un _chemin_ est une courbe posée dans la scène. Il ne se voit pas dans une image rendue : c’est
un rail, le long duquel une caméra peut courir pendant un plan.

**Ajouter ▸ Objet ▸ Chemin** en pose un à l’origine, avec deux points. Ses **poignées** — une
bille par point — n’apparaissent que lorsqu’on travaille dessus : chemin sélectionné, ou caméra
sélectionnée qui l’emprunte pendant un plan. Elles gardent leur taille à l’écran, où que soit la
vue.

Quatre gestes, dans la scène :

| Geste                                       | Ce qu’il fait                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Cliquer une poignée**, chemin sélectionné | la choisit : les flèches de déplacement s’y accrochent, et on la déplace comme un objet                                         |
| **⌥ + clic sur la courbe**                  | pose un nouveau point dans la portion cliquée, et le choisit aussitôt                                                           |
| **⌥ ⇧ + clic n’importe où**                 | **allonge le chemin** : le point se pose au bout, là où l’on vient de viser. C’est le geste qui trace un trajet clic après clic |
| **Suppr**, ou clic droit sur une poignée    | retire le point choisi. Un chemin garde toujours ses deux derniers points                                                       |

**⌥ ⇧ + clic se pose sur ce qu’on clique** — le sol, un mur, une caisse. Si le rayon ne rencontre
rien, le point se pose **à la hauteur du point précédent**, ce qui garde un trajet à plat quand
on clique dans le vide. Chaque clic est **un `⌘Z`**, donc un trajet se défait point par point.

**Ce qui n’est pas du décor est traversé** : les repères d’atelier — le boîtier d’une caméra,
l’ampoule d’une lampe —, les chemins eux-mêmes avec leurs poignées, et tout objet masqué à l’œil
de l’Explorateur de scène. Une caméra posée sur son propre rail ne fait donc pas obstacle au
geste qui prolonge ce rail.

> **Il faut travailler sur un seul chemin.** Le geste sert le chemin sélectionné, ou celui
> qu’emprunte la caméra sélectionnée. Si deux chemins sont en cours en même temps, il n’allonge
> aucun des deux plutôt que de choisir à votre place. **Et il ne fait alors rien d’autre non
> plus** : `⌥ ⇧` est réservé au traçage, il ne change jamais la sélection en cours de route.

L’Inspecteur, section **Chemin**, règle la **Tension** — de l’angle vif à la courbe ronde — et
**Fermé**, qui referme la boucle sur le premier point. Le **+** de la ligne **Points** ajoute un
point au bout, sans viser dans la vue : le chemin s’allonge dans la direction qu’il prenait. Sur
un chemin **fermé**, qui n’a pas de bout, le point se pose dans la portion qui revient au
premier.

### Les lumières disponibles

Sans lumière, la scène reste noire.

| Lumière            | Ce qu’elle fait                                    | Quand l’utiliser                             |
| ------------------ | -------------------------------------------------- | -------------------------------------------- |
| **Ambiante**       | éclaire tout, uniformément, sans ombre             | pour déboucher les noirs                     |
| **Directionnelle** | des rayons parallèles, comme le soleil             | l’éclairage principal d’une scène extérieure |
| **Hémisphérique**  | une couleur venant du ciel, une autre du sol       | un rendu extérieur doux et naturel           |
| **Ponctuelle**     | rayonne dans toutes les directions depuis un point | une ampoule, une bougie                      |
| **Projecteur**     | un cône de lumière                                 | un spot de théâtre, un phare                 |

**Pour commencer** : une **directionnelle** pour l’éclairage principal, plus une **ambiante**
faible pour que les ombres ne soient pas complètement noires. C’est la recette classique.

---

## Regarder la scène autrement

Trois boutons, entre les bascules et le cadrage. Ils ne changent rien à la scène : ils changent la
façon de la regarder. Rien de tout cela n’est enregistré avec le document, et `⌘Z` n’y touche pas.

### Projection — `O`, ou **Affichage ▸ Projection**

En **perspective**, les fuyantes convergent : c’est ce que voit un œil, et c’est le réglage par
défaut. En **orthographique**, les parallèles restent parallèles et un objet garde sa taille quelle
que soit sa distance.

C’est ce qui permet de juger un alignement. Deux cubes posés côte à côte semblent décalés en
perspective ; en orthographique, ils le sont ou ils ne le sont pas.

La bascule garde ce que vous voyez au centre à la même taille — la caméra se replace pour cela,
et son éloignement change donc au passage.

### Se placer — **Affichage ▸ Point de vue**

**De face**, **de dos**, **de gauche**, **de droite**, **de dessus**, **de dessous**. La caméra va
se poser sur l’axe correspondant, à la distance qu’elle avait déjà, et regarde le point autour
duquel elle tournait.

Combiné à la projection orthographique, c’est la vue de plan classique — celle sur laquelle on
aligne.

### Mode de rendu — `Z`, ou **Affichage ▸ Mode de rendu**

| Mode                 | Ce qui est dessiné                                                                   |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Rendu**            | les surfaces peintes par leur matière, sans les arêtes                               |
| **Filaire**          | les arêtes seules — ce qui montre la densité du maillage                             |
| **Rendu et filaire** | les surfaces peintes, et les arêtes par-dessus                                       |
| **Solide**           | une argile unie sur toutes les surfaces : la forme, sans les matières                |
| **Aperçu matière**   | les matières sous le seul éclairage du studio, sans les lumières de la scène         |
| **Matcap**           | un éclairage capté sur une sphère : c’est le relief qui se lit, pas la couleur       |
| **Densité**          | du vert au rouge selon les triangles par unité de surface : le rouge est à optimiser |
| **Translucide**      | les surfaces à peine posées, pour voir les articulations à l’intérieur               |
| **Squelette seul**   | plus aucune surface — il ne reste que les os, pour les corriger sans rien deviner    |

Le bouton porte le mode en cours et le fait défiler à chaque clic ; son menu permet d’en choisir un
directement. `Z` fait la même chose au clavier — **et en quatre vues, sur le
quart où se trouve le pointeur** : chaque quart garde son propre mode.

**Rendu et filaire** est le plus coûteux : les arêtes sont un objet de plus par maille, construit
quand on l’allume et jeté quand on l’éteint. Sur un modèle importé de plusieurs milliers de
mailles, cela se sent.

### Quatre vues — `⇧Q`, ou **Affichage ▸ Quatre vues**

Le viewport se partage en quatre. **Le quart en haut à gauche garde le cadrage que vous aviez** ;
il repasse en perspective si vous étiez en projection orthographique. Les trois autres arrivent en
orthographique : **dessus** en haut à droite, **face** en bas à gauche, **profil gauche** en bas à
droite.

**Les quatre sont des plans de travail**, pas des aperçus : les poignées de transformation suivent
le quart où se trouve votre pointeur. On sélectionne et on déplace dans n’importe lequel.

**Le nom d’une vue, en haut à droite de son quart, est aussi la façon d’en changer.** Sept choix :
la vue libre et les six côtés. Rien n’oblige à garder la disposition de départ — deux perspectives
et deux axes se demandent aussi bien.

**Seule la vue libre tourne.** Faire glisser dans un quart de côté ne le fait pas pivoter : une vue
de dessus qui bascule n’est plus une vue de dessus, et c’est précisément ce qu’on lui demande.
**C’est la vue qui décide, jamais la projection** — passer la vue libre en orthographique avec `O`
ne l’empêche pas de tourner. Le déplacement latéral et le zoom marchent partout.

**Changer la vue d’un quart recadre tous les quarts de côté** sur la scène entière : ils n’ont pas
de cadrage à eux qu’ils retrouveraient. Seule la vue libre garde le sien.

### Arêtes en quads — `⇧W`

En filaire, le studio redessine les arêtes **sans les diagonales que la triangulation a
ajoutées** — un cube perd ainsi celles qui barraient ses faces, une par face.

**C’est une reconstruction, pas une lecture du fichier** : un GLB ne stocke que des triangles.
Deux triangles dont l’arête commune sépare des faces presque coplanaires sont relus comme un
quad. **Sur une surface très courbée, la reconstruction se trompe** et efface une arête que le
modeleur avait voulue.

---

## Choisir plusieurs objets

**Un clic remplace la sélection. Un clic avec `⇧`, `⌘` ou `Ctrl` l’ajoute ou la retire** —
recliquer un objet déjà choisi le sort de la sélection.

| Geste                                  | Effet                                                           |
| -------------------------------------- | --------------------------------------------------------------- |
| **Clic** sur un objet                  | il devient la sélection, seul                                   |
| **`⇧`/`⌘`/`Ctrl` + clic**              | il entre dans la sélection, ou en sort s’il y était             |
| **Clic dans le vide**                  | tout est désélectionné                                          |
| **`⇧`/`⌘`/`Ctrl` + clic dans le vide** | **rien ne change** — un raté ne doit pas défaire un tri patient |
| **Clic gauche + glisser**              | trace un rectangle : tout ce qu’il touche est choisi            |
| **`⇧`/`⌘`/`Ctrl` + glisser**           | le rectangle **ajoute** à la sélection au lieu de la remplacer  |

**Le rectangle prend ce qu’il touche**, pas seulement ce qu’il enferme entièrement : un sol est
toujours plus grand que le rectangle qu’on trace dessus. Un glisser qui ne traverse rien vide la
sélection, comme un clic dans le vide. En mode pose, il désigne un **os** — le plus proche de la
caméra parmi ceux qu’il croise — et jamais un objet.

Tout ce qui suit — déplacer, tourner, supprimer, grouper, dupliquer, régler dans l’Inspecteur —
agit sur **toute** la sélection, pas seulement sur le dernier objet cliqué.

---

## Grouper

**`⌘G`**, ou **Édition ▸ Grouper**.

Un groupe range plusieurs objets sous un même parent. **Déplacer le groupe les déplace tous**, et
il se replie d’un clic dans le panneau Scène — une scène de trente objets redevient lisible.

Deux façons de défaire ou de refaire un rangement :

- **`⌘Z`** annule le groupement, comme n’importe quelle action ;
- **glisser une ligne sur une autre**, dans le panneau Scène, la range sous elle. Pour **sortir** un
  objet de son groupe, lâchez-le sur la **première ligne**, celle qui porte le nom de la scène :
  elle représente la racine.

La branche d’accueil **se déplie toute seule** après le dépôt — sinon l’objet qu’on vient de
ranger disparaîtrait de l’écran, et on le croirait perdu.

> **Un groupe ne peut pas descendre dans son propre contenu.** Le studio refuse le dépôt plutôt
> que de fabriquer une boucle. De même, relâcher une ligne là où elle était déjà ne fait rien —
> ni action, ni entrée dans l’historique.

---

## Percer, fusionner, croiser

**Édition ▸ Percer**, ou les boutons de la barre d’outils, après le groupe.

Posez un cube dans un mur, sélectionnez les deux — **dans l’ordre que vous voulez** — puis
**Percer** : le mur gagne une fenêtre. C’est tout le principe. **La plus grosse forme est la
matière**, les autres sont les outils qui la creusent, et l’ordre des clics n’y change rien.

Une façon de marquer, trois de combiner, et deux pour revenir en arrière :

| Bouton               | Ce qu’il fait                                                                         |
| -------------------- | ------------------------------------------------------------------------------------- |
| **Négatif**          | marque les formes choisies comme **outils** — elles deviennent rouges et translucides |
| **Percer**           | creuse les plus petites formes dans la plus grosse — le cube ouvre la fenêtre         |
| **Fusionner**        | réunit les formes en un seul solide                                                   |
| **Garder le commun** | ne garde que la partie où les formes se chevauchent                                   |
| **Séparer**          | rend les formes d’origine, chacune là où elle était                                   |
| **Inverser le pli**  | `I` — refait le pli à l’envers, sans annuler                                          |

**Si le pli part à l’envers, ne cherchez pas pourquoi : pressez `I`.** « Inverser le pli »
refait le même pli dans l’autre sens — ce qui avait été creusé devient la matière — en un clic et
sans rien annuler. C’est aussi une ligne du clic droit sur le solide.

**Pour dire d’avance quelle forme sera creusée**, marquez l’outil : sélectionnez-le, pressez `N`,
et il s’affiche en rouge translucide. Une forme marquée est **toujours** creusée dans les autres,
quel que soit le bouton pressé ensuite — **Fusionner** avec un négatif dans la sélection perce donc
au lieu de réunir. Presser `N` à nouveau retire la marque.

> **La marque se voit, l’ordre des clics non.** C’est toute la raison d’être du bouton : avant,
> rien à l’écran ne disait quel objet allait être creusé, et ajouter une forme la sélectionnant
> aussitôt, le geste naturel donnait presque toujours le mauvais sens.

**Rien n’est perdu.** Le solide garde en mémoire les formes dont il a été fait : **Séparer** vous
les rend là où elles étaient, et `⌘Z` annule la découpe comme n’importe quelle autre action. Vous
pouvez donc essayer sans crainte.

> **Ce qui a été creusé revient marqué.** Une forme qui servait d’outil vous est rendue en rouge
> translucide, pour que refaire le même pli donne le même solide. Pressez `N` pour lui retirer la
> marque et en refaire une forme ordinaire.

Le solide obtenu se comporte comme un objet ordinaire : il porte un nom, se déplace, se tourne,
s’habille d’une matière, et la fenêtre suit le mur quand vous le déplacez.

> **Le calcul ne se fait pas pendant que vous bougez le cube**, mais au moment où vous cliquez sur
> le bouton — et il se fait à côté, sans figer l’écran. Sur une forme très détaillée, le solide
> peut donc apparaître **plein pendant un instant** avant que le trou se creuse : ce n’est pas une
> erreur, c’est le calcul qui n’a pas encore rendu sa réponse.

> **Une seule forme ne se perce pas.** Il en faut au moins deux, et les boutons ne font rien tant
> que ce n’est pas le cas. **Séparer** ne s’applique qu’à un solide à la fois.

---

## Dupliquer, copier, coller

Les quatre raccourcis que vous connaissez déjà. **Dupliquer** a sa ligne dans **Édition** ; les
lignes _Couper_, _Copier_ et _Coller_ que vous y verrez plus haut **ne sont pas celles de la
scène**.

| Geste         | Raccourci | Ce qu’il fait                                                     |
| ------------- | --------- | ----------------------------------------------------------------- |
| **Dupliquer** | `⌘D`      | pose une copie de la sélection au même endroit, et la sélectionne |
| **Copier**    | `⌘C`      | retient la sélection sans toucher à la scène                      |
| **Couper**    | `⌘X`      | la retient et la retire de la scène                               |
| **Coller**    | `⌘V`      | pose ce qui a été retenu dans la scène en cours                   |

> **Les lignes du menu Édition agissent sur le TEXTE**, pas sur la scène : elles servent à copier
> un nom qu’on est en train de renommer. Les touches, elles, font la différence — un texte
> sélectionné garde `⌘C`, tout le reste appartient à la scène.

Trois choses valent d’être sues :

- **Un groupe se duplique entier**, avec tout ce qui pend dessous. Copier un enfant seul le copie
  seul, et il retrouve son parent — sauf si vous le collez dans une scène qui n’a pas ce parent,
  où il se pose alors à la racine.
- **La copie tombe exactement sur l’original.** Elle est sélectionnée : la déplacer est le geste
  suivant, pas une manœuvre de rattrapage.
- **Ce presse-papiers est celui du studio**, pas celui du système. Copier un objet ne jette pas le
  texte que vous aviez en réserve, et vous pouvez coller dans une autre scène. Il se vide en
  revanche quand vous changez de projet : un objet importé y nomme un asset qui n’existe nulle
  part ailleurs.

---

## Le panneau Scène — l’arbre de la scène

Le panneau **Scène**, dans la colonne de droite, montre tout ce que la scène contient, sous
forme d’arborescence.

- **Cliquez** une ligne pour sélectionner l’objet — avec `⇧`, `⌘` ou `Ctrl` pour en choisir
  plusieurs, exactement comme dans la vue.
- **Les flèches du clavier** parcourent l’arbre.
- **L’œil** à droite de chaque ligne affiche ou masque l’objet.
- **Glissez une ligne sur une autre** pour la ranger dessous ; sur la ligne du haut, celle qui
  porte le nom de la scène, pour la sortir de son groupe.

La sélection est la **même** des deux côtés : ce que vous choisissez dans l’arbre s’entoure de
poignées dans la vue, et réciproquement.

Seules les lignes visibles sont réellement dessinées : une scène lourde défile sans peine.

---

## L’Inspecteur — tout ce qui se règle

Le panneau **Inspecteur**, dans la colonne de droite. Il montre **ce qui est sélectionné**, et
tout ce qui le définit.

Ses champs viennent du **type de l’objet**, pas d’un formulaire écrit pour chacun. Une sphère
montre son rayon, un tore montre son tube, un projecteur montre son angle.

### Pour un objet

| Section            | Ce qu’elle contient                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identité**       | le nom, modifiable                                                                                                                                                |
| **Transformation** | Position, Rotation, Échelle — trois nombres chacune (X, Y, Z). Un sprite sans enfant, sélectionné seul, n’a pas de ligne Rotation : elle ne se verrait nulle part |
| **Géométrie**      | ce qui définit la forme : rayon, largeur, segments…                                                                                                               |
| **Matière**        | Couleur, Rugosité, Métallicité, Répétition au mètre, et cinq emplacements d’images                                                                                |

#### Les champs de géométrie, tous

Vous ne les verrez jamais tous en même temps : chaque forme montre les siens.

| Champ                                    | Ce qu’il règle                                             | Sur quelles formes                             |
| ---------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| **Largeur**, **Hauteur**, **Profondeur** | les trois côtés d’une boîte                                | Cube, Plan                                     |
| **Rayon**                                | la taille d’une forme ronde                                | Sphère, Cercle, Capsule, Tore, Nœud, polyèdres |
| **Rayon supérieur**, **Rayon inférieur** | les deux bouts d’un cylindre — inégaux, on obtient un cône | Cylindre                                       |
| **Rayon intérieur**, **Rayon extérieur** | le trou et le bord                                         | Anneau                                         |
| **Tube**                                 | l’épaisseur du boudin                                      | Tore, Nœud de tore, Tube                       |
| **Segments**                             | le nombre de facettes                                      | la plupart des formes rondes                   |
| **Segments radiaux**                     | les facettes tout autour                                   | Cylindre, Capsule, Tore, Tube                  |
| **Segments tubulaires**                  | les facettes le long du boudin                             | Tore, Nœud de tore                             |
| **Segments en largeur**, **en hauteur**  | la finesse dans chaque direction                           | Sphère, Plan                                   |
| **Segments de calotte**                  | la finesse des bouts arrondis                              | Capsule                                        |
| **Enroulements P**, **Enroulements Q**   | combien de fois le nœud tourne sur lui-même                | Nœud de tore                                   |

**Les segments** méritent un mot : c’est le nombre de facettes qui composent une forme ronde.
Peu de segments = anguleux et léger ; beaucoup = lisse et lourd. 32 est un bon compromis pour
une sphère.

**Enroulements P et Q** sont les deux nombres qui définissent un nœud. P est le nombre de tours
autour de l’axe, Q le nombre de tours à travers le trou. `P=2, Q=3` donne le nœud de trèfle, celui
qu’on voit partout. Changez-en un, vous obtenez un autre nœud — c’est le seul champ du studio dont
on ne peut pas prévoir le résultat sans essayer.

**Rugosité et Métallicité** sont les deux réglages qui font tout l’aspect d’une matière :

| Réglage         | À 0                     | À 1         |
| --------------- | ----------------------- | ----------- |
| **Rugosité**    | miroir parfait          | mat complet |
| **Métallicité** | plastique, bois, pierre | métal       |

Les cinq emplacements d’images — **Image**, **Normales**, **Carte de rugosité**, **Carte de
métallicité**, **Occlusion ambiante** — reçoivent des images du projet. Le bouton **Choisir une
image** ouvre la liste ; **Retirer l’image** la vide.

**Toute forme neuve arrive déjà habillée** d’un damier de travail. Il sert à trois choses : juger
une échelle, voir une image s’étirer, et distinguer une face d’une autre. Remplacez-le quand
vous voulez — c’est un point de départ, pas une décoration.

Quatre damiers sont copiés dans le dossier **Images** du projet la première fois qu’une scène
en demande un : `CheckerLarge`, `CheckerSmall`, `GridLarge`, `GridSmall`. Ce sont des images du
projet comme les autres.

**Répétition au mètre** dit combien de carreaux tiennent dans un mètre. À `1`, un carreau fait un
mètre — sur un mur de 3 m comme sur un sol de 40 m, les carreaux restent carrés et de même
taille. Montez à `2` pour un objet qu’on regarde de près.

### Pour une lumière

| Champ                                    | Ce qu’il fait                                     |
| ---------------------------------------- | ------------------------------------------------- |
| **Couleur**                              | la teinte de la lumière                           |
| **Intensité**                            | sa puissance                                      |
| **Portée**                               | jusqu’où elle éclaire — ponctuelle et projecteur  |
| **Atténuation**                          | à quelle vitesse elle faiblit avec la distance    |
| **Angle**                                | l’ouverture du cône — projecteur seulement        |
| **Pénombre**                             | la douceur du bord du cône — projecteur seulement |
| **Cible**                                | vers quoi elle pointe                             |
| **Couleur du ciel** / **Couleur du sol** | hémisphérique seulement                           |

### Pour une caméra

Une caméra a **son objectif**, et, dès qu’un plan la couvre, **ce que ce plan lui fait faire**.

| Champ                  | Ce qu’il règle                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Angle de vue**       | ce que la caméra embrasse, en degrés. C’est le zoom : petit angle = téléobjectif, grand angle = grand-angle |
| **Distance proche**    | en deçà, plus rien n’est dessiné. Jamais zéro — le tri des profondeurs n’aurait plus de marge               |
| **Distance lointaine** | au-delà, plus rien n’est dessiné                                                                            |

Le bouton **Poser cette caméra là où regarde la vue** lui donne la place et la direction de la
vue en cours : cadrez à la souris, cliquez, la caméra y est.

#### Plan caméra

Cette section porte **le plan qui couvre la tête de lecture** : ce qui **déplace** la caméra
pendant ce plan, et ce qu’elle **regarde**. Tant qu’aucun plan ne couvre la tête, elle ne montre
que le bouton **Créer un chemin pour cette caméra** — qui ouvre alors le plan et pose le rail du
même geste.

| Champ                                                | Ce qu’il fait                                                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chemin**                                           | le rail que la caméra emprunte pendant ce plan. **Aucun** la laisse là où son emplacement et ses clés la mettent                                                                                              |
| **Créer un chemin pour cette caméra**                | pose un chemin devant la caméra, dans son axe de visée, et le lie à ce plan. **Un seul `⌘Z` annule les deux** — et si aucun plan ne couvre la tête, le bouton en ouvre un du même geste                       |
| **Courbe de vitesse**                                | **Constante**, **Départ doux**, **Arrivée douce**, **Départ et arrivée doux**. Sans elle, un travelling démarre et s’arrête net                                                                               |
| **Départ sur le chemin** / **Arrivée sur le chemin** | de 0 à 1, la portion de rail réellement parcourue. **Un départ plus grand que l’arrivée fait rouler le rail à l’envers**                                                                                      |
| **Cible**                                            | **Libre** — la caméra regarde là où sa rotation la tourne · **Un point** — elle vise des coordonnées, réglées par **Point visé** · **le nom d’un objet** — elle le suit, même si cet objet est lui-même animé |

**La vitesse est régulière le long du rail**, quelles que soient les distances entre ses points :
à la moitié du plan la caméra a parcouru la moitié de la **longueur** du chemin, pas la moitié de
ses segments.

**Ces réglages vivent sur le PLAN, pas sur la caméra.** La même caméra peut donc faire un
travelling dans un plan et rester fixe dans le suivant, viser la statue ici et la porte là.

### Ombres

Deux interrupteurs, sur chaque objet qui peut en avoir :

| Interrupteur           | Ce qu’il fait                                            |
| ---------------------- | -------------------------------------------------------- |
| **Projette une ombre** | l’objet bloque la lumière et pose son ombre sur le reste |
| **Reçoit les ombres**  | les ombres des autres se dessinent sur lui               |

**Les deux se décident objet par objet**, parce qu’une ombre coûte du calcul à chaque lumière qui
la projette. Un sol reçoit sans projeter ; une petite pièce de décor loin de la caméra peut ne
faire ni l’un ni l’autre sans que cela se voie.

> **La section n’apparaît pas toujours.** Un _sprite_ ne joue pas du tout avec les ombres, une
> lumière ambiante ou hémisphérique n’en projette aucune : plutôt que d’afficher un interrupteur
> sans effet, le studio n’affiche rien.

À quoi ressemble une ombre — bord net ou adouci, finesse du calcul — se règle une fois pour toute
la scène dans **Réglages ▸ Espaces de travail ▸ Modélisation**.

### Environnement — le ciel qui éclaire

**Cette section s’affiche même quand rien n’est sélectionné**, parce qu’elle appartient à la
scène entière et non à un objet.

| Valeur                 | Ce que ça donne                                                            |
| ---------------------- | -------------------------------------------------------------------------- |
| **Studio** _(départ)_  | un éclairage neutre, calculé, qui existe avant que vous n’ayez rien généré |
| _une skybox du projet_ | le ciel choisi éclaire la scène **et** se reflète dans les matières        |

C’est le pont entre les deux espaces : un ciel fabriqué dans l’espace **Skyboxes** devient ici la
lumière de votre scène. Un coucher de soleil pose une lumière orange rasante sur tout, sans que
vous ayez à placer une seule lampe.

La liste ne propose que les **skyboxes du projet, présentes sur votre disque**. Un ciel resté
dans le nuage n’y figure pas : il serait choisi, et rien ne s’afficherait.

> L’Inspecteur **n’est pas un panneau de la 3D**. Le même inspecteur lit un clip, une piste ou un
> asset quand c’est cela qui est sélectionné. C’est pourquoi il reste ouvert dans tous les
> espaces.

---

## La grille au sol

Le quadrillage n’est **pas** un objet de la scène : c’est un repère, pour savoir où sont les
choses et à quelle hauteur. Il n’apparaît dans aucun rendu.

**Réglages ▸ Espaces de travail ▸ Modélisation** :

| Réglage                 | Ce qu’il fait                                        | Défaut  |
| ----------------------- | ---------------------------------------------------- | ------- |
| **Afficher la grille**  | l’affiche ou la cache                                | activée |
| **Taille de la grille** | son étendue en mètres — un carreau vaut toujours 1 m | 20      |

Cachez-la pour juger une image sans rien autour.

Elle est posée **juste sous** le niveau zéro : un sol qui repose dessus la masque, au lieu de la
laisser transparaître. Sur les modèles qui posent un sol — dont le niveau de test — elle
disparaît donc d’elle-même, sans qu’il y ait rien à décocher.

---

## Capturer la vue

**Affichage ▸ Capturer la vue** enregistre une image de la vue 3D dans le dossier **Images** du
projet. Ce qui est capturé est ce que le viewport dessine — **moins** la grille, les poignées de
transformation, les rails et les repères de lumière : une image, pas une copie d’écran.

Le menu du bouton offre quatre définitions :

| Choix                | Hauteur de l’image          |
| -------------------- | --------------------------- |
| **Taille de la vue** | celle du panneau, à l’écran |
| **1080p**            | 1080 pixels                 |
| **1440p**            | 1440 pixels                 |
| **4K**               | 2160 pixels                 |

**Seule la hauteur est imposée** : la largeur suit la forme du panneau, pour que l’image montre
exactement ce que vous voyiez — ni plus, ni moins. Un panneau étroit donne donc une image étroite,
et c’est voulu. Élargissez le panneau avant de capturer si vous voulez une image large.

L’image apparaît dans les assets du projet comme n’importe quelle autre.

---

## Sortir une scène du studio

**Fichier ▸ Exporter ▸ Scène** écrit tout ce que le document contient.
**Fichier ▸ Exporter ▸ Sélection** n’écrit que les objets choisis — un groupe emmène ce qui pend
dessous.

| Format                    | Ce que c’est                          | Quand l’employer                                                |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| **glTF binaire (`.glb`)** | un seul fichier, géométries comprises | le choix par défaut, et celui que lisent la plupart des moteurs |
| **glTF (`.gltf`)**        | la même chose en JSON, lisible        | pour inspecter ou comparer le contenu                           |
| **USDZ (`.usdz`)**        | le format des visionneuses d’Apple    | pour ouvrir la scène sur un iPhone ou un Mac                    |

Une boîte d’enregistrement s’ouvre pour choisir où le fichier va. Son nom est celui du document ;
l’extension suit le format choisi.

**Ce qui ne sort pas.** La grille au sol, le trièdre du coin, les poignées de transformation et les
repères de lumière ne font pas partie de la scène : ce sont des aides d’affichage. Le fichier ne
contient que ce que le panneau Scène liste. Les arêtes du mode « rendu et filaire » n’en sont pas non
plus.

**Un sprite ne sort pas non plus**, et sans avertissement : aucun des deux formats n’a d’objet qui
se tourne toujours vers la caméra. En glTF le fichier garde son nom et sa place, mais rien n’y est
dessiné ; en USDZ il n’en reste rien du tout. Une image plate qui doit survivre à l’export se fait
avec un plan et une image.

**Une sélection imbriquée garde sa place.** Exporter un objet rangé dans un groupe l’écrit là où il
est dans la scène, pas là où il est dans son groupe.

---

## Enregistrer

`⌘S` / `Ctrl+S` écrit la scène dans le projet, sous `Modelling/Scenes/`.

**Les scènes 3D savent s’enregistrer**, comme les six autres types de documents.

**Le fichier écrit est un `.gltf`, et c’est un vrai glTF** : un autre logiciel l’ouvre et y trouve
l’arbre de la scène, le nom et la place de chaque objet, les caméras et les lumières
directionnelles, ponctuelles et coniques. Ce que le standard ne porte pas — la forme des
primitives, les matières, les rails, les plans de caméra, l’animation — voyage dans le même
fichier mais **n’est lu que par IA Studio**. Rien ne se perd d’un enregistrement à l’autre ; ce qui
s’ouvre ailleurs est plus pauvre que ce que vous voyez ici.

Un onglet dont le travail n’est pas encore écrit porte **un point** (`•`) à côté de son nom. Le
point disparaît à l’enregistrement et revient à la modification suivante.

Rouvrir le studio ramène l’onglet et relit sa scène. Un onglet jamais enregistré revient vide :
rien n’avait été écrit pour lui.

<!-- CAPTURE : la vue 3D avec une maille sélectionnée, l’arbre de scène et le panneau Mailles.
     Vers ../../images/scene-3d.png -->

---

## Animer la scène

La bande du bas de l’espace Modélisation porte une **timeline**, comme en Vidéo et en Audio, sur toute la
largeur de l’écran.

### Ce qu’un modèle apporte déjà

Un personnage généré à distance — par un modèle _texte vers mouvement_, ou une capture depuis une
vidéo — arrive avec ses **séquences d’animation** dans le fichier. Sélectionnez-le, et l’Inspecteur
offre la section **Animation** :

| Contrôle                      | Ce qu’il fait                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Clip**                      | choisit lequel jouer, parmi ceux que le fichier porte                                                                         |
| **▶ / ⏸**                     | montre le bloc dans la vue, sur une horloge à lui                                                                             |
| **Vitesse**                   | un multiplicateur, de 0,1 à 4                                                                                                 |
| **En boucle**                 | recommence à la fin, ou s’arrête sur la dernière pose                                                                         |
| **Transition**                | la durée du fondu **aux deux bouts** du bloc, jusqu’à une seconde                                                             |
| **Déplacement du personnage** | si ce mouvement emmène le personnage, ou le fait marcher sur place — **Automatique**, **Sur place**, **Celui de l’animation** |
| **Pilote**                    | quelle moitié du corps ce bloc anime — **Tout le corps**, **Le haut du corps**, **Le bas du corps**                           |

**Ces sept contrôles portent sur LE BLOC CHOISI sur la bande** : appuyez sur un bloc pour le
choisir, et la section bascule dessus — tant que vous n’en avez choisi aucun, c’est le premier.
Un modèle qui porte plusieurs blocs se règle donc bloc par bloc : la vitesse et la boucle
s’écrivent dans celui que vous regardez, et les autres ne bougent pas.

> **Le ▶ de l’Inspecteur ne déplace pas la tête de lecture.** Regarder une animation est un coup
> d’œil sur un bloc, pas un déplacement de l’horloge de la scène : le bloc tourne dans la vue, la
> bande reste où vous l’avez laissée. **Les deux ne marchent jamais ensemble** — lancer la
> timeline coupe l’aperçu, déplacer la tête aussi, et lancer l’aperçu met la timeline en pause.

**La position de la tête n’est pas enregistrée** : rouvrir la scène la remet au début. Ce qui est
enregistré, ce sont les blocs — leur place sur la bande, leur vitesse, leur boucle, leur transition,
leur déplacement et ce qu’ils pilotent.

**Un seul curseur pour les deux bouts, et c’est délibéré** : ce que _Transition_ règle est la façon
dont ce mouvement **rejoint ses voisins**, et un bloc dont les deux bouts fondraient sur des durées
différentes ne décrirait rien de tel. Le fondu vaut zéro par défaut, et une seconde au maximum.

**Le _Déplacement du personnage_ règle une seule question : ce mouvement fait-il avancer le
personnage sur le sol ?** Une marche enregistrée le fait ; posée telle quelle sur un objet que la
bande emmène déjà d’un point à un autre, le personnage couvre le terrain **deux fois** et arrive
au-delà.

| Valeur                   | Ce qu’elle fait                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automatique**          | le bloc emmène le personnage, **sauf** si une trajectoire de la bande le déplace déjà. C’est le réglage qui évite le double déplacement, et le défaut |
| **Sur place**            | le mouvement n’avance jamais : il est joué sur place                                                                                                  |
| **Celui de l’animation** | le déplacement du fichier est toujours utilisé, trajectoire ou pas                                                                                    |

> **« Sur place » ne cloue pas le personnage au sol** : seul le déplacement **horizontal** est
> retiré. La hauteur des hanches et leur rebond restent, sans quoi une marche s’enfoncerait dans le
> sol ou glisserait au lieu de marcher.

> **Ce qui compte comme trajectoire, ce sont DEUX clés de position au moins** sur l’objet lui-même.
> Une clé isolée place le personnage, elle ne le déplace pas, et _Automatique_ laisse alors le
> mouvement l’emmener.

> **Une trajectoire rendue muette compte quand même.** _Automatique_ regarde si ces clés
> **existent**, pas si elles jouent : rendre une trajectoire muette arrête le personnage, ça ne
> rend pas la main au mouvement pour l’envoyer marcher tout seul.

**Un modèle sans séquence garde la section**, qui dit alors ce qui lui manque — qu’il ne porte pas
encore de squelette, ou qu’il en porte un que le studio ne reconnaît pas. Le menu, lui, ne
s’affiche que s’il y a quelque chose à choisir.

**Une séquence se voit aussi sur la bande du bas**, posée en bloc à sa longueur réelle, et c’est
**le bloc** qui porte le nom du clip. La ligne qui l’accueille est une **sous-piste**, appelée
**Anim. 1**, **Anim. 2**, et ainsi de suite. Les sous-pistes sont groupées **sous** les lignes de
clés, jamais mêlées à elles.

**Une séquence que son fichier ne nomme pas s’appelle « Animation » à l’écran**, ou
**Animation 1**, **Animation 2** — et partout où le studio la nomme : le menu **Clip**, le bloc sur
la bande, le panneau Animations et le volet d’ajout. C’est le cas le plus courant : un export Tripo
appelle son unique séquence `NlaTrack` — le nom que Blender donne par défaut à une piste qu’on n’a
pas nommée — et un export Uthana n’en nomme aucune, ce qui les fait numéroter à l’ouverture.

**Le numéro n’est pas un rang recompté** : c’est celui que le fichier porte déjà. Si des séquences
nommées sont mêlées aux autres, **la numérotation saute** — « Animation 1 », « Marche »,
« Animation 3 ».

> **Le fichier, lui, garde son mot.** Ce remplacement ne vit qu’à l’écran : ouvrez la scène
> ailleurs, `NlaTrack` est toujours là. C’est délibéré — écrire « Animation » dans le document
> figerait la langue du jour où il a été enregistré, et un fichier français resterait français pour
> un lecteur anglophone.

**Tout autre nom est laissé intact** : le studio ne remplace que ces deux écritures-là, à la
lettre. Une séquence que quelqu’un aurait vraiment appelée `NlaTrack` serait donc renommée elle
aussi — rien ne permet de l’en distinguer.

> **Une animation LIVRÉE ne suit pas cette règle** : elle porte le nom de son dossier, quoi que son
> fichier écrive. C’est un autre mécanisme, décrit plus bas.

### Rendre un modèle animable

Un modèle importé n’a le plus souvent aucun squelette : c’est une **maille**, et rien ne peut
l’animer. **La section Animation est là quand même**, et c’est elle qui le dit — « Ce modèle n’est
pas encore animable. » Une seconde section, **Squelette**, porte alors le bouton **Rendre
animable**.

**Cette seconde section ne s’affiche pas toujours, et c’est voulu** : un modèle qui arrive avec son
propre squelette n’en reçoit pas un second, et un modèle encore en cours de chargement n’a rien à
mesurer.

**Deux formes sont refusées avant tout clic**, parce que le studio pose son squelette d’après
l’encombrement du modèle : « Ce modèle est trop plat pour recevoir un squelette. » et « Ce modèle
est couché. Redressez-le avant de le rendre animable. » Dans le second cas, redressez-le et le
bouton revient.

Le bouton ouvre un petit volet, à côté de lui, avec deux réglages.

| Réglage                | Ce qu’il propose                                                            |
| ---------------------- | --------------------------------------------------------------------------- |
| **Type de personnage** | **Automatique**, **Humain**, **Animal**, **Autre**                          |
| **Service**            | **Automatique — le studio**, puis les services distants qui savent le faire |

**Le studio ne pose qu’un squelette HUMANOÏDE** — hanches, colonne, deux bras, deux jambes. Choisir
**Animal** ou **Autre** affiche la raison et **grise Créer le squelette** : mieux vaut le dire que
poser des hanches sur un cheval et vous laisser le découvrir.

> **Les services distants sont listés, et aucun n’est choisissable aujourd’hui.** Chacun porte la
> raison qui l’en empêche — l’abonnement qui manque, la taille du modèle, ou qu’il n’est **pas
> encore branché**. Le studio, lui, le fait **lui-même et gratuitement**, sans limite de taille :
> c’est le sens d’« Automatique — le studio », et c’est ce que **Créer le squelette** lance.

**Ce que ça change, une fois créé** : une barre **Préparation du personnage** pendant le calcul,
puis « Ce modèle a reçu un squelette. » La section Animation cesse de dire qu’il n’est pas
animable — « Ce personnage est prêt à être animé. » — et le **mode pose** attrape enfin ses os, qui
n’existaient pas avant.

### L’onglet Modèle

Un modèle s’édite **sur son propre onglet**, ouvert par le double-clic ci-dessus ou par le bouton
**Éditer le squelette** de l’Inspecteur. Il montre le fichier seul, posé sur une grille, et sa barre
porte ce qui bouge la **vue** : sélection, navigation, déplacer, tourner, le **mode de rendu**
(filaire, matcap, densité…), **Afficher les os**, et **Cadrer**. Les deux boutons de droite
choisissent ce que le gizmo fait d’une articulation — la poser, ou modifier le squelette.

Le **clic droit** sur le modèle, dans la vue comme dans le panneau Scène, offre les mêmes gestes :
cadrer, afficher ou masquer les os, le mode de rendu, capturer la vue. Les menus **Affichage** et
**Fichier ▸ Exporter** servent l’onglet comme ils servent une scène ; le fichier exporté prend le
nom de l’onglet.

L’Inspecteur ajoute deux sections à celles du squelette et des mouvements. **Points d’attache**
nomme, sur un os, l’endroit où un objet d’une scène viendra s’accrocher. **Formes** pèse chaque
cible de morphing que le fichier porte, d’un curseur — **un aperçu** : ce poids n’est pas encore
écrit dans le fichier.

> **Cet onglet n’ajoute rien au modèle.** Une forme, une lumière ou un texte se posent dans une
> scène, jamais ici : ce qui s’enregistre depuis l’onglet est le fichier du modèle, squelette
> compris. Et ⌘S ne sait réécrire qu’un `.glb` : sur un `.fbx` ou un `.obj` il le dit, plutôt que
> d’écrire un fichier que rien ne relirait.

### Ajouter une animation

La section **Animation** ouvre elle-même de quoi en choisir une : le lien **Ajouter une animation**
déroule un volet sous lui, avec trois onglets.

| Onglet           | Ce qu’il offre                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bibliothèque** | tout ce qui est déjà sous la main, en une seule liste : les séquences que le fichier du personnage porte, celles livrées avec le studio, et les animations rangées dans le projet |
| **Import**       | un fichier pris sur le disque — `.glb`, `.gltf`, `.fbx`                                                                                                                           |
| **IA**           | les modèles distants qui **fabriquent** un mouvement                                                                                                                              |

**L’onglet Bibliothèque n’est pas le panneau _Animations_** décrit plus bas, et les deux listes ne
se valent pas : l’onglet compte une source de plus — les animations rangées dans le projet — et il
**pose** ce qu’on choisit, là où le panneau se glisse sur la bande.

**Choisir une ligne POSE le bloc, ce n’est pas une répétition.** Le mouvement est écrit sur le vrai
personnage, transposé comme il le sera, et il se met à jouer aussitôt : ce que vous regardez **est**
le résultat, il n’y a pas d’aperçu qui pourrait en différer. Continuer à parcourir remplace le bloc
posé par le suivant — il n’en reste jamais deux.

**Deux boutons pour sortir.** **Garder** laisse le bloc où il est et referme le volet : garder,
c’est ne rien faire de plus. **Annuler** le reprend, et la scène revient où elle était.

**Le volet se ferme aussi tout seul, et ce qu’il advient du bloc dépend de la raison.** Cliquer
hors du volet ou appuyer sur `Échap` sont des façons de le FERMER : le bloc est repris, comme avec
Annuler. **Passer à une autre application n’en est pas une** — le studio referme le volet en
**gardant** le bloc, exactement comme si vous aviez appuyé sur Garder, plutôt que de le reprendre
pendant que vous regardez ailleurs.

**Sous la liste, l’aperçu porte ses propres contrôles** : _Revenir au début_, _Jouer l’aperçu_,
_Aller à la fin_, puis **Position**, **Vitesse** et **En boucle** — ces deux derniers étant les
réglages de la section, écrits dans le bloc que vous venez de poser. Comme le ▶ de l’Inspecteur,
cet aperçu tourne sur une horloge à lui et ne déplace pas la tête de lecture.

**Position TIENT la pose où vous la laissez**, au lieu de tout ramener au début : c’est ce qui
permet de juger une pose plutôt qu’un mouvement, et la lecture repart ensuite de là. _Aller à la
fin_ montre la dernière pose du mouvement — celle qui compte pour enchaîner sur le bloc suivant.

**Le volet dit ensuite si le mouvement va au squelette**, en une ligne : « Le personnage sait jouer
ce mouvement. », ou bien qu’il ne lui va pas parfaitement. **Aucun nom d’os n’est affiché
d’emblée** — _Voir les articulations concernées_ ouvre la liste, et ce sont des **rôles**, jamais
des noms d’os : deux squelettes ne partagent que ce vocabulaire-là. Chaque ligne dit ce qui arrive à
l’articulation — « reste au repos » pour une articulation de votre personnage que le mouvement
n’anime pas, « non reprise » pour une articulation du mouvement que votre personnage n’a pas.

> **Une séquence venue du fichier du personnage ne dit rien de tout cela**, et c’est normal : elle
> parle déjà son squelette, il n’y a eu aucune transposition à juger.

**Un fichier importé reste où il est** — le studio le référence, il ne le recopie pas, comme tout
import. Un fichier qui ne porte aucun mouvement est refusé sur place, avec sa raison, plutôt que de
ne rien faire.

**L’onglet IA ne fait aujourd’hui que LISTER**, et il le dit : aucune génération ne s’y lance
encore. Chaque ligne porte la raison qui l’en empêche — l’abonnement qui manque, ou « Pas encore
branché ». Quand le catalogue n’offre aucun service de mouvement, l’onglet le dit aussi.

### La bibliothèque d’animations

Le panneau **Animations**, dans la colonne de droite, liste **ce qu’un personnage peut jouer** :
d’abord les séquences que le fichier du modèle sélectionné porte, puis celles livrées avec le
studio. Les deux sources se suivent dans une seule liste, et se glissent de la même façon.

**Une ligne se glisse sur une sous-piste de la bande, et c’est ce qui y pose un bloc.** Il commence
là où vous lâchez, cadré sur l’image la plus proche, et prend la longueur réelle du fichier. Il est
choisi aussitôt : l’Inspecteur décrit alors ce que vous venez de poser.

> **Seule une sous-piste accepte un dépôt.** Une ligne de clés porte des clés, la ligne d’un objet
> est l’objet lui-même, et la règle du haut n’est pas une piste : lâcher sur l’une des trois ne
> fait rien.

**Chaque ligne porte aussi un ▶ — _Jouer sur le personnage_** — et c’est le moyen d’essayer une
animation sans viser une sous-piste. **Il pose un VRAI bloc** sur le personnage sélectionné, avec
les mêmes réglages de départ qu’un glisser, et le joue aussitôt. **Il le pose au DÉBUT de la
première sous-piste**, là où le glisser vous laisse choisir la ligne et l’endroit.

> **Ce n’est pas le ▶ de l’Inspecteur**, qui regarde un bloc **déjà posé** sans jamais rien écrire.
> Celui-ci pose le bloc lui-même, et peut le reprendre.

**Un second appui l’arrête ET retire le bloc** : le bouton le dit, _Arrêter et retirer le bloc_.
Appuyer sur le ▶ d’une **autre** ligne retire d’abord **celui qui joue** — jamais deux aperçus à la
fois.

> **Ce qui reste dépend de la façon dont ça s’est arrêté**, et c’est la seule subtilité de ce
> bouton. Arrêté par vous, le bloc s’en va. **Interrompu par la tête de lecture — parce que vous
> avez lancé la bande ou déplacé la tête — le bloc RESTE**, posé sur le personnage. Ce n’est pas un
> accident : c’est ce qui transforme un essai concluant en travail gardé. **Et plus rien ne le
> reprend** : le ▶ suivant pose son essai EN PLUS, au même endroit.

**L’aperçu ne montre jamais que le dernier essai, seul.** C’est la BANDE qui, ensuite, partage la
pose entre les blocs qui se recouvrent sous la tête de lecture : deux essais empilés au même
endroit se moyennent, et le personnage fait les deux à moitié. Écartez-les sur la sous-piste — un
bloc se glisse à la souris — pour les voir l’un après l’autre.

**Le ▶ est éteint tant qu’aucun modèle n’est sélectionné dans la scène** : il n’y a alors rien sur
quoi jouer un mouvement. **Un modèle suffit — il n’a pas besoin d’être déjà animable** ; ce qu’il
sait vraiment jouer, la section Animation le dira. La liste, elle, reste affichée.

**Une animation livrée est rejouée sur le squelette de VOTRE personnage** — elle a été montée pour
un autre, et le studio la transpose. Le personnage qui la portait n’entre pas dans la scène.

**Une animation livrée porte le nom de son DOSSIER**, jamais celui écrit dans le fichier — un
export Tripo appelle son unique séquence `NlaTrack`, un export Uthana n’en nomme aucune. Une
vignette s’affiche si le dossier en porte une, sinon une marque générique. Un dossier vaut **une**
animation : si son fichier en épelle plusieurs, c’est la première qui est jouée.

**Le studio peut être livré sans aucune animation.** Quand ni le modèle sélectionné ni le dossier
livré n’ont rien à offrir, le panneau le dit : « Aucune animation. Sélectionnez un personnage, ou
installez des animations dans le dossier de l’application. » Ce dossier est commun à tous les
projets, et il se met à jour en mettant le studio à jour.

### Superposer deux animations

**Deux blocs ne se superposent pas sur une même sous-piste.** Là où ils se chevauchent, ils se
partagent le personnage à parts égales, et la pose obtenue est leur moyenne — c’est-à-dire ni
l’un ni l’autre. Posez-les **bout à bout** pour les enchaîner : hors de son bloc, un mouvement
tient sa pose de bord, et c’est le suivant qui prend la main.

**Pour les jouer ensemble, donnez-leur chacun une ligne.** Le bouton **+** de la dernière
sous-piste — _Ajouter une sous-piste_ — en ouvre une en dessous, et une sous-piste restée seule ne
se supprime pas : c’est elle qui reçoit ce qu’on dépose sur l’objet. Leur ordre se change en
glissant leur en-tête, et **il ne change que l’endroit où elles sont dessinées** — contrairement
aux plans de caméra, aucune sous-piste ne passe devant une autre.

**C’est là que _Pilote_ sert.** Deux blocs réglés sur **Tout le corps** n’ont rien de plus à donner
que leur moyenne, même sur deux lignes : ils se disputent les mêmes os. Réglez l’un sur **Le haut
du corps** et l’autre sur **Le bas du corps**, et chacun garde sa moitié entière — marcher _et_
lever les bras devient les deux à la fois, au lieu d’un demi-pas les bras à mi-hauteur.

> **Les hanches vont avec les jambes**, et c’est délibéré : elles portent le placement du
> personnage, donc un bloc du haut du corps l’emmènerait ailleurs que là où ses jambes l’ont posé.

> **Les moitiés se lisent sur le squelette, pas sur le fichier.** Un os qui ne remplit aucun rôle
> reconnu suit le membre auquel il pend — un os de torsion, un doigt que personne n’a nommé, une
> queue. Et quand rien au-dessus de lui n’est reconnu non plus, il part avec le bas du corps : sur
> un modèle dont la section annonce **un squelette dont aucune articulation n’est reconnue**, ne
> comptez pas sur les moitiés et laissez les blocs sur **Tout le corps**.

### Modifier un bloc posé

**Un bloc choisi répond à trois gestes**, et le clic droit sur le bloc les porte tous les trois —
sans ce menu, aucun ne se découvrirait.

| Geste              | Touche  | Ce qu’il fait                                                           |
| ------------------ | ------- | ----------------------------------------------------------------------- |
| **Dupliquer**      | `⌘D`    | pose une copie du bloc **juste après lui**, bout à bout                 |
| **Couper le bloc** | `S`     | coupe le bloc en deux là où se trouve la tête de lecture                |
| **Supprimer**      | `Suppr` | retire le bloc de la bande. **L’animation elle-même n’est pas touchée** |

**La coupe ne pose aucun fondu au joint**, exactement comme celle du montage : les deux moitiés se
lisent comme un seul mouvement, et une rampe au milieu ferait fondre la pose là où il ne se passe
rien. La seconde moitié reprend le mouvement là où la première s’arrête.

**Couper reste grisé tant que la tête de lecture n’est pas STRICTEMENT à l’intérieur du bloc** :
posée sur l’un de ses deux bords, elle ne le couperait en rien. Le menu garde l’entrée grisée
plutôt que de la retirer — une liste dont la longueur suit la tête de lecture ne s’apprend pas.

> **Ces trois touches n’appartiennent à aucun contexte de l’écran des raccourcis**, et ne s’y
> changent donc pas : elles sont liées à la bande, qui doit avoir le focus. **Les deux mêmes
> touches font autre chose dans la vue 3D** — `S` y redimensionne, `⌘D` y duplique l’objet
> sélectionné — et c’est la surface qui a le focus qui tranche. Le clic droit reste le chemin sûr.
> Voir [Les raccourcis clavier](15-raccourcis.md).

### Voir le squelette

Un modèle à squelette porte des **os**. La touche **B**, ou **Affichage ▸ Afficher les squelettes**,
les dessine par-dessus la scène. La ligne est cochée tant qu'ils sont visibles.

**Pour en attraper un, passez en mode pose** — touche **P**, ou **Affichage ▸ Mode pose**. Le clic
cesse alors de choisir des objets et choisit des os.

> **Le studio prend l’os le plus proche du pointeur à l’écran**, qu’il soit devant ou derrière une
> épaule. Visez donc **l’articulation elle-même** plutôt que le membre qu’elle pilote.

### Retoucher un squelette

**Un os choisi en mode pose ouvre ses réglages dans la section Squelette** — et il doit appartenir
au modèle que l’Inspecteur décrit. Tant qu’aucun os n’est choisi, la section garde l’état du
personnage, **Ajouter les mains** s’il a quelque chose à faire, et **Retirer le squelette**.

| Réglage ou bouton                | Ce qu’il fait                                                       |
| -------------------------------- | ------------------------------------------------------------------- |
| **Nom**                          | renomme l’os choisi. Un nom déjà pris est refusé, et rien ne change |
| **Articulation**                 | quel rôle cet os tient dans un corps humain — ou **Aucune**         |
| **Ajouter un os enfant**         | pose un os sous celui qui est choisi, exactement à sa place         |
| **Retirer cet os**               | retire l’os choisi du squelette                                     |
| **Ajouter une poignée à suivre** | donne à cette articulation une poignée qu’elle cherche à atteindre  |
| **Ajouter les mains**            | pose des doigts sur les mains d’un personnage qui n’en a pas        |
| **Retirer le squelette**         | rend le modèle à son état de maille                                 |

**Renommer sert plus qu’on ne croit** : un squelette arrive avec les noms de son fichier, et
`mixamorigHips` n’est le choix de personne. Le nom est celui que vous lirez ensuite partout.

**_Articulation_ est ce qui rend un mouvement transposable.** C’est par ces rôles — et non par les
noms — que le studio fait jouer à votre personnage une animation montée pour un autre : deux
squelettes ne partagent que ce vocabulaire. Un os qui n’en tient aucun reste sur **Aucune** et ne
gêne rien.

> **Les rôles sont écrits en anglais et ne sont pas traduits** : c’est la liste que se partagent
> les logiciels d’animation, et la traduire ici la rendrait introuvable ailleurs.

**Une poignée à suivre pose un pied au sol ou une main sur une prise.** L’articulation cherche à
l’atteindre, et **les os au-dessus d’elle tournent pour suivre — deux au plus** : le parent et le
grand-parent. C’est ce qui distingue un pied qui reste posé d’un pied qui traverse le sol quand la
hanche bouge. Le bouton devient **Retirer la poignée** pour une articulation qui en a déjà une.

> **Ce n’est pas la poignée d’un gizmo**, ni celle qui rogne un clip : celle-ci est un point que
> l’articulation VISE, et elle reste posée dans la scène.

> **Sur un os qui n’a rien au-dessus de lui, le bouton ne fait rien** — les hanches, par exemple,
> n’ont aucun ancêtre à faire tourner. Un os dont le parent est déjà la racine n’en fait suivre
> qu’un.

**Ajouter les mains n’apparaît que là où il a quelque chose à faire** : il faut une main et un
avant-bras reconnus, et **une main qui porte déjà un pouce est laissée intacte**. **La condition se
juge côté par côté** — si une seule main la remplit, le bouton apparaît et ne pose des doigts que
de ce côté-là, sans rien dire de l’autre.

**Un os ajouté naît sous son parent, au même endroit que lui**, et porte son nom suivi d’un
numéro. C’est le gizmo qui le met où il doit aller.

> **Retirer le squelette n’efface pas les animations posées.** Le modèle redevient une maille, mais
> les blocs et les clés qui visaient ses os restent dans le document — sans os pour les porter,
> donc sans effet. `⌘Z` ramène le squelette et tout se rattache ; sinon, retirez les blocs
> vous-même.

### Poser vos propres mouvements

**Vos objets sont déjà dans la bande.** Chaque objet de la scène y a sa ligne : il n’y a rien à
créer, et aucun bouton pour cela.

Placez la tête de lecture, puis **posez une clé sur la ligne de l’objet**. Les trois propriétés
animées — Position, Rotation, Échelle — naissent à ce moment-là, ensemble, et en **une seule
annulation**. Si l’objet est un modèle à squelette, le menu **Os** apparaît dans la barre : il s’ouvre
sur **Le modèle entier**, et choisir un os fait porter les clés sur lui seul, ce qui est la façon
de corriger un bras sans déplacer tout le personnage.

**La bande se lit par objet.** Une ligne par objet — ou par os — et ses propriétés
animées **repliées dessous**. La ligne repliée montre toutes les clés de l’objet, celles de ses
trois propriétés confondues ; la déplier les sépare. **Replier ne perd jamais une clé**, cela ne
change que ce qui est montré.

| Contrôle de la barre                        | Ce qu’il fait                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Revenir au début**                        | ramène la tête de lecture à zéro                                                                                                                         |
| **Lire** / **Mettre en pause**              | joue la timeline                                                                                                                                         |
| **Enregistrement automatique**              | bouger un objet **pose une clé** au lieu de déplacer sa pose de repos                                                                                    |
| **Durée** et **Images/s**                   | la longueur de la timeline, et sa cadence                                                                                                                |
| **Os**                                      | sur un modèle à squelette : l’os que la prochaine clé animera, ou **Le modèle entier**. Un os **cliqué dans la vue** en mode pose l’emporte sur ce choix |
| **Poser une clé sur tout ce qui est animé** | le même geste, sur tout ce qui est **déjà** animé — grisé tant que rien ne l’est                                                                         |
| **Rendre en vidéo**                         | voir plus bas — grisé tant qu’aucune caméra n’est dans la scène                                                                                          |

**Chaque ligne porte les siens**, à gauche de la bande :

| Sur l’en-tête d’une ligne                               | Ce qu’il fait                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| le chevron                                              | **Afficher ou masquer les propriétés animées**                                                                                                                                                   |
| **Poser une clé sur _(le nom)_**                        | enregistre le déplacement fait depuis, sur toutes les propriétés de cet objet. **Le même bouton bascule** : là où une clé se tient déjà, il s’allume et devient **Retirer la clé de _(le nom)_** |
| **Rendre muette** / **Écouter seule** / **Verrouiller** | les trois interrupteurs d’une ligne, les mêmes qu’en Vidéo                                                                                                                                       |
| **Supprimer la piste _(le nom)_**                       | sur une ligne de propriété, la retire avec ses clés                                                                                                                                              |

**La tête de lecture s’attrape et se déplace** sur la règle graduée, et **les clés se déplacent**
sur leur ligne. **Au-delà de la durée, la bande est assombrie** : la tête ne va pas plus loin, et aucune clé ne
s’y pose — un bloc de clip, lui, s’y dépose encore.

**Une clé se retire de deux façons.** Le losange de l’en-tête, pressé là où une clé se tient sous
la tête de lecture, la retire de **toutes les propriétés qui en portent une à cet instant** — d’un
seul coup, comme il les avait posées, et `⌘Z` les fait toutes revenir ensemble. Sur la bande,
**cliquez une clé pour la choisir, puis `Suppr` ou `Retour arrière`** : elle part de la ligne où
elle est, et c’est **la ligne qui décide de la portée**, jamais son pliage — celle d’un objet
emporte toutes ses propriétés, celle d’une propriété dépliée n’emporte qu’elle. **Une ligne
verrouillée garde la sienne** — le verrou protège du retrait comme il protège de la pose.

**Lire quand la tête est déjà au bout rembobine** au lieu de s’arrêter sur l’image où l’on est.

**L’animation compose avec la pose de l’objet, elle ne la remplace pas** — et pas de la même
façon selon la propriété : les déplacements **s’ajoutent**, les échelles se **multiplient**.
C’est l’inverse d’un montage vidéo, où le clip du dessus cache celui du dessous.

> **Pour empiler deux fois la même propriété sur un objet, verrouillez ses lignes** : la clé
> suivante en ouvre de nouvelles par-dessus. Deux positions de 2 et 3 donnent 5 ; deux échelles
> qui doublent chacune donnent **quatre fois** la taille.

> **Un objet DÉJÀ animé enregistre de lui-même, quoi que dise l’interrupteur.** Une fois qu’il
> porte une clé, le bouger édite son animation. L’interrupteur ne décide donc que d’une chose :
> si un objet **pas encore animé** se met à l’être — et la distinction porte sur les **clés**,
> pas sur les lignes : des propriétés ouvertes et vides ne sont pas encore une animation, et
> l’interrupteur y garde son mot.
>
> **Un os sans clé est un cas à part** : n’ayant pas de pose de repos où retomber, le geste est
> abandonné et l’os revient où il était.

### Poser les clés à la main

L’enregistrement automatique n’est pas obligatoire. Le geste, dans l’ordre :

1. **posez une clé** au départ, sur la ligne de l’objet — elle ouvre ses trois propriétés (une
   caméra en a une quatrième, son **angle de vue**) et retient la pose où il se tient à cet
   instant, contre laquelle toutes ses clés se mesureront ;
2. **déplacez la tête** sur la règle ;
3. **déplacez l’objet**, puis **posez une clé** à nouveau.

> **Les chiffres de l’Inspecteur reviennent à la pose de référence, pas l’objet à l’écran.** La
> clé retient le déplacement, et la position enregistrée repart de la référence. Dans la vue,
> **rien ne bouge** : ce que vous voyez est la référence plus la clé, donc l’endroit où vous venez
> de poser l’objet.

**Un os ne travaille pas ainsi** : ses propriétés n’ont pas de pose de référence, donc y poser une
clé **fige ce qu’elles tiennent déjà** et rien ne revient en place. Pour animer un os, passez par
l’enregistrement automatique et le mode pose plutôt que par ces trois étapes.

### Sortir une vidéo

Ajoutez une **caméra** à la scène (menu Ajouter → Objet → Caméra). C’est un objet comme un autre :
elle se déplace au gizmo, elle s’anime comme n’importe quel objet, et un export glTF l’emporte
avec lui.

#### L’aperçu — voir ce que la caméra filme

**Choisissez une caméra, et un encart s’ouvre en haut à droite de la vue** : ce qu’elle voit, à
l’instant où se tient la tête de lecture, au format d’une vidéo. En haut, son nom. Il se referme
en désélectionnant la caméra.

Ce n’est pas une vue de travail mais une **image de rendu** : ni grille, ni poignées, ni
squelettes, ni repères de lumières ou de caméras — exactement ce que le fichier vidéo contiendra.

| Geste                                | Ce qu’il fait                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Glisser l’encart**                 | le déplace dans la vue, s’il gêne                                                                                     |
| **Agrandir l’aperçu à toute la vue** | l’encart prend toute la surface. Le même bouton, devenu **Remettre l’aperçu dans son coin**, le renvoie d’où il vient |

**La pastille « À l’antenne »** s’allume quand la caméra choisie est aussi celle que le montage
désigne à cet instant. C’est la seule chose qui distingue les deux : **l’aperçu suit ce que vous
avez sélectionné**, le montage et le rendu suivent ce que les plans décident — voir plus bas.

**Une scène peut en porter plusieurs et changer de caméra en cours de route.** C’est le rôle des
**plans**, posés sur la bande du bas :

1. **choisissez la caméra** dans la scène ou dans l’arbre ;
2. **placez la tête de lecture** là où le plan doit commencer ;
3. **Mettre cette caméra à l’antenne**, dans la barre de la timeline. Le plan s’ouvre à partir de
   la tête, sur **trois secondes** — ou ce qui reste de la bande, si c’est moins.

Un plan se **glisse** et se **rogne** ensuite comme un clip de montage. Chaque caméra a **sa
ligne**, et **l’ordre de ces lignes fait la loi** : là où deux plans se recouvrent, c’est la ligne
la plus haute qui passe à l’antenne. Glissez un en-tête de ligne pour la changer de rang — cela
modifie le document, et `⌘Z` le rend.

> **Sans aucun plan, rien n’est perdu** : c’est la première caméra de la scène qui filme, sur toute
> la durée. Et **supprimer une caméra ne troue pas le film** — ses plans sont sautés plutôt que
> rendus en noir, et annuler la suppression les ramène entiers.

**L’angle de vue s’anime comme le reste**, et c’est le zoom d’un plan. Posez une clé sur la ligne
de la caméra — elle ouvre l’**angle de vue** avec les trois autres propriétés —, puis réglez ce
champ dans l’Inspecteur : avec l’**enregistrement automatique**, chaque réglage devient une clé à
la tête plutôt qu’un changement d’objectif. Une caméra **déjà animée** enregistre même sans, comme
un objet déjà animé le fait d’un déplacement. Le champ affiche alors ce que l’objectif lit **à
l’instant où se tient la tête**, clés comprises.

Le bouton **Rendre en vidéo** de la timeline écrit un fichier `.mp4` sur toute la durée, chaque
image prise par la caméra que le montage désigne à cet instant. Le studio demande **où enregistrer
avant de calculer quoi que ce soit** — un rendu prend des minutes.

**Sans caméra dans la scène, le bouton est grisé** : il n’y a rien à travers quoi regarder.

---

## Jouer la scène

Le bouton **Jouer** de la barre d’outils lance la scène comme une partie, **dans une fenêtre à
part**. Le document n’est pas touché : la partie construit son propre monde, et **Arrêter** le
jette pour remettre la scène telle qu’elle était. La fenêtre de jeu lit son propre clavier — rien
du viewport ne lui est passé, et l’éditeur derrière elle ne bouge pas.

### Les commandes, sans rien configurer

Une scène neuve se joue **au clavier comme à la manette**, sans créer un seul fichier ni écrire
une ligne de script. Une manette branchée est reconnue dès qu’un premier bouton est pressé — c’est
le navigateur qui l’exige, pas le studio.

**À pied**

| Geste     | Clavier                                                            | Manette                          |
| --------- | ------------------------------------------------------------------ | -------------------------------- |
| Marcher   | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> ou les flèches | stick gauche                     |
| Courir    | <kbd>Maj</kbd>                                                     | clic du stick gauche             |
| Regarder  | souris, **bouton maintenu**, non rebindable                        | stick droit, **sans rien tenir** |
| Sauter    | <kbd>Espace</kbd>                                                  | ✕ / A                            |
| Interagir | <kbd>E</kbd>                                                       | ▢ / X                            |

> **Interagir et Sortir n’agissent pas d’eux-mêmes.** Le studio lit ces deux commandes et les
> passe à votre script : ce que « interagir » veut dire devant un objet, et ce que sortir d’une
> voiture veut dire, n’appartiennent qu’à votre jeu. Le script posé par le modèle montre où les
> brancher.

**Au volant**

| Geste            | Clavier                                                | Manette         |
| ---------------- | ------------------------------------------------------ | --------------- |
| Accélérer        | <kbd>W</kbd> ou <kbd>↑</kbd>                           | gâchette droite |
| Freiner, reculer | <kbd>S</kbd> ou <kbd>↓</kbd>                           | gâchette gauche |
| Braquer          | <kbd>A</kbd> <kbd>D</kbd> ou <kbd>←</kbd> <kbd>→</kbd> | stick gauche    |
| Frein à main     | <kbd>Espace</kbd>                                      | ✕ / A           |
| Sortir           | <kbd>F</kbd>                                           | ▢ / X           |

**Aux commandes d’un avion**

| Geste          | Clavier                                      | Manette                                     |
| -------------- | -------------------------------------------- | ------------------------------------------- |
| Cabrer, piquer | <kbd>↓</kbd> cabre, <kbd>↑</kbd> pique       | stick gauche, **tiré vers soi pour cabrer** |
| Incliner       | <kbd>A</kbd> <kbd>D</kbd>                    | stick gauche                                |
| Lacet          | <kbd>Q</kbd> <kbd>E</kbd>                    | gâchettes d’épaule                          |
| Gaz            | <kbd>Maj</kbd> ouvre, <kbd>Ctrl</kbd> réduit | gâchettes                                   |

> **Le stick est analogique, la touche ne l’est pas.** Un stick poussé à mi-course marche à mi-
> vitesse ; une touche ne connaît que zéro et tout. C’est la seule chose qu’une manette sait dire
> et qu’un clavier ne sait pas.

> **Les gaz d’un avion sont un levier, pas une pédale.** On les pousse, on les tire, et ils
> restent où on les a laissés — un moteur qui retombe au ralenti dès qu’un doigt se lève ne se
> pilote pas.

### Deux réglages qu’il ne faut pas confondre

Le réglage **Réglages ▸ Périphériques ▸ Parcourir le studio à la manette** ne concerne **que
l’interface du studio** : il laisse une manette déplacer le focus, valider et revenir dans les
panneaux et les dialogues. Il reste éteint par défaut, pour qu’une partie ne déplace pas l’éditeur
derrière elle — **et il n’a aucun effet sur la partie**, qui écoute la manette de toute façon.

La liste **Contrôles détectés** de la même page dit ce que la machine voit. Une manette qui n’y
figure pas n’a pas encore envoyé un premier appui.

### Changer les commandes

Les commandes ci-dessus sont un **point de départ**, pas une limite. Une **carte de contrôles**
du projet les remplace, contexte par contexte.

**Les cinq modèles de scène jouables en posent une, et vous n’avez rien à faire pour cela.**
Créez une scène « 1re personne », « 3e personne » ou « Vue de dessus » et le projet
reçoit `Controls/character.input.json` plus un script `Scripts/player.ts` accroché au personnage ;
« Voiture » et « Avion » posent les leurs. Ouvrez-les, changez-les — c’est ce qu’ils sont là pour
montrer. Une seconde scène du même modèle **rejoint** ces fichiers au lieu de les réécrire : une
carte appartient au projet, pas à la scène.

Le bouton **Nouvelle carte de contrôles** de l’Explorateur en crée une à la main, depuis l’un des
cinq points de départ standards — _studio_, _personnage_, _véhicule_, _vol_, _menu_. Elles se
rangent dans le dossier **Contrôles du jeu** — `Controls/` sur le disque — au sommet du projet,
comme les interfaces.

Une carte nomme des **actions** — `move`, `look`, `jump`, `run`, `interact` pour un personnage —
et dit quelles touches, quels sticks et quels boutons les atteignent. **Ce que la carte du projet
déclare l’emporte ; ce qu’elle laisse de côté garde le comportement par défaut.** Un projet sans
aucune carte marche donc exactement comme le tableau ci-dessus.

Un contexte porte aussi une **priorité** et un drapeau **Actif au démarrage**. Les contextes
_personnage_, _véhicule_ et _vol_ sont actifs d’emblée — aucun nom d’action ne leur est commun,
donc ils ne se marchent pas dessus.

Le contexte *menu* demande qu’on crée sa carte pour exister : il **prime** sur les autres, et c’est
à un script de le pousser quand un menu s’ouvre — sans la carte, la demande ne fait rien.

Le préréglage *studio* ne décrit pas un jeu : il décrit la **navigation à la manette de l’interface
du studio**, celle que Réglages ▸ Périphériques active. Créer sa carte, la rebinder et
l’enregistrer change la navigation **à l’enregistrement**, sans rouvrir le projet. Ses cinq actions
sont `navigate` (le stick gauche), `next` et `previous` (la croix), `confirm` et `back`. Sans carte
`studio` dans le projet, c’est le préréglage qui répond.

Un script lit ces mêmes actions par leur nom, jamais une touche :

```ts
import { defineScript } from '@studio'

export default defineScript({
  onUpdate(self, ctx, dt) {
    const walk = ctx.input.axis2('move')
    const running = ctx.input.button('run')
  },
})
```

Le même script répond alors au clavier **et** à la manette, sans savoir lequel des deux a parlé.

### Piloter le corps depuis un script

Lire les commandes ne suffit pas toujours : un script peut aussi **demander** au corps de bouger,
et c'est le contrôleur du studio qui exécute — avec la gravité, les pentes et les murs.

| Demande                                 | Ce qu'elle fait                                               |
| --------------------------------------- | ------------------------------------------------------------- |
| `self.walk(x, z)`                       | marche dans cette **direction** — l'allure vient du composant |
| `self.jump()`                           | saute, avec la même tolérance au sol qu'un bouton             |
| `self.look(lacet, tangage)`             | tourne le regard, dans la forme d'un stick                    |
| `self.drive(gaz, braquage, frein)`      | conduit **ce** véhicule                                       |
| `self.fly(tangage, roulis, lacet, gaz)` | pilote **cet** appareil                                       |

> **Ne déplacez pas un personnage avec `moveBy`.** Celle-là pose le nœud où vous dites, sans rien
> demander à personne — donc à travers le mur que la physique n'a pas encore vu. `walk` demande,
> et ce qui est impossible n'arrive pas.

> **`walk` prend une direction, pas une vitesse.** L'allure est celle du `CharacterController`, ou
> celle de la scène quand il n'en déclare aucune : `walk(0, -1)` et `walk(0, -3)` marchent à la
> même allure, `walk(0, -0.5)` à la moitié — exactement comme un stick à mi-course. Et elle est
> **relative au regard**, pas au monde : `walk(0, -1)` veut dire « devant moi ».

**Une demande REMPLACE les commandes, pour ce corps et ce pas seulement**, à deux exceptions près :
un saut **s'ajoute** au bouton — une impulsion ne se dé-presse pas, donc un script ne peut pas
empêcher un joueur de sauter — et il n'y a **qu'un seul regard** pour la scène, celui du corps que
la caméra suit.

Ces demandes se font depuis `onUpdate`, qui est le pas lui-même : celles écrites dans
`onLateUpdate` arrivent après que les contrôleurs ont lu, et sont perdues. Un script qui se tait
sur un pas rend la main au joueur sur ce pas ; un script qui parle à chaque pas tient le corps.
C'est ce qui permet de dire « ne bouge pas » : `self.walk(0, 0)` immobilise, là qu'une demande qui
ne ferait que s'ajouter ne pourrait jamais rien demander du tout.

Et la demande vise **le corps sur lequel le script est posé** : un script sur une voiture conduit
cette voiture, pas les autres de la scène.

---

## Optimiser et exporter un jeu

La scène modifiée reste le monde auteur : chaque arbre, accessoire et objet piloté par un script
garde son identité et reste modifiable. **Play** et **Exporter le jeu…** construisent un monde
runtime séparé. Les optimisations sûres partagent les géométries et matières répétées,
instancient les objets compatibles, regroupent les objets statiques proches et conservent
l’identifiant source pour le picking, les scripts et la physique.

Utilisez **Édition ▸ Optimiser la sélection…** pour prévisualiser puis appliquer une consigne aux
objets choisis. **Édition ▸ Performances du monde…** rend compte de toute la scène. Les deux
distinguent les chiffres mesurés des résultats estimés. Le compilateur runtime réutilise les
zones inchangées quand Play est relancé.

**Édition ▸ Exporter le jeu…** présente d’abord les opérations SAFE, qui ne changent ni l’image
attendue ni le comportement. La section Avancé est volontaire : niveaux de distance générés,
simplification géométrique, compression et redimensionnement des images peuvent modifier le
résultat. Le dialogue affiche donc **Changements visuels : AUCUN** jusqu’à l’activation de l’une
d’elles, puis **POSSIBLES**. Les niveaux générés gardent toujours l’original en LOD0. L’export ne
réécrit jamais la scène auteur ; son cache runtime peut être supprimé puis reconstruit.

---

## Ce qui manque encore

L’espace Modélisation a désormais tout ce que ce manuel décrit. Ce qui reste tient en deux phrases : les
polices s’offrent en une seule graisse par famille, et un texte ne se plie pas le long d’une
courbe. Côté animation, **les clés** s’enchaînent en ligne droite — il n’y a pas encore de courbes
d’accélération pour elles, la **Courbe de vitesse** d’un plan caméra étant la seule du studio —, et
une séquence d’un modèle se joue seule, sans fondu vers une autre.

Le détail est dans [Ce qui n’existe pas encore](18-limites.md).

---

[← Espace Image](08-espace-image.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Espace Vidéo →](10-espace-video.md)
