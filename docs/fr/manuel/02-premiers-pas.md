# 2. Premiers pas

[← Découvrir](01-decouverte.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : La fenêtre →](03-la-fenetre.md)

Ce chapitre va du logiciel absent à votre première image, en huit étapes. Comptez un
quart d’heure la première fois, dont dix minutes d’attente pendant l’installation.

---

## Étape 1 — Installer le studio

Il y a deux façons d’avoir le studio sur sa machine.

### Vous avez reçu une application toute faite

C’est le cas le plus simple. Double-cliquez et suivez ce que votre système propose.

| Système | Ce que vous recevez | Quoi en faire |
|---|---|---|
| **macOS** | un fichier `.dmg` | l’ouvrir, glisser l’application dans **Applications** |
| **Windows** | un installeur `.exe` | le lancer, suivre l’assistant |
| **Linux — Debian, Ubuntu** | un paquet `.deb` | l’ouvrir avec l’installeur de votre bureau, ou `sudo apt install ./<fichier>.deb` |
| **Linux — les autres** | un `.AppImage` | le rendre exécutable, puis le lancer — rien ne s’installe |

> **macOS peut refuser d’ouvrir l’application** si elle n’a pas été signée par Apple. Le message
> parle d’un « développeur non identifié ». Dans ce cas : clic droit sur l’application →
> **Ouvrir** → **Ouvrir** à nouveau dans la boîte de dialogue. Ce détour n’est nécessaire que la
> première fois.

### Vous partez du code source

Il vous faut **Node 24** — la version que porte `.nvmrc`, et celle que la CI utilise — et
**[pnpm](https://pnpm.io)**. Ensuite, dans un
terminal, à la racine du dossier :

```bash
pnpm install          # télécharge les dépendances — quelques minutes
pnpm rebuild:native   # recompile la base de données locale pour votre machine
pnpm ffmpeg:fetch     # télécharge le ffmpeg que l'application embarque
pnpm start            # lance le studio
```

La deuxième commande n’est pas facultative : le studio range son catalogue dans une petite base
de données qui doit être compilée pour votre système exact. Sans elle, le studio démarre puis
échoue à ouvrir un projet.

La troisième l’est presque : sans elle, l’import de vidéos fonctionne, mais sans copie allégée ni
forme d’onde. L’application distribuée, elle, porte déjà ces binaires.

---

## Étape 2 — Obtenir une clé API

Le studio ne fabrique rien lui-même. Il demande au service de génération, et celui-ci a besoin de savoir qui
demande. C’est le rôle de la **clé API** et du **secret API** : un identifiant et un mot de
passe, réservés aux programmes.

1. Créez ou ouvrez votre compte chez votre fournisseur de génération.
2. Cherchez la section des clés API dans les réglages de votre compte.
3. Créez une clé. Le site vous donne **deux chaînes de caractères** : une clé et un secret.
4. **Copiez-les tout de suite.** Le secret n’est souvent affiché qu’une fois.

> Ces deux chaînes valent votre compte. Ne les collez ni dans un e-mail, ni dans un message, ni
> dans un fichier partagé. Si vous pensez les avoir laissées traîner : retournez sur le site,
> supprimez la clé, créez-en une autre. Cela prend dix secondes et invalide l’ancienne.

---

## Étape 3 — Brancher votre compte

1. Ouvrez les réglages : `⌘,` sur macOS, `Ctrl+,` sur Windows et Linux. Ou par le menu —
   **AI Desktop Studio ▸ Réglages…** sur macOS, **Fichier ▸ Réglages…** ailleurs, car il n’y a
   de menu d’application que sur macOS.
2. Dans la liste de gauche, cliquez sur **Compte**.
3. Donnez-lui un **nom** — ce que vous voulez : « Studio », « Perso », votre prénom.
4. Collez votre clé dans **Clé API**, votre secret dans **Secret API**.
5. Cliquez **Ajouter un compte**.

**Pourquoi un nom ?** Parce que le studio en tient plusieurs. Une clé API porte son propre projet
distant, et vous pouvez passer de l’un à l’autre depuis la barre de titre. Pour un premier
compte, le nom n’a aucune importance — mettez ce qui vous vient.

Le studio vérifie immédiatement auprès du fournisseur. Trois réponses possibles :

| Ce qui s’affiche | Ce que ça veut dire |
|---|---|
| Une pastille verte **Utilisé** sur la ligne du compte | tout va bien, vous pouvez fermer les réglages |
| **Clé ou secret API invalide.** | une des deux chaînes est fausse — souvent un espace collé en trop au début ou à la fin |
| **Impossible de joindre le service de génération. Vérifiez votre connexion.** | ce n’est pas votre clé, c’est votre connexion internet |

**Où vont vos identifiants.** Ils sont chiffrés par le trousseau de votre système — Keychain sur
macOS, le gestionnaire d’identifiants sur Windows, le trousseau du bureau sur Linux — et rangés
avec les réglages du studio. La partie du logiciel qui dessine l’écran ne les reçoit jamais :
elle demande seulement « suis-je connecté ? ».

> Si votre système n’offre aucun chiffrement, le studio **refuse de les enregistrer** plutôt que
> de les écrire en clair sur le disque. C’est rare, et cela arrive surtout sur des Linux
> dépourvus de trousseau.

<!-- CAPTURE : la fenêtre de Réglages, section Compte, un compte listé avec sa pastille « Utilisé ».
     Enregistrer dans ../../images/settings-account.png -->

---

## Étape 4 — Choisir sa langue (facultatif)

Toujours dans les réglages, section **Général**, réglage **Langue**.

Trois choix : **Système** (la langue de votre ordinateur), **Français**, **English**.

**Un réglage choisi n’est pas encore un réglage enregistré.** Cliquez **Appliquer**, qui laisse la
fenêtre ouverte, ou **OK**, qui la ferme. C’est la différence avec l’étape précédente, où
**Ajouter un compte** écrivait sur-le-champ : les réglages, eux, sont mis de côté jusqu’à ce que
vous validiez. Une pastille marque le réglage modifié en attendant, et **Annuler** jette ces
changements-là.

Une fois appliqué, le changement de langue se voit tout de suite — il n’y a rien à relancer — et
cela ne touche ni vos projets ni ce que vous écrivez dedans.

---

## Étape 5 — Créer votre premier projet

`⌥⌘N` / `Alt+Ctrl+N`, ou menu **Fichier ▸ Nouveau projet…** — ou `⌘N`, qui ouvre la fenêtre
proposant un projet comme un document

Le studio vous demande **un dossier**, et ce dossier *devient* le projet — il ne fabrique rien
au-dessus ni en dessous. Créez-le au besoin depuis le sélecteur (bouton **Nouveau dossier**) et
donnez-lui le nom que vous voulez pour le projet : c’est celui qu’il portera.

Ce qu’il installe dedans :

```
Mon premier projet/        ← le dossier que VOUS avez choisi
├── Images/           un dossier par section du studio : ce que vous y créez
├── Video/              et ce que vous y générez y atterrit ensemble
├── Audio/
├── Materials/
├── Skyboxes/
├── Scripts/
├── Scenes/           vos scènes
├── Models/           vos maillages
├── Animations/       vos mouvements
├── .project.json     la carte d'identité du projet — caché
└── .index/           le catalogue et ses caches — à garder, caché
```

Le nom du projet s’affiche en haut de la fenêtre. Vous savez toujours dans quoi vous travaillez.
Pour le changer plus tard, double-cliquez sur sa ligne dans **Vos projets** : cela renomme le
projet, pas le dossier.

Trois réponses possibles, et aucune n’écrase quoi que ce soit :

- **le dossier est déjà un projet** — le studio l’ouvre au lieu d’en créer un par-dessus ;
- **il contient déjà des fichiers** — le studio demande confirmation avant de s’y installer, et
  ne touche à rien de ce qui s’y trouve ;
- **il est dans un projet, ou il contient des projets** — le studio refuse : deux projets qui se
  chevauchent revendiqueraient les mêmes fichiers. Choisissez un dossier à côté.

Le chapitre [Les projets](04-projets.md) détaille chaque dossier.

---

## Étape 6 — Choisir un espace et un modèle

En haut de la fenêtre, cliquez sur **Image**.

À gauche, le panneau **Modèles** se remplit. Ce sont les modèles du catalogue distant capables
de fabriquer des images. Il y en a beaucoup.

Pour un premier essai, prenez-en un au hasard parmi ceux mis en avant : cliquez sur une
vignette. Son nom apparaît en haut du panneau — c’est lui qui travaillera.

> **Le panneau est vide et parle d’identifiants ?** Retournez à l’étape 3 : la clé n’est pas
> enregistrée, ou elle a été refusée.

---

## Étape 7 — Écrire son premier prompt

Une fois le modèle choisi, son icône **Génération** apparaît dans le rail de gauche. Cliquez-la :
le panneau **Génération** prend la place des Modèles — ils partagent la même moitié de colonne et
se relaient — et affiche un formulaire.

**Ce formulaire n’est pas toujours le même.** Il est construit à partir de ce que le modèle
choisi sait recevoir : deux modèles différents n’ont pas les mêmes réglages, et le studio les
découvre au lieu de les deviner. C’est pourquoi un modèle publié demain aura, lui aussi, le bon
formulaire.

Le champ qui compte s’appelle **prompt**. Écrivez-y une phrase. Par exemple :

```
a small red lighthouse on a cliff, morning light, calm sea
```

Traduction : *un petit phare rouge sur une falaise, lumière du matin, mer calme*. L’anglais n’est
pas obligatoire, mais la plupart des modèles le comprennent nettement mieux.

Les autres champs ont tous une valeur de départ raisonnable. Laissez-les tels quels pour ce
premier essai — le chapitre [Générer](06-generer.md) les explique un par un.

---

## Étape 8 — Générer, attendre, récupérer

Appuyez sur **Générer**.

En bas à droite, la **ligne d’état** affiche « 1 génération » et une barre de progression. Selon le
modèle,
comptez de dix secondes à deux minutes. Vous n’avez pas à rester à regarder : la barre avance
toute seule, et vous pouvez faire autre chose pendant ce temps.

Quand la ligne affiche **Terminée**, votre image est arrivée. Elle est rangée dans le panneau
l’**Explorateur** — le dossier du projet — et sur votre disque, dans `Images/`.

**Cliquez sur la vignette** : l’**Inspecteur**, à droite, montre tout ce qu’on sait d’elle — sa
taille, son poids, le modèle qui l’a faite, le prompt que vous avez écrit, et la *graine* qui
permettra d’y revenir.

Le bouton **Afficher dans le dossier**, dans l’inspecteur, ouvre votre gestionnaire de fichiers
sur elle. C’est de là que vous l’enverrez à qui vous voudrez.

> **Pour la retoucher**, passez dans l’espace **Image** : le `+` du rail gauche ouvre un
> document, puis glissez votre image sur la toile — elle y devient un calque, et le pinceau, la
> gomme et les formes s’appliquent dessus. Le chapitre [Espace Image](08-espace-image.md) détaille
> les trois façons de l’y faire entrer.
>
> **Pour le garder :** `⌘S` écrit le document dans le projet, calques et masques compris, et il
> se rouvre tel quel — le panneau **Explorateur** liste ce que le projet contient. `⇧⌘E` en sort
> un PNG aplati, ce qui est un export et non un enregistrement.
>
> Pour transformer l’image plutôt que la peindre : reprenez le panneau **Génération** avec un
> modèle *image vers image*, et donnez-lui votre image comme point de départ.

<!-- CAPTURE : le panneau Génération avec le formulaire d’un modèle, et la ligne d’état en
     dessous avec une tâche en cours. Vers ../../images/generate.png -->

---

## Et maintenant ?

| Envie | Chapitre |
|---|---|
| Comprendre chaque morceau de l’écran | [La fenêtre, expliquée](03-la-fenetre.md) |
| Mieux choisir son modèle | [Trouver un modèle](05-modeles.md) |
| Mieux écrire ses prompts | [Générer](06-generer.md) |
| Peindre et dessiner | [Espace Image](08-espace-image.md) |
| Savoir ce que le studio ne sait pas encore faire | [Ce qui n’existe pas encore](18-limites.md) |
| Faire le tour des réglages | [Tous les réglages](14-reglages.md) |

---

[← Découvrir](01-decouverte.md) · [Sommaire](../guide-utilisateur.md) · [Chapitre suivant : La fenêtre →](03-la-fenetre.md)
