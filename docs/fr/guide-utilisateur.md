# AI Desktop Studio — le manuel

Bienvenue. Ce manuel explique **tout** ce que fait AI Desktop Studio, du premier lancement au
travail de tous les jours.

Il est écrit pour être lu par quelqu’un qui n’a jamais ouvert de logiciel de création, sans
pour autant mentir à quelqu’un qui en ouvre tous les jours. Quand un mot compliqué est
nécessaire, il est expliqué à l’endroit où il apparaît, puis rappelé dans le
[glossaire](manuel/17-glossaire.md).

> 🇬🇧 This manual is also available [in English](../en/user-guide.md).
> Vous cherchez plutôt comment le logiciel est **bâti** ? Voir [architecture.md](architecture.md).

---

## En trois phrases

AI Desktop Studio est un logiciel qui s’installe sur votre ordinateur. Il sait **fabriquer** des
images, des vidéos, des sons, des objets en 3D, des matières et des ciels — en demandant à des
modèles d’intelligence artificielle, en ligne, chez un fournisseur de génération. Et il
sait ensuite **les assembler, les régler et les ranger**, chez vous, sans les renvoyer nulle
part.

---

## Le manuel, chapitre par chapitre

### Pour commencer

| | Chapitre | Ce que vous y trouverez |
|---|---|---|
| 1 | [Découvrir le studio](manuel/01-decouverte.md) | À quoi il sert, pour qui, et les huit mots à connaître avant de commencer |
| 2 | [Premiers pas](manuel/02-premiers-pas.md) | Installer, brancher son compte, créer son premier projet, faire sa première image |
| 3 | [La fenêtre, expliquée](manuel/03-la-fenetre.md) | Chaque morceau de l’écran, à quoi il sert, comment le déplacer ou le faire revenir |

### Le travail de tous les jours

| | Chapitre | Ce que vous y trouverez |
|---|---|---|
| 4 | [Les projets](manuel/04-projets.md) | Ce qu’est un projet, ce qu’il y a dedans, comment le sauvegarder et le déplacer |
| 5 | [Trouver un modèle](manuel/05-modeles.md) | Le catalogue, la recherche, les filtres, et comment choisir |
| 6 | [Générer](manuel/06-generer.md) | Le formulaire, le prompt, la file de tâches, les erreurs et les reprises |
| 7 | [Les assets et la Bibliothèque](manuel/07-assets.md) | La bibliothèque distante, télécharger, l’import de vos propres fichiers |

### Les espaces de travail

| | Chapitre | Ce que vous y trouverez |
|---|---|---|
| 8 | [Espace Image](manuel/08-espace-image.md) | Peindre, gommer, recadrer, empiler des calques |
| 9 | [Espace Modélisation](manuel/09-espace-modelisation.md) | Voler dans une scène, poser des objets et des lumières, les régler |
| 10 | [Espace Vidéo](manuel/10-espace-video.md) | Monter une séquence, couper, régler des pistes |
| 11 | [Espace Audio](manuel/11-espace-audio.md) | Rogner un son, faire des fondus, normaliser |
| 12 | [Espace Matières](manuel/12-espace-matieres.md) | Juger une matière sur un objet éclairé |
| 13 | [Espace Skyboxes](manuel/13-espace-skyboxes.md) | Fabriquer un ciel à 360° et le régler |

### Les annexes

| | Chapitre | Ce que vous y trouverez |
|---|---|---|
| 14 | [Tous les réglages](manuel/14-reglages.md) | Chaque réglage, sa valeur de départ, ses limites, à quoi il sert |
| 15 | [Tous les raccourcis](manuel/15-raccourcis.md) | La liste complète, par contexte, et comment les changer |
| 16 | [Quand ça coince](manuel/16-depannage.md) | Les messages, ce qu’ils veulent dire, quoi faire |
| 17 | [Glossaire](manuel/17-glossaire.md) | Tous les mots du logiciel, expliqués simplement |
| 18 | [Ce qui n’existe pas encore](manuel/18-limites.md) | Les boutons gris, les promesses en cours, ce qu’il ne faut pas attendre |
| 19 | [Comment faire pour…](manuel/19-recettes.md) | Seize recettes pas à pas, du premier clic au résultat |
| 20 | [Piloter le studio depuis l’extérieur](manuel/20-piloter-de-l-exterieur.md) | L’assistant, et le point d’entrée pour un client comme Claude Code |

---

## Le tour en cinq minutes

Si vous ne lisez qu’une chose, lisez ceci. C’est le chemin complet, du logiciel fermé à une
première image dans votre projet.

**1. Branchez votre compte.**
Ouvrez les réglages avec `⌘,` (macOS) ou `Ctrl+,` (Windows, Linux). Allez dans **Compte**.
Donnez un **nom** au compte, puis collez votre **clé API** et votre **secret API**, pris sur
chez votre fournisseur. Cliquez **Ajouter un compte** : le studio vérifie
tout de suite et pose une pastille verte **Utilisé** sur la ligne.

**2. Créez un projet.**
`⌥⌘N` / `Alt+Ctrl+N` — ou `⌘N`, puis **Créer un projet**. Choisissez un dossier et un nom. Un projet est un **dossier sur votre disque** :
tout ce que vous fabriquerez atterrira dedans.

**3. Choisissez un espace.**
En haut de la fenêtre, six onglets : **Image**, **Vidéo**, **3D**, **Audio**, **Matières**,
**Skyboxes**. Cliquez **Image**.

**4. Choisissez un modèle.**
À gauche, le panneau **Modèles** montre le catalogue. Cliquez sur une vignette qui vous plaît.
Le nom du modèle choisi s’affiche en haut du panneau.

**5. Décrivez ce que vous voulez.**
L’icône **Génération** vient d’apparaître dans le rail de gauche : cliquez-la, le panneau
**Génération** prend la place des Modèles et affiche un formulaire. Le champ le plus important
s’appelle le **prompt** : c’est votre phrase de commande, en anglais de préférence.
Par exemple : `a small red lighthouse on a cliff, morning light`.

**6. Appuyez sur Générer.**
La demande part. En bas à droite de la fenêtre, la ligne d’état affiche « 1 génération » avec une
barre qui avance. Un clic dessus ouvre le détail.
Vous pouvez continuer à travailler pendant ce temps.

**7. Récupérez le résultat.**
Quand la tâche passe à « Terminée », l’image arrive dans la **Bibliothèque** de votre compte — et
dans le dossier du
projet — et sur votre disque, dans le dossier `Images/`. Cliquez dessus : l’**Inspecteur**,
à droite, montre son modèle, son prompt et sa graine, et sait ouvrir le dossier qui la contient.

C’est tout. Le reste du manuel détaille chacune de ces sept étapes, et les cinq autres espaces.

---

## Comment lire ce manuel

**Vous n’avez pas à le lire dans l’ordre.** Chaque chapitre se suffit à lui-même et renvoie aux
autres quand il faut.

Trois conventions reviennent partout :

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| `⌘S` / `Ctrl+S` | Un raccourci clavier. La première forme est celle de macOS, la seconde celle de Windows et Linux |
| **Génération** en gras | Le nom exact d’un bouton, d’un panneau ou d’un menu, tel qu’il est écrit à l’écran |
| > Une citation encadrée | Un avertissement, ou une limite à connaître avant de s’y heurter |

Les symboles du clavier, une fois pour toutes :

| Symbole | Touche | Où |
|---|---|---|
| `⌘` | Commande | macOS. Remplacée par `Ctrl` ailleurs |
| `⇧` | Majuscule (Shift) | partout |
| `⌥` | Option / Alt | partout |
| `⌃` | Contrôle | macOS |

---

## Une chose importante, avant tout le reste

**Vos identifiants ne quittent jamais votre machine.** Ils sont chiffrés par le trousseau de
votre système d’exploitation — le même coffre-fort que celui qui garde vos mots de passe — et
seule la partie du logiciel qui parle au fournisseur y a accès. L’écran que vous regardez, lui, ne
sait jamais quelle est votre clé : il sait seulement s’il est connecté ou non.

**Vos fichiers non plus.** Vos projets sont des dossiers ordinaires sur votre disque. Ce qui part
vers le fournisseur, c’est ce que vous demandez de générer : le texte de votre prompt et, le cas échéant,
l’image que vous fournissez en entrée.

**Une exception, et elle est cochée par défaut** — mais elle ne touche pas vos fichiers. Le
réglage **Nommer les assets rapatriés**, dans **Réglages ▸ Génération**, demande à l’API de nommer
une image qui arrive sans nom utile. **Aucun octet ne quitte votre disque** : cette image-là est
déjà chez le fournisseur, puisqu’elle en vient, et le studio n’envoie que son identifiant. Ce qui se
dépense, en revanche, ce sont des **unités créatives**, sans clic de votre part — c’est le seul
endroit où le studio dépense de lui-même. Décochez-le et cela s’arrête ; le
[chapitre 14](manuel/14-reglages.md) le détaille.
