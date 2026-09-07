# 14. Tous les réglages

[← Espace Skyboxes](13-espace-skyboxes.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Tous les raccourcis →](15-raccourcis.md)

Chaque réglage du studio, sa valeur de départ, ses limites, et à quoi il sert vraiment.

---

## Ouvrir les réglages

`⌘,` (macOS) ou `Ctrl+,` (Windows, Linux). Ou le menu **Réglages…**.

Les réglages s’ouvrent dans **une fenêtre à part**. Elle vit à côté de votre travail : vous
pouvez la laisser ouverte, changer une valeur, regarder l’effet dans la fenêtre principale,
recommencer.

À gauche, la liste des **sections**. Au-dessus, un champ **Rechercher un réglage** : tapez
« grille », « langue », « ffmpeg », et la fenêtre affiche les réglages qui correspondent, quelle
que soit leur section. Si rien ne correspond, elle le dit : « Aucun réglage ne correspond à cette
recherche. »

### Comment un changement est enregistré

Trois boutons en bas de la fenêtre.

| Bouton        | Ce qu’il fait                                           |
| ------------- | ------------------------------------------------------- |
| **Appliquer** | enregistre les changements et laisse la fenêtre ouverte |
| **OK**        | enregistre et ferme la fenêtre                          |
| **Annuler**   | jette les changements non enregistrés                   |

Tant qu’un réglage est modifié sans être appliqué, une **pastille** apparaît à côté de lui, avec
l’infobulle « Modifié, pas encore appliqué ».

> **Fermer la fenêtre avec des changements en attente ne les perd pas en silence.** Le studio
> demande : « Vous avez changé des réglages sans les appliquer. Que voulez-vous faire ? » — vous
> choisissez **Appliquer** ou **Ne pas appliquer**.

### Revenir à la valeur d’origine

Chaque réglage porte, au survol, un petit bouton **Restaurer la valeur par défaut**. Il ne touche
que ce réglage-là. Pour tout remettre à zéro d’un coup, voir **Tout réinitialiser** dans la
section Avancé, plus bas.

### Un réglage grisé

Certains réglages dépendent d’un autre. **Taille de la grille** ne sert à rien si la grille n’est
pas affichée : il reste visible, mais grisé, avec la raison écrite en dessous — _« Sans effet tant
que "Afficher la grille" est désactivé. »_

Rien n’est jamais caché : un réglage qu’on ne peut pas changer maintenant reste à sa place, avec
son explication.

---

## Général

_Langue de l’application et ce qu’elle fait en s’ouvrant._

### Langue

**Choix. Départ : Système.**

La langue de tous les textes de l’application : menus, boutons, messages.

| Valeur       | Effet                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Système**  | reprend la langue de votre ordinateur — **anglais** si ce n’est ni le français ni l’anglais |
| **Français** | français                                                                                    |
| **English**  | anglais                                                                                     |

> **Une machine en allemand, en espagnol ou en japonais ouvre le studio en anglais**, pas en
> français.

Chaque langue s’écrit dans sa propre langue — « Français » reste « Français » même sur un écran en
anglais.

Une fois appliqué, le changement est **immédiat** : il n’y a rien à relancer. Il ne touche ni vos projets, ni ce que
vous écrivez dedans : un prompt écrit en anglais reste en anglais.

> **Le formulaire de génération suit aussi, mais pas toujours jusqu’au bout.** Les noms des
> réglages qu’un modèle propose — et les phrases d’explication sous eux — sont écrits par le
> modèle, et l’API de génération ne les rend qu’en anglais. Le studio les traduit lui-même. Un réglage
> qu’il ne connaît pas encore reste donc **en anglais** plutôt que de disparaître, et un modèle
> publié demain arrive dans sa langue d’origine.
>
> **Sept mots restent en anglais exprès** : `sampler`, `scheduler`, `LoRA`, `checkpoint`,
> `prompt`, `clip skip`, `denoising strength`. **Ne reste en anglais que ce que le studio ne nomme
> en français nulle part**, ni dans une de ses surfaces, ni dans le [glossaire](17-glossaire.md).

### À l’ouverture

**Choix. Départ : Rouvrir le dernier projet.**

Ce que l’application fait quand vous la lancez.

| Valeur                        | Effet                                   |
| ----------------------------- | --------------------------------------- |
| **Rouvrir le dernier projet** | vous remet là où vous vous étiez arrêté |
| **Ne rien ouvrir**            | démarre sur une fenêtre vide            |

« Ne rien ouvrir » est plus rapide au démarrage, et plus reposant si vous jonglez entre beaucoup
de projets.

### Afficher l’accueil

**Interrupteur. Départ : activé.**

L’écran pleine largeur sur lequel le studio s’ouvre : vos projets, ce sur quoi vous travailliez,
ce qui tourne, et ce que les modèles savent faire. Décoché, le studio va droit à l’espace que
vous aviez quitté.

**Ce réglage et le précédent sont indépendants.** « Ne rien ouvrir » ne concerne que le projet :
l’accueil s’affiche quand même, et vous propose d’en créer un. Pour arriver directement dans un
espace de travail, il faut décocher celui-ci.

Ce qui se règle **sur l’accueil lui-même**, et pas ici : quelles bandes sont affichées — voir
[La fenêtre](03-la-fenetre.md#laccueil-avant-tout-le-reste).

### Actualités des modèles

**Interrupteur. Départ : activé.**

La bande **Ce qui bouge**, en bas de l’accueil, lit les modèles qui montent et les articles parus
sur Hugging Face. **C’est le seul appel sortant du studio pour autre chose qu’un modèle ou une
génération**, et il va sur l’hôte d’où viennent déjà tous les poids du catalogue : personne
n’apprend rien de neuf. Décoché, le studio ne contacte personne pour cette bande, qui reste et
dit qu’elle est coupée.

Une réponse est gardée six heures, et la bande montre huit lignes au plus, rien de plus vieux qu’un mois : ce sont des tendances, pas un fil d’actualité.

---

## Compte

_Identifiants API, chiffrés par le trousseau du système._

C’est ici qu’on branche le studio à votre service de génération. Sans cette étape, tout
ce qui touche à la génération reste inerte : le catalogue de modèles est vide, le bouton
**Générer** ne répond pas.

### Le studio tient plusieurs comptes

Pas un seul. Vous pouvez enregistrer autant de clés API que vous voulez, chacune sous un nom que
vous choisissez — « Studio », « Client X », « Perso ».

**Pourquoi c’est utile.** Une clé API **porte son propre projet distant** : ses modèles, ses
assets, son crédit. Changer de compte change **la bibliothèque distante** que vous parcourez.

> **Cela ne touche jamais votre projet local.** Vos dossiers, vos images, vos montages sont sur
> votre disque et n’appartiennent à aucun compte. Changer de compte change ce que vous pouvez
> **aller chercher**, jamais ce que vous avez **déjà**.

### Ajouter un compte

Le formulaire, sous la liste. Trois champs :

| Champ          | Ce que c’est                                                      |
| -------------- | ----------------------------------------------------------------- |
| **Nom**        | ce que vous voulez, pour vous y retrouver — « Studio, Client X… » |
| **Clé API**    | votre identifiant, visible pendant que vous le tapez              |
| **Secret API** | votre mot de passe, masqué par des points                         |

Prenez la clé et le secret chez votre fournisseur, dans les réglages de
votre compte. Puis **Ajouter un compte** — le bouton affiche « Ajout… » le temps de l’écriture.

**Le bouton reste éteint** tant que les trois champs ne sont pas valides.

Le nom obéit à trois règles, et le studio dit laquelle a été enfreinte :

| Règle                                          | Message si elle est enfreinte          |
| ---------------------------------------------- | -------------------------------------- |
| Un nom est obligatoire                         | « Un nom est obligatoire. »            |
| 60 caractères au maximum                       | « Ce nom est trop long. »              |
| Deux comptes ne peuvent pas porter le même nom | « Un autre compte porte déjà ce nom. » |

L’unicité est vérifiée **sans tenir compte de la casse** : « Studio » et « studio » sont le même
nom.

**Deux autres messages peuvent apparaître ici**, plus rares, et ils ne se règlent pas de la même
façon :

| Message                                   | Ce qui s’est passé                                                                                 | Quoi faire                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| « Ce compte n’existe plus. »              | vous agissez sur un compte supprimé entre-temps — par une autre fenêtre du studio, le plus souvent | fermez les réglages et rouvrez-les : la liste se relit                           |
| « Le compte n’a pas pu être enregistré. » | l’écriture a échoué sans que le studio sache dire pourquoi                                         | réessayez une fois ; si cela recommence, voir [Quand ça coince](16-depannage.md) |

Le premier n’est jamais votre faute et ne perd rien. Le second est le seul message de cette
section qui mérite un deuxième essai.

> **Les champs sont vidés même en cas de succès.** Ce n’est pas un bug : une fois envoyée, la clé
> est chiffrée par le trousseau du système et rangée hors de portée de l’affichage. C’est pourquoi
> il n’y a **pas de bouton « voir ma clé »**.

### La liste des comptes

Une ligne par compte. Sur celle du compte **en cours d’utilisation**, une pastille :

| Pastille                   | Ce qu’elle dit                                         |
| -------------------------- | ------------------------------------------------------ |
| **Utilisé**, en vert       | c’est ce compte qui travaille, et sa clé fonctionne    |
| **Non connecté**, en rouge | c’est ce compte qui travaille, mais sa clé est refusée |

Les autres lignes n’en portent pas : seul le compte actif peut dire si sa clé marche, puisque
c’est le seul qu’on interroge.

Trois boutons par ligne :

| Bouton                 | Effet                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| **Utiliser ce compte** | bascule dessus. Absent sur la ligne déjà active                               |
| **Renommer**           | remplace la ligne par un champ de saisie, avec **Enregistrer** et **Annuler** |
| **Supprimer**          | retire le compte et sa clé                                                    |

### Quand la liste est vide

> « Aucun compte pour l’instant. Ajoutez une clé API pour accéder à la bibliothèque distante. »

Rien n’est enregistré, et rien ne fonctionne : ni catalogue, ni génération.

### Si le trousseau est verrouillé

> « Le trousseau n’a pas rendu vos comptes. Réessayez après l’avoir déverrouillé — rien n’a été
> modifié. »

**Rien n’a été modifié** : le studio a refusé d’écrire plutôt que d’écraser la liste qu’il ne
pouvait pas relire. Déverrouillez votre trousseau, réessayez, tout est encore là.

---

## Apparence

_Thème et densité des contrôles._

### Thème

**Choix. Départ : Sombre.**

| Valeur      | Effet                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| **Sombre**  | fond gris très foncé — repose les yeux dans une pièce peu éclairée     |
| **Clair**   | fond clair — se lit mieux en plein jour                                |
| **Système** | suit le réglage de votre ordinateur, et bascule tout seul le soir venu |

> **Le fond reste opaque, quel que soit le thème.** Pas de transparence, pas de flou derrière la
> fenêtre : un fond translucide fausserait la perception des couleurs qu’on juge au-dessus.

### Densité

**Choix. Départ : Confort.**

Règle la taille des boutons et la hauteur des lignes.

| Valeur      | Hauteur des contrôles | Pour qui                                                                  |
| ----------- | --------------------- | ------------------------------------------------------------------------- |
| **Confort** | 28 px                 | plus d’air, plus faciles à viser à la souris                              |
| **Compact** | 24 px                 | plus de choses à l’écran, sur un petit écran ou avec beaucoup de panneaux |

### Couleur d’accent

**Couleur. Départ : celle du thème (bleu).**

La couleur qui signale **ce qui est sélectionné ou en cours** : le contour du panneau actif, la
tête de lecture de la timeline, le cadre d’une sélection.

Elle ne change rien à ce que vous fabriquez — seulement à la façon dont l’application vous montre
où vous en êtes. Laissez-la telle quelle pour garder celle du thème.

### Taille du texte

**Curseur. De 0,85 à 1,40, par pas de 0,05. Départ : 1.**

Agrandit ou réduit **tous les textes** de l’application d’un seul coup.

- **1** est la taille d’origine, celle à laquelle l’interface a été dessinée ;
- **au-dessus**, les mots deviennent plus gros et il en tient moins à l’écran ;
- **en dessous**, c’est l’inverse.

Les **boutons gardent leur taille** : c’est la densité qui s’en occupe. Les deux réglages sont
séparés exprès — on peut vouloir de gros textes sur des contrôles serrés, ou l’inverse.

### Limiter les animations

**Case à cocher. Départ : décochée.**

Coupe les petits mouvements de l’interface : les panneaux apparaissent d’un coup au lieu de
glisser.

Utile dans deux cas : si les animations vous fatiguent ou vous donnent mal au cœur, et sur une
machine un peu lente où elles saccadent au lieu de fluidifier.

---

## Génération

_File de génération et modèles par défaut, par famille._

### Générations simultanées

**Nombre entier. De 1 à 16. Départ : 3.**

Combien de créations travaillent **en même temps**.

Plus ce nombre est grand, plus vous en lancez d’un coup — mais chacune peut mettre plus longtemps
à revenir, et le service peut refuser celles qui arrivent en trop (voir
[Trop de requêtes](16-depannage.md)). **Trois est un bon équilibre.**

> **Ce réglage est la seule vanne.** Toutes les générations passent par la même file, quel que
> soit l’espace de travail d’où elles partent, et rien ne la contourne.

### Nommer les assets rapatriés

**Case à cocher.**

Nomme automatiquement une image qui arrive **sans nom utile**, en demandant à l’API ce qu’elle y
voit.

> **C’est le seul endroit où le studio dépense sans qu’on le lui ait demandé** : décochez-le, et
> plus rien ne part de lui-même. Le nommage travaille en lots, sous une file bornée, et chaque
> résultat prend sa ligne dans le journal d’activité.

**Ce qui compte comme « sans nom utile »**, et rien d’autre :

| Ce que le studio renomme                                          | Exemples                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| un nom vide, ou un préfixe d’appareil suivi d’un numéro           | `IMG_4821`, `DSC0001`, `PXL_20260809`, `photo 12`                                        |
| les noms que donnent les systèmes, dans les deux langues          | `Sans titre`, `Téléchargement`, `Image collée`, `Nouvelle image`, `Untitled`, `Download` |
| une capture d’écran **suivie de son horodatage ou de son numéro** | `Capture d’écran 2026-08-09 à 10.30.45`, `Screenshot (3)`                                |

**Un nom que vous avez choisi n’est jamais remplacé**, même s’il commence par les mêmes mots :
`Capture d’écran du menu principal` reste tel quel.

Les accents ne changent rien à cette reconnaissance : `Capture d'écran` et `Capture d’écran`
sont traités pareil, y compris sous la forme particulière que macOS écrit dans ses noms de
fichiers.

### Tentatives maximum

**Nombre entier. De 0 à 10. Départ : 4.**

Quand une génération échoue à cause d’une **coupure réseau** ou d’un **serveur occupé**,
l’application réessaie toute seule. Ce nombre dit combien de fois avant d’abandonner.

À **0**, elle n’essaie jamais deux fois.

> **Une clé API invalide n’est jamais réessayée**, quel que soit ce réglage. Réessayer ne la
> corrigerait pas — cela ne ferait que retarder le message qui vous dit quoi faire.

### Modèle par défaut, par famille

Neuf sous-sections : **Image**, **Vidéo**, **3D**, **Audio**, **Matières**, **Skyboxes**,
**Agrandissement**, **Détourage**, **Vectorisation**.

Les trois dernières n’ont pas d’espace de travail à elles : ce sont les familles que les éditions
du canvas — Agrandir, Détourer, Vectoriser — vont chercher. Le panneau **Modèles** ne montre que
la famille de l’espace ouvert, donc **c’est ici, et seulement ici, que leur modèle se choisit**.

Chacune tient un seul réglage : le modèle que le panneau **Génération** présélectionne quand vous
arrivez dans cet espace.

| Valeur                                | Effet                                                 |
| ------------------------------------- | ----------------------------------------------------- |
| **Demander à chaque fois** _(départ)_ | aucun modèle présélectionné, vous choisissez          |
| _un modèle_                           | ce modèle est déjà en place à l’ouverture de l’espace |

Réglez-le une fois que vous avez trouvé le modèle avec lequel vous travaillez le plus : cela
enlève un clic à chaque session.

> **Pour Agrandissement, Détourage et Vectorisation, ce réglage n’est pas un confort.** C’est ce
> qui décide si l’édition correspondante peut partir : sans modèle réglé, **Agrandir** ouvre cet
> écran au lieu d’envoyer l’image.

---

## Espaces de travail

_Ce qui n’a de sens que dans un espace précis : la vue 3D, le montage, l’image._

Une seule sous-section pour l’instant : **3D**.

### Afficher la grille

**Case à cocher. Départ : cochée.**

Le quadrillage posé au sol de la vue 3D.

Il **ne fait pas partie de ce que vous fabriquez** : c’est un repère, pour savoir où sont les
choses et à quelle hauteur. On le cache pour juger une image sans rien autour.

### Taille de la grille

**Nombre entier. De 2 à 500 mètres. Départ : 20.** _(grisé si la grille est masquée)_

Jusqu’où le quadrillage s’étend, et donc combien de carreaux il compte — **un carreau vaut
toujours un mètre**.

Agrandissez-le pour une scène vaste ; réduisez-le pour un petit objet posé près de la caméra.

### Vitesse de déplacement

**Curseur. De 0,5 à 20 m/s, par pas de 0,5. Départ : 4.**

À quelle vitesse la caméra avance quand vous **volez** dans la vue 3D.

Trop lent, on met dix secondes à traverser la scène. Trop rapide, on la dépasse sans la voir.
4 m/s est à peu près l’allure d’un homme qui court.

### Accélération

**Curseur. De 1 à 10, par pas de 0,5. Départ : 3.**

Par combien la vitesse est multipliée **tant que vous maintenez la touche d’accélération**
(`⇧` gauche, par défaut).

À 3, vous allez trois fois plus vite : de quoi traverser une grande scène sans avoir à toucher au
réglage du dessus.

### Angle de vue

**Curseur. De 30° à 100°, par pas de 5. Départ : 60.**

Ce que la caméra embrasse.

| Angle               | Effet                                        |
| ------------------- | -------------------------------------------- |
| **petit** (30–45°)  | rapproche et aplatit, comme un téléobjectif  |
| **60°**             | proche de ce que voit un œil                 |
| **grand** (85–100°) | montre beaucoup plus, mais déforme les bords |

### Les trois pas du magnétisme

Le magnétisme s’allume dans la **barre d’outils de la scène** (touche `M`) ; ces trois réglages
disent seulement **de combien** il avance à chaque cran.

| Réglage                | Bornes              | Départ    | Ce qu’il fait                         |
| ---------------------- | ------------------- | --------- | ------------------------------------- |
| **Pas de déplacement** | 0,001 à 10 m, par 0,1 | **0,5 m** | de combien un objet avance d’un cran  |
| **Pas de rotation**    | 1° à 90°, par 1     | **15°**   | l’angle d’un cran de rotation         |
| **Pas d’échelle**      | 0,01 à 1, par 0,05  | **0,1**   | de combien l’échelle avance d’un cran |

**15° est la valeur classique** : vingt-quatre positions sur un tour, dont tous les angles ronds —
30, 45, 90. La rotation compte ses crans **depuis l’endroit où elle a commencé**, pas depuis zéro.

### Douceur des ombres

**Choix. Départ : Douce.**

Le grain du bord d’une ombre.

| Valeur    | Effet                                                    |
| --------- | -------------------------------------------------------- |
| **Dure**  | un bord net, découpé au couteau — c’est le moins coûteux |
| **Douce** | un bord adouci, plus proche de la réalité                |

**Ce réglage dit à quoi ressemble une ombre, pas qui en projette une.** Cela se décide objet par
objet, dans l’Inspecteur — voir [Espace Modélisation](09-espace-modelisation.md).

### Finesse des ombres

**Choix : 512, 1024, 2048 ou 4096. Départ : 2048.**

La taille, en pixels de côté, de la carte que chaque lumière calcule pour savoir ce qu’elle
éclaire.

Plus le nombre est grand, plus le bord de l’ombre est précis — et **plus il coûte cher** :
doubler ce nombre **quadruple** la mémoire utilisée. 2048 est le bon compromis ; descendez à 1024
si une scène chargée commence à ramer, montez à 4096 pour une image finale.

---

## Raccourcis

_Les touches qui déclenchent chaque action. Cliquez sur une touche pour la remplacer._

Cette section a son chapitre : [Tous les raccourcis](15-raccourcis.md).

---

## Dictée

_Dicter un texte au lieu de le taper. Tout se passe sur cet ordinateur : rien de ce que vous
dites n’est envoyé nulle part._

Le geste est décrit dans [Générer](06-generer.md#dicter-au-lieu-de-taper) ; ici, ce qui se règle.

### Activer la dictée

Décochée, la dictée disparaît : plus de bouton de micro à côté des champs, plus de raccourci, et
l'application ne charge rien ni ne demande jamais l’accès au micro.

### Façon de déclencher

**Maintenir la touche** écoute tant que ⌥D est enfoncée et s'arrête au relâchement. C'est le
réglage d'origine, et le plus sûr : on ne laisse jamais le micro ouvert par oubli.

**Basculer marche/arrêt** démarre à la première pression et s’arrête à la suivante. La main se
repose, ce qui vaut mieux quand on dicte longtemps.

### Silence qui termine une phrase

En millisecondes, 600 par défaut. C'est la durée de blanc au bout de laquelle ce que vous venez
de dire est considéré comme fini, transcrit, et écrit dans le champ.

**Augmentez-la** si vos phrases se coupent en deux parce que vous marquez des pauses pour
réfléchir. Réduisez-la si vous trouvez que le texte met trop longtemps à apparaître.

### Aperçu pendant que vous parlez

En millisecondes, 700 par défaut. C'est l'intervalle entre deux aperçus de la phrase en cours —
le texte grisé sous le champ.

**Ce n'est pas gratuit** : chaque aperçu relit tout ce qui a été dit depuis le début de la phrase.
Sur une machine qui peine, les aperçus s'espacent d'eux-mêmes — le texte définitif, lui, n'en
souffre jamais.

**Mettez 0** pour supprimer les aperçus : le texte n'apparaîtra alors qu'à la fin de chaque
phrase, et la machine travaillera beaucoup moins.

### Fils de calcul

De 1 à 8, deux par défaut. Le nombre de cœurs que la reconnaissance a le droit d’occuper. Plus
haut va plus vite jusqu’à un certain point, mais chaque fil est un cœur en moins pour le reste
de l'application — la vue 3D, le montage, l'interface.

### Libérer la mémoire après

En minutes, dix par défaut. Le modèle chargé occupe environ 700 Mo ; passé ce délai sans dicter,
il est relâché et la mémoire rendue. Il se recharge tout seul à la dictée suivante, en quelques
secondes.

**Mettez 0** pour le garder chargé en permanence : la dictée démarre alors instantanément, au
prix de 700 Mo occupés tant que le studio est ouvert.

### Dossier du modèle

Laissez vide dans le cas normal : le modèle est téléchargé à côté de vos réglages. Ce champ sert
à pointer un modèle déjà présent ailleurs — sur un disque externe, ou partagé entre plusieurs
comptes de la machine.

---

## Médias

_Préparation des fichiers importés : proxies et waveforms._

### Chemin de ffmpeg

**Chemin de fichier. Départ : vide.**

**ffmpeg** est le programme qui sait lire et convertir à peu près tous les formats vidéo et audio
du monde. Le studio s’en sert pour deux choses, à l’import :

1. **le proxy** — une copie allégée de la vidéo, qui permet de naviguer dans la timeline sans
   à-coups ;
2. **la waveform** — le dessin de la bande son, ces vagues qui permettent de voir où quelqu’un
   parle.

> **Le studio porte le sien**, sur macOS, Windows et Linux. Vous n’avez rien à installer, et ce
> réglage ne sert que si vous tenez à en utiliser un autre.

**Laissez donc ce champ vide**, sauf raison précise. Le studio essaie les trois dans cet ordre :

1. le ffmpeg **livré avec l’application** ;
2. celui que vous indiquez ici ;
3. celui qui se trouve sur le `PATH` de votre système.

Sous le champ, le studio dit ce qu’il a retenu :

| Message                                                                    | Ce qu’il veut dire                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| « ffmpeg est disponible : proxies et waveforms seront préparés. »          | tout va bien — le cas normal                       |
| « ffmpeg reste introuvable. L’import fonctionne, sans proxy ni waveform. » | même celui de l’application manque : voir plus bas |

**Le second message est devenu rare.** Il n’arrive plus guère qu’à qui lance le studio depuis son
code source sans avoir exécuté `pnpm ffmpeg:fetch`, qui télécharge les binaires.

> **Même là, l’import fonctionne.** Vos fichiers entrent dans le projet, se lisent et se montent.
> C’est simplement moins confortable. Le studio ne vous bloque jamais sur l’absence d’un outil
> facultatif.

Le bouton **Parcourir…** ouvre le sélecteur de fichiers de votre système.

---

## Versions

_Suivi des versions du dossier de projet, par git. Ne concerne que vos fichiers._

Cette section règle le panneau **Git** et le panneau **Historique**. Elle ne concerne à aucun
moment le studio lui-même : ce qui est suivi, c’est le dossier de votre projet.

### Chemin de git

Le suivi des versions a besoin du programme **git**, qui n’est pas fourni avec le studio. Sur la
plupart des machines il est déjà là et ce réglage reste vide.

Renseignez-le seulement si vous tenez à un git précis. **Un chemin contenant une espace est
refusé** — c’est une limite du composant qui lance git, pas un choix — et l’application se
comporte alors comme si git était absent.

> **Si git manque**, le panneau Git le dit et n’offre aucun bouton : il n’y a rien à proposer
> tant que le programme n’est pas là.

### Nom de l’auteur, Adresse de l’auteur

Ce qui est inscrit dans chaque version enregistrée. **Laissez les deux vides** si vous utilisez
déjà git sur cet ordinateur : le studio reprend alors ce que git connaît, et n’écrase rien.

**Les deux ensemble, ou aucun des deux** : git veut un nom ET une adresse, et n’en renseigner
qu’un ferait échouer chaque enregistrement sur l’autre.

> **Rien ne part ni n’arrive sans que vous le demandiez.** Il n’y a pas de relève automatique :
> les trois boutons du panneau Git — relever, recevoir, envoyer — sont les seuls moments où le
> studio parle au serveur.

---

## Stockage

_Où vos projets sont rangés sur le disque._

### Dossier des projets

**Chemin de dossier. Départ : vide.**

Le dossier que l’application **vous propose** quand vous créez ou ouvrez un projet.

Cela ne déplace **rien** : les projets déjà créés restent exactement où ils sont. C’est une
suggestion de départ pour le sélecteur de fichiers, pas un déménagement.

Laissez vide pour repartir à chaque fois du dernier endroit visité.

---

## Avancé

_Ce dont on n’a besoin que pour comprendre un problème, ou pour repartir de zéro._

### Détail du journal

**Choix. Départ : Tout.**

Combien l’application raconte ce qu’elle fait, dans son journal.

| Valeur                        | Ce qui est écrit           |
| ----------------------------- | -------------------------- |
| **Rien**                      | plus rien du tout          |
| **Erreurs seulement**         | ce qui a échoué            |
| **Erreurs et avertissements** | et ce qui a failli échouer |
| **Tout** _(départ)_           | chaque étape               |

« Tout » est utile pour comprendre un problème, et bavard le reste du temps. Ce réglage ne change
rien à ce que fait le logiciel — seulement à ce qu’il en dit.

**Attention à ne pas confondre ce journal avec celui de la ligne d’état.** Celui-ci est le journal
interne du studio : il part dans le terminal qui l’a lancé, **et dans un fichier**, que le bouton
ci-dessous affiche. Le journal de la ligne d’état, lui, ne dépend pas de ce réglage — il reçoit ses
lignes quoi qu’il arrive.

### Journal technique

**Bouton : Afficher le journal technique.**

Ouvre votre gestionnaire de fichiers sur le journal interne, un fichier nommé `main.log`. Le studio
y écrit à chaque lancement, quelle que soit la façon dont vous l’avez démarré.

Le fichier ne grossit pas indéfiniment : passé un mégaoctet, il est mis de côté sous le nom
`main.1.log` et un neuf reprend. Il y en a donc **deux au plus**, et la trace d’un lancement
survit à celui qui le suit.

C’est ce fichier qu’on vous demandera si quelque chose échoue sans rien afficher à l’écran. Ce que
vous y trouverez dépend du réglage juste au-dessus : à « Rien », il ne s’écrit plus une ligne.

### Fichier de réglages

**Bouton : Afficher dans le dossier.**

Ouvre votre gestionnaire de fichiers sur l’endroit où vos réglages sont enregistrés, un fichier
nommé `settings.json`.

| Système | Où                                                      |
| ------- | ------------------------------------------------------- |
| macOS   | `~/Library/Application Support/AI Desktop Studio/settings.json` |
| Windows | `%APPDATA%\AI Desktop Studio\settings.json`                     |
| Linux   | `~/.config/AI Desktop Studio/settings.json`                     |

Utile pour en faire une copie avant de changer de machine, ou pour l’envoyer à quelqu’un qui vous
aide à comprendre un problème.

> **Vos identifiants API sont dans ce fichier, mais chiffrés.** Ils y figurent sous forme d’un
> bloc illisible, que seul le trousseau de **votre** session peut déchiffrer. Copier ce fichier
> sur une autre machine y recopie vos réglages, mais **pas** votre connexion : il faudra retaper
> la clé et le secret.

### Piloter le studio depuis l’extérieur

**Case à cocher. Départ : décochée.**

Ouvre un point d’entrée **sur cette machine seule**, par lequel un programme extérieur — un client
MCP comme Claude Code — peut lancer les mêmes actions que l’assistant.

**Décochée, rien n’écoute.** C’est l’état d’une installation neuve, et celui de tout lancement tant
que la case n’est pas cochée.

**Tout ce qui coûte, téléverse ou touche à vos fichiers demande votre accord à l’écran**, exactement
comme si vous l’aviez demandé vous-même dans l’assistant. Un programme extérieur ne peut pas se le
donner à votre place.

> **Le [chapitre 20](20-piloter-de-l-exterieur.md) est celui de ce réglage** : ce qui garde ce
> point d’entrée, comment y brancher Claude Code, les familles d’actions accessibles et ce que
> chacune engage.

### Commande de connexion

**Bouton : Copier.**

Copie la ligne à coller dans un terminal pour brancher un client :

```
claude mcp add <nom> -- "/Applications/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio" --mcp-stdio=…
```

**Elle ne porte ni port ni jeton** : elle désigne le studio comme un programme à démarrer, pas une
adresse à joindre. Ceux-là changent bien à chaque démarrage — c’est votre client qui va les lire,
au moment où il en a besoin. **La ligne se colle donc une fois, et vaut pour tous les lancements
suivants.**

Le chemin est celui de **votre** installation, d’où le bouton plutôt qu’une valeur imprimée ici.

### Outils de développement

**Bouton : Ouvrir.**

Ouvre la console technique du navigateur intégré : les messages du journal, les erreurs, l’état
interne de l’affichage.

**Dans la version installée, ce bouton n’ouvre rien** — la console y est refusée, par sécurité. Il
reste affiché, sans effet. Il ne vous manque rien : **le journal d’activité porte déjà ce qui sert
à un signalement**, détail technique compris. Voir [Quand ça coince](16-depannage.md#le-journal).

Réservé au dépannage, dans une version de développement. **Rien de ce qui s’y trouve n’est
nécessaire pour se servir du logiciel.**

### Tout réinitialiser

**Bouton : Réinitialiser.** _(avec confirmation)_

Remet **TOUS** les réglages dans l’état d’une installation neuve : thème, langue, raccourcis,
modèles par défaut, tout.

Le studio demande d’abord confirmation :

> _Remettre tous les réglages à zéro ? Vos projets ne sont pas touchés, mais ce retour en arrière
> est définitif._

**Vos projets, vos images et vos montages ne sont pas touchés.** Seuls les réglages le sont.

> **C’est sans retour.** Ce bouton ne passe pas par le tampon d’édition : il n’y a pas d’**Annuler**
> qui le rattrape. C’est pour cette raison qu’il demande confirmation, contrairement aux autres
> réglages.

---

## Tableau de bord : toutes les valeurs de départ

Ce que vous avez sur une installation neuve, d’un coup d’œil.

| Section    | Réglage                              | Départ                    | Limites                                    |
| ---------- | ------------------------------------ | ------------------------- | ------------------------------------------ |
| Général    | Langue                               | Système                   | Système, Français, English                 |
| Général    | À l’ouverture                        | Rouvrir le dernier projet | —                                          |
| Général    | Afficher l’accueil                   | activé                    | —                                          |
| Général    | Actualités des modèles               | activé                    | —                                          |
| Apparence  | Thème                                | Sombre                    | Sombre, Clair, Système                     |
| Apparence  | Densité                              | Confort                   | Confort, Compact                           |
| Apparence  | Couleur d’accent                     | celle du thème            | —                                          |
| Apparence  | Taille du texte                      | 1                         | 0,85 à 1,40                                |
| Apparence  | Limiter les animations               | décochée                  | —                                          |
| Génération | Générations simultanées              | 3                         | 1 à 16                                     |
| Génération | Nommer les assets rapatriés          | cochée                    | —                                          |
| Génération | Tentatives maximum                   | 4                         | 0 à 10                                     |
| Génération | Modèle par défaut ×7                 | Demander à chaque fois    | —                                          |
| 3D         | Afficher la grille                   | cochée                    | —                                          |
| 3D         | Taille de la grille                  | 20 m                      | 2 à 500                                    |
| 3D         | Vitesse de déplacement               | 4 m/s                     | 0,5 à 20                                   |
| 3D         | Accélération                         | 3×                        | 1 à 10                                     |
| 3D         | Angle de vue                         | 60°                       | 30 à 100                                   |
| 3D         | Pas de déplacement                   | 0,5 m                     | 0,001 à 10                                 |
| 3D         | Pas de rotation                      | 15°                       | 1 à 90                                     |
| 3D         | Pas d’échelle                        | 0,1                       | 0,01 à 1                                   |
| 3D         | Douceur des ombres                   | Douce                     | Dure ou Douce                              |
| 3D         | Finesse des ombres                   | 2048                      | 512, 1024, 2048, 4096                      |
| Dictée     | Activer la dictée                    | activée                   | —                                          |
| Dictée     | Façon de déclencher                  | Maintenir la touche       | Maintenir la touche, Basculer marche/arrêt |
| Dictée     | Silence qui termine une phrase       | 600 ms                    | 200 à 2000                                 |
| Dictée     | Aperçu pendant que vous parlez       | 700 ms                    | 0 à 2000                                   |
| Dictée     | Fils de calcul                       | 2                         | 1 à 8                                      |
| Dictée     | Libérer la mémoire après             | 10 min                    | 0 à 120                                    |
| Médias     | Chemin de ffmpeg                     | vide                      | —                                          |
| Stockage   | Dossier des projets                  | vide                      | —                                          |
| Avancé     | Détail du journal                    | Tout                      | Rien → Tout                                |
| Point d’entrée | Piloter le studio depuis l’extérieur | décochée              | —                                          |
| Point d’entrée | Laisser toucher aux fichiers sans demander | décochée        | —                                          |
| Point d’entrée | Laisser téléverser sans demander     | décochée              | —                                          |
| Point d’entrée | Laisser publier vers un serveur sans demander | décochée      | —                                          |
| Point d’entrée | Unités créatives dépensables sans demander | 0               | 0 à 10 000                                 |

---

## Deux réglages qui n’existent pas encore

Deux valeurs vivent dans le fichier de réglages sans qu’aucun contrôle ne les édite :

- **le dernier projet ouvert** — écrit tout seul à chaque ouverture. C’est de la mémoire de
  session, pas une préférence : rien à régler ;
- **l’emplacement des assets** — un choix entre « sur votre disque » et « dans le nuage », dont le
  second n’existe pas encore. Voir [Ce qui n’existe pas encore](18-limites.md).

---

[← Espace Skyboxes](13-espace-skyboxes.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Tous les raccourcis →](15-raccourcis.md)
