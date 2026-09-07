# 4. Les projets

[← La fenêtre](03-la-fenetre.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Trouver un modèle →](05-modeles.md)

---

## Un projet est un dossier

Pas une base de données. Pas un espace en ligne. Pas un fichier unique qu’on ne peut ouvrir
qu’avec ce logiciel.

**Un dossier ordinaire, sur votre disque.** Vous pouvez l’ouvrir dans votre explorateur de
fichiers, regarder dedans, le copier sur une clé USB, le sauvegarder avec le reste de vos
documents, l’envoyer à quelqu’un. **Il porte le nom que vous lui avez donné, et rien d’autre** :
pas d’extension, pas de suffixe technique.

C’est une décision de conception, pas un hasard. Un projet qu’on ne peut ouvrir qu’avec le
logiciel qui l’a créé est un projet qu’on perd le jour où le logiciel ne s’ouvre plus.

---

## Créer, ouvrir, changer de projet

| Action | Raccourci | Menu |
|---|---|---|
| **Nouveau…** | `⌘N` / `Ctrl+N` | **Fichier ▸ Nouveau…** |
| **Nouveau projet** | `⌥⌘N` / `Alt+Ctrl+N` | **Fichier ▸ Nouveau projet…** |
| **Ouvrir un projet** | `⌘O` / `Ctrl+O` | **Fichier ▸ Ouvrir un projet…** |
| **Ouvrir un projet récent** | — | **Fichier ▸ Ouvrir récent** |

**`⌘N` ouvre une fenêtre**, la même depuis n’importe quel écran : elle propose de créer un projet
et, en dessous, chaque type de document — image, vidéo, scène, interface, script, audio, matière,
ciel. Les types de l’espace où vous êtes sont en tête de liste ; tous les autres restent
accessibles. **Le bouton vert `+`**, en haut de la colonne d’icônes, ouvre exactement la même
fenêtre.

**Aucun projet ouvert ?** La fenêtre le dit et offre la sortie sur place : vos projets récents,
d’un clic, ou les deux boutons pour en créer ou en ouvrir un. Le projet s’ouvre et vous
continuez — sans repasser par l’accueil.

**Les deux gestes sont aussi dans le panneau Explorateur**, quand aucun projet n’est ouvert : il
affiche alors **Ouvrir un projet** et **Créer un projet**, à sa place habituelle dans la colonne
de gauche.

**Un seul projet est ouvert à la fois.** Ouvrir le second ferme le premier — sans rien perdre :
tout ce qui était enregistré l’est resté.

Le nom du projet ouvert s’affiche dans la ligne d’état, en bas à gauche.

### La liste des projets de l’accueil

**Chaque ligne porte le nom du projet et, dessous, le dossier où il se trouve.** C’est le dossier
qui distingue deux projets appelés pareil — et un studio finit toujours par en avoir deux, l’un
sous `Documents`, l’autre sur un disque de travail. **La date de dernière ouverture n’a pas
disparu** : elle est dans l’infobulle de la ligne, avec le chemin entier, qu’un panneau étroit
tronque.

**Chaque ligne a son menu**, au clic droit comme au bouton :

| Entrée | Ce qu’elle fait |
|---|---|
| **Afficher dans le dossier** | ouvre le gestionnaire de fichiers sur ce projet |
| **Retirer de la liste** | retire le projet de cette liste, **sans toucher au dossier ni à ce qu’il contient** |

**Retirer ne demande pas confirmation** : rien n’est perdu, et rouvrir le projet remet sa ligne.
C’est le geste qui nettoie une liste où traîne un dossier déplacé.

**Retirer un projet de la liste ne le ferme pas.** Les deux gestes sont distincts : retirer efface
une ligne d’une liste de raccourcis, fermer rend le studio à l’accueil. Retirer la ligne du projet
ouvert laisse donc l’Explorateur, la timeline et les onglets exactement où ils étaient — c’est
**Fermer le projet**, dans le menu du projet de la barre de titre, qui les vide.

**Une génération en cours n’est pas perdue par la fermeture.** Elle continue là où elle tourne, et
son résultat est rangé dans ce projet-ci — jamais dans un autre, même si vous en ouvrez un autre
entre-temps. Elle reste visible dans la barre des générations tant qu’elle tourne, mais **son
résultat n’arrivera pas dans le projet que vous ouvrez à la place** : c’est en rouvrant le sien
que vous le retrouverez. **Le studio vous le demande** avant de vous laisser quitter le projet —
fermeture comme bascule vers un autre — en disant combien tournent encore.

Et quand l’une d’elles se termine alors que son projet n’est pas ouvert, **le studio l’écrit dans
son journal** — panneau Activité — en nommant la génération et le projet où son résultat vous
attend. Sans cette ligne, la génération quitterait la barre sans rien montrer, ce qui ressemble à
du travail perdu : il ne l’est pas, mais il faut rouvrir son projet **dans les sept jours** pour
le récupérer.

> **Un projet ne se « sauvegarde » pas.** Il n’y a pas de commande « Enregistrer le projet ».
> Chaque chose est écrite au moment où elle arrive : un asset généré à sa réception, un
> document quand vous faites `⌘S`, la disposition des panneaux quand vous la changez.

**Quitter un projet vous demande d’abord ce qu’il faut faire du travail non enregistré**, document
par document — enregistrer, abandonner, ou renoncer à partir. C’est vrai des trois façons de le
quitter : le fermer, en ouvrir un autre depuis la liste, en choisir un dans le sélecteur. Renoncer
laisse tout exactement où c’était.

---

## Ce qu’il y a dedans

```
Mon projet/
│
├── Images/               UN DOSSIER PAR SECTION DU STUDIO
├── Video/                  posés à la création, et ordinaires : renommez-les,
├── Audio/                  déplacez-les, videz-les, rangez-les autrement
├── Materials/            vos matières, et les images qui les servent
├── Skyboxes/
├── Scripts/
├── Modelling/            la section Modélisation range trois choses
│   ├── Scenes/             vos scènes
│   ├── Models/             vos maillages
│   └── Animations/         vos mouvements
│                           …et tout ce que vous créez à côté
│
│   Chacun porte un .ai-desktop-studio-role — CACHÉ — qui dit à quelle section il sert
│
├── .project.json         la carte d'identité — CACHÉ
│
├── .project-context.json  CE QUE LE PROJET RACONTE — CACHÉ
│                        l'univers, le style, les interdits — voir plus bas
│
├── .ai-desktop-studio/            UNE SAUVEGARDE DU CATALOGUE — CACHÉ
│   └── items.json          ce qu'un fichier ne peut pas dire de lui-même
│
└── .index/               LE CATALOGUE ET SES CACHES — À GARDER, CACHÉ
    ├── catalog.db          l'index qui rend la recherche instantanée
    ├── proxies/            des copies allégées des vidéos, pour naviguer sans à-coups
    ├── peaks/              le dessin des formes d'onde audio
    ├── posters/            l'image que porte une vignette de vidéo ou de modèle
    └── filmstrips/         créé d’avance, encore vide
```

**Ce qui commence par un point est à la machine ; tout le reste est à vous**, et c’est toute la
règle. Vos fichiers restent visibles et vous les rangez comme vous l’entendez — vous devez pouvoir
les regarder, les copier, les réparer. La carte d’identité, l’index et la sauvegarde, non : ce sont
les outils du studio, pas votre travail.

> **Ces dossiers ne sont qu’un point de départ.** Ils sont posés à la création et jamais remis :
> si vous supprimez `Images/`, il ne revient pas — sauf le jour où une génération a besoin d’un
> endroit où atterrir, et le studio le recrée plutôt que de refuser de travailler.

> **Renommez-les, déplacez-les : ils continuent de servir leur section.** Ce qui lie un dossier à
> une section n’est pas son nom mais un petit fichier caché qu’il porte, `.ai-desktop-studio-role`. Il
> voyage avec le dossier — un renommage dans le Finder ou l’Explorateur de Windows, un
> déplacement, une copie, un zip. Renommez `Modelling/` en « Mes modèles » et le prochain maillage
> y atterrit quand même.
>
> Dans l’explorateur du studio, un dossier qui sert une section porte l’icône de cette section, et
> **son nom reste celui du disque** — ce que vous lisez dans le studio est ce que vous lisez dans
> le Finder. C’est l’icône et l’infobulle qui disent la section, dans votre langue ; le dossier,
> lui, ne change jamais de nom parce que vous changez de langue.
>
> Un dossier neuf portant le nom d’origine — vous avez renommé `Images/`, puis créé un `Images/` à
> la main — est un dossier ordinaire : c’est le marqueur qui décide, pas le mot.

> **Les noms sur le disque sont en anglais, et c’est délibéré.** Un dossier qui suivrait la langue
> de l’interface serait renommé à chaque changement de langue, et tout ce que le catalogue sait de
> ce qu’il contient pointerait à côté. Le studio traduit ce que le dossier SERT, jamais son nom.

> **`Materials/` est le seul qui ne corresponde pas à un type de fichier.** Il tient vos
> **matières** — les documents `.mtlx` — et les **images qui en servent une** : une couleur de
> base, un relief, une rugosité y atterrissent, quand une photo va dans `Images/`. Ce qui les
> sépare n'est pas leur nature, les deux sont des images, mais **le canal** que la seconde porte.

> **Un projet créé avant cette arborescence garde la sienne, à l’identique.** `3D/`, `Sky/`,
> `documents/`, `scripts/`, `Textures/` : rien n’est déplacé, rien n’est renommé, et tout ce qui
> s’y trouve reste lisible et modifiable. Chaque fichier porte son propre chemin, et rien ne lit
> son rôle dans le nom du dossier qui le tient. Seuls les fichiers CRÉÉS à partir de maintenant
> atterrissent dans la nouvelle arborescence, qui apparaît à côté de l’ancienne. Vous pouvez tout
> ranger à la main, à votre rythme, ou ne rien ranger du tout.

> **Sur Windows, un point ne cache rien** — l’Explorateur lit un attribut de fichier, pas le nom.
> Le studio le pose lui-même sur `.project.json` et sur `.index/`. **`.ai-desktop-studio/` ne le reçoit
> pas** : le jour où il apparaît — il n’est écrit qu’après une passe qui a trouvé quelque chose —
> vous le verrez dans l’Explorateur de Windows, à côté de vos dossiers. Il n’y a rien à en faire :
> c’est la sauvegarde décrite plus bas. Si la pose échoue, **le projet s’ouvre quand
> même** : un fichier de service qui reste visible est un défaut d’apparence, refuser d’ouvrir le
> projet pour cela en serait un vrai.

### Ce qui vous appartient

**Tout ce qui ne commence pas par un point.** C’est votre travail. Ce sont de vrais fichiers, dans
de vrais formats — un PNG est un PNG, un MP4 est un MP4. Vous pouvez les ouvrir avec n’importe
quel autre logiciel, et les ranger dans les dossiers que vous voulez.

**Ce qu’un fichier EST ne dépend pas de l’endroit où il est.** Une image reste une image dans
`Repérages/Ruelles/` comme dans `Images/` : le studio lit son extension, et la fiche du catalogue
corrige ce que l’extension ne peut pas deviner — un canal de normales et une couleur de base sont
deux PNG. Déplacez, renommez, réorganisez : le studio suit.

### `.index/` porte plus que des caches — ne le supprimez pas

Il porte cinq entrées, et **deux d’entre elles sont bien des caches** : `proxies/` et `peaks/`
sont refabriqués à l’import d’un média, et les jeter ne coûte qu’une réimportation. `filmstrips/`
est créé d’avance et reste vide — rien ne l’écrit encore.

**`posters/` n’en est pas un.** C’est l’image que porte la vignette, et **deux types y ont droit** :
la vidéo et le modèle 3D — les deux qu’aucune vignette ne saurait distinguer autrement, une
liste de rushes étant une liste de rectangles gris.

Pour une vidéo importée, l’image est saisie **au dixième de la durée**, et non au début : une
prise commence assez souvent sur du noir pour qu’une liste de premières images soit une liste
de tuiles noires. Pour un modèle, c’est l’aperçu descendu avec lui.

**Elle n’est écrite qu’une fois** — à l’import ou au rapatriement — et rien ne la refabrique après
coup. Jetez ce dossier, et vos vignettes retombent sur l’icône générique de leur type. Rien n’est
perdu de votre travail ; c’est l’Explorateur qui devient illisible d’un coup d’œil.

**`catalog.db` n’en est pas un.** C’est lui qui garde le nom de chaque asset, ses tags, ses
dimensions, le modèle et le prompt qui l’ont produit, ce dont il dérive — et, pour un média
importé, **le chemin de votre fichier d’origine**, qui n’est écrit nulle part ailleurs. Le journal
d’activité vit dans la même base.

**Le studio ne sait pas le reconstruire à partir du dossier.** Le catalogue se remplit au fil des
générations et des imports ; la passe qui relit le dossier à l’ouverture RETROUVE les fichiers qui
ont bougé, elle ne redevine pas ce qu’ils sont. Supprimer `.index/` rend donc un projet dont les
fichiers sont tous là et dont plus rien ne dit ce qu’ils sont.

> **C’est à cela que sert `.ai-desktop-studio/items.json`.** Le studio y recopie, après chaque passe qui a
> changé quelque chose, ce qu’un fichier ne peut pas dire de lui-même : son nom, ses tags, le
> modèle et le prompt qui l’ont produit — rangés par empreinte du contenu, de sorte qu’un fichier
> retrouvé se reconnaisse. Ce n’est pas une source : le studio ne la lit jamais de lui-même. C’est
> ce qui reste à lire, à la main, le jour où l’index a disparu.

> **Si vous devez alléger un projet**, jetez `proxies/` et `peaks/` — c’est là qu’est le poids, et
> ce sont les deux seuls que le studio sait refaire. Gardez `catalog.db`, qui pèse peu et sait
> tout, et `posters/`, qui pèse peu et ne revient pas.

### `.project.json`

Un petit fichier texte, lisible avec n’importe quel éditeur :

```json
{
  "version": 1,
  "name": "Mon projet",
  "createdAt": "2026-08-07T10:24:11.000Z",
  "updatedAt": "2026-08-07T18:03:52.000Z"
}
```

**C’est ce fichier qui fait d’un dossier un projet**, jamais son nom : le studio ouvre le dossier
que vous désignez et cherche ce fichier dedans.

- **`updatedAt` bouge à chaque document enregistré.** C’est la dernière fois que ce projet a
  travaillé, pas la dernière fois qu’il a été ouvert.
- **Désigner un dossier qui n’en contient pas** vous vaut « Ce dossier n’est pas un projet
  AI Desktop Studio », dans le journal et dans une bulle en bas à droite — pas un message système.
- **Un fichier tronqué ou modifié à la main** est signalé comme illisible, et le studio ne l’ouvre
  pas plutôt que d’en deviner le contenu.
- **Un projet créé par une version PLUS RÉCENTE du studio est refusé.** Il n’est pas ouvert « du
  mieux possible » : le studio ne connaît pas ce que cette version a ajouté, et le premier
  enregistrement l’effacerait sans rien dire. Mettez le studio à jour pour rouvrir ce projet ; le
  dossier, lui, n’a pas été touché.

> **Un projet créé par une version précédente s’ouvre tel quel.** Son dossier s’appelait
> « Mon projet.scenario » et sa carte d’identité `project.json`, sans point — le studio les
> reconnaît et écrit la nouvelle forme à côté. **L’ancien fichier est laissé où il est** : le
> dossier vous appartient, vous le synchronisez peut-être, et une version antérieure du studio sait
> encore le lire. Renommer le dossier pour lui retirer son extension est à vous de le faire, si
> vous y tenez ; le studio n’y touche pas.

---

## Le contexte du projet

Vous travaillez sur un film médiéval. Vous demandez « une maison » et vous obtenez un pavillon de
banlieue. Vous récrivez « une chaumière médiévale à colombages, dans une forêt brumeuse, peinture à
l'huile » — et vous le récrivez à chaque génération, toute la journée.

**Le contexte du projet est l'endroit où l'on écrit cela une fois.** Il vit dans le panneau
**Contexte**, moitié basse de la colonne de gauche, à côté de l'Explorateur et de Git : les trois
parlent du projet ouvert — son arbre, son histoire, et ce qu'il raconte.

Le menu du projet, dans la barre de titre, y mène aussi : **Contexte du projet**, entre la liste
des projets et les deux façons d'en ouvrir un autre. C'est l'une des deux lignes qui agissent sur
le projet ouvert au lieu d'en changer — l'autre est **Fermer le projet**.

### Des fiches, et rien d'imposé

Un contexte est une liste de **fiches**. Chacune porte un titre que vous choisissez, un texte que
vous écrivez, et un interrupteur.

```
CONTEXTE DU PROJET                    [+]
──────────────────────────────────────────
☑ Univers
  Moyen Âge, XIIIᵉ siècle. Forêt profonde,
  royaume en déclin.

☑ Direction artistique
  Peinture à l'huile, clair-obscur, ocres
  et verts sourds.

☐ Personnage : Aldric
  Chevalier balafré, armure ternie.

☑ Interdits
  Béton, néon, vêtement moderne.
──────────────────────────────────────────
             412 / 600 caractères envoyés
```

**Aucune rubrique n'est imposée**, et c'est délibéré : un romancier, un architecte et un studio de
jeu décrivent un monde avec des mots entièrement différents. Le bouton `+` propose trois façons de
commencer — Univers, Direction artistique, Interdits — mais ce ne sont que des points de départ :
renommez, réécrivez, supprimez.

**Une fiche éteinte garde son texte et n'ajoute rien.** C'est ainsi qu'on met un personnage de côté
le temps d'une série d'images sans le perdre.

### Ce qui part, et le compteur

Le texte des fiches allumées est ajouté **sous** votre prompt, jamais devant :

```
une maison en ruine

Project context —
Univers: Moyen Âge, XIIIᵉ siècle. Forêt profonde, royaume en déclin.
Direction artistique: Peinture à l'huile, clair-obscur, ocres et verts sourds.
Interdits: Béton, néon, vêtement moderne.
```

Le compteur en bas du panneau dit ce qui est réellement envoyé. **La limite est de six cents
caractères, et elle vient des modèles, pas du studio** : beaucoup d'encodeurs de texte ne lisent que
soixante-dix-sept jetons — environ trois cents caractères — et laissent tomber le reste sans un mot.
Au-delà de la limite, **les dernières fiches ne partent pas** ; elles sont écartées entières, jamais
coupées au milieu d'une phrase.

### Des images de référence

Une fiche peut porter jusqu'à **quatre images** : déposez-les dessus depuis la bibliothèque.

Elles ne partent pas toutes seules. Le panneau de génération les montre avec un bouton **Utiliser
ces références**, et rien ne bouge sans ce clic — une image de référence change l'opération que le
modèle exécute et ce qu'elle coûte, ce n'est pas quelque chose qui doit arriver par surprise. Le
bouton n'apparaît pas pour un modèle qui ne prend aucune image.

### Le fichier, et ce qui se passe s'il casse

Le contexte est écrit dans `.project-context.json`, **à la racine de votre dossier de projet**. Il
suit donc le projet : copié sur un disque, envoyé à quelqu'un, versionné dans Git — il est là.
C'est du JSON lisible et vous pouvez l'éditer à la main.

Si le studio ne parvient pas à le lire, **il n'y touche pas** et le panneau dit laquelle des deux
choses est arrivée :

| Ce que dit le panneau | Ce qu'il faut faire |
|---|---|
| Le fichier est illisible | Le réparer, ou le supprimer pour repartir de zéro. Rien n'a été écrasé |
| Écrit par une version plus récente | Mettre le studio à jour |

Un projet qui n'a pas de fichier n'a pas de contexte, et c'est le cas ordinaire : rien n'est créé
tant que vous n'avez pas écrit une première fiche.

### Ce que le contexte touche, et ce qu'il ne touche pas

**Il s'applique à toutes les générations** — images, vidéos, modèles 3D, sons, ciels — dès
que le modèle a un champ de description. Un agrandissement, une conversion, un maillage fait à
partir d'une image n'en ont pas : le contexte ne fait alors rien, silencieusement.

**L'assistant le reçoit aussi.** Il sait dans quel projet il travaille sans que vous le lui disiez.

**Le nom de vos fichiers ne change pas.** Un asset généré est nommé d'après le début de son prompt ;
c'est **ce que vous avez écrit** qui le nomme, jamais la version allongée par le contexte. De même,
« Régénérer » rouvre le formulaire sur votre prompt, pas sur le prompt allongé — sans quoi le
contexte s'ajouterait à lui-même à chaque reprise.

---

## Les documents

Un document est un travail en cours : une image avec ses calques, une scène 3D avec ses objets,
un montage avec ses pistes.

Le bouton **+** en haut du rail gauche en crée un, et demande deux choses : son **nom**, et son
**emplacement**.

**Le nom proposé dit ce que le document est** — `Scène 1`, `Vidéo 1`, `Image 1` — et l’extension
du format est écrite à droite du champ, pour que vous voyiez le fichier avant de valider. Chaque
type compte les siens : la première image d’un projet s’appelle `Image 1` même si le projet tient
déjà trois scènes.

L’emplacement se parcourt **en colonnes**, comme la fenêtre d’enregistrement du système : chaque
colonne montre ce qu’un dossier contient, et choisir un dossier ouvre son contenu dans la colonne
suivante. **Le dernier dossier choisi est celui où le document ira** — il n’y a pas deux notions à
suivre. Le chemin complet est écrit au-dessus des colonnes. On ne sort jamais du projet : rien
d’autre n’est proposé.

Les colonnes s’ouvrent sur le dossier que l’Explorateur montre, ou, si rien n’y est sélectionné,
sur le dossier de la section — `Modelling/Scenes/` pour une scène, `Images/` pour une image,
`Materials/` pour une matière. En dessous, **Nouveau dossier** en crée un dans le dossier choisi,
sans quitter la fenêtre.

Il est enregistré avec `⌘S` / `Ctrl+S` — dans le dossier que vous avez choisi en le créant, et
ensuite là où vous l’avez rangé — sous une extension qui dit ce qu’il est :

| Type de document | Extension | Espace |
|---|---|---|
| image en calques | `.ora` | Image |
| scène 3D | `.gltf` | 3D |
| séquence vidéo | `.otio` | Vidéo |
| son en cours d’édition | `.otio` | Audio |
| ciel | `.gltf` | Skyboxes |
| matière | `.mtlx` | Matières |

Cette extension est là pour que le dossier **se lise à l’œil**. `a3f1.gltf` à côté de
`b204.mtlx` dit ce qu’est chacun ; `a3f1.json` à côté de `b204.json` ne dit rien.

> **Les six types savent s’enregistrer**, et le panneau **Explorateur** montre le dossier du
> projet en arborescence — c’est par là qu’on rouvre un document fermé. Fermer un onglet dont le travail n’est
> pas écrit pose la question avant de le perdre.

### Parcourir le projet — le panneau Explorateur

Le panneau **Explorateur** montre **le dossier du projet**, en arborescence : les sept dossiers de
départ, et tout ce que vous y avez créé ou déposé vous-même. Les dossiers se déplient, les fichiers
sont dedans, exactement comme dans l’explorateur de votre système.

**Il montre aussi ce que le studio ne sait pas ouvrir.** Un `.pdf`, un `.txt`, un dossier de notes :
c’est votre dossier, et c’est ce qui distingue un explorateur d’une liste de documents.

Un document y est écrit sous **le nom que vous lui avez donné**, et la lecture en liste fait
suivre **son extension en gris** — `Scène 1 .gltf`. Renommer la ligne change le nom, jamais
l’extension.

#### Deux lectures du même dossier

La tête du panneau porte trois boutons. Les deux premiers disent comment le dossier est LU, et
l’un des deux est toujours allumé :

| Lecture | Ce qu’elle montre |
|---|---|
| **Par dossier** | le projet tel qu’il est rangé sur le disque, en arborescence |
| **Par domaine** | tous les fichiers du projet groupés par ce qu’ils **sont**, où qu’ils soient rangés |

**Par domaine** ignore les dossiers. Il pose huit en-têtes au plus — les six types du studio,
**Matière** pour un document `.mtlx`, et **Autre** pour ce qui n’en relève d’aucun — chacun suivi du nombre de fichiers qu’il compte. **Un
domaine que rien ne remplit n’apparaît pas** : huit en-têtes vides sur un projet neuf ne diraient
rien.

Un en-tête nomme, il n’ouvre pas : on ne le sélectionne pas, on ne le renomme pas, et rien ne s’y
dépose.

**Elle n’a presque nulle part où déposer**, et c’est mécanique : ranger un fichier demande un
dossier où le porter, et il n’y a plus de dossier à l’écran. Une ligne se prend toujours, mais la
seule cible qui reste est le vide sous l’arbre — la racine du projet. **Pour ranger, revenez
Par dossier.**

C’est ce qui répond à « où sont passées mes vidéos ? » quand elles sont réparties dans cinq
dossiers que vous avez faits vous-même.

#### Chercher, et trier

Sous les boutons, une barre : un champ et un tri. **La recherche parle par-dessus les deux
lectures** — taper un mot est une question sur le projet, pas sur la façon dont il est affiché.

Elle parcourt le dossier **entier**, pas seulement ce qui est déplié, et ramène chaque
correspondance **avec la chaîne de dossiers qui y mène** : un fichier neuf replis plus bas
apparaît là où il est, pas hors sol. Elle attend que la frappe se pose avant de partir.

Le tri range par **Nom, de A à Z** ou **Nom, de Z à A**. Il vaut pour les deux lectures ; il ne
touche pas à l’ordre des domaines, qui est celui que le studio emploie partout ailleurs.

**Le panneau distingue quatre silences**, et c’est ce qui fait qu’il ne dit jamais « vide » quand
il veut dire « patientez » : un dossier illisible, une lecture encore en route, un projet sans
aucun fichier, et un mot auquel rien ne répond. **Une recherche sans résultat ne fait pas
disparaître le champ où elle a été tapée** — sinon il n’y aurait plus de chemin de retour.

#### Les gestes

| Geste | Effet |
|---|---|
| **Double-clic** sur un dossier | l’ouvre ou le referme |
| **Double-clic** sur un document du studio | l’ouvre, en changeant d’espace s’il appartient à un autre |
| **Double-clic** sur un asset | **l’ouvre dans le studio**, dans l’espace qui édite son type — où qu’il soit rangé |
| **Double-clic** sur tout autre fichier | le confie à votre système, qui l’ouvre avec l’application prévue |
| `→` `←` | déplie, replie |
| `↑` `↓` | la ligne précédente, la suivante |
| `Entrée` | ouvre la ligne |
| **⌘-clic** / `Ctrl`-clic | ajoute la ligne à la sélection, ou l’en retire |
| **⇧-clic** | prend tout ce qui va de la dernière ligne prise à celle-ci |
| **Glisser** une ligne sur un dossier | y déplace le fichier ou le dossier, sous le même nom |
| **Glisser** une ligne dans le vide sous l’arbre | la sort de son dossier, à la racine du projet |

**Tout ce qui suit vaut pour la sélection entière**, pas pour la seule ligne cliquée : glisser en
emporte plusieurs d’un coup, et le menu du clic droit s’applique à toutes. **Trois fichiers portés
vers un dossier que l’un d’eux contient n’allument pas ce dossier** — le refus est demandé pour le
lot, pas ligne à ligne.

**Le glisser déplace, le clic droit renomme** — et les deux ne se recouvrent pas : « Renommer »
change le nom **là où le fichier est déjà**, et ne peut pas le sortir de son dossier. Un dossier
qui n’accepterait pas le dépôt ne s’allume pas : vous voyez avant de lâcher, pas après. Un nom
déjà pris dans le dossier d’arrivée est refusé plutôt qu’écrasé, et le journal le dit.

#### Le clic droit : douze gestes, en quatre groupes

| Groupe | Geste | Ce qu’il fait |
|---|---|---|
| ouvrir | **Ouvrir** | ouvre le fichier dans son espace, ou déplie le dossier |
| | **Afficher dans le dossier** | ouvre le Finder ou l’Explorateur Windows, sur la ligne cliquée |
| | **Informations sur le fichier** | ouvre la fenêtre qui dit tout ce que le studio sait de cette entrée |
| presse-papiers | **Couper** · **Copier** | retiennent la sélection pour le prochain collage |
| | **Coller** | dépose dans le dossier affiché ce que le presse-papiers retient |
| fichiers | **Nouveau dossier** | crée un dossier vide dans le dossier affiché |
| | **Dupliquer** | pose une copie à côté de l’original, sous un nom libre |
| | **Renommer** | change le nom sur le disque, là où il est lu |
| | **Mettre à la corbeille** | envoie à la corbeille de votre système |
| revenir | **Annuler** · **Rétablir** | défont et refont le dernier lot de fichiers |

**Huit de ces douze gestes portent le raccourci auquel ils répondent**, et c’est celui qui est
*en vigueur* : si vous l’avez remappé dans les réglages, c’est le vôtre qui s’affiche ici. Les
quatre autres — **Ouvrir**, **Afficher dans le dossier**, **Informations sur le fichier**,
**Renommer** — n’en portent aucun, et c’est exact : ce ne sont pas des commandes du registre.
`Entrée` ouvre bien la ligne, mais c’est l’arbre qui écoute cette touche, et elle ne se change
pas.

**Aucun geste ne disparaît du menu ; ceux qui ne s’appliquent pas sont grisés.** Un menu dont la
longueur change selon la ligne cliquée est un menu qu’on ne peut pas apprendre. **Informations
sur le fichier** est grisé sur un dossier — ce qu’il répond est celui d’un fichier.

**Quatre gestes ne suivent pas la sélection, et ce sont exactement les quatre sans raccourci** :
**Ouvrir**, **Afficher dans le dossier**, **Informations sur le fichier** et **Renommer** visent
la ligne que vous venez de cliquer, même si plusieurs noms sont pris. Les huit autres travaillent
sur la sélection entière. Le partage se retient sans l’apprendre : un geste qui parle d’**une**
entrée — l’ouvrir, la montrer, la décrire, la renommer — ne peut pas en viser vingt.

**`⌘Z` ne défait les fichiers que si le focus est dans ce panneau.** Ailleurs il appartient au
document ouvert : annuler dans le canevas ne doit pas atteindre votre disque.

> **Rien n’est effacé ici.** « Mettre à la corbeille » est la corbeille du système : le fichier
> s’y récupère.
>
> **C’est le seul geste que `⌘Z` ne reprend pas.** Déplacer, dupliquer, créer, renommer se défont
> d’une frappe ; la corbeille du système n’a pas de retour portable, et l’historique du studio
> s’arrête là. **C’est aussi pour cela qu’un lot demande confirmation** : au-delà d’un fichier, le
> studio annonce combien partent et attend votre accord. **Un seul fichier part sans question** —
> il est nommé sur la ligne que vous venez de cliquer, et le système offre de le remettre.
>
> **Une porte supprime pour de bon**, et elle le dit : **Supprimer le document…**, dans le menu
> d’un onglet, retire le fichier du dossier sans passer par la corbeille. Son dialogue annonce
> « Cette action est irréversible », et c’est exact.

**Un refus, et il est grisé plutôt que caché.** Ce que le studio garde pour lui — tout ce qui
commence par un point : `.index/`, `.ai-desktop-studio/`, `.project.json` — ne se renomme ni ne se jette, et
ne reçoit rien non plus. Ce sont ses outils ; renommer l’un d’eux casserait le projet pour un nom
que personne ne lit. **Le même refus vaut des deux côtés du glisser** : vous voyez avant de lâcher.

**Un document écrit comme un dossier ne reçoit rien non plus.** Une planche `.ora` est un vrai
répertoire, mais ce qu’il contient est l’écriture du studio : un fichier qu’on y déposerait
serait effacé par la prochaine sauvegarde, qui reconstruit ce dossier. Le document lui-même se
déplace comme n’importe quel fichier — c’est son intérieur qui ne s’ouvre pas.

**Tout le reste vous obéit**, les sept dossiers de départ compris : renommez-les, videz-les,
jetez-les, sortez-en un asset pour le ranger ailleurs, coupez, copiez, dupliquez. Le studio suit —
c’est ce que la passe de réconciliation fait à l’ouverture et au retour dans la fenêtre.

**Le renommage, lui, passe par le geste de la chose.** Un asset et un document ont chacun le leur, et
l’Explorateur y mène : le nom change, et le fichier suit dans le même mouvement. Un document
renommé ici garde son onglet ouvert, qui prend le nouveau nom. Un asset renommé ici change de nom
partout à la fois — l’Explorateur, l’Inspecteur, l’onglet qui l’édite — parce qu’il
n’y a **qu’un seul nom** : celui de sa ligne d’index EST celui de son fichier.

> **Une image que vous avez déposée vous-même se renomme aussi**, même si le studio n’en a
> aucune fiche : c’est alors un fichier ordinaire, renommé comme tel. Ce qui change selon les
> cas, c’est ce qui SUIT le nom — une fiche d’index, l’onglet d’un document, ou rien.

> Un nom que votre système de fichiers n’accepterait pas est refusé plutôt que corrigé en
> silence — une barre oblique, par exemple. Un nom que le dossier tient déjà l’est aussi, plutôt
> que d’écraser le fichier de quelqu’un d’autre. Le champ s’est refermé quand la réponse arrive :
> c’est le journal d’activité qui le dit.

- les documents déjà à l’écran sont marqués **Ouvert** ;
- l’icône d’un document dit de quel espace il relève, la même que dans le rail.

#### Les éléments cachés

**Rien de ce dont le nom commence par un point ne s’affiche par défaut** — `.project.json` et
`.index/`, donc, mais aussi un dossier à vous que vous auriez nommé en commençant par un point.

**Le troisième bouton en tête du panneau les montre**, sous l’œil que tous les explorateurs de
fichiers emploient pour cela. Ce qu’il révèle reste **en lecture seule** : ces lignes refusent
tous les gestes, des deux côtés — ni renommer, ni corbeille, ni glisser, ni recevoir un dépôt.
C’est ce que le studio tient pour lui, et le voir n’est pas y toucher.

**Un dossier n’est lu qu’au moment où vous l’ouvrez.** `Images/` peut contenir des milliers de
fichiers dans un projet ordinaire, et les lire pour les compter coûterait une attente à chaque
ouverture de projet.

**L’arbre suit le disque.** Copiez un fichier dans le dossier depuis votre système : il apparaît,
sans rien à cliquer. Il se relit aussi quand vous revenez sur la fenêtre — un projet posé sur un
volume réseau n’émet parfois aucun événement, et ce second filet le rattrape.

#### Ce qui se passe quand vous rangez le dossier sans le studio

L’arbre, lui, ne fait que montrer. **Ce qui suit vraiment vos fichiers est une passe** qui remet
le catalogue et le disque d’accord, et elle se déclenche à deux moments : **à l’ouverture d’un
projet** — ce qui a bougé pendant que le studio était fermé — et **quand la fenêtre revient au
premier plan** — ce qui a bougé pendant qu’il était ouvert. Le Finder est l’autre moitié de tout
dossier de projet ; ni l’un ni l’autre moment ne suffit seul.

**Elle reconnaît un fichier à son contenu, pas à son chemin.** Déplacez une image d’un dossier à
l’autre, renommez-la, faites les deux : la fiche la retrouve et la suit. Les identifiants ne
changent pas, donc **une scène 3D continue de pointer sur son image** après que vous l’avez
rangée ailleurs.

**Elle n’efface jamais une fiche.** Un fichier introuvable est **daté comme absent**, et sa fiche
reste : le prompt, la graine et la filiation ne sont écrits sur aucun disque, et les perdre parce
qu’un fichier est sur une clé USB débranchée serait perdre plus que le fichier. Rebranchez la clé,
la passe suivante remet la fiche en service.

**Le plus souvent, vous ne la verrez pas.** Une barre s’affiche en tête du panneau **tant qu’une
passe tourne** — mais une passe ordinaire lit le dossier, trouve tout là où le catalogue l’annonce
et se termine avant d’avoir pu être peinte. Ce qui la rend visible est un projet où quelque chose
a bougé : c’est le cas où la passe doit lire des fichiers, donc le seul où l’attente dure assez
pour mériter une explication.

| Ce que la barre montre | |
|---|---|
| **Le studio retrouve les fichiers déplacés hors du projet** | et l’avancement, dès qu’il sait combien de fichiers il va lire |
| **Arrêter** | interrompt la recherche ; **ce qui a déjà été retrouvé reste retrouvé** |

**Le journal ne parle que si quelque chose a changé** : *n fichiers déplacés hors du studio ont
été retrouvés et suivis*, et — en avertissement — *n fichiers du catalogue sont introuvables dans
le projet, leurs fiches sont conservées*. Une passe sur un projet où rien n’a bougé n’écrit rien
du tout, et c’est ce qui la rend supportable à chaque retour dans la fenêtre.

> **C’est toujours par là qu’on rouvre un document fermé.** La disposition retient les onglets
> ouverts, mais un document fermé alors qu’aucune disposition ne le portait n’est plus atteignable
> par les onglets ; il est dans le dossier où vous l’avez rangé, un repli plus bas.

> **Un document jamais enregistré ne revient pas au redémarrage**, et son onglet ne revient pas
> non plus : il est retiré de la disposition plutôt que rouvert sur « Ce document n’est plus
> ouvert. » La disposition est écrite sur votre disque, le contenu des documents non — ce sont les
> fichiers du projet qui en tiennent lieu, et ce qui n’a jamais été écrit n’a rien à rouvrir.

Il n’y a pas de dialogue « Ouvrir un fichier », et il n’en est pas prévu : le studio n’ouvre que
ce qui est dans le projet.

### Comment un document est écrit

Le studio écrit d’abord dans un fichier de transit, puis le renomme par-dessus l’ancien. Cela
veut dire que si l’ordinateur s’éteint **pendant** l’écriture, vous gardez l’ancienne version
intacte au lieu d’un fichier à moitié écrit.

> Une coupure de courant à la seconde exacte de l’écriture peut malgré tout perdre la dernière
> sauvegarde. C’est le compromis assumé : l’alternative coûterait une attente à chaque `⌘S`.

---

## Enregistrer des versions — le panneau Git

Le panneau **Git** suit **le dossier de votre projet**, et rien d’autre : vos fichiers, jamais le
studio lui-même. Une version enregistrée est un état complet du dossier, que vous pouvez ensuite
relire fichier par fichier — c’est ce que montre le panneau **Historique**, dans la bande du bas.

C’est le filet du travail long : une piste de lumière tentée avant le week-end, une matière qu’on
préfère abandonner, un dossier de vingt documents dont on veut l’état d’hier.

### Mettre le suivi en place

Sur un projet qui ne suit pas encore ses versions, le panneau propose un seul bouton :
**Suivre les versions**. Il prépare le dossier, sur cet ordinateur, et **n’envoie rien nulle
part** — un serveur, si vous en voulez un, se relie plus tard.

Trois choses se passent à ce moment-là, et il vaut mieux les savoir :

- Le studio écrit un fichier d’exclusions qui laisse `.index/` de côté : ce dossier se
  **reconstruit** à partir de vos fichiers, l’enregistrer serait enregistrer un cache.
  **Un fichier d’exclusions déjà présent n’est pas touché** — un projet qui revient d’ailleurs
  garde les règles que quelqu’un a écrites.
- Le nom de la première branche est celui que **votre** git utilise par défaut. Le studio n’en
  impose aucun.
- Le suivi porte sur **la racine du projet**. Un dossier de projet posé à l’intérieur d’un dépôt
  qui ne le concerne pas — un dossier personnel versionné une fois — n’est pas considéré comme
  suivi, et le panneau propose de le mettre en place pour lui-même.

> **Si git n’est pas installé**, le panneau le dit et n’offre aucun bouton : il n’y a rien à
> proposer tant que le programme n’est pas là. Voir [Réglages ▸ Versions](14-reglages.md#versions).

### Enregistrer une version

En haut du panneau, un champ où écrire **ce que dit cette version**. En dessous, la liste de ce
qui a changé, chaque fichier avec une case.

**La case est le geste central** : la cocher, c’est dire « celui-là fera partie de la prochaine
version ». La décocher l’en retire. Il n’y a rien d’autre à comprendre, et aucun autre bouton pour
la même chose.

Le bouton **Commit** demande **un message et au moins un fichier coché**. Tant que l’un des deux
manque, il reste éteint — sauf si **Corriger la dernière** est cochée, où le message seul suffit :
refaire une version pour son seul message est le cas le plus courant.

| Ce que vous voulez | Le geste |
|---|---|
| Enregistrer une partie de ce qui a changé | cochez ces fichiers-là, écrivez le message, **Commit** |
| Enregistrer tout un groupe d’un coup | le bouton **Tout cocher dans…** de son en-tête, puis **Commit** |
| Corriger la version que vous venez d’enregistrer | cochez ce qui manquait, cochez **Corriger la dernière**, **Commit** |

**Corriger la dernière** refait la dernière version au lieu d’en ajouter une — un message mal
tourné, un fichier oublié d’une minute. La case n’apparaît qu’une fois qu’il y a une version à
corriger.

> **Un message n’est jamais perdu.** Il n’est effacé que si la version a réellement été
> enregistrée : un refus — l’auteur non renseigné est celui que tout le monde rencontre d’abord —
> vous laisse votre texte pour réessayer. Il survit aussi au fait de quitter le panneau, et même
> de changer de projet.

### Les quatre groupes de fichiers

La liste est rangée sous quatre en-têtes, dans cet ordre, et **un groupe vide n’apparaît pas** :

| Groupe | Ce qu’il contient |
|---|---|
| **En conflit** | ce qu’une fusion n’a pas su départager — à régler avant tout le reste |
| **Retenus** | ce qui est coché, donc ce que la prochaine version enregistrera |
| **Modifiés** | ce qui a changé depuis la dernière version, et n’est pas coché |
| **Nouveaux** | ce que le suivi n’a jamais vu — un asset qui vient d’être généré, par exemple |

Chaque en-tête porte le **nombre** de fichiers du groupe et un bouton qui les prend **tous** —
« Tout cocher dans Modifiés », « Tout décocher dans Retenus ». Un import qui écrit trente fichiers
se coche en un clic plutôt qu’en trente.

**La liste est à plat, pas en arborescence** : ce qu’on lit ici est la courte liste de ce qui a
bougé. L’arbre, c’est l’Explorateur, une icône plus haut.

### Les gestes d’une ligne

| Geste | Effet |
|---|---|
| **La case** | fait entrer le fichier dans la prochaine version, ou l’en retire |
| **Comparer** | montre l’avant et l’après **dans la bande du bas**, et l’amène au premier plan |
| **Restaurer** | remet le fichier tel qu’il était dans la dernière version enregistrée |

**Comparer** n’est pas offert sur un fichier **Nouveau** — il n’a pas de version d’avant à
laquelle se comparer — ni sur un fichier en conflit, qui porte les deux versions à la fois.

**Restaurer** n’est offert que sur un fichier **modifié** ou **supprimé**, et c’est le même
raisonnement : un fichier neuf n’a rien où revenir. **Le supprimer est le travail de
l’Explorateur**, qui passe par la corbeille de votre système — un fichier ne disparaît pas d’un
panneau de versions. Un fichier **renommé** n’est pas restaurable non plus : remettre un renommage
en place toucherait deux chemins, dont un que vous n’avez pas cliqué.

### Le panneau se tient à jour tout seul

Il se relit quand vous **changez de projet**, quand le **dossier bouge sur le disque** — y compris
sous une main qui n’est pas le studio — et quand la **fenêtre revient au premier plan**. Rien
n’est interrogé en boucle.

Le bouton **Actualiser**, en tête du panneau, est là pour l’impatience légitime : vous venez de
faire quelque chose dans un terminal et vous voulez le voir **maintenant**.

### Les branches

Le bouton de gauche porte le nom de la branche sortie — ou **Hors branche**, si vous vous êtes
posé sur une version précise plutôt que sur une branche. Il ouvre la liste des branches, avec une
coche sur celle qui est sortie, et une ligne **Nouvelle branche**.

> **Cette liste se relit à chaque ouverture** : une branche créée dans un terminal **sans y
> basculer** y est déjà. Le bouton **Actualiser** reste celui des fichiers — il ne lit pas les
> branches, et n’a pas à le faire.

Une branche est la façon d’essayer autre chose sans rien perdre : deux directions artistiques sur
le même projet, chacune la sienne.

> **Avant la première version enregistrée, il n’existe aucune branche** — git n’en a pas tant que
> rien n’est enregistré. Le bouton va alors droit au champ de nom, sans ouvrir de liste d’un seul
> élément.

Un nom que git refuserait est refusé **avant** la commande, plutôt que de vous renvoyer un message
écrit pour quelqu’un qui lit une page de manuel : pas d’espace, et aucun des caractères
`~ ^ : ? * [ \`.

### Mettre de côté

**Mettre de côté** range tout ce qui a changé — **fichiers neufs compris** — et vous rend un
dossier propre. C’est pour l’essai qu’on veut écarter le temps de regarder ce qu’il y avait
dessous, sans l’enregistrer et sans le perdre.

Rien ne vous est demandé : la pile est nommée toute seule d’après la branche et le moment. Le
menu du bouton liste ensuite ce qui est en attente.

| Geste | Effet |
|---|---|
| **Mettre de côté maintenant** | range tout, et rend le dossier propre |
| **Cliquer une pile** | la remet dans le dossier **et la retire de la liste** |
| **Jeter** | la supprime sans la remettre — **rien ne la récupère ensuite** |

### Un serveur, si vous en voulez un

Tant que le projet ne parle à aucun serveur, et **une fois une première version enregistrée**, le
panneau montre un champ d’adresse et un bouton **Relier**. L’adresse se colle : c’est celle que
votre hébergeur affiche après avoir créé un dépôt. Rien d’autre n’est demandé, et **rien n’est
envoyé à ce moment-là**.

Une fois relié, trois boutons apparaissent en tête du panneau :

| Bouton | Ce qu’il fait |
|---|---|
| **Relever** | va voir ce que le serveur a de neuf, **sans rien changer chez vous** |
| **Recevoir** | ramène chez vous les versions enregistrées ailleurs |
| **Envoyer** | met vos versions sur le serveur |

À côté d’eux, deux compteurs — « 3 à envoyer », « 2 à recevoir » — qui **n’apparaissent que
lorsqu’ils ne sont pas à zéro**.

> **Le premier envoi d’une branche est offert même avec rien en avance** : c’est lui qui crée
> cette branche sur le serveur.

**Le studio ne demande jamais de mot de passe.** Si le serveur refuse l’accès, le panneau demande
alors — et alors seulement — un identifiant et un **jeton personnel**, une fois par serveur et non
par projet. Il est chiffré par le trousseau de votre système, ne ressort jamais de l’application,
et **l’envoi qui avait été refusé est relancé tout seul**. Si un jeton est déjà retenu et que le
serveur le refuse quand même, un bouton **Oublier le jeton** l’efface.

**Rien ne part ni n’arrive sans l’un de ces trois boutons** : il n’y a aucune relève automatique.
Un seul serveur par projet, nommé `origin`, ce que git et tous les hébergeurs supposent.

### Quand deux versions se contredisent

Après une réception, des fichiers peuvent atterrir **En conflit** : les deux côtés ont touché le
même endroit, et personne ne peut décider à votre place. Ce groupe passe en tête de liste, et ses
lignes portent deux boutons au lieu des gestes habituels :

| Bouton | Effet |
|---|---|
| **Garder ma version de…** | conserve ce que vous aviez, et écarte ce qui arrivait |
| **Garder l’autre version de…** | conserve ce qui arrivait, et écarte ce que vous aviez |

Une fois tous les conflits réglés et les fichiers cochés, **Commit** termine la fusion.

L’en-tête du groupe porte la sortie de secours : **Abandonner la fusion** remet le dossier tel
qu’il était avant qu’elle commence.

> Ce que le panneau **ne fait pas** — un client git complet, une fusion à la main, un mot de passe
> demandé, une clé SSH à phrase de passe — est écrit noir sur blanc au chapitre
> [Ce qui n’existe pas encore](18-limites.md#git). Les réglages du suivi, dont le nom d’auteur
> inscrit dans chaque version, sont au chapitre [Réglages ▸ Versions](14-reglages.md#versions).

---

## Relire les versions — le panneau Historique

Le panneau **Historique** occupe la bande du bas et demande **un dossier suivi par git**. Il
montre les versions enregistrées de **toutes les branches à la fois**, pas seulement celle où vous
êtes : le panneau Git écrit, celui-ci relit, et les deux regardent le même dossier.

> Tant que le suivi des versions n’est pas en place, **le panneau n’est pas proposé du tout** : ni
> son icône dans le rail, ni la bande du bas, qui ne prend alors aucune place. C’est le panneau
> Git qui dit où en est ce projet, et qui porte le bouton. Le suivi en place mais rien
> d’enregistré encore : **Aucune version enregistrée pour l’instant.**

### Ce que porte une ligne

| Colonne | Ce qu’elle dit |
|---|---|
| **Le tracé** | à quelle branche cette version appartient, et de quoi elle découle |
| **L’empreinte** | le nom court que git donne à la version |
| **Les pastilles** | les noms qui pointent sur elle — voir juste en dessous |
| **Le message** | ce que vous avez écrit en l’enregistrant. Il prend toute la place qui reste |
| **L’auteur**, **le moment** | qui l’a enregistrée, et quand |

Trois sortes de pastilles, dont **une seule en bleu plein** :

| Pastille | Ce que c’est |
|---|---|
| **Version nommée** | un nom qu’on a posé sur cette version. La seule en bleu plein, parce que c’est celle qu’on cherche en faisant défiler |
| **Branche** | une branche de votre ordinateur en est là |
| **Branche du serveur** | le serveur en était là au dernier **Relever** |

### L’ordre n’est pas celui de l’horloge

Les versions sont rangées **par filiation**, pas par date : une version est toujours au-dessus de
celles dont elle découle. Sur un projet travaillé à plusieurs machines, deux horloges mal réglées
suffisent à rendre l’ordre des dates faux, alors que la filiation, elle, ne se discute pas. Vous
pouvez donc croiser une date plus ancienne au-dessus d’une plus récente : ce n’est pas un défaut
d’affichage.

### Ouvrir une version

Cliquez une ligne : la colonne **Fichiers de cette version** s’ouvre à droite et liste ce que
cette version a changé, avec les mêmes mots que le panneau Git — **Ajouté**, **Modifié**,
**Supprimé**, **Renommé**. Recliquer la même ligne referme la colonne.

> Une version peut ne toucher aucun fichier — une fusion, le plus souvent. Le panneau le dit
> plutôt que de vous laisser devant une colonne vide.

### Comparer un fichier de cette version

Cliquez un fichier de la colonne : la comparaison s’ouvre dans la **zone large**, à droite. C’est
la même zone que celle du panneau Git, et c’est voulu — le panneau étroit demande, la zone large
montre.

| Ce que vous comparez | Ce que vous voyez |
|---|---|
| **Un fichier texte** | les lignes ajoutées en vert, les retirées en rouge, avec les numéros de ligne **des deux versions** côte à côte, et le compte signé en tête : `+12 −3` |
| **Une image** | les deux états côte à côte, **Avant** et **Après**. C’est la comparaison pour laquelle ce studio existe, et celle qu’aucune liste de lignes ne donne |
| **Un fichier qui vient d’apparaître** | il n’a pas d’avant, et la colonne le dit au lieu de rester vide. Un fichier supprimé n’a pas d’après |

**Fermer la comparaison** rend la place. Un fichier que git ne sait pas comparer — trop lourd,
absent des deux côtés — le dit aussi, plutôt que de rester en attente.

### Nommer une version

En tête de la colonne des fichiers, **Nommer cette version** pose un nom sur elle. C’est ce qu’on
met sur l’état qu’un client a vu, sur celui qui est parti à l’impression, sur celui d’avant une
idée qui n’a pas marché : un nom se retrouve en faisant défiler, une empreinte non.

Le nom suit les mêmes règles qu’un nom de branche, et pour la même raison — pas d’espace, et aucun
des caractères `~ ^ : ? * [ \`. Une fois posé, il apparaît sur la ligne en bleu plein, et il y
reste.

### Soixante à la fois

L’historique se lit par pages de soixante versions. Un bouton **Voir plus** charge la suite en
dessous ; il disparaît quand il n’y a plus rien à charger. Un projet de deux ans compte des
dizaines de milliers de versions, et les lire toutes pour en dessiner vingt est ce que cette
pagination évite.

### Le panneau se tient à jour tout seul

Enregistrer une version, refaire la dernière, changer de branche : la liste se relit d’elle-même,
sans que vous ayez rien à demander. Le bouton **Actualiser** est là pour l’autre cas — ce qui a
été fait **en dehors du studio**, dans un terminal. Il relit depuis la première page plutôt que
d’ajouter à ce qui est affiché, sans quoi les deux moitiés de la liste décriraient deux états
différents du dossier.

### Ce que le panneau ne fait pas

**Il ne ramène pas le dossier à une version ancienne.** On y lit une version, on la compare, on la
nomme ; aucun geste ne la ressort. Les deux retours qu’offre le studio sont ailleurs et plus
étroits : **Restaurer** sur une ligne du panneau Git rend **un** fichier tel qu’il était dans la
**dernière** version enregistrée, et changer de branche déplace le dossier vers le bout d’une
branche, jamais vers une version au milieu.

> Un terminal, lui, sait se poser sur une version précise. Le studio l’affiche alors sans
> broncher : le bouton de branche indique **Hors branche**, et l’historique continue de se lire.

---

## Déplacer, copier, sauvegarder un projet

| Vous voulez… | Faites |
|---|---|
| **Le sauvegarder** | copiez le dossier. C’est tout |
| **L’alléger avant de le copier** | supprimez `.index/proxies` et `.index/peaks` — **gardez `catalog.db`** |
| **Le déplacer ailleurs** | déplacez le dossier, puis rouvrez-le depuis le studio |
| **Le renommer** | renommez le dossier. Le nom affiché, lui, vient de `.project.json` |
| **Le partager** | envoyez le dossier compressé. Celui qui le reçoit devra avoir sa propre clé API |

Rien ne casse : les chemins écrits à l’intérieur du projet sont **relatifs**, ce qui veut dire
qu’ils décrivent une position à l’intérieur du dossier, pas un emplacement sur votre disque.

> **Une exception : les médias importés.** Quand vous importez un fichier de votre disque —
> **vidéo, son, image ou objet 3D**, les quatre s’importent —, le studio **ne le copie pas** : il
> crée un lien vers l’endroit où il se trouve. Si vous déplacez le projet sans emporter ces
> fichiers-là, les liens se cassent.
>
> **Rien ne vous le dira tant que vous n’aurez pas cliqué.** L’inspecteur ne montre pas « Fichier
> introuvable » de lui-même : il propose le bouton **Afficher dans le dossier**, et
> c’est le clic qui, ne trouvant rien, fait apparaître le message. Voir
> [Les assets](07-assets.md).

---

## Rouvrir un projet au démarrage

Par défaut, le studio **rouvre le dernier projet** quand vous le lancez. Vous retrouvez vos
onglets et vos panneaux là où vous les aviez laissés.

Ce comportement se règle : **Réglages ▸ Général ▸ À l’ouverture**, avec deux choix — « Rouvrir
le dernier projet » ou « Ne rien ouvrir ».

Vous pouvez aussi choisir **où le studio vous propose de créer vos projets** :
**Réglages ▸ Stockage ▸ Dossier des projets**. Cela ne déplace rien ; cela ne fait que
présélectionner un endroit dans la boîte de dialogue.

---

## Sans projet ouvert

Le studio fonctionne, mais plusieurs choses sont indisponibles, et le disent :

| Ce que vous voyez | Pourquoi |
|---|---|
| « Ouvrez un projet pour générer. » | une image fabriquée doit atterrir quelque part |
| « Ouvrez un projet pour voir ses assets. » | l’Explorateur montre le contenu d’un projet |
| Le bouton **+** du rail est grisé | un document est un fichier dans un dossier de projet |

---

[← La fenêtre](03-la-fenetre.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Trouver un modèle →](05-modeles.md)
