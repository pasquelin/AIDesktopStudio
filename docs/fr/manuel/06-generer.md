# 6. Générer

[← Trouver un modèle](05-modeles.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Les assets →](07-assets.md)

C’est le cœur du studio : vous décrivez, il fabrique.

---

## Le principe, en trois temps

**1. Vous remplissez un formulaire et vous appuyez sur Générer.**

**2. La demande part.** Elle ne revient pas tout de suite. Elle devient une **tâche**, visible
dans le panneau du même nom, avec une barre de progression.

**3. Le résultat arrive** dans la **Bibliothèque** de votre compte, puis sur votre disque.

Entre les deux, vous pouvez continuer à travailler, changer d’espace, ouvrir un autre document.
Rien ne bloque.

---

## Le formulaire

Choisissez un modèle dans le panneau **Modèles**, à gauche, puis ouvrez le panneau
**Génération** : son icône vient d’apparaître dans le rail, et le panneau prend la place des
Modèles dans la même moitié de colonne.

**Le formulaire n’est pas écrit à la main.** Il est construit à partir de ce que le modèle
choisi déclare savoir recevoir. Deux modèles n’ont donc pas le même formulaire, et un modèle
publié demain aura, lui aussi, le sien — sans mise à jour du studio.

> Si un modèle propose un réglage que le studio ne sait pas représenter, il apparaît quand même,
> en saisie libre. Un formulaire ne disparaît jamais parce qu’un champ est inconnu.

### Les types de champs que vous rencontrerez

| Ce que vous voyez | Ce que c’est | Ce qu’on y met |
|---|---|---|
| Une **grande zone de texte** | le *prompt* | votre description |
| Une **ligne de texte** | un texte court | un mot, un nom, une valeur |
| Un **nombre** | une quantité | souvent avec un minimum et un maximum |
| Une **case à cocher** | oui ou non | — |
| Un **menu déroulant** | une liste de choix imposés | un format, un style, une taille |
| Un **cadre vide** « Déposez une image… » | une image d’entrée — référence, masque, image à éditer | glissez-y un asset du projet, ou collez son identifiant |
| Un **carré de couleur** | une couleur | un clic ouvre le sélecteur du système |
| Un **nombre avec un dé** 🎲 | la *graine* — voir plus bas | un nombre, ou un clic sur le dé |

> **Une image posée sur un formulaire part chez le fournisseur au moment de générer.** Le modèle
> tourne sur les serveurs du fournisseur : il ne peut lire que ce que la bibliothèque du compte
> contient. Le studio envoie donc l’asset du projet, garde le lien entre les deux, et n’envoie
> rien la fois suivante. Vous la retrouvez dans le panneau **Bibliothèque**, parmi ce que la
> bibliothèque du compte détient.
>
> Une image modifiée depuis son envoi repart : sans quoi la génération tournerait sur une
> version que vous ne voyez plus.

Les champs sont **groupés** quand le modèle les groupe, et certains **n’apparaissent que si un
autre a la bonne valeur** — inutile de proposer la force d’un effet quand l’effet est désactivé.

Un champ obligatoire non rempli **empêche l’envoi** : le formulaire le signale plutôt que de
laisser partir une demande que le serveur refuserait.

---

## Le prompt

C’est le champ qui compte. Quelques principes, dans l’ordre d’importance.

### Écrivez en anglais si vous le pouvez

La grande majorité des modèles ont été entraînés sur des descriptions en anglais. Un prompt
français fonctionne parfois, mais moins bien. La grammaire compte peu, les mots comptent beaucoup.

**Vous n’avez pas besoin d’un traducteur ailleurs** : le bouton **Traduire en anglais**, au-dessus
du champ, s’en charge. Voir la section suivante.

### Décrivez ce qui est là

Les modèles comprennent mal la négation. « Sans voiture » a de bonnes chances de faire
apparaître une voiture. Décrivez plutôt la scène telle que vous la voulez : « une rue vide au
petit matin ».

### Allez du sujet au détail

Une structure qui marche presque toujours :

```
[le sujet], [ce qu'il fait ou comment il est], [le décor], [la lumière], [le style]
```

Par exemple :

```
a small red lighthouse, standing on a rocky cliff, calm grey sea behind,
soft morning light, photographic
```

### Soyez concret

| Mou | Précis |
|---|---|
| « quelque chose de joli » | « une clairière au coucher du soleil, brume basse » |
| « un personnage » | « une vieille femme en manteau de laine, de trois quarts » |
| « des couleurs chaudes » | « ocre, rouge brique, or pâle » |

### Un mot par idée, pas dix

Empiler quarante adjectifs ne rend pas l’image quarante fois meilleure. Au-delà d’une trentaine
de mots, la plupart des modèles diluent. Mieux vaut une phrase juste que trois phrases vagues.

---

## Dicter au lieu de taper

Un bouton en forme de micro se tient **dans le coin inférieur droit du champ**. Il apparaît sur
**tous** les champs de texte long du formulaire, pas seulement sur le prompt : un prompt négatif
se dicte aussi bien.

**Tout se passe sur votre ordinateur.** Rien de ce que vous dites n’est envoyé nulle part, il
n'y a pas de clé à saisir, et la dictée fonctionne sans connexion.

### La première fois

La reconnaissance a besoin d'un modèle, qui pèse 640 Mo et se télécharge **une seule fois**. Le
studio ne le rapatrie jamais tout seul : il vous le propose, vous décidez. Pendant le
téléchargement, l'application reste entièrement utilisable — vous pouvez générer, dessiner,
monter, comme si de rien n'était.

Votre ordinateur vous demandera aussi l'autorisation d'utiliser le micro. Si vous refusez, un
lien vous emmène directement dans les réglages du système pour revenir dessus : une fois refusé,
macOS ne redemande plus.

### Dicter

Deux façons, au choix dans les réglages :

- **En maintenant ⌥D** (le réglage d'origine). On appuie, on parle, on relâche : le texte
  s'écrit. C'est le plus sûr — le micro n'est jamais laissé ouvert par oubli.
- **En basculant** : une pression démarre, la suivante arrête. La main se repose, ce qui vaut
  mieux pour les longues dictées.

Le raccourci fonctionne **depuis le champ où vous êtes en train d'écrire**, ce qui est tout
l'intérêt, et le texte se pose **à l'endroit du curseur** — pas à la fin. Ce que vous aviez déjà
tapé n'est jamais écrasé.

Cela vaut pour tous les champs du studio, pas seulement le prompt : la recherche d'assets, le
renommage d'un calque, un nom de document.

**Le micro d'un champ suit la même règle**, et c'est pour cela qu'il garde le curseur chez lui :
l'appuyer ne sort pas du champ, la phrase s'y pose comme si vous l'aviez tapée.

### Ce que vous voyez pendant

Pendant que vous parlez, une phrase grisée s'affiche **en bas du champ, à gauche du micro** :
c'est ce que la reconnaissance croit entendre, et elle se corrige au fil des mots. Elle n'entre
pas dans le champ. Quand vous marquez un silence — ou que vous relâchez la touche — la phrase est
arrêtée, ponctuée, et **elle seule** est écrite dans le champ.

Un petit indicateur à côté du micro monte et descend avec votre voix. S'il ne bouge pas, le
micro n'entend rien : vérifiez lequel votre ordinateur utilise.

### Ce qu'il faut savoir

- **Parlez normalement**, comme à quelqu'un. La ponctuation est ajoutée toute seule, il est
  inutile de dire « virgule ».
- **Une phrase à la fois.** Un silence d'une demi-seconde suffit à la clore. Si vos phrases se
  coupent en deux parce que vous réfléchissez en parlant, allongez ce délai dans les réglages.
- **Le français fonctionne**, et vingt-quatre autres langues européennes, reconnues toutes
  seules — vous n'avez rien à annoncer. Mais souvenez-vous que les modèles d'image lisent
  l'anglais : dictez en français, puis **Traduire en anglais** juste en dessous.
- **La mémoire est rendue** après dix minutes sans dicter. La fois suivante demande quelques
  secondes de rechargement, et c'est tout.

---

## Se faire aider pour écrire le prompt

Trois boutons se tiennent au-dessus du champ. Ils ne sont pas là sur tous les formulaires :
**c’est le modèle qui désigne le champ à assister**, et le studio suit. Un modèle qui ne le
signale pas n’affiche pas ces boutons — le studio n’essaie pas de deviner lequel de ses champs
est un prompt.

| Bouton | Ce qu’il fait |
|---|---|
| **Proposer des variantes** | fait réécrire votre brouillon par le modèle qui va le lire |
| **Traduire en anglais** | réécrit votre texte dans la langue sur laquelle les modèles ont appris |
| **Décrire le style des références** | envoie les images posées sur le formulaire si elles ne sont pas déjà dans la bibliothèque, puis écrit ce qu’elles ont en commun |

Pendant le travail, « Rédaction des variantes… » s’affiche et les trois boutons sont inactifs.

### Ce qu’une variante propose, et comment on la prend

Chaque variante apparaît dans son propre encadré, avec jusqu’à trois choses :

- **le texte réécrit**, celui que vous adopterez ;
- **la raison** de la réécriture, en italique, quand le modèle en donne une ;
- **les réglages** qu’elle suggère en plus du texte — un ratio, un nombre d’étapes — listés en
  clair sous la proposition.

Deux boutons, et la différence entre eux compte :

| Bouton | Effet |
|---|---|
| **Utiliser le texte** | remplace le prompt, **et rien d’autre** |
| **Texte + réglages** | remplace le prompt **et** applique les réglages proposés |

**Le second n’apparaît que s’il y a des réglages à appliquer.** Séparer les deux gestes est
délibéré : écraser un ratio que vous venez de choisir n’est pas une décision qu’une suggestion
prend toute seule.

> Les réglages proposés sont **filtrés contre ce que le modèle déclare accepter** avant d’être
> appliqués. Une valeur hors bornes est écartée, jamais ramenée de force dans l’intervalle.

### Quand ces demandes n’ont rien à faire

| La demande | Ce qui arrive |
|---|---|
| **Traduire un prompt en anglais**, sur un texte déjà anglais | **rien n’est refusé** : le texte revient tel quel, et la réponse porte la langue reconnue |
| **Décrire le style des références**, sans image sur le formulaire | « Le formulaire ne porte aucune image de référence dont lire le style. » |

Ni l’un ni l’autre n’est une panne, et rien n’est dépensé.

> **Ces demandes-là n’entrent pas dans la file** : elles ne s’affichent pas dans la ligne d’état,
> et il n’y a rien à annuler. **Proposer des variantes ne coûte aucune unité créative** — c’est
> mesuré, pas supposé. Pour la traduction et la lecture de style, le studio ne mesure rien :
> traitez-les comme des appels ordinaires.
>
> **Une exception à leur rapidité : le premier clic sur « Décrire le style des références ».** Une
> image que la bibliothèque ne connaît pas encore doit y monter avant que l’API puisse la
> regarder, et ce transfert est un fichier entier — sur un gros PNG, l’attente se compte en
> secondes. Le badge de l’image passe alors de **Local seulement** à **Synchronisé**, et les clics
> suivants sur la même image sont immédiats. C’est voulu : le geste est explicite, donc l’envoi
> est attendu. **Rien de tel ne se produit pendant que vous tapez** — l’estimation de coût
> n’envoie jamais d’image.

---

## Le contexte du projet, dans le formulaire

Si le projet ouvert porte un contexte, le panneau le montre au-dessus du formulaire, tel qu'il
partira, avec une case cochée :

```
☑ Appliquer le contexte du projet
┌────────────────────────────────────────┐
│ Project context —                      │
│ Univers: Moyen Âge, XIIIᵉ siècle…      │
│ Direction artistique: peinture à…      │
└────────────────────────────────────────┘
```

**Décocher la case laisse le contexte de côté pour ce tir-là**, sans aller éteindre une fiche dans
le panneau Contexte. La case reste comme vous l'avez laissée tant que le panneau est ouvert.

Le prix affiché sous le bouton **Générer** tient compte du contexte : ce qui est chiffré est ce qui
sera envoyé.

Le bloc n'apparaît pas quand il n'y aurait rien à dire — aucune fiche allumée, ou un modèle sans
champ de description. Ce que le contexte contient, comment il s'écrit et où il est rangé sont au
chapitre [Projets](04-projets.md#le-contexte-du-projet).

---

## Les réglages qu’on retrouve souvent

Ils ne sont pas les mêmes partout, mais ces noms reviennent :

| Nom courant | Ce que ça fait | Conseil |
|---|---|---|
| **prompt** | votre description | voir ci-dessus |
| **Prompt négatif** | ce que vous voulez éviter | court : « blurry, text, watermark » |
| **Graine** (*seed*) | le point de départ du hasard | voir ci-dessous |
| **steps** | le nombre d’étapes de calcul | plus haut = plus long, pas forcément mieux |
| **Guidage**, **Échelle de guidage** (*guidance*, *cfg*) | à quel point le modèle obéit au prompt | trop haut, l’image devient dure et saturée |
| **Largeur** / **Hauteur** | les dimensions | souvent contraintes à des multiples de 8 ou 64 |
| **Nombre d’images** | combien d’images d’un coup | chacune consomme du crédit |
| **Intensité** (*strength*) | à quel point une image de départ est transformée | 0 = inchangée, 1 = méconnaissable |

> **Pourquoi certains noms sont en français et d’autres non.** Ces noms sont écrits par le modèle,
> donc en anglais, et le studio les traduit avec son propre dictionnaire. Ce qu’il ne traduit pas,
> il ne le traduit **nulle part** : `prompt`, `sampler`, `scheduler`, `LoRA`, `checkpoint`,
> `clip skip`, `denoising strength` — sept mots que ni une surface du studio ni le
> [glossaire](17-glossaire.md) n’a jamais nommés en français. Un nom qu’il ne connaît pas encore —
> `steps` en est un — reste en anglais plutôt que de disparaître.

### La graine (*seed*)

Un nombre qui fixe le hasard.

**Deux générations avec le même prompt, le même modèle et la même graine donnent la même
image.** Changez la graine, vous obtenez une variante.

C’est ce qui rend une image **reproductible**. Vous avez obtenu quelque chose de presque bien ?
Gardez la graine, ajustez le prompt : vous explorez autour du même résultat au lieu de repartir
de zéro.

Le **bouton dé** 🎲 à côté du champ tire une nouvelle graine au hasard.

---

## Générer

Le bouton **Générer**, en bas du formulaire.

> **Pas de formulaire du tout ?** Le panneau demande un projet avant d’en dessiner un : il
> affiche « Ouvrez un projet pour générer. » et les deux boutons qui en ouvrent ou en créent un.
> Un résultat doit atterrir quelque part, et une génération lancée sans projet ne se collecte
> nulle part.

### Le prix, avant de payer

Le bouton porte une estimation : **`~12 UC`**, à côté du mot Générer. C’est ce que la génération
coûterait si vous appuyiez maintenant.

Le chiffre suit le formulaire. Changez la taille, le nombre d’images, le modèle : il se remet à
jour tout seul, une fois que vous avez cessé de taper. Il ne se demande pas tant qu’un champ
obligatoire est vide — sans quoi il n’y aurait aucun prix à donner.

> **Demander le prix ne coûte rien et ne génère rien.** Le studio envoie une demande *à blanc* :
> l’API la chiffre et s’arrête là. Aucune unité créative n’est dépensée, aucun asset n’apparaît.

**Pas de chiffre sur le bouton ?** Trois cas se ressemblent à l’écran, et aucun n’est un
problème : rien n’a encore été demandé, l’API n’a pas voulu chiffrer ce modèle, ou la demande
n’est pas passée. Un prix est une courtoisie ; son absence n’empêche jamais de générer.

> **Une image de référence n’est pas comptée dans l’estimation.** Le prix se demande à chaque
> frappe, et chiffrer une image voudrait dire l’envoyer à chaque fois. Le formulaire est donc
> chiffré sans elle, alors que l’API, elle, la facture : sur un modèle qui lit une référence,
> **le chiffre annoncé est plus bas que ce que vous paierez**.

> **C’est une estimation, pas une facture.** Ce que vous avez réellement dépensé se lit après
> coup, sur la ligne de la génération, et dans **Aide ▸ Consommation…**.

---

## Suivre ses générations

Elles vivent **dans la ligne d’état**, en bas à droite de la fenêtre — pas dans un panneau.

C’est délibéré. Une génération est plusieurs minutes d’attente que vous passez ailleurs : elle doit
se lire depuis n’importe quel espace de travail, et un panneau ne peut être qu’à un endroit. Là,
elle ne coûte aucune place.

### Le résumé

```
3 générations  ▓▓▓▓▓░░░░░  45 %  ⌃
```

| Élément | Ce qu’il dit |
|---|---|
| **« 3 générations »** | combien travaillent en ce moment |
| **La barre** | leur avancement moyen |
| **Le pourcentage** | le même chiffre, en clair |
| **Le chevron** | un clic ouvre le détail |

**Quand plus rien ne travaille, le résumé disparaît.** Sauf s’il y a eu un échec : « 2 échecs »
reste affiché, parce qu’un échec qui s’effacerait avec la dernière tâche en cours est un échec que
personne n’aurait lu.

### Le détail

Un clic ouvre la liste au-dessus de la ligne d’état. Une ligne par génération, avec le nom du
modèle et son état.

| État | Ce qui se passe |
|---|---|
| **En file** | la demande attend son tour |
| **En cours** | le modèle travaille — la barre avance |
| **Terminée** | c’est fini, le résultat est arrivé dans vos assets |
| **Échouée** | quelque chose n’a pas marché — la ligne dit quoi |
| **Annulée** | vous l’avez arrêtée |

Le bouton **Annuler la tâche** arrête ce qui n’est pas encore terminé.

**Sous la barre, la ligne dit ce que la génération a coûté** — `3 UC` — ou, si elle a échoué,
pourquoi. Jamais les deux : une génération ratée n’a pas de prix à annoncer.

> **Une génération reprise affiche son prix dès que le studio redemande où elle en est** — le
> chiffre voyage avec la tâche, pas seulement avec la demande. Tant qu’il n’est pas revenu, la
> ligne ne dit rien : mieux vaut se taire qu’annoncer un chiffre faux.

### La file d’attente

Le studio ne lance pas tout d’un coup. Il en fait tourner **trois à la fois** par défaut, et met
le reste en file.

Ce nombre se règle : **Réglages ▸ Génération ▸ Générations simultanées**, de 1 à 16.

> **Augmenter ce nombre n’accélère pas le service.** Cela rend seulement plus probable que
> le fournisseur refuse vos demandes en trop. La file existe justement pour étaler une rafale plutôt
> que de la faire rejeter. Trois est un bon équilibre.

### Les reprises automatiques

Quand une demande échoue à cause d’une coupure réseau ou d’un serveur occupé, le studio
**réessaie tout seul**, en attendant un peu plus longtemps à chaque tentative.

Le nombre de tentatives se règle : **Réglages ▸ Génération ▸ Tentatives maximum**, de 0 à 10.
Quatre par défaut.

> **Une clé API invalide n’est jamais réessayée.** Réessayer ne la corrigerait pas. Le studio
> distingue ce qui vaut la peine d’être retenté de ce qui ne le vaut pas.

### Fermer le studio n’annule pas une génération

**Une génération lancée continue chez le fournisseur, que le studio soit ouvert ou non.** Ce qui manquait
jusqu’ici, c’est qu’il sache la retrouver au retour : c’est fait. En quittant, il note les
demandes encore en cours ; au lancement suivant, il les reprend là où elles en sont et leur
résultat rejoint vos assets comme si de rien n’était.

Trois précisions qui décident de ce que vous verrez :

- **la reprise est par projet.** Rouvrez le projet d’où partait la demande, et elle réapparaît
  dans la ligne d’état. Un autre projet ne montre pas les tâches du premier, et ne les perd pas
  non plus ;
- **la reprise est par compte.** Une demande est réinterrogée avec la clé qui l’a lancée — une
  autre clé recevrait une fin de non-recevoir, et aucune reprise ne répare cela ;
- **au-delà d’une semaine, une demande oubliée est balayée.** C’est assez long pour l’entraînement
  d’un modèle, qui dure des heures, et assez court pour qu’un projet abandonné en pleine
  génération ne traîne pas ses notes indéfiniment.

**Une annulation, elle, arrête vraiment la demande** — chez le fournisseur, pas seulement dans
l’affichage.

### Changer de compte n’interrompt pas une génération en cours

**Une tâche finit sur le compte qui l’a lancée.** Elle retient sa clé au moment où vous appuyez sur
Générer, et la garde jusqu’au bout — y compris pour déposer le résultat dans vos assets.

Vous pouvez donc lancer une vidéo de dix minutes, basculer sur un autre compte pour aller chercher
un modèle, et la première continue tranquillement.

> Ce qui change, en revanche, c’est **le catalogue** : passer d’un compte à l’autre vide les
> modèles et les assets distants du précédent. C’est voulu — ce sont deux bibliothèques
> différentes, et les mélanger vous ferait choisir un modèle auquel votre clé n’a pas accès.

---

## Quand le résultat arrive

La ligne passe à **Terminée**, et l’asset apparaît :

- dans la **Bibliothèque** de votre compte, d’où vous pouvez le télécharger ;
- sur votre disque, dans `Images/`, `Video/`, `Models/`… selon son type — ou dans `Materials/`
  quand c’est une image qui sert une matière — tant que vous ne l’avez pas rangé ailleurs.

**Ce que vous pouvez en faire ensuite dépend de son type**, et c’est là que le studio surprend le
plus souvent :

| Le résultat est… | Ce qui est possible aujourd’hui |
|---|---|
| une **image** | la peindre dans un document **image**, la reprendre comme départ d’une autre génération, ou s’en servir comme **ciel** ou comme **couleur de base** d’une matière |
| une **vidéo** ou un **son** | le poser sur une **timeline** (espace Vidéo), ou l’éditer (espace Audio) |
| un **panorama** | le poser dans un document **ciel** (espace Skyboxes) |
| un **objet 3D** | l’ouvrir dans une **scène** (espace 3D), qui naît avec lui dedans |

**Rappel du geste**, parce qu’il déroute : le double-clic **ouvre l’asset dans un onglet à lui**,
dans l’espace qui édite son type, sans regarder ce que vous avez devant vous. Aucun document
préalable n’est donc nécessaire. Pour l’envoyer dans un onglet **déjà ouvert**, c’est le clic droit
ou le glisser-déposer. Voir [Les assets](07-assets.md).

> **Une image générée se retouche dans l’espace Image** : double-cliquez-la, ou glissez-la sur la
> toile d’un document image déjà ouvert — elle y devient un calque. `⌘S` enregistre ce document,
> calques compris, et `⇧⌘E` en sort un PNG. Voir [Espace Image](08-espace-image.md).

<!-- CAPTURE : le panneau Génération avec le formulaire d’un modèle, et la ligne d’état en
     dessous avec une tâche en cours. Vers ../../images/generate.png -->

---

## Régénérer avec les mêmes réglages

Sélectionnez un asset dans l’Explorateur, et regardez l’**Inspecteur**, à droite. S’il connaît la
génération qui l’a produit, il affiche son modèle, son prompt et sa graine — et propose
**Régénérer**.

Un clic remplit le formulaire de génération avec ces valeurs. À vous d’en changer une seule et
de relancer, ce qui est la façon la plus rapide d’explorer une piste.

> Les valeurs restent dans le formulaire jusqu’à ce qu’un autre « Régénérer » les remplace. Cela
> se lit comme « les derniers réglages utilisés ».

---

## Les erreurs, et ce qu’elles veulent dire

| Message | Cause | Quoi faire |
|---|---|---|
| **Aucun identifiant enregistré.** | aucune clé API | **Réglages ▸ Modèles d’IA ▸ Clés API** |
| **Clé ou secret API invalide.** | une des deux chaînes est fausse | vérifier, souvent un espace en trop |
| **Cette clé API n’a pas les droits requis.** | la clé existe mais ne peut pas faire cela | vérifier votre plan chez votre fournisseur |
| **Trop de requêtes. Nouvelle tentative en cours…** | vous avez dépassé le débit autorisé | rien, le studio réessaie tout seul |
| **Le service de génération est momentanément indisponible.** | panne côté serveur | réessayer plus tard |
| **Impossible de joindre le service de génération. Vérifiez votre connexion.** | votre connexion internet | vérifier le réseau |
| **La génération a échoué.** | le modèle a refusé la demande | souvent un paramètre hors limites, ou un prompt refusé |
| **Impossible d’enregistrer le résultat sur le disque.** | le dossier du projet n’est plus accessible | disque plein, projet déplacé, droits en écriture |
| **Valeur invalide.** | un champ du formulaire | le champ concerné est signalé |

Le chapitre [Quand ça coince](16-depannage.md) reprend ces cas en détail.

---

[← Trouver un modèle](05-modeles.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : Les assets →](07-assets.md)
