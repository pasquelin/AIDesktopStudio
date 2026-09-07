# 16. Quand ça coince

[← Tous les raccourcis](15-raccourcis.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Glossaire →](17-glossaire.md)

Chaque message que le studio peut afficher, ce qu’il veut dire, et quoi faire.

---

## Le premier endroit où regarder : le journal

En bas à droite, à côté des générations, une icône ouvre le **journal d’activité**. Il retient ce
que le studio a fait et ce qu’il a raté, même quand vous regardiez ailleurs.

Quand quelque chose ne s’est pas passé comme prévu, c’est là qu’il faut aller **avant** de
chercher plus loin : il nomme l’objet en cause et dit ce qui a échoué.

| Ce que le journal peut raconter | Sujet |
|---|---|
| « La génération « … » a échoué », « Génération « … » annulée », « 2 assets générés dans Image et Modélisation » | Génération |
| « Impossible d’importer « … » », « « … » est illisible » | Import |
| « Impossible d’envoyer « … » », « Les tags de « … » n’ont pas rejoint la bibliothèque », « L’API de génération a refusé une requête », « Le fichier n’a pas pu être affiché » | Bibliothèque |
| « L’enregistrement du document a échoué », « Un calque n’a pas pu être chargé », « L’export de la scène a échoué » | Document |
| « Ce dossier n’est pas un projet AI Desktop Studio », « Le projet n’a pas pu être créé dans ce dossier », « Ce fichier n’a pas pu être ouvert par le système » | Projet |
| « Une partie de l’interface n’a pas pu s’afficher », « L’agencement enregistré d’un espace était illisible » | Interface |

Filtrez par **niveau** — information, avertissement, échec — ou par **sujet** : chacun est un
menu dont le bouton dit ce qu'il retient. Le détail est au
[chapitre 3](03-la-fenetre.md#le-journal-à-côté).

Le volet se referme de trois façons : un clic à côté, `Échap`, ou le passage à une autre
application. Recliquer l’icône marche aussi. C’est vrai de la barre des générations à sa gauche.

> **Une génération réussie dit dans quel dossier elle a atterri** — utile dès qu’un modèle
> produit autre chose que ce que l’espace où vous êtes montre.

**Un échec fait aussi apparaître une bulle** dans le coin, qui ne s’efface pas toute seule. Si
vous ne l’avez pas vue, le compteur rouge de la ligne d’état la garde en mémoire jusqu’à ce que
vous ouvriez le journal.

---

## D’abord : la plupart des messages ne sont pas des erreurs

Le studio écrit beaucoup de phrases dans des panneaux vides. **Ce ne sont pas des pannes** : ce
sont des panneaux qui vous disent ce qu’il leur manque pour se remplir.

| Ce que vous lisez | Ce que ça veut dire |
|---|---|
| « Aucun projet ouvert » | il faut créer ou ouvrir un projet (`⌘N` puis un clic, ou `⌘O`) |
| « Aucun document ouvert. Générez ou ouvrez un asset pour commencer. » | le centre de la fenêtre attend un premier onglet |
| « Aucun asset. Générez quelque chose pour commencer. » | l’Explorateur du projet est encore vide |
| « Aucune génération en cours. » | rien ne se génère en ce moment — la liste des générations est vide |
| « Ouvrez un projet pour générer. » | le formulaire attend un projet où déposer le résultat |
| « Ouvrez un projet pour voir ses assets. » | idem, pour l’Explorateur |
| « Ouvrez une scène pour voir son contenu. » | le panneau **Scène** attend une scène ouverte |
| « Ouvrez une scène pour voir ses mailles. » / « Ouvrez une scène pour voir ses lumières. » | idem, pour les deux panneaux voisins |
| « Aucun modèle choisi » / « Rien n’est facturé tant qu’aucun modèle n’est choisi. » | aucun modèle n’a été validé — Scenario n’est pas utilisé tant que vous n’en choisissez pas un |
| « Ce modèle n’attend aucun paramètre. » | c’est normal : certains modèles ne prennent qu’un prompt |
| « Aucun résultat pour ce filtre. » | votre recherche ne trouve rien ; élargissez-la |
| « Aucun réglage ne correspond à cette recherche. » | idem, dans la fenêtre des réglages |
| « Aucune action n’utilise cette touche : elle est libre. » | vous pouvez lui attribuer un raccourci |
| « Ce document n’est plus ouvert. » | l’onglet a été fermé entre-temps |
| « Aucun modèle dans cet espace. » | le catalogue est bien là, mais aucun modèle ne correspond à cet espace |
| « Ouvrez une image pour voir ses calques. » | le panneau Calques attend un document image |
| « Aucune maille. Ajoutez-en une pour commencer. » | la scène 3D est vide — le bouton **+** en pose une |
| « Ouvrez une scène pour voir ses mailles. » | le panneau Mailles attend une scène 3D |
| « Aucune lumière. La scène restera noire. » | il faut au moins une lumière pour voir quelque chose |
| « Ouvrez une scène pour voir ses lumières. » | idem, pour le panneau Lumières |
| « Ouvrez une scène pour inspecter ce qu’elle contient. » | l’Inspecteur attend une scène 3D |
| « Sélectionnez un objet pour voir ses propriétés. » | la scène est là, rien n’est sélectionné |
| « Sélectionnez un élément pour voir ses propriétés. » | la même chose, hors de la 3D |
| « Sélectionnez un clip pour le voir ici. » | le moniteur Source attend une sélection |
| « Aucune séquence ouverte. Créez-en une pour monter. » | la timeline attend un document séquence — bouton **+** |

Aucune de ces phrases ne demande d’action de dépannage. Le reste du chapitre parle des vraies
pannes.

---

## Les messages de connexion

Ils apparaissent en rouge sous les champs de la section **Compte** des réglages, ou dans le
panneau **Modèles** quand il ne peut rien afficher.

### « Aucun identifiant enregistré. »

**Ce que ça veut dire.** Aucun compte n’est enregistré, ou celui qui l’est a été supprimé.

**Quoi faire.** Réglages (`⌘,`) → **Compte** → donnez un nom, collez votre clé et votre secret →
**Ajouter un compte**. Ils se prennent sur le tableau de bord de votre fournisseur.

### « Le trousseau n’a pas rendu vos comptes. Réessayez après l’avoir déverrouillé — rien n’a été modifié. »

**Ce que ça veut dire.** Le coffre-fort de votre système est verrouillé, et le studio n’a pas pu
relire la liste de vos comptes.

**Ce qui compte le plus dans cette phrase, c’est la fin.** Le studio a **refusé d’écrire** plutôt
que d’écrire à moitié : sans pouvoir relire la liste existante, enregistrer un compte l’aurait
remplacée par lui seul. Vos autres comptes sont intacts.

**Quoi faire.** Déverrouillez votre trousseau — sur macOS, ouvrez « Trousseaux d’accès » et
authentifiez-vous ; sur Linux, déverrouillez le trousseau du bureau — puis recommencez.

### « Renseignez vos identifiants API pour voir vos modèles. »

La même chose, dite par le panneau **Modèles**. Le catalogue vient du service : sans compte
branché, il n’y a rien à lister.

### « Clé ou secret API invalide. »

**Ce que ça veut dire.** Le service a répondu que ce couple ne lui dit rien.

**Quoi faire, dans l’ordre :**

1. **vérifiez qu’il n’y a pas d’espace** collé au début ou à la fin de ce que vous avez copié.
   C’est de très loin la cause la plus fréquente ;
2. **vérifiez que vous n’avez pas inversé** la clé et le secret ;
3. **regénérez le couple** sur le tableau de bord de votre fournisseur et recollez-le.

> **Ce message ne se répare pas tout seul.** Le studio ne réessaie **jamais** une clé invalide,
> quel que soit le réglage « Tentatives maximum » : réessayer ne la corrigerait pas, cela ne ferait
> que retarder ce message.

### « Cette clé API n’a pas les droits requis. »

**Ce que ça veut dire.** La clé est valide, mais elle n’a pas le droit de faire ce que vous venez
de demander — ou votre plan ne le couvre pas.

**Quoi faire.** Vérifiez sur le tableau de bord de votre fournisseur les permissions de la
clé et l’état de votre abonnement. Une clé restreinte à la lecture, par exemple, peut lister des
modèles sans pouvoir lancer une génération.

### « Impossible de joindre le service de génération. Vérifiez votre connexion. »

**Ce que ça veut dire.** La demande n’est jamais arrivée. Ce n’est pas un refus du service, c’est
le trajet qui a échoué.

**Quoi faire :**

1. vérifiez que vous avez bien Internet ;
2. si vous êtes derrière un pare-feu d’entreprise ou un VPN, essayez sans ;
3. réessayez : le studio le fait déjà tout seul (voir plus bas), mais une coupure longue épuise
   ses tentatives.

### « Le service de génération est momentanément indisponible. »

**Ce que ça veut dire.** Le service a répondu, mais pour dire qu’il a un problème de son côté.
Cela ne vient pas de vous.

**Quoi faire.** Attendre. Le studio réessaie tout seul, en espaçant ses tentatives. Si cela dure,
allez voir la page d’état de votre fournisseur, ou son support.

### « Ressource introuvable. »

**Ce que ça veut dire.** Le studio a demandé quelque chose de précis — un modèle, un asset — qui
n’existe plus, ou qui n’est pas accessible à votre compte.

**Quoi faire.** Le cas courant est un modèle retiré du catalogue depuis que vous l’aviez choisi.
Rafraîchissez le panneau **Modèles** et prenez-en un autre.

### « Une erreur inattendue est survenue. »

**Ce que ça veut dire.** Quelque chose a échoué d’une façon que le studio n’a pas su nommer.

**Quoi faire.** Réessayez une fois. Si cela recommence, ouvrez le **journal d’activité** : la
ligne de l’échec y porte, en petit, le nom technique de ce qui a échoué et le message d’erreur.
C’est cela qu’il faut recopier dans une demande d’aide.

> **Aucun message d’erreur du service ne vous est montré tel quel.** Le studio les traduit tous en
> une de ces phrases. Ce n’est pas de la paresse : un message d’erreur brut contient la requête qui
> l’a produite, donc l’en-tête d’authentification, donc **votre clé API**. Elle ne doit jamais
> arriver jusqu’à l’écran, où elle finirait dans une capture d’écran envoyée à un forum.

---

## Quand une partie de l’écran tombe en panne

Deux messages qui ne viennent pas du service, mais du studio lui-même. Ils s’affichent **à la
place** de ce qui aurait dû être dessiné, avec un bouton **Réessayer**.

### « Ce panneau a rencontré une erreur. »

**Ce que ça veut dire.** Un seul panneau a échoué à se dessiner. Le reste de la fenêtre — vos
documents, vos autres panneaux, vos générations en cours — **continue de fonctionner
normalement**.

**Quoi faire.** Cliquez **Réessayer** : le panneau se reconstruit. Neuf fois sur dix il repart.

**Ce que vous ne perdez pas** : rien. Un panneau est une vue sur des données qui vivent ailleurs.

### « L’application a rencontré une erreur. »

**Ce que ça veut dire.** La même chose, un cran au-dessus : c’est la fenêtre entière qui n’a pas
pu se dessiner.

**Quoi faire.** **Réessayer** d’abord. Si l’écran revient au même état, fermez la fenêtre et
rouvrez-la.

> **Ces deux écrans ne disent pas ce qui a échoué.**
>
> **Mais la panne laisse une trace, elle** — et le journal est le seul endroit où la lire. Il en
> garde une ligne sous le sujet **Interface** — « Une partie de l’interface n’a pas pu
> s’afficher » — suivie, en petit, du nom technique de la zone fautive et du message d’erreur.
> C’est ce qu’il faut recopier dans un signalement.
>
> **Un projet ouvert la garde** : elle est écrite dans le projet et se relit plus tard. Sans
> projet ouvert, elle s’affiche mais ne survit pas à la session. Et **elle n’est écrite qu’une
> fois par zone fautive** : si **Réessayer** échoue à nouveau au même endroit, aucune ligne ne
> s’ajoute.
>
> **Ce qui est enregistré sur le disque est en sécurité.** Un plantage d’affichage ne touche ni
> vos assets, ni les documents déjà écrits.

---

## Les messages de génération

Ils apparaissent sur la ligne de la tâche, dans la liste qu’ouvre le résumé des générations, en bas
à droite de la fenêtre.

### « Trop de requêtes. Nouvelle tentative en cours… »

**Ce que ça veut dire.** Vous en avez demandé plus que ce que le service accepte sur un court
laps de temps.

**Ce que le studio fait tout seul.** Il attend, puis réessaie — en doublant l’attente à chaque
fois : 1 seconde, puis 2, puis 4, puis 8. C’est ce qu’on appelle une **temporisation
exponentielle**, et c’est la bonne façon de se comporter : réessayer tout de suite, en boucle,
aggrave l’encombrement au lieu de le résoudre.

**Ce que vous pouvez faire.** Si cela revient souvent, baissez **Générations simultanées** dans
les réglages. Trois est la valeur de départ ; deux suffit largement pour travailler
confortablement.

> **Ce message est devenu rare.** Le studio borne désormais son **débit** d’appels, et pas
> seulement le nombre de générations en parallèle : c’étaient deux choses différentes, et compter
> les secondes ne suffisait pas. Le voir souvent malgré cela veut dire qu’un autre outil se sert
> de la même clé en même temps.

### « La génération a échoué. »

**Ce que ça veut dire.** Le service a bien reçu la demande, l’a traitée, et a rendu un échec. Ce
n’est ni un problème de réseau, ni un problème de compte.

**Les causes ordinaires :**

- **un paramètre refusé** — une dimension que ce modèle n’accepte pas, une valeur hors de ses
  bornes ;
- **un prompt refusé** — le service applique ses propres règles de contenu ;
- **une image d’entrée inutilisable** — trop grande, trop petite, dans un format que le modèle ne
  prend pas.

**Quoi faire.** Repartez du formulaire : remettez les paramètres à leurs valeurs par défaut (le
petit bouton de restauration à côté de chacun), et relancez. Si cela passe, réintroduisez vos
valeurs une par une pour trouver celle qui bloquait.

> **Ce message n’est jamais réessayé automatiquement.** Une demande refusée le sera à l’identique
> la fois d’après : seul un changement de votre part peut la faire passer.

### « Impossible d’enregistrer le résultat sur le disque. »

**Ce que ça veut dire.** La génération a **réussi** — l’image existe — mais le studio n’a pas pu
l’écrire dans votre projet.

**Les causes ordinaires :**

- **le disque est plein** ;
- **le dossier du projet a été déplacé, renommé ou supprimé** pendant que la tâche travaillait ;
- **le dossier est en lecture seule**, ou sur un disque réseau qui s’est démonté ;
- **le projet est dans un dossier synchronisé** (iCloud, Dropbox, OneDrive) qui a repris la main
  sur le fichier au mauvais moment.

**Quoi faire.** Libérez de la place, vérifiez que le dossier du projet est bien là où il était, et
relancez la génération.

> **Un projet dans un dossier synchronisé est une source d’ennuis.** Ces services déplacent et
> ré-écrivent les fichiers pendant que vous travaillez. Préférez un dossier local, et sauvegardez
> autrement.

### Quelles erreurs sont réessayées, et lesquelles ne le sont pas

Le studio ne réessaie que **ce qu’un nouvel essai peut réparer**.

| Message | Réessayé ? |
|---|---|
| Trop de requêtes | **oui** |
| Service indisponible | **oui** |
| Impossible de joindre le service de génération | **oui** |
| Clé ou secret invalide | non |
| Droits insuffisants | non |
| Ressource introuvable | non |
| La génération a échoué | non |
| Enregistrement impossible | non |
| Erreur inattendue | non |

Le nombre de tentatives est réglable : Réglages → **Génération** → **Tentatives maximum**
(4 par défaut, 0 à 10).

---

## Les messages d’import

Ils apparaissent pendant qu’un fichier que vous avez glissé dans le projet est préparé.

### Les étapes normales

| Ce que vous lisez | Ce qui se passe |
|---|---|
| **En attente…** | le fichier fait la queue |
| **Analyse…** | le studio lit sa durée, sa taille, son format |
| **Empreinte…** | il calcule sa signature, pour reconnaître un doublon |
| **Proxy…** | il fabrique la copie allégée qui rend la navigation fluide |
| **Waveform…** | il dessine la bande son |
| **Prêt** | c’est fini, le fichier est utilisable |

Le bouton **Interrompre la préparation** arrête le travail en cours. **Retirer de la liste**
enlève la ligne une fois qu’elle est finie.

### « Préparation vidéo indisponible : ni copie allégée ni forme d’onde. »

**Où ça s’affiche.** Sur un triangle d’alerte ambre, dans la barre de titre de l’Explorateur à
assets : survolez-le ou atteignez-le au clavier. Le même état est écrit en toutes lettres, et en
permanence, dans **Réglages ▸ Médias**.

**Ce que ça veut dire.** Aucun ffmpeg utilisable n’a été trouvé — pas même celui que
l’application transporte.

**Ce qui marche quand même.** L’import lui-même. Votre fichier est dans le projet, il se lit, il
se monte.

**Ce qui manque.** La navigation dans la timeline saccade sur les gros fichiers (pas de copie
allégée), et les pistes audio n’affichent pas leurs vagues.

**Quoi faire.** Le studio livre son propre ffmpeg sur les trois systèmes, donc ce message ne
devrait pas apparaître sur une application installée normalement. S’il apparaît quand même :

1. **vous avez lancé le studio depuis son code source** — exécutez `pnpm ffmpeg:fetch`, qui
   télécharge les binaires manquants ;
2. **le binaire livré est là, mais il ne démarre pas** — c’est lui qui est retenu, et le chemin
   que vous indiqueriez dans Réglages → **Médias** → **Chemin de ffmpeg** ne le remplace pas :
   ce champ ne sert que si le binaire livré est absent. Réparez ou remplacez celui-là ;
3. **sinon**, s’en passer reste parfaitement viable sur des fichiers courts ou légers.

#### Le cas déroutant : ffmpeg est là, et le studio dit qu’il n’y est pas

Vous tapez `which ffmpeg` dans un terminal, il répond un chemin. Le fichier existe. Et le studio
continue d’afficher que la préparation vidéo est indisponible.

**Ce n’est pas une contradiction.** Le studio ne se contente pas de *trouver* le programme : il
**lance** celui qu’il a retenu, avec `ffmpeg -version`, et n’annonce la préparation vidéo que s’il
répond. Un ffmpeg installé par Homebrew dont une bibliothèque a disparu — après une mise à jour de
macOS, ou un `brew cleanup` un peu large — existe toujours en tant que fichier, mais ne démarre
plus.

**Attention à ce que « retenu » veut dire** : le studio prend le **premier candidat présent** —
livré, puis celui des réglages, puis le `PATH` — et ne redescend pas la liste. Le `which ffmpeg`
que vous venez de taper n’est donc consulté que si les deux autres manquent.

**Pour le vérifier vous-même**, dans un terminal :

```bash
ffmpeg -version
```

Si cette commande affiche un numéro de version, ffmpeg va bien. Si elle se plaint d’une
bibliothèque manquante, c’est le diagnostic.

**Pour le réparer**, sur macOS :

```bash
brew reinstall ffmpeg
```

### « Déjà dans le projet »

**Ce que ça veut dire.** Ce fichier a la même empreinte qu’un asset déjà présent. Le studio
refuse d’en garder deux copies.

**Ce n’est pas une erreur.** Cherchez-le dans l’**Explorateur** : il y est déjà.

### « Fichier illisible »

**Ce que ça veut dire.** Le studio n’arrive pas à ouvrir ce fichier.

**Les causes ordinaires :** un fichier tronqué (téléchargement interrompu), une extension qui ment
sur le contenu, un format exotique, ou un fichier protégé par des droits numériques.

**Quoi faire.** Ouvrez-le dans un autre lecteur pour vérifier qu’il est sain. S’il l’est,
convertissez-le dans un format courant (`.mp4`, `.wav`, `.png`).

> **À ne pas confondre** avec « Ce clip n’a pas pu être affiché », plus bas : là, l’import a
> réussi, et c’est l’affichage dans un moniteur qui échoue.

### « Échec » / « Interrompu »

**Échec** : la préparation s’est arrêtée sur un problème. **Interrompu** : vous l’avez arrêtée
vous-même. Dans les deux cas, le fichier peut être réimporté.

### « Cet asset n’a pas pu être ouvert »

**Ce que ça veut dire.** Vous avez double-cliqué un asset, et il n’est pas arrivé. Ce n’est ni un
bug, ni un fichier abîmé. **La ligne du journal dit laquelle des quatre causes**, en gris à côté
du message.

| Ce que dit le détail | Ce qui s’est passé | Quoi faire |
|---|---|---|
| `no destination` | **la cause ordinaire** : aucun espace ne sait ouvrir ce type d’asset | le clic droit liste ce que cet asset sait devenir |
| `not on disk` | l’asset est dans votre bibliothèque distante, pas encore sur ce disque | le récupérer dans le projet — voir [Assets](07-assets.md) |
| `no project` | aucun projet n’est ouvert, et un document est un fichier : il lui faut un dossier | ouvrir ou créer un projet |
| `no document` | le document n’a pas pu être créé | vérifier que le dossier du projet est accessible en écriture |

> **Le double-clic ouvre un onglet s’il le faut.** Il réutilise celui de l’asset quand il est déjà
> ouvert, sinon il en crée un : vous n’avez aucune destination à préparer. Le clic droit, lui,
> liste tout ce que cet asset sait devenir sans rien tenter.

---

## Les messages de la dictée

### « La dictée a besoin d'un modèle de reconnaissance, à télécharger une seule fois. »

Ce n'est pas une panne : c'est la première fois. Le modèle pèse 640 Mo et n'est jamais rapatrié
sans qu'on le demande. Cliquez, et continuez à travailler pendant le téléchargement — il ne gêne
rien.

### « L’accès au micro a été refusé. »

Vous avez répondu non à la demande du système, et **macOS ne redemande plus**. Le bouton
« Ouvrir les réglages du système » vous emmène à l'endroit exact où l'autoriser. Il faut ensuite
redémarrer le studio.

### « Le modèle téléchargé est abîmé ; il a été supprimé. »

Le fichier est arrivé incomplet ou corrompu — connexion coupée, proxy qui réécrit, disque plein.
Le studio l'a effacé plutôt que de charger un modèle en lequel il n'a pas confiance. Relancez le
téléchargement.

### « Le téléchargement du modèle a échoué. »

Le réseau a lâché. Ce qui était arrivé est conservé : la tentative suivante **reprend là où elle
s'était arrêtée**, elle ne recommence pas les 640 Mo.

### « La reconnaissance vocale s’est arrêtée. »

Le moteur a quitté en cours de route. Il redémarre tout seul à la dictée suivante, jusqu'à trois
fois ; au-delà, le studio cesse d'essayer plutôt que de relancer un processus qui meurt à chaque
phrase. Le détail va dans la console technique (**Réglages ▸ Avancé ▸ Outils de développement**),
pas à l'écran : il nomme un chemin de fichier, ce qui n'aide personne devant l'écran mais dit tout
à qui la lit.

### « Aucun micro disponible. »

Aucune entrée audio n'a répondu. Un casque USB débranché en cours de dictée donne ce message :
rebranchez-le, ou laissez le studio prendre le micro intégré.

### Le texte ne s'écrit nulle part

La dictée écrit **à l'endroit du curseur**, dans le champ où il se trouve. Si le curseur n'est
dans aucun champ de texte, il n'y a nulle part où écrire, et rien ne se passe : cliquez d'abord
dans le champ.

### Le niveau ne bouge pas quand vous parlez

Le micro n'entend rien. Vérifiez lequel votre ordinateur utilise (Réglages Système ▸ Son ▸
Entrée), et que ce n'est pas une entrée muette — certaines interfaces audio en exposent.

---

## Les messages du montage

### « Ce clip n’a pas pu être affiché : son média est introuvable, ou son format n’est pas lisible ici. »

**Ce que ça veut dire.** Le clip est bien là, sur sa piste, mais le moniteur n’arrive pas à en
tirer une image. Il le dit à la place de l’image, au lieu de rester noir.

**Les causes ordinaires :** un `.exr`, un `.tif` ou un `.tiff` — ces trois-là s’importent comme
images mais aucun moniteur ne les affiche — ou un fichier vidéo tronqué.

**Quoi faire.** Convertissez le fichier en `.png` (image) ou en `.mp4` (vidéo) avec un autre
outil, puis réimportez-le : **le studio ne convertit rien tout seul.** Le clip reste sur sa
piste et garde sa durée ; seule son image manque.

---

## Quand le studio se pilote depuis l’extérieur

Ce qui suit ne concerne que le point d’entrée pour un programme extérieur, décrit au
[chapitre 20](20-piloter-de-l-exterieur.md). Les refus d’action y sont tous listés ; ici, ce sont
les ennuis de branchement.

### « Mon client répond que le studio ne répond pas »

**Ce que ça veut dire.** Votre client a bien démarré le point d’entrée, et celui-ci n’a trouvé
aucune adresse à joindre : le studio n’est pas lancé, ou la case ne l’est pas.

**Quoi faire.** Ouvrez le studio, et vérifiez **Réglages ▸ Point d’entrée (MCP)** — la rubrique dit
sur quel port il écoute, ou qu’il ne le fait pas. Redemandez ensuite à votre client : **il n’y a
rien à recoller**, ce que vous lui aviez donné ne portait ni port ni jeton.

> **Si la ligne date d’une installation déplacée**, c’est l’autre cas : elle nomme un chemin vers
> l’application, et ce chemin a changé. **Commande de connexion ▸ Copier** en donne une à jour.

### « La case est cochée et rien n’écoute quand même »

**Ce que ça veut dire.** Le point d’entrée n’a pas réussi à démarrer — un autre programme occupait
la place, ou le système a refusé. **La case reste cochée**, parce qu’elle décrit ce que vous avez
demandé, pas ce qui a abouti.

**Quoi faire. Décochez-la, puis recochez-la.** C’est ce qui redemande un démarrage — et il en faut
un : après un échec, recocher une case déjà cochée ne relance rien. Un redémarrage du studio a le
même effet.

### « Une action refuse en disant qu’aucune fenêtre n’est au premier plan »

**Ce que ça veut dire.** Le studio tourne, mais aucune de ses fenêtres n’est là pour agir — ni pour
vous poser la question qu’une action coûteuse exige.

**Quoi faire.** Ouvrez une fenêtre du studio, et redemandez. **Ce refus n’est jamais un oui
silencieux** : rien n’a été exécuté, rien n’a été dépensé.

### « Mon client attend, puis abandonne »

**Ce que ça veut dire.** Une question est restée à l’écran sans réponse. Le studio l’abandonne au
bout de **deux minutes** et répond un refus, plutôt que de laisser le client attendre
indéfiniment.

**Quoi faire.** Regardez la fenêtre du studio avant de relancer : la demande y attendait un
**Autoriser** ou un **Refuser**.

---

## Les ennuis qui n’affichent aucun message

Ceux-là sont les plus déroutants : rien ne s’écrit, mais quelque chose ne va pas.

### « Je n’entends rien pendant la lecture »

Il n’y a pas de message : le son se tait sans rien dire. Sept causes, de la plus banale à la
plus technique :

1. **La piste est muette, ou une autre est en solo.** Solo l’emporte sur tout : dès qu’une piste
   passe en solo, les autres se taisent. Voir [l’en-tête d’une piste](10-espace-video.md).
2. **Vous déplacez la tête de lecture à la main.** Le son ne sort qu’en lecture ; le scrub est muet.
3. **Le clip est sur une piste image.** Une vidéo posée là se voit sans s’entendre : seules les
   pistes de son sont jouées.
4. **Vous regardez le moniteur Source sur une vidéo.** Il joue un clip son sélectionné, mais
   pas le son d’une vidéo — celui-là n’est encore joué nulle part.
5. **Le gain du clip est au plancher.** L’inspecteur d’un clip le donne en décibels.
6. **Le média a bougé depuis l’import.** Le studio ne le redemande pas soixante fois par seconde :
   il abandonne le clip pour la session. Réimportez le fichier.
7. **Le tout premier son tarde.** Le fichier est décodé entier avant d’être joué ; sur une longue
   nappe, la première seconde peut être sautée plutôt que jouée en retard.

### « Je peins et rien ne se dépose »

**Regardez le curseur avant de glisser.** S’il est un sens interdit, l’outil vous dit qu’il ne
peut rien faire là où il est, et il vous le dit **avant** le geste.

| Ce qui bloque | Comment le lever |
|---|---|
| Un **groupe** est armé dans la pile | choisissez un calque, pas le groupe qui le contient |
| Le calque actif est un **calque de réglage** | il n’a pas de pixels à peindre : prenez le calque du dessous |
| Ses **pixels sont verrouillés** | déverrouillez-le dans le panneau Calques |
| Sa **position est verrouillée** | même chose, pour l’outil Déplacement |

Si le curseur est normal et que rien n’apparaît quand même, c’est ailleurs : une **sélection**
est peut-être posée hors de la zone où vous peignez — le pinceau, la gomme et le pot n’agissent
qu’à l’intérieur. `⌘D` l’abandonne.


### « ⌘Z ne fait rien »

**La cause, presque toujours.** L’action que vous voulez défaire appartient à **un autre onglet**.

Chaque document a sa propre pile d’annulation. `⌘Z` recule dans l’onglet **actif**, pas dans le
dernier geste que vous avez fait dans le studio.

**Quoi faire.** Activez l’onglet concerné, puis annulez.

### « Le canvas est tout noir après avoir détaché un panneau »

**La cause.** Une vue 3D ne survit pas au déplacement d’une fenêtre à l’autre : la carte graphique
lui reprend son contexte de dessin.

**Quoi faire.** Fermez l’onglet et rouvrez-le. La vue se reconstruit à partir de la scène — vous
ne perdez pas votre travail, seulement l’affichage.

### « L’interface se fige quelques secondes pendant une recherche »

**La cause.** Une recherche dans un très gros catalogue.

**Quoi faire.** Attendez ; cela se débloque. Pour l’éviter, tapez plus de lettres avant de lancer
la recherche, ou restreignez avec les filtres.

### « La lecture saccade sans raison »

**Deux causes possibles :**

1. **il n’y a pas de proxy** — voir le message ffmpeg plus haut. C’est le cas le plus fréquent sur
   une vidéo lourde ;
2. **la machine est chargée** — une génération en cours consomme le réseau, et une scène 3D
   ouverte dans un autre onglet consomme la carte graphique.

**Quoi faire.** Fermez les onglets dont vous ne vous servez pas, et vérifiez que ffmpeg est
disponible.

### « Les animations de l’interface saccadent »

Réglages → **Apparence** → cochez **Limiter les animations**. Les panneaux apparaissent d’un coup
au lieu de glisser, ce qui est bien plus agréable qu’un glissement haché.

### « J’ai perdu mon travail en fermant un onglet »

**Ce n’est plus censé pouvoir arriver.** Tous les types de documents s’enregistrent, et fermer un
onglet dont le travail n’est pas écrit pose la question avant de fermer : *Enregistrer*, *Ne pas
enregistrer*, *Annuler*.

**Si la question ne s’est pas posée**, c’est que le document était propre — pas de point (`•`) à
côté de son nom. Deux cas connus :

- **le document n’a jamais été enregistré et n’a rien reçu** : il n’y avait rien à garder ;
- **son fichier n’avait pas pu être lu à l’ouverture.** Le studio refuse alors délibérément de
  l’enregistrer, pour ne pas écrire un document vide par-dessus celui qu’il n’a pas su lire — le
  fichier est la seule copie. La raison est dans le journal d’activité.

**Ce qui ne revient jamais** : l’**historique d’annulation**. Rouvrir un document, c’est repartir
sans `⌘Z`. La liste complète est dans
[Ce qui n’existe pas encore](18-limites.md).

### « J’ai supprimé un document par erreur »

**Rien ne le rend.** *Supprimer le document…* du menu contextuel d’onglet retire le fichier du
dossier du projet, et le studio n’a pas de corbeille. C’est pour cela que la confirmation a
*Annuler* pour bouton par défaut.

Si le dossier de projet est dans une sauvegarde système (Time Machine, un dossier synchronisé),
c’est là qu’il faut aller le chercher.

### « Les panneaux sont dans tous les sens et je ne m’y retrouve plus »

Menu **Affichage** → **Réinitialiser la disposition**. Les panneaux reprennent leur place
d’origine. **Votre travail n’est pas touché** — seul l’agencement de la fenêtre l’est.

### « Le studio ne se souvient pas de mes réglages »

**La cause probable.** Vous avez fermé la fenêtre des réglages sans **Appliquer**, et choisi
« Ne pas appliquer » à la question posée.

**Quoi faire.** Recommencez, et terminez par **Appliquer** ou **OK**.

### « Rien ne se passe quand je clique sur Générer »

Trois vérifications, dans cet ordre :

1. **un projet est-il ouvert ?** Sinon le formulaire affiche « Ouvrez un projet pour générer. » ;
2. **un modèle est-il choisi ?** Sinon le panneau affiche « Aucun modèle choisi » ;
3. **êtes-vous connecté ?** Le point du sélecteur de compte, en haut à droite, doit être vert.

---

## Aller plus loin

### Le journal

**Le journal d’activité, celui de la ligne d’état, est la seule trace lisible depuis
l’application** — et c’est lui qu’il faut joindre quand vous demandez de l’aide. Chaque échec y
laisse une ligne, avec son heure. **Quand le studio a un détail technique à donner**, il l’écrit en
petit sous le message : c’est le cas des pannes d’affichage, des refus de l’API et des échecs
d’envoi vers la bibliothèque. Les échecs de projet, eux, n’en portent pas — le chemin que vous avez
choisi dans un dialogue n’apprendrait rien de plus. Un projet ouvert garde la ligne : elle est
écrite dans le projet et se relit plus tard.

> **Deux réglages de la section Avancé n’aident pas ici, et il vaut mieux le savoir avant
> d’essayer.** **Détail du journal** règle ce que le studio écrit dans *son* journal interne, qui
> n’est lisible que depuis un terminal — pas dans la version que vous avez installée, et il ne
> change rien à ce que montre le panneau Activité. **Outils de développement** n’ouvre rien non
> plus : la console est refusée hors version de développement, délibérément — voir
> [le chapitre 14](14-reglages.md#outils-de-développement).

### Le fichier de réglages

Réglages → **Avancé** → **Fichier de réglages** → **Afficher dans le dossier**. Il s’ouvre dans votre gestionnaire
de fichiers.

**Vous pouvez le partager sans crainte pour vos identifiants** : ils y sont chiffrés par le
trousseau de votre session, et illisibles ailleurs. Mais vous pouvez aussi préférer ne pas
l’envoyer du tout — il contient tous vos réglages, dont les chemins de vos dossiers.

### Repartir de zéro

Réglages → **Avancé** → **Tout réinitialiser**. Remet tous les réglages dans l’état d’une
installation neuve.

**Vos projets ne sont pas touchés.** Mais l’opération est définitive : il n’y a pas d’annulation.

---

## Le tableau de survie

| Symptôme | Première chose à essayer |
|---|---|
| Le catalogue de modèles est vide | **Réglages ▸ Modèles d’IA ▸ Clés API**, puis se connecter |
| « Clé ou secret API invalide. » | chercher un espace en trop dans ce qui a été collé |
| « Trop de requêtes » à répétition | baisser **Générations simultanées** à 2 |
| « La génération « … » a échoué » | remettre les paramètres du modèle par défaut, relancer |
| « L’enregistrement du document a échoué » | vérifier la place disque et que le dossier du projet existe |
| Timeline qui saccade | vérifier que la préparation vidéo est disponible, ou raccourcir la vidéo |
| Pas de vagues sur la piste audio | idem |
| « Préparation vidéo indisponible » alors que `which ffmpeg` en trouve un | `ffmpeg -version` : le binaire existe mais ne démarre plus |
| « Le trousseau n’a pas rendu vos comptes » | déverrouiller le trousseau, puis recommencer — rien n’a été perdu |
| « Cet asset n’a pas pu être ouvert » | lire le détail en gris : il dit laquelle des quatre causes |
| « Ce panneau a rencontré une erreur » | cliquer **Réessayer** — le reste de la fenêtre va bien |
| `⌘Z` sans effet | activer le bon onglet |
| Canvas 3D noir | fermer et rouvrir l’onglet |
| Panneaux en désordre | Affichage → Réinitialiser la disposition |
| Un espace est revenu tout seul à sa disposition par défaut | son agencement enregistré était illisible : il a été jeté plutôt que gardé — le journal le dit sous **Interface**. Réorganisez-le, le nouvel agencement est réenregistré |
| Travail perdu à la fermeture d’un onglet | la fermeture demande avant de jeter : répondre **Enregistrer**. **Ne pas enregistrer** est définitif — [voir les limites](18-limites.md) |

---

[← Tous les raccourcis](15-raccourcis.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Glossaire →](17-glossaire.md)
