# 1. Découvrir le studio

[← Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Premiers pas →](02-premiers-pas.md)

---

## À quoi sert ce logiciel

Vous décrivez ce que vous voulez, avec des mots. Un ordinateur distant le fabrique. Vous
récupérez le résultat chez vous, et vous continuez à travailler dessus.

Voilà l’idée entière. Ce qu’AI Desktop Studio ajoute par rapport à un site web où l’on tape une
phrase et où l’on télécharge une image, c’est **tout ce qui vient après** :

- vos créations sont **rangées** dans un projet, sur votre disque, pas dans un dossier
  « Téléchargements » qui déborde ;
- vous pouvez **les assembler** sans changer de logiciel — poser une matière sur un objet 3D,
  glisser une vidéo dans un montage, fabriquer un ciel, rogner un son ;
- vous pouvez **retrouver comment vous les avez faites** — le modèle, le prompt et la graine
  restent attachés à chaque fichier, et un bouton les rejoue ;
- **rien ne repart** : vos fichiers restent chez vous.

> **Une chose à savoir tout de suite :** les six types de documents s’enregistrent dans le
> dossier du projet et se rouvrent tels quels, et fermer un onglet qui a du travail non
> enregistré pose la question avant de le perdre. Ce qui ne revient jamais, c’est l’historique
> d’annulation. La liste complète et honnête de ce qui manque encore est le chapitre
> [Ce qui n’existe pas encore](18-limites.md) — il est fait pour être lu, pas caché.

## Six façons de travailler

Le studio ne fait pas six logiciels différents. Il fait un seul logiciel qui **se réarrange**
selon ce que vous fabriquez. Ces six arrangements s’appellent des **espaces de travail**.

| Espace | Ce qu’on y fabrique | Un exemple |
|---|---|---|
| **Image** | des images fixes | une affiche, une illustration, une carte de matière |
| **Vidéo** | des séquences animées | un plan de dix secondes, un montage de plusieurs prises |
| **3D** | des scènes en volume | un décor, un objet posé sous une lumière |
| **Audio** | des sons et des musiques | une ambiance, un bruitage, une nappe musicale |
| **Matières** | des matières | du bois, du métal rouillé, du tissu — pour habiller un objet 3D |
| **Skyboxes** | des ciels à 360° | ce qu’on voit autour de soi quand on lève les yeux dans une scène |

Vous changez d’espace en cliquant sur son nom, en haut de la fenêtre. Les panneaux se
réorganisent tout seuls, et le catalogue de modèles se filtre sur ce qui sait fabriquer ce
type-là.

## Les huit mots à connaître

Ce sont les seuls mots dont on ne peut pas se passer. Tous les autres sont dans le
[glossaire](17-glossaire.md).

### 1. Un **projet**

Un dossier sur votre disque, qui contient tout votre travail : les fichiers que vous avez
fabriqués, ceux que vous avez importés, et la façon dont vous les avez arrangés.

Un projet s’ouvre, se ferme, se copie sur une clé USB, s’envoie à quelqu’un. C’est un dossier
ordinaire — vous pouvez l’ouvrir dans votre explorateur de fichiers et regarder dedans.

> **Sans projet ouvert, on ne peut pas générer.** C’est voulu : une image fabriquée doit
> atterrir quelque part.

### 2. Un **asset**

Un fichier de matière première dans votre projet : une image, une vidéo, un son, un objet 3D,
un ciel.

Le mot est anglais et n’a pas de bon équivalent français court. On dit parfois « ressource »
ou « média ». Retenez : **un asset est un fichier fini que vous pouvez réutiliser**.

Les assets vivent dans l’**Explorateur** une fois sur votre disque, et dans la **Bibliothèque**
tant qu’ils ne sont qu’en ligne.

### 3. Un **document**

Un travail en cours, ouvert dans un onglet, au centre de la fenêtre.

La différence avec un asset est celle qui sépare **la matière** de **l’ouvrage** : une image
générée est un asset ; l’image que vous êtes en train de peindre, avec ses calques et son
historique, est un document.

Il y a six sortes de documents, une par espace :

| Espace | Document | Extension du fichier |
|---|---|---|
| Image | une image en calques | `.ora` |
| 3D | une scène | `.gltf` |
| Vidéo | une séquence | `.otio` |
| Audio | un son en cours d’édition | `.otio` |
| Skyboxes | un ciel | `.gltf` |
| Matières | une matière | `.mtlx` |

### 4. Un **modèle**

Le programme distant qui fabrique. Il y en a plusieurs centaines dans le catalogue distant, et
ils ne savent pas tous faire la même chose : l’un dessine des images à partir de texte, un autre
transforme une image en objet 3D, un troisième compose de la musique.

**Choisir le bon modèle compte autant que bien écrire son prompt.** Le chapitre
[Trouver un modèle](05-modeles.md) explique comment s’y retrouver.

### 5. Un **prompt**

Votre phrase de commande. Le texte que vous écrivez pour décrire ce que vous voulez.

C’est le champ le plus important du formulaire de génération. Quelques principes, développés au
chapitre [Générer](06-generer.md) :

- **écrivez en anglais** si vous le pouvez : la plupart des modèles ont été entraînés dessus ;
- **décrivez ce qui est là**, pas ce qui n’y est pas ;
- **soyez concret** : « un phare rouge sur une falaise, lumière du matin » vaut mieux que
  « quelque chose de joli ».

### 6. Une **tâche** (ou *job*)

Une demande de fabrication en cours.

Vous appuyez sur **Générer**, et la demande part chez le fournisseur. Elle ne revient pas tout de
suite : selon le modèle, cela prend de quelques secondes à plusieurs minutes. Pendant ce temps,
la demande vit dans la **ligne d’état**, en bas de la fenêtre, avec une barre de progression, et
vous pouvez
continuer à travailler — ou l’annuler.

Une tâche passe par cinq états : **En file** → **En cours** → **Terminée**. Ou bien
**Échouée**, ou **Annulée** si vous l’arrêtez.

### 7. Un **panneau**

Une petite fenêtre à l’intérieur de la grande. Chaque panneau fait une chose : montrer les
calques, lister les modèles, montrer ce qui est sélectionné.

On les ouvre et on les ferme d’un clic sur les **rails** — les bandes d’icônes collées aux bords
gauche et droit de la fenêtre. Le chapitre [La fenêtre](03-la-fenetre.md) les décrit tous.

### 8. Un **calque**

Une couche transparente empilée sur les autres, dans l’espace Image.

Imaginez des feuilles de calque posées les unes sur les autres : vous dessinez sur celle du
dessus sans abîmer celles du dessous. Vous pouvez en masquer une, la remonter, la descendre, la
supprimer. C’est ce qui rend une image **modifiable** au lieu d’être un aplat définitif.

---

## Ce dont vous avez besoin

| | |
|---|---|
| **Un ordinateur** | macOS, Windows ou Linux |
| **Une connexion internet** | pour générer. Pour travailler sur ce que vous avez déjà, non |
| **Un compte chez un fournisseur de génération** | avec une clé API et un secret API — voir [Premiers pas](02-premiers-pas.md) |

**Ce dont vous n’avez pas besoin** : savoir dessiner, savoir programmer, savoir ce qu’est un
réseau de neurones. Le studio est fait pour être conduit, pas compris.

---

## Ce que le studio ne fait pas

Autant le dire tout de suite, cela évite de le chercher.

- **Il ne travaille pas hors ligne pour générer.** La fabrication se passe sur les serveurs du
  fournisseur. Sans connexion, vous pouvez ouvrir, monter, régler et enregistrer, mais pas créer
  de nouveau contenu.
- **Il n’est pas gratuit à l’usage.** Chaque génération consomme le crédit de votre compte
  distant. Le studio ne vous le facture pas — il ne fait que transmettre — mais votre compte,
  lui, compte.
- **Il ne remplace pas Photoshop, ni Blender, ni Premiere.** Il en fait une part utile, dans un
  seul endroit, autour de la génération. Le chapitre
  [Ce qui n’existe pas encore](18-limites.md) dit précisément où sont les bords.

---

[← Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Premiers pas →](02-premiers-pas.md)
