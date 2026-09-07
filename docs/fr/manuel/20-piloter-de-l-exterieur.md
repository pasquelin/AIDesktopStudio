# 20. Piloter le studio depuis l’extérieur

[← Comment faire pour…](19-recettes.md) · [Sommaire](../guide-utilisateur.md)

---

Jusqu’ici, vous avez conduit le studio à la main : un clic, un raccourci, une entrée de menu. Ce
chapitre décrit l’autre façon — **dire ce que vous voulez, et laisser le studio le faire**.

Elle a deux portes, et **elles donnent sur la même pièce** :

| La porte | Où elle est | Qui parle |
|---|---|---|
| **L’assistant** | dans la fenêtre, sur `⌘K` | vous, en français ou en anglais |
| **Le point d’entrée** | fermé au départ, à ouvrir dans les réglages | un programme extérieur, comme Claude Code |

Les deux lisent **le même catalogue**, et **rien qui engage quelque chose ne part sans que vous
l’ayez vu à l’écran** — d’où que vienne la demande.

**Le point d’entrée les offre toutes** — tout ce qu’un programme conduit délibérément : l’arbre
des fichiers, la pile de calques, le montage, le ciel, la matière, la scène 3D, le squelette d’un
personnage, le dépôt git, la bibliothèque distante, les panneaux du studio.

**L’assistant, lui, en reçoit autant que le modèle qui vous répond peut en tenir.** Le catalogue
entier là où il y a la place — un nuage de discussion, un modèle local à grande fenêtre — et
seulement les actions d’une phrase parlée là où il n’y en a pas : ouvrir un espace, chercher un
modèle, préparer une génération. Dans ce dernier cas il lui reste de quoi **demander le reste** en
cours de route, ce qui lui coûte un aller-retour. Vous n’avez rien à régler : cela suit le modèle
choisi dans la fenêtre de l’assistant.

---

## L’assistant

**`⌘K`**, ou **Affichage ▸ Assistant** dans la barre de menus. Une fenêtre s’ouvre par-dessus le
studio, avec un champ, et c’est tout.

Vous y écrivez ce que vous voulez faire, en une phrase ordinaire :

> *Ouvre un nouveau fichier 3D*
> *Cherche un modèle de matière pour de la pierre*
> *Prépare une génération d’image en 1024 par 1024*

L’assistant lit la phrase, choisit une ou plusieurs actions dans le catalogue, et les exécute.
Chaque étape s’affiche dans le fil, avec ce qu’elle a donné.

### Ce que l’assistant peut lire

**Votre phrase, les dix derniers échanges, et l’état du studio.** Il sait quel espace est ouvert,
quel document est devant et s’il porte des modifications non enregistrées, quel modèle est armé
pour cet espace, ce qui y est sélectionné, et ce que la fiche du projet raconte
([chapitre 4](04-projets.md#le-contexte-du-projet)). C’est ce qui lui permet de comprendre
« fais-moi un vélo » comme une génération dans l’espace où vous êtes, plutôt que comme un document
à créer.

**Il ne voit pas vos documents pour autant** : ni vos images, ni leur contenu — il connaît le
*catalogue* des actions et leurs paramètres, et l’état de la fenêtre, pas ce que vos fichiers
contiennent.

Une exception, et elle est explicite : **Décrire le style des références** lit les images de
référence déjà posées sur le formulaire du Générateur. C’est le seul endroit où l’assistant
regarde une image, et il faut l’avoir demandé.

### Choisir qui vous répond

Le sélecteur est **dans la fenêtre de l’assistant**, pas dans les réglages — le moment où l’on veut
un modèle plus solide, c’est au milieu d’une phrase qui n’a pas été comprise. Il liste tout ce qui
peut répondre, groupé par l’endroit où cela tourne :

- **Sur cette machine** — les modèles installés, Ollama compris. Rien ne sort de l’ordinateur.
- **Vos clés** — les services pour lesquels une clé est enregistrée dans *Réglages ▸ Clés API*. Le
  nom exact du modèle se règle à côté du service, dans *Réglages ▸ Modèles d’IA*.
- **Le studio** — le catalogue distant, sur l’un des quatre modèles ci-dessous.

C’est le même choix que *Réglages ▸ Modèles d’IA ▸ Assistant* : le changer ici le change là-bas, et
il vaut pour le projet ouvert dès lors que c’est le projet qui l’avait fixé.

| Modèle du studio | Ce qu’il vaut |
|---|---|
| **Haiku 4.5** *(départ)* | le plus rapide et le moins cher |
| **Sonnet 4.6** | l’équilibre |
| **Opus 4.8** | le plus fiable sur une demande en plusieurs étapes |
| **Gemini 3.5 Flash** | l’alternative rapide |

Le moins cher suffit pour ouvrir un espace ou chercher un modèle. Les autres tiennent mieux une
demande qui enchaîne trois ou quatre actions.

> **Sous *Le studio*, il n’y a ni second compte, ni seconde clé à saisir.** L’assistant réfléchit
> sur un modèle du catalogue distant, avec la connexion que vous avez déjà. C’est aussi pour cette
> raison que **réfléchir se paie** — voir juste en dessous. Un service à vous ou un modèle de cette
> machine ne consomme, lui, aucune unité créative.

### Ce que ça coûte

**Réfléchir consomme des unités créatives.** Pas beaucoup, mais ce n’est pas gratuit, et c’est
distinct de ce que coûtera la génération que l’assistant prépare.

**La fenêtre affiche le cumul de la conversation en cours**, en bas.

**Fermer la fenêtre ne le remet pas à zéro**, et n’efface pas le fil : rouvrir l’assistant retrouve
les deux, là où vous les aviez laissés. Le compteur court **jusqu’à ce que vous quittiez le
studio**.

> **Ce cumul ne compte que la réflexion.** Ce qu’une génération coûte est rapporté ailleurs — la
> barre des tâches et le chapitre [Générer](06-generer.md) s’en chargent. Les deux ne se
> confondent pas, et l’assistant n’en lance aucune sans vous le demander.

### La dictée y fonctionne

Le micro à côté du champ est le même que partout ailleurs, avec les mêmes réglages
([chapitre 14](14-reglages.md#dictée)). Parler à l’assistant plutôt que lui écrire ne change rien
à ce qu’il fait de la phrase.

---

## Le point d’entrée pour un programme extérieur

C’est la seconde porte : **un autre logiciel installé sur votre machine peut conduire le studio
comme vous le feriez**. Un assistant de programmation comme Claude Code, par exemple, ou tout
client parlant le protocole **MCP**.

**Cette porte est fermée au départ, et le reste tant que vous ne l’ouvrez pas.**

### Ce qui la garde

Quatre choses, et il faut les quatre pour qu’une demande passe :

| Le verrou | Ce qu’il empêche |
|---|---|
| **Fermée par défaut** | rien n’écoute sur une installation neuve |
| **Sur cette machine seule** | le point d’entrée n’écoute que `127.0.0.1` : rien du réseau ne l’atteint, ni le Wi-Fi de la maison, ni celui du bureau |
| **Un jeton neuf à chaque démarrage** | une demande sans le jeton du lancement en cours est refusée |
| **Aucune page web** | une demande venue d’un site ouvert dans votre navigateur est refusée sur ce seul motif |

> **Et par-dessus les quatre, le cinquième, qui est vous.** Tout ce qui dépense ou téléverse
> s’affiche à l’écran et attend votre accord, exactement comme si vous l’aviez demandé vous-même.
> Un programme extérieur ne peut pas se le donner à votre place.

### L’ouvrir

**Réglages ▸ Point d’entrée (MCP) ▸ Piloter le studio depuis l’extérieur.** Cochez la case ; le point d’entrée
démarre aussitôt. Décochez-la, il s’arrête et **plus rien n’écoute**.

---

## Brancher Claude Code

C’est le cas le plus courant, et il tient en trois gestes.

### 1. Copier la ligne de connexion

**Réglages ▸ Point d’entrée (MCP) ▸ Commande de connexion ▸ Copier.** Le studio met dans votre
presse-papiers une ligne de cette forme :

```
claude mcp add <nom> -- "/Applications/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio" --mcp-stdio=…
```

**Ni port, ni jeton, ni adresse.** Ce que vous collez désigne **le studio comme un programme à
démarrer**, pas un endroit à joindre. C’est ce qui fait que cette ligne reste vraie à tous les
lancements — voir plus bas.

### 2. Coller dans un terminal

Ouvrez un terminal **dans le dossier du projet où vous travaillez avec Claude Code**, et collez la
ligne. Claude Code connaît désormais le studio.

### 3. Ouvrir la porte

Remontez dans la même rubrique et cochez **Piloter le studio depuis l’extérieur**. Elle dit alors
sur quel port le studio écoute, ce qu’un client peut faire, et ce qui garde la porte.

**Cet ordre n’est pas une exigence** — c’est celui de l’écran, et il n’a de sens que depuis que ce
qui se copie ne porte plus d’adresse : la case peut être cochée avant, après, ou déjà l’être.

**C’est en cochant que les outils apparaissent** : porte fermée, votre client trouve bien le
studio mais s’entend répondre qu’il ne répond pas. Pour vérifier, demandez-lui la liste de ses
serveurs MCP — le studio doit y figurer, connecté.

### Un client qui se configure par un fichier

Tous ne se pilotent pas depuis un terminal. Pour ceux-là, **Bloc de configuration ▸ Copier le
JSON** met dans le presse-papiers le même branchement, dans la forme qu’un fichier de
configuration attend :

```json
{
  "mcpServers": {
    "ia-studio": {
      "command": "/Applications/AI Desktop Studio.app/Contents/MacOS/AI Desktop Studio",
      "args": ["--mcp-stdio=…"]
    }
  }
}
```

Collez-le dans le fichier de configuration MCP de votre client. Comme la commande, il ne porte ni
port ni jeton.

### Il n’y a rien à refaire

**Le port et le jeton changent bien à chaque démarrage du studio** : les deux verrous du milieu
sont intacts, et c’est délibéré — un port fixe et un jeton permanent tiendraient d’une session à
l’autre, et tiendraient aussi pour n’importe quel programme les ayant lus une fois.

**Mais votre client ne les connaît pas.** Il démarre le studio, et c’est ce programme-là qui va
lire l’adresse du lancement en cours — à chaque message qu’il porte, jamais une fois pour toutes.

**La ligne collée une fois vaut donc pour tous les lancements suivants**, y compris ceux où le port
et le jeton sont neufs, c’est-à-dire tous. Un client déjà enregistré sous le même nom se
remplace ; il n’y a rien à supprimer avant.

> **Studio fermé, ou case décochée** : votre client s’entend répondre que le studio ne répond pas,
> plutôt que d’attendre. Rouvrez-le, et il repart — sans que rien ne soit à recoller.

### Ce que vous pouvez lui demander

Une fois branché, Claude Code parle au studio comme vous parleriez à l’assistant, mais depuis
votre projet de code :

> *Ouvre l’espace Modélisation dans le studio et crée un document*
> *Cherche-moi un modèle de skybox nocturne*
> *Liste les générations en cours*
> *Prépare une génération d’image avec ce prompt, mais ne l’envoie pas*
> *Range les rushes de la semaine dans un dossier par jour*
> *Génère une matière de pierre, attends-la, et pose-la dans la scène*
> *Ajoute un calque de texte « Générique » en bas de l’image, en 64 points*
> *Pose une sphère à deux mètres à droite du cube et éclaire-la en chaud*
> *Enregistre une version avec un message qui décrit ce qu’on vient de faire*

**La dernière phrase mérite d’être lue deux fois.** Préparer et envoyer sont **deux actions
distinctes**, et seule la seconde dépense. Un client extérieur peut remplir le formulaire autant
qu’il veut : tant que **Lancer la génération préparée** n’a pas reçu votre accord à l’écran, rien
n’est parti.

---

## Le catalogue

**Quinze familles.** Le tableau ci-dessous dit ce que chacune couvre et ce qu’elle **engage** —
c’est cette dernière colonne qui décide si le studio vous demandera quelque chose. Ni le nombre
d’actions ni la liste exacte ne sont recopiés ici : ils bougent, et **c’est votre client qui les
lit à la source** quand vous lui demandez ses outils, avec le détail de chaque paramètre.

| La famille | Ce qu’elle couvre | Ce qu’elle engage |
|---|---|---|
| **Le studio** | ce qui est ouvert, quel document est devant, ce qui vient de se passer | rien |
| **Les fichiers** | ouvrir un projet, le renommer, lister, chercher, déplacer, copier, renommer, mettre à la corbeille, montrer dans le gestionnaire de fichiers, annuler et refaire le dernier lot | **des fichiers** pour ce qui déplace ou détruit |
| **Les documents** | ouvrir, mettre devant, renommer, fermer, exporter dans le projet | **des fichiers** pour fermer, renommer et exporter |
| **Générer** | lire les entrées d’un modèle, chiffrer, préparer, lancer, attendre, annuler | **des unités créatives** pour lancer, et pour lancer seulement |
| **La bibliothèque** | chercher, lire, étiqueter, légender, retirer des assets, repérer ceux dont le fichier a disparu, extraire les images d’un modèle | **des fichiers** pour retirer, **un serveur** pour retirer aussi de la bibliothèque distante |
| **La bibliothèque distante** | parcourir la vôtre et le flux public, chercher des ressemblances, prévoir, rapatrier, envoyer | **un asset** pour envoyer |
| **L’image** | la pile de calques : ajouter, styler, placer, grouper, fusionner, recadrer, régler un masque, poser et déplacer les repères | rien |
| **Le montage** | Vidéo et Audio : poser un bloc, le déplacer, le rogner, le couper, régler fondus, niveau et vitesse, tenir les pistes. L’export du document sort la **coupe** en OpenTimelineIO, jamais un film — le rendu image par image demande une session que rien d’extérieur ne peut tenir | rien, sauf l’export |
| **Le ciel et la matière** | régler l’image d’un ciel, y placer le soleil, choisir sous quelle projection le regarder, remplir les canaux d’une matière, la remapper, choisir la forme sur laquelle la juger et la rendre | rien |
| **La 3D** | la scène : poser un objet, l’orienter, le tailler, l’éclairer, le peindre, l’habiller de cartes, écrire un texte, tracer un chemin, le rattacher, et la regarder — depuis une face, dans l’une des façons de dessiner, et en prendre une image. Le décor aussi : ce qui éclaire la scène, ce qui est derrière elle, sa brume, son sol, son rendu, et les décors tout prêts | rien |
| **Les personnages** | rendre un modèle animable, ajouter ou retirer un os, lui donner une articulation du standard, poser une poignée qu’il atteint, lister ce qu’il peut jouer, poser un bloc d’animation et le régler, poser et retirer des clés, tenir les canaux, régler durée et cadence | rien |
| **Le contexte du projet** | lire les fiches qui disent ce que le projet raconte, en ajouter une, en réécrire une, l’allumer ou l’éteindre, la supprimer | **des fichiers** pour réécrire le texte d’une fiche et pour en supprimer une — ajouter et éteindre ne détruisent rien |
| **Le versionnage** | lire le dépôt et l’historique, indexer, enregistrer, brancher, remiser, trancher un conflit, rapatrier, publier | **des fichiers** pour ce qui réécrit la copie de travail, **un serveur** pour publier |
| **Les réglages** | lire et changer les réglages, actionner les boutons de la fenêtre, lister les comptes, en activer un, en renommer un | **des fichiers** pour les deux boutons que rien ne reprend |
| **Autour des documents** | la fenêtre, le compte, les mises à jour, les polices, les recettes épinglées, les styles de matière, les panneaux du studio, la dictée, et les trois fenêtres du menu Aide | **des fichiers** pour supprimer un style et pour installer une mise à jour |

**Ce que l’assistant en connaît, lui, tient en onze**, et ce sont celles d’une demande parlée :
lancer une commande, ouvrir un espace, chercher et choisir un modèle, préparer une génération, la
lancer, lister les tâches, retravailler ou traduire un prompt, décrire le style des références, et
refermer la conversation. Les autres se conduisent depuis un programme.

> **Une commande n’atteint que le document qui est devant.** C’est vrai du raccourci clavier comme
> du client extérieur, et c’est la première chose à savoir pour le piloter : demandez-lui d’abord
> l’état du studio, mettez le bon onglet devant, puis agissez.

### Les cinq commandes qui font exception

**Lancer une commande** n’engage rien — sauf quand la commande visée est l’une de ces cinq :

| Commande | Ce qu’elle fait de votre image |
|---|---|
| **Régénérer la zone** | l’aplatit et la téléverse |
| **Détourer** | idem |
| **Agrandir** | idem |
| **Vectoriser** | idem |
| **Étendre** | idem |

Toutes les cinq **téléversent l’image du canevas**, qui devient alors un asset permanent de votre
bibliothèque. Elles ne coûtent aucune unité créative — elles préparent seulement le formulaire —
mais elles laissent quelque chose derrière elles, et c’est ce qui leur vaut de vous être
demandées.

---

## Ce que le studio vous demande, et quand

Trois questions, toutes à l’écran, dans la fenêtre au premier plan.

**Quand une action va dépenser :**

> *Cette action va dépenser 12 unités créatives.*

Le montant est **estimé avant** d’être engagé. Quand le studio ne parvient pas à l’estimer, il le
dit plutôt que d’inventer un chiffre :

> *Cette action va dépenser des unités créatives. Le studio n’a pas pu en estimer le montant, et
> n’en invente pas.*

**Quand une action va téléverser :**

> *Cette action va téléverser une image, qui restera dans votre bibliothèque. Elle ne coûte aucune
> unité créative.*

**Quand une action va toucher à vos fichiers :**

> *Cette action va modifier ce que porte votre projet — des fichiers, ou les assets de sa
> bibliothèque. Elle ne coûte aucune unité créative.*

Celle-ci est délibérément **étroite** : déplacer, renommer, mettre à la corbeille, fermer un
onglet qui porte du travail non enregistré, revenir en arrière sur un fichier suivi par git,
réécrire la dernière version enregistrée. Créer un dossier ou dupliquer un fichier n’enlève rien
à personne et ne vous demande rien — un studio qui demanderait pour ceux-là vous apprendrait à
cliquer **Autoriser** sans lire.

**Étroite ne veut pas dire rattrapable.** L’Explorateur reprend un déplacement, un renommage ou
une mise à la corbeille. Il ne reprend rien de ce qu’un fichier suivi par git n’avait jamais
enregistré, rien d’une version réécrite, et rien d’un asset retiré aussi de la bibliothèque
distante.

**Quand une action va publier hors de cette machine :**

> *Cette action va publier vers un serveur, hors de cette machine. Elle ne coûte aucune unité
> créative, et rien ici ne la rattrape.*

Deux demandes portent ce niveau, et elles méritent d’être nommées : **envoyer une branche vers un
dépôt git distant**, et **retirer un asset en demandant qu’il le soit aussi de la bibliothèque
distante** — l’API n’a ni suppression unitaire ni retour en arrière. Toutes les autres restent au
bord de la machine, y compris rapatrier — lequel réécrit votre copie de travail et vous demande
donc au titre des fichiers.

Dans les quatre cas, deux boutons : **Autoriser** et **Refuser**. Refuser n’exécute rien, et
l’assistant en tient compte pour la suite de sa demande.

> **La question ne se contourne pas.** Ni `Échap`, ni un clic à côté ne la referment : une action
> attend la réponse, et la faire disparaître la laisserait attendre indéfiniment. Il faut
> répondre.

**Vous avez deux minutes.** Passé ce délai la demande est abandonnée, et le programme qui l’avait
formulée reçoit un refus plutôt que d’attendre. C’est le temps de lire « cela va dépenser 12
unités » et de décider — pas un délai réseau.

### Travailler pendant que vous n’êtes pas là

Tant que rien n’est armé, un client qui agit sans personne devant l’écran s’arrête à la première
question. C’est le défaut, et il est délibéré.

Les réglages avancés ouvrent quatre lignes qui changent cela, chacune sous **Piloter le studio
depuis l’extérieur** et sans effet si celui-ci est éteint. Les trois premières laissent passer un
niveau d’engagement sans demander — toucher aux fichiers, téléverser, publier vers un serveur. La
quatrième est un montant en unités créatives : ce qu’un client peut dépenser dans cette fenêtre
avant que le studio se remette à demander. À zéro, chaque dépense vous est demandée.

> **Trois choses à savoir avant d’armer quoi que ce soit.** Une génération dont l’API refuse de
> donner le prix n’est **jamais** lancée sans vous, quel que soit le montant autorisé — un coût
> inconnu ne se plafonne pas. Le compte est tenu par fenêtre et repart de zéro à chaque
> lancement : deux fenêtres ouvertes portent chacune le montant entier. Et **aucun client ne peut
> armer ces quatre lignes lui-même** : elles ne s’écrivent que dans cette fenêtre de réglages,
> parce qu’une autorisation qu’un programme se donne à lui-même n’en est pas une.

---

## Quand ça refuse

Une action refusée dit toujours pourquoi. Les motifs, et ce qu’ils veulent dire :

| Le message | Ce qui s’est passé |
|---|---|
| *Cette commande n’existe pas dans le studio.* | l’identifiant demandé ne correspond à rien |
| *Aucune surface du studio n’était là pour prendre cette commande.* | ouvrez le document ou le panneau auquel elle s’adresse, et redemandez |
| *Le Générateur n’était pas ouvert. Il vient de l’être.* | rien n’a échoué : redemandez la même chose |
| *Le Générateur n’a aucun modèle armé pour l’instant.* | choisissez un modèle avant de préparer |
| *La génération n’est pas partie.* | l’envoi a échoué en aval — rien n’a été dépensé |
| *Les paramètres fournis ne conviennent pas à cette action.* | ce qui a été transmis ne correspond pas aux champs attendus |
| *Le studio ne répond pas.* | la fenêtre n’a pas pu être jointe |
| *Cette action demande un accord, et aucune fenêtre n’était là pour le donner.* | jamais un oui silencieux : sans écran, c’est non |
| *Vous avez refusé cette action.* | c’est vous |
| *Aucune fenêtre du studio n’était au premier plan pour exécuter cette action.* | le studio tourne sans fenêtre devant : ouvrez-en une |
| *La demande est restée à l’écran sans réponse, et a été abandonnée.* | les deux minutes sont passées |
| *Le formulaire ne porte aucune image de référence dont lire le style.* | posez une image sur le formulaire d’abord |
| *Le formulaire a changé depuis l’annonce du coût. Rien n’a été envoyé — redemandez pour obtenir un nouveau chiffre.* | ce qui a été chiffré est ce qui part, jamais autre chose |
| *Ce que vous nommez n’existe pas.* | la demande était bien formée et sa cible est absente — c’est le motif le plus fréquent, et il porte sur un identifiant plutôt que sur des paramètres |
| *Aucun projet n’est ouvert.* | un chemin est relatif à un projet, et il n’y en a pas pour l’être |
| *Un client extérieur ne peut pas faire cela.* | jamais votre refus à vous : armer la délégation ne s’écrit que dans la fenêtre des réglages |
| *Le document au premier plan n’a rien que ceci puisse rendre.* | un ciel vide, une matière sans canal, une scène sans caméra |
| *Cela a été tenté et n’a pas abouti.* | l’activité récente en porte la raison ; ce n’est pas ce qui a été transmis |

Les deux motifs de fenêtre — *aucune fenêtre au premier plan*, *aucune fenêtre pour
donner l’accord* — **ne se rencontrent que depuis un programme extérieur**. L’assistant, lui, est
dans la fenêtre : il y a toujours quelqu’un pour être demandé.

---

## Ce que ce chemin ne fait pas

- **Il ne rend jamais une clé API ni un secret.** Il peut dire quels comptes existent, lequel est
  actif, et renommer l’étiquette de l’un d’eux — jamais ce qu’ils contiennent, et il ne peut ni en
  ajouter ni en supprimer. Ce qui part vers le fournisseur part comme d’habitude, avec vos identifiants,
  depuis votre machine.
- **Il ne s’autorise rien lui-même.** Les quatre lignes qui laissent passer un engagement sans
  question ne s’écrivent que dans la fenêtre des réglages : un client qui demande à les changer
  s’entend répondre non.
- **Il ne dépense jamais de lui-même.** Une seule action dépense — lancer la génération préparée —
  et elle demande, avec son estimation.
- **Il ne survit pas à la fermeture.** Le studio fermé, le point d’entrée n’existe plus, et le
  jeton du lancement avec lui. Ce que votre client garde n’est pas une adresse mais une façon de
  démarrer le studio : rien de ce qu’il détient n’ouvre quoi que ce soit tant que le studio ne
  tourne pas, la case cochée.

> **Il lit et modifie en revanche le dossier de votre projet**, ce qui n’était pas le cas des
> premières versions de ce point d’entrée. C’est ce qui permet à un assistant de programmation de
> travailler avec vous plutôt qu’à côté de vous — et c’est pourquoi tout ce qui déplace ou détruit
> vous est demandé à l’écran.

---

## À côté de ce chapitre

- **[Générer](06-generer.md)** — ce que l’assistant prépare, et ce que coûte de l’envoyer.
- **[Tous les réglages](14-reglages.md)** — la case et le bouton, dans leur section.
- **[Tous les raccourcis](15-raccourcis.md)** — `⌘K` parmi les autres.
- **[Quand ça coince](16-depannage.md)** — quand la porte ne s’ouvre pas.

---

[← Comment faire pour…](19-recettes.md) · [Sommaire](../guide-utilisateur.md)
