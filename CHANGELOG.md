# Journal des versions

Format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation
[semver](https://semver.org/lang/fr/).

**Le tag fait foi**, et `package.json` porte le même numéro sans le `v`. La section d'une version
est extraite telle quelle par le job `release` et **devient le corps de la release GitHub** — une
version taguée sans sa section ici fait échouer la publication, délibérément. La procédure est
dans [`docs/ci/RELEASE.md`](docs/ci/RELEASE.md), la règle d'extraction dans
`src/main/releaseNotes.ts`.

Conséquence sur l'écriture : **dans une section de version, les liens sont absolus.** Une page de
release ne résout pas les chemins relatifs du dépôt, et ces liens-là sont les premiers qu'un
lecteur ouvre. Le préambule que voici n'est jamais publié et s'autorise donc le relatif.

## [2.0.0] — 2026-09-07

**Le studio s'appelle AI Desktop Studio, et il fabrique des mondes.** Un terrain se sculpte au
pinceau, se peint en quatre matières et se sème de végétation ; un personnage rigué joue un graphe
d'états ; une scène se joue à la manette et s'exporte en jeu autonome. Le tout sous un nom neuf, un
site neuf, et un moteur d'IA qui tourne sur la machine.

> **⚠️ Le renommage est un cutover : rien ne migre.** `IA Studio` devient `AI Desktop Studio`
> jusque dans ses identifiants techniques — `appId`, dossier des réglages, protocole
> `ai-desktop-studio://`. Quatre conséquences, toutes assumées :
>
> - **La 1.0.0 installée ne se met pas à jour toute seule.** L'`appId` a changé : la 2.0.0
>   s'installe **à côté** d'elle. Désinstaller l'ancienne à la main.
> - **Les réglages et les clés API ne suivent pas.** Ils vivaient sous `IA Studio`, et l'entrée de
>   trousseau « IA Studio Safe Storage » devient orpheline. Ressaisir ses identifiants API une
>   fois, dans Réglages.
> - **Un projet de la 1.0.0 s'ouvre toujours** — ses documents n'ont pas changé de format. Seul son
>   dossier `.ia-studio/` n'est plus lu : le renommer en `.ai-desktop-studio/` rend la mémoire de
>   l'assistant et la sauvegarde des métadonnées d'items.
> - **Les dossiers d'un projet d'avant perdent leur rôle.** Ce qui fait qu'un dossier EST celui
>   des images ou des scripts est un fichier caché qu'il porte, et il a changé de nom :
>   `.ia-studio-role` devient `.ai-desktop-studio-role`. Sans lui, le dossier perd sa couleur, son
>   emblème, son infobulle et le rôle qui y range un import — le studio le remarque de nouveau dès
>   qu'il écrit dedans, ce qui rend les rôles un par un. Pour les rendre d'un coup :
>
>   ```bash
>   find <vos projets> -name .ia-studio-role -exec sh -c \
>     'mv "$1" "$(dirname "$1")/.ai-desktop-studio-role"' _ {} \;
>   ```
> - **Les adresses internes `ia-studio://` ne répondent plus.** Le studio sert ses assets sous
>   `ai-desktop-studio://`.

> **Les installeurs ne sont toujours pas signés.** Ni certificat Apple, ni certificat Windows n'est
> provisionné à ce jour
> ([ADR-04](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/ci/adr/ADR-04-strategie-de-signature.md)) :
> macOS opposera Gatekeeper, Windows affichera SmartScreen. L'auto-update vérifie le condensat du
> manifeste — il garantit qu'un téléchargement n'a pas été corrompu, pas qu'il vient de nous.

### Ajouté

**Un panneau Monde, et le terrain se sculpte.** Le relief se travaille au pinceau dans le viewport
— élever, creuser, lisser, aplanir — avec son intensité, son adoucissement de bord, des masques
peints texel par texel et des masques de hauteur et de pente. Il se découpe en chunks de 64 texels
calculés dans un worker, s'annule chunk par chunk, et porte une pile de calques de retouche qui
gardent chaque passe séparée. Une heightmap EXR peut lui servir de base. La physique suit : sous
les pieds, un relief devient un heightfield Jolt plutôt qu'un cube.

**Le sol se peint, la végétation pousse.** Quatre matières se mélangent au pinceau, canal par
canal, et la peinture persiste en PNG. Le Scatter sème de vrais modèles cellule par cellule en
maillages instanciés, avec paliers de densité selon la distance, capsules de collision, et un
masque dérivé du sol peint.

**Une scène s'exporte en jeu autonome.** Un compilateur compile le monde par delta, déduplique son
contenu, regroupe et fusionne ce qui est statique, partitionne l'espace et ne dessine que ce
qu'une caméra atteint. Le jeu exporté paie ce que l'éditeur paie — mêmes ombres, même culling —
et une recette WebGL le vérifie de bout en bout. L'optimisation au bake s'interrompt.

**Le jeu se joue à la manette.** Des cartes de contrôle éditables (`.input.json`), leurs
préférences, leur zone morte, et des scripts qui pilotent un corps au lieu de le téléporter.

**Le personnage a son onglet et son graphe d'animation.** L'onglet Modèle ouvre les six formats de
maillage et donne le squelette, les points d'attache, le poids des formes, les textures extraites
et redevenues éditables, la capture et l'export — sans jamais toucher à une scène. Un graphe
d'états (`.anim.json`) fait jouer au personnage ce qu'il est en train de faire. Les animations se
rangent par dossier, portent leur vignette, et se transfèrent d'un personnage à l'autre par un
atelier qui préserve la hauteur et les repères d'armature.

**Un moteur d'IA tourne sur la machine.** Un interpréteur Python embarqué, un écran de bienvenue
qui télécharge les modèles, l'auto-rig Make-It-Animatable et sa qualité réglable, et une recherche
d'action sémantique locale.

**Le viewport se conduit comme les logiciels d'à côté** : schémas de navigation Unity, Unreal,
Blender, Maya et Roblox, rectangle de sélection, accords de dolly, pavé numérique et gestes
tactiles.

**Un mode pixel art** dans l'espace Image : une cellule, une grille, et des pixels qui sortent
nets.

**Le studio se pilote de l'extérieur par 310 actions** — 222 à la 1.0.0 — l'animation, les cartes
de contrôle, l'optimisation du monde et les vues de fichier ayant rejoint le catalogue.

### Modifié

**Le studio s'appelle AI Desktop Studio** — voir l'encadré en tête de section.

**Tout import 3D devient un `.glb`.** Six formats entrent, dont le Collada et le BVH, et repartent
en glTF binaire ; l'original est gardé sous `.sources`. Le `.gltf` reste seul à ouvrir une scène.

**Le châssis à docks est devenu une bibliothèque**, le studio ne gardant que ses moitiés d'usine.

**⌘W ferme une vue de fichier** sans jeter ses modifications, et le dernier onglet ne ferme plus
la fenêtre.

**Un projet ou un fichier se crée depuis n'importe où**, les arbres replient leurs descendants, la
scène gagne ses filtres, et toutes les fenêtres se tiennent sur le même gris.

**Le rail de la 3D ne montre que ce qui est actionnable.** Un outil que rien ne peut recevoir y
disparaît au lieu d'être grisé — ils étaient une vingtaine à attendre une sélection. Le menu natif
les nomme tous à tout moment, et le clic droit offre ceux que la situation permet. Les barres qui
RÉPONDENT à un état, elles, gardent leur grisage : Appliquer et Annuler un recadrage ne sont dans
aucun menu.

**Le site quitte GitHub Pages pour une seule adresse** :
[www.aidesktopstudio.com](https://www.aidesktopstudio.com/).

### Corrigé

- Le picking d'une grande scène coûtait à chaque clic ce qu'il coûte sur toute la scène, et perdait
  la sélection sur les corps groupés.
- Une annulation emportait la sculpture encore en vol ; un glisser de pinceau annulait ses propres
  disques au lieu de les enfiler.
- Le regard partagé d'un personnage suivait la caméra de celui qui le conduisait.
- Les touches de vol redressaient la caméra toutes seules.
- Le miroir et la course de la peinture de sol ne tombaient pas où le pinceau était.
- Une scène rechargée oubliait son heightmap, et un `.exr` du catalogue ouvrait un onglet Image.
- Le regroupement statique se reconstruisait à chaque frame : 78 % de moins.
- Le thread UI payait la boucle du disque pendant une sculpture.
- « Nouveau projet » pouvait ne rien faire, sans un mot : le dossier choisi, le sélecteur refermé,
  et le studio immobile. Deux portes de sortie refusaient sans avoir posé de question — une vue de
  fichier disparue, un enregistrement qui se dérobe — et le disent désormais.
- Le studio ouvre les fichiers que le système lui envoie.

### Limites connues

- **Le manuel ne décrit pas encore le panneau Monde**, la sculpture du relief, le Scatter ni le
  mode pixel art. Ses vingt chapitres couvrent le reste, dont l'onglet Modèle, les animations et
  l'export d'un jeu.
- **Les projets et les réglages de la 1.0.0** — voir l'encadré en tête de section.
- Les installeurs ne sont pas signés.
- Sur Linux, un document dont le nom porte un accent écrit sous forme décomposée — ce que produit
  une archive faite sur macOS — s'affiche dans l'Explorateur sans pouvoir s'ouvrir.
- La liste complète et par espace :
  [chapitre 18](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/fr/manuel/18-limites.md).

## [1.0.0] — 2026-08-20

**Les six documents du studio s'écrivent désormais dans des formats que d'autres logiciels lisent
déjà.** Un projet devient un dossier ordinaire qu'on explore, qu'on met sous contrôle de version et
qu'on ouvre ailleurs — et le studio tout entier se pilote de l'extérieur.

> **⚠️ Cette version ne rouvre pas les documents des versions 0.x.** Les six extensions maison
> — `.img`, `.scene`, `.seq`, `.aud`, `.sky`, `.tex` — n'existent plus, et rien ne les convertit :
> un document enregistré par la 0.2.0 n'est plus reconnu. **Garder la 0.2.0 installée le temps de
> refaire ce qui doit l'être**, ou repartir des assets, qui eux ne changent pas. C'est ce qui fait
> de cette version une 1.0.0 plutôt qu'une 0.3.0 : le format d'un document engage, et celui-ci a
> changé pour de bon.

> **Les installeurs ne sont toujours pas signés.** Ni certificat Apple, ni certificat Windows n'est
> provisionné à ce jour
> ([ADR-04](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/ci/adr/ADR-04-strategie-de-signature.md)) :
> macOS opposera Gatekeeper, Windows affichera SmartScreen. L'auto-update vérifie le condensat du
> manifeste — il garantit qu'un téléchargement n'a pas été corrompu, pas qu'il vient de nous.

### Ajouté

**L'Explorateur devient un vrai navigateur de fichiers.** Un arbre et une grille, la navigation aux
flèches, un menu contextuel sur le fond comme sur chaque ligne, une fenêtre « Informations sur le
fichier », et l'ouverture décidée par ce que le fichier EST. Ce qu'il montre, il l'ouvre ; ce qu'il
ouvre, il le montre.

**Un projet se met sous contrôle de version, depuis le studio.** Un panneau Git et un panneau
Historique : l'état du dossier, les branches, la mise en attente, l'enregistrement d'une version, la
résolution d'un conflit côté nôtre ou côté leur. L'historique se retire de lui-même quand git ne
suit pas le dossier ouvert.

**Le studio suit ses fichiers où qu'on les range.** Déplacer, renommer ou trier hors de
l'application ne casse plus le catalogue : il retrouve ses fichiers, et un rescan reconnaît aussi
ceux venus de l'API.

**L'espace 3D reçoit l'animation.** Une bande d'animation avec ses blocs, ses canaux et ses
sous-pistes, des rails de caméra tracés au clic, des plans posés sur ces rails, la composition de
l'objectif animable depuis l'inspecteur. Un maillage nu reçoit un squelette, un personnage se
retargète quelle que soit la convention d'os de son fournisseur et garde sa taille, et l'export
emporte les animations — celles du modèle comme celles du studio.

**L'espace Image redevient complet** : remplissage, formes, texte à deux natures, calques groupés,
et une boîte de texte qui se voit, se tire et se ferre.

**Le studio se pilote de l'extérieur** — le point d'entrée MCP publie **222 actions en
14 familles**, des documents aux assets, de la scène au montage, du fichier au dépôt git.

**Une passerelle vers DaVinci Resolve** : un script installé à la demande dans le dossier que
Resolve lit, qui importe le montage écrit par le studio dans le projet ouvert.

**Un journal d'activité dans le studio**, avec sa fenêtre et son fichier tournant — sans avoir à
lancer l'application depuis un terminal.

**Le studio n'écrase plus le travail fait ailleurs, et enregistre tout seul.**

### Modifié

**Les six documents portent un format ouvert**, et le format ouvert EST le document — pas un export
à côté :

| Document | Format |
|---|---|
| Image en calques | **`.ora`** — OpenRaster, relu et réécrit par GIMP |
| Montage vidéo, montage audio | **`.otio`** — OpenTimelineIO, et `.otioz` quand les médias voyagent avec |
| Scène 3D, ciel | **`.gltf`** — glTF 2.0, ouvert par n'importe quel lecteur |
| Matière | **`.mtlx`** — MaterialX 1.39 |

**Un fichier revenu enrichi refuse de s'enregistrer plutôt que de perdre ce qu'il porte.** Une
scène rouverte dans Blender, un montage annoté ailleurs : le studio le liste, le lit, et dit ce
qu'il ne saurait pas réécrire — au lieu de l'écraser en silence.

**Le vocabulaire est tenu d'un bout à l'autre** — « matière » et non « matériau », « maille » pour
le type d'asset 3D, un seul mot pour ce que la caméra embrasse, et le même geste porte le même nom
dans le montage comme dans la palette. Le manuel et les deux langues disent ce que l'écran dit.

**L'interface a une règle de couleur** : l'accent plein désigne ce qu'on actionne, sa version
adoucie ce qui est choisi, et le survol n'est plus de l'accent. Il n'y a plus deux bleus de
sélection.

**Le manuel compte vingt chapitres**, dont le mode d'emploi du panneau Git, celui du panneau
Animations et celui de l'Explorateur — et il est lu **dans** l'application, pas seulement sur
GitHub.

### Corrigé

- Un export de plusieurs minutes n'avait ni barre de progression ni bouton pour l'arrêter.
- Le montage sortait un fichier que Resolve ouvrait sans retrouver un seul rush.
- Le viewport 3D se vidait pendant qu'on déplaçait une cloison, et le moniteur caméra retraversait
  toute la scène à chaque image même immobile.
- Le gizmo ne répondait pas en vue grille ; une caméra que ses plans avaient lâchée restait collée
  à son rail ; la pose d'un personnage dépendait de la façon dont la tête de lecture était arrivée.
- Deux animations superposées se moyennaient au lieu de se composer.
- Le panneau Animations supprimait un bloc gardé sans un mot.
- Une image exportée deux fois portait deux noms ; une image sans titre lisible sortait sous le nom
  « texture ».
- Un nom de fichier tient désormais sur les trois plateformes, et son nettoyage couvre tout ce que
  la frontière refuse.
- Plusieurs dizaines d'écarts entre ce que le manuel décrivait et ce que l'écran fait — libellés,
  raccourcis, gestes, comptes annoncés.

### Limites connues

- **Les documents des versions 0.x ne s'ouvrent pas** — voir l'encadré en tête de section.
- L'historique d'annulation ne survit pas à la fermeture d'un document.
- Les installeurs ne sont pas signés.
- Sur Linux, un document dont le nom porte un accent écrit sous forme décomposée — ce que produit
  une archive faite sur macOS — s'affiche dans l'Explorateur sans pouvoir s'ouvrir.
- La liste complète et par espace :
  [chapitre 18](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/fr/manuel/18-limites.md).

## [0.2.0] — 2026-08-16

L'espace Audio devient un vrai espace de montage, la 3D entre dans le montage vidéo, et les
documents comme les assets portent enfin le nom qu'on leur donne.

> **Les installeurs ne sont toujours pas signés.** Ni certificat Apple, ni certificat Windows
> n'est provisionné à ce jour
> ([ADR-04](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/ci/adr/ADR-04-strategie-de-signature.md)) : macOS opposera
> Gatekeeper, Windows affichera SmartScreen. L'auto-update vérifie le condensat du manifeste —
> il garantit qu'un téléchargement n'a pas été corrompu, pas qu'il vient de nous.

### Ajouté

**L'espace Audio a ses deux moniteurs**, empilés là où la Vidéo pose les siens côte à côte : la
prise qu'on édite au-dessus, le montage tel qu'il sera exporté au-dessous. Le temps se lit sur
les deux, et un seul écoute la barre d'espace à la fois — celui sur lequel on a cliqué.

**Le son se lit à trois niveaux.** L'onde du moniteur programme dit à quel niveau elle joue, une
échelle en décibels borde la forme d'onde, et un analyseur de spectre s'ouvre à la demande : la
troisième lecture s'offre, elle ne s'impose pas. Tout ce que la fenêtre joue passe désormais par
un point unique où l'on peut écouter.

**La 3D entre dans le montage, en direct.** Une scène 3D se dépose dans la timeline vidéo comme
un clip, se lit sur les deux moniteurs, et le montage regarde par la vue de l'onglet 3D.

**Un document se nomme à sa création**, au lieu d'être numéroté, et son identité ne dépend plus
du nom de son fichier : renommer un document renomme le fichier, renommer un asset renomme le
sien. Un asset porte le nom de ce qu'on a demandé, pas celui que la machine a répondu.

**Le dossier choisi devient le projet** — on ouvre un dossier, il est le projet, au lieu d'en
recevoir un.

**Les vignettes apparaissent dans la vue liste des assets**, et leur définition suit les écrans
Retina.

### Modifié

**Couper devient un geste de montage** : l'éditeur travaille sur la tranche du clip, et non plus
sur le média entier. Lâcher un asset sous la dernière piste ouvre les pistes qu'il faut.

**Un son se montre par son onde**, plus par un pictogramme de haut-parleur — y compris quand
l'ingestion n'a pas eu le temps d'en dériver une.

**Les quatre moniteurs partagent un seul cadre**, au lieu de deux écrits à la main de chaque
côté.

**Le site de présentation** montre les captures des six espaces, l'atelier Audio inclus, et une
vidéo de démonstration : <https://www.aidesktopstudio.com/>.

### Corrigé

- Un filtre posé dans un espace vidait celui d'à côté ; le mot tapé dans une recherche suivait
  dans l'espace suivant.
- Le moniteur source retombait à zéro, et son retour au début ne faisait rien.
- Deux moniteurs affichant le même clip 3D ne montraient pas la même image, et un clip 3D
  pouvait rester noir.
- L'inspecteur voyait le montage vidéo mais pas le sonore, où « Appliquer » effaçait l'onde.
- Le raccourci d'export volait ⌘M à « Réduire » dans le menu natif.
- Entrée et Échap coupaient la saisie d'un IME en pleine composition.
- Le champ de renommage ne laissait ni sélectionner ni suivre la saisie.
- Un document sans extension n'était plus reconnu comme un document ; un document image, qui est
  un dossier, était pris pour un dossier ordinaire par l'Explorateur.
- Le manuel : plusieurs chapitres se contredisaient d'un chapitre à l'autre, et l'anglais du
  studio est désormais relu comme le bundle — britannique, et « montage » n'y est plus traduit
  par *montage*.

### Limites connues

- L'historique d'annulation ne survit pas à la fermeture d'un document.
- Les installeurs ne sont pas signés — voir l'encadré ci-dessus.
- La liste complète et par espace :
  [chapitre 18](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/fr/manuel/18-limites.md).

## [0.1.0] — 2026-08-15

Première version publiée. Le studio est complet dans ses six espaces ; ce qui lui manque encore
est écrit noir sur blanc au chapitre
[Ce qui n'existe pas encore](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/fr/manuel/18-limites.md),
qui est fait pour être lu.

> **Les installeurs ne sont pas signés.** Ni certificat Apple, ni certificat Windows n'est
> provisionné à ce jour
> ([ADR-04](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/ci/adr/ADR-04-strategie-de-signature.md)) : macOS opposera
> Gatekeeper, Windows affichera SmartScreen. L'auto-update vérifie le condensat du manifeste —
> il garantit qu'un téléchargement n'a pas été corrompu, pas qu'il vient de nous.

### Ajouté

**Six espaces de travail**, entre lesquels la fenêtre se réarrange au lieu de changer de logiciel :
Image, Vidéo, 3D, Audio, Textures et Skyboxes. Le catalogue de modèles se filtre sur ce que
l'espace courant sait fabriquer.

**Les projets vivent sur votre disque**, dans un dossier ordinaire qui se copie, s'envoie et
s'ouvre dans l'explorateur. Les six types de documents s'y enregistrent et s'y rouvrent tels
quels. Rien ne repart : la génération est distante, le travail est local.

**Aucun formulaire de génération n'est écrit à la main.** Les entrées de chaque modèle sont
découvertes par l'API et rendues à la volée, si bien qu'un modèle nouveau ou un paramètre inconnu
apparaît sans mise à jour de l'application.

**Une file de génération unique**, à concurrence bornée et réglable, qui rapporte sa progression
et s'annule. Chaque asset garde le modèle, le prompt et la graine qui l'ont produit, et un bouton
les rejoue.

**Un assistant conversationnel** posé sur le studio, avec dictée : la reconnaissance vocale tourne
sur la machine, hors du processus principal
([ADR-17](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/ci/adr/ADR-17-moteur-de-dictee-hors-processus.md)).

**Le studio se pilote de l'extérieur** par un serveur MCP —
[chapitre 20](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/fr/manuel/20-piloter-de-l-exterieur.md).

**Le manuel est dans l'application**, pas seulement sur le dépôt : vingt chapitres sous
Aide ▸ Manuel utilisateur, en français et en anglais.

**Français et anglais de bout en bout**, densité compacte ou confortable, échelle de texte
réglable.

**Cinq installeurs** produits par la même chaîne à chaque version — macOS Apple Silicon et Intel,
Windows x64, Linux AppImage et deb — avec mise à jour automatique.

### Sécurité

La clé et le secret d'API ne quittent jamais le processus principal, chiffrés par le trousseau du
système. La fenêtre demande « suis-je authentifié ? », jamais « quelle est ma clé ? ».

### Limites connues

- L'historique d'annulation ne survit pas à la fermeture d'un document.
- Les installeurs ne sont pas signés — voir l'encadré ci-dessus.
- La liste complète et par espace :
  [chapitre 18](https://github.com/pasquelin/AIDesktopStudio/blob/HEAD/docs/fr/manuel/18-limites.md).

[0.2.0]: https://github.com/pasquelin/AIDesktopStudio/releases/tag/v0.2.0
[0.1.0]: https://github.com/pasquelin/AIDesktopStudio/releases/tag/v0.1.0
