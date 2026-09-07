# AI Desktop Studio — architecture

Comment le studio est bâti, et pourquoi il l’est ainsi. Écrit pour qui reprend le code. Vous
cherchez plutôt comment _s’en servir_ ? Voir [guide-utilisateur.md](guide-utilisateur.md).

> 🇬🇧 This document is also available [in English](../en/architecture.md).

---

## Sommaire

1. [La forme générale](#la-forme-générale)
2. [Six invariants](#six-invariants)
3. [Traverser la frontière des processus](#traverser-la-frontière-des-processus)
4. [Le processus principal](#le-processus-principal)
5. [Le renderer](#le-renderer)
6. [Les moteurs](#les-moteurs)
7. [Une génération, de bout en bout](#une-génération-de-bout-en-bout)
8. [Projets et catalogue](#projets-et-catalogue)
9. [Le contrôle de version](#le-contrôle-de-version)
10. [Le design system](#le-design-system)
11. [Internationalisation](#internationalisation)
12. [La configuration](#la-configuration)
13. [Les tests](#les-tests)
14. [Ajouter quelque chose](#ajouter-quelque-chose)
15. [Livrer une version](#livrer-une-version)

---

## La forme générale

Electron, trois cibles, un dépôt.

```
        ┌─────────────────────────────────────────────┐
        │  processus principal   Node, tous droits    │
        │                                             │
        │  · identifiants API, chiffrés par l'OS      │
        │  · client SDK du fournisseur                │
        │  · JobManager — le seul qui poll            │
        │  · ModelRegistry — schémas → descripteurs   │
        │  · catalogue SQLite, dossiers de projet     │
        │  · menu natif, fenêtres, protocoles         │
        └───────────────────┬─────────────────────────┘
                            │  ipcMain.handle / webContents.send
        ┌───────────────────┴─────────────────────────┐
        │  preload             le pont, et rien d'autre│
        │  contextBridge.exposeInMainWorld             │
        └───────────────────┬─────────────────────────┘
                            │  window.studio, typé
        ┌───────────────────┴─────────────────────────┐
        │  renderer     bac à sable, ni Node ni fs    │
        │                                             │
        │  · shell React 19 — rails, zones, docks     │
        │  · six moteurs, aucun React dedans          │
        │  · stores zustand, TanStack Query           │
        └─────────────────────────────────────────────┘
```

`contextIsolation` et `sandbox` sont actifs et le restent. Le renderer n’a ni `fs`, ni
`child_process`, ni `nodeIntegration`. La navigation est verrouillée au niveau `app`, et
`openExternal` ne laisse passer que `https:`.

---

## Six invariants

Ils gouvernent tout. En enfreindre un casse le projet dans ce qu’il a de défendable.

### 1. Le renderer ne voit jamais de secret

La clé et le secret vivent dans le processus principal, chiffrés par l’OS via le `safeStorage`
d’Electron. Le renderer demande « suis-je authentifié ? » — **jamais** « quelle est ma clé ? ».

### 2. Toute frontière passe par `shared/ipc.ts`

Typé des deux côtés. Aucun `ipcRenderer.invoke('un-truc')` dans un composant. `shared/` n’a
**aucune dépendance runtime** — types et constantes uniquement, ce qui permet aux deux processus
de l’importer.

`main/ipc/handle.ts` dérive la signature de chaque handler du canal lui-même : un handler qui ne
respecte pas son contrat déclaré ne compile pas.

### 3. Un moteur est recréable depuis son état, jamais depuis son DOM

Chaque moteur se reconstruit intégralement depuis son état sérialisé — `CanvasEngine` et
`SceneRenderer` autant que le son, qui est une paire de modules plutôt qu’une classe et tient la
même règle : l’édition est l’état, jamais le buffer en mémoire.

La raison est concrète : un contexte WebGL ne survit pas au déplacement entre documents, et
détacher un panneau dans une autre fenêtre l’exige. Le save/load et l’undo deviennent fiables
gratuitement.

### 4. Les moteurs ignorent React ; React les pilote

`engines/` ne contient **aucun import React**. Les composants lisent l’état et appellent des
méthodes ; ils ne détiennent pas la scène.

### 5. Aucun formulaire de génération écrit à la main

Les entrées de `POST /generate/custom/{modelId}` sont **propres à chaque modèle** et se
découvrent via `GET /models/{modelId}`. Le `ModelRegistry` les traduit en `FieldDescriptor[]`,
et `<DynamicForm/>` les rend.

Coder un formulaire en dur pour un modèle donné est un bug, pas un raccourci. Un `kind` inconnu
retombe en saisie brute — jamais un formulaire qui disparaît.

### 6. Le thread UI ne fait que de l’UI

Toute opération susceptible de dépasser 16 ms part ailleurs, dans cet ordre de réflexe :

1. **GPU** — filtres, blend, normal map, AO, redimensionnement.
2. **Web Worker** — vignettes, formes d’onde, BVH, parsing de gros GLB.
3. **OffscreenCanvas + Worker** — rendus hors écran.
4. **`utilityProcess`** — ffmpeg, indexation, hachage, transferts.

Toute tâche longue est **annulable**, **rapporte sa progression**, et tourne dans un pool borné à
`hardwareConcurrency − 2`.

`better-sqlite3` est synchrone : une requête lourde dans le processus principal bloque toutes les
fenêtres, donc les requêtes de catalogue non triviales passent par `worker_threads`.

Trois fils existent précisément pour cela. `main/project/catalogWorker.ts` détient la base et
répond à une boucle de messages : une recherche parmi des milliers d’assets ne gèle plus aucune
fenêtre. `renderer/src/engines/audio/audio.worker.ts` sort la chaîne sonore du thread de la
fenêtre, les buffers d’échantillons étant **transférés** plutôt que copiés. Et
`renderer/src/engines/scene/bvh.worker.ts` construit les arbres de collision d’un maillage — **un
seul worker, pas un pool** : un BVH par maillage arrive en rafale au chargement d’une scène, et
une rafale bornée à un fil garde le reste de la fenêtre réactif. Les trois ne sont que de la
tuyauterie : le catalogue, le dispatch, l’arithmétique audio et la construction du BVH se testent
seuls, sans worker.

**Ce qui attend une réponse est un module, pas une carte privée.** `bvhInflight.ts` tient les
requêtes parties vers le worker et les promesses qui les attendent, et il expose son décompte.
La raison n’est pas l’élégance : tant que cette carte vivait dans le constructeur du builder,
la ligne qui la nettoyait après un envoi refusé était une assurance qu’aucun test ne pouvait
atteindre — vidée, la porte restait verte. **Un registre que rien ne peut lire est un registre
que rien ne mesure**, et c’est le même remède que `framingPlacement`, sorti de `frameSelection`
pour la même raison.

**Et deux processus, pour ce qui ne doit pas partager un heap.**
`main/media/peaksWorker.ts` réduit une forme d’onde dans un `utilityProcess` : une heure de PCM
mesurée à 129 ms sur le thread principal, et toutes les fenêtres du studio attendaient.
`main/dictation/sttWorker.ts` tient Parakeet
— six cents millions de paramètres, 640 Mo de poids — dans un `utilityProcess` à lui. Un thread
n'aurait pas suffi : il partage le heap et le cycle de vie de son processus, donc les 700 Mo
resteraient dans l'empreinte du principal et un plantage de l'addon natif emporterait le studio.
Ce qui décide quoi que ce soit — le tampon, la file, la machine à états — vit à côté et se teste
sans lui. Voir [`ADR-17`](../ci/adr/ADR-17-moteur-de-dictee-hors-processus.md).

---

## Traverser la frontière des processus

`src/shared/ipc.ts` déclare les canaux en types littéraux et la forme du `StudioBridge`. Les deux
côtés l’importent ; aucun ne peut dériver.

```
renderer                    preload                  main
────────                    ───────                  ────
getBridge()          →  window.studio         →  ipcMain.handle(CHANNELS.x)
  .provider                 exposeInMainWorld       handler dérivé du canal
  .searchModels(q)          contextBridge           renvoie des données typées
```

Les registres `CHANNELS` et `EVENTS` font foi ; aucun compte recopié dans la documentation n’est
stable. `missions:watch` et `missions:create` montent vers le main. `evt:mission-changed` redescend
uniquement vers la fenêtre abonnée, avec une projection filtrée sur son projet.

**`EVENTS` est l’autre sens** — le main pousse notamment la progression, les changements de projet
et de réglages, les missions, l’état des fenêtres, la dictée et les commandes du menu natif.

La séparation n’est pas cosmétique : **chaque `on…` du pont s’abonne à exactement une entrée de
`EVENTS`**, et chaque méthode d’appel à exactement une de `CHANNELS`.

Les fichiers locaux sont servis au renderer par un protocole `ia-studio://`. L’URL est dérivée de
l’identifiant de l’asset : une grille de vignettes ne coûte donc aucun IPC — et le renderer ne
manipule toujours aucun chemin de fichier.

---

## Le processus principal

```
src/main/
├── provider/
│   ├── client.ts            le client @scenario-labs/sdk, bâti sur les identifiants stockés
│   ├── credentialsWatch.ts  quand la clé active change, ce qui doit se relire
│   ├── modelRegistry.ts     GET /models/{id} → FieldDescriptor[]
│   ├── modelCatalog.ts      listing paginé des modèles, mis en cache
│   ├── jobManager.ts        la file, la concurrence, le polling
│   ├── runner.ts            ce qui appelle réellement generate
│   ├── schema.ts            traduction de schéma et déduction de famille
│   ├── retry.ts             le backoff exponentiel, sorti du JobManager et partagé
│   ├── assetCatalog.ts      la bibliothèque distante, lue et paginée
│   ├── assetNormalizer.ts   un asset de l'API ramené à la forme du studio
│   ├── ownerScope.ts        à quel projet la clé active donne accès
│   ├── filterExpression.ts  la recherche traduite pour l'API
│   ├── limits.ts            les tailles de lot que l'API impose
│   ├── promptAssist.ts      variantes, traduction, lecture de style
│   ├── assistQueue.ts       la file bornée de l'assistance de fond
│   ├── uploader.ts          l'envoi d'un fichier vers la bibliothèque
│   ├── cost.ts              ce qu'une génération coûterait, sans la lancer
│   ├── usage.ts             les unités consommées et la grille de prix
│   └── handlers.ts          les canaux provider:*
├── project/
│   ├── store.ts             créer et ouvrir un dossier de projet, lire/écrire le manifeste
│   ├── catalog.ts           l'index SQLite des assets
│   ├── catalogThread.ts     le worker qui le porte, et son protocole
│   ├── activityLog.ts       ce que le studio a fait et raté
│   ├── documents.ts         l'écriture atomique d'un document
│   ├── sqlite.ts            le port SqliteDriver
│   ├── sqliteNative.ts      better-sqlite3 — production
│   └── sqliteMemory.ts      node:sqlite — tests
├── assets/
│   ├── localBackend.ts      les assets du projet, sur le disque
│   ├── cloudBackend.ts      les mêmes, du côté de la bibliothèque
│   ├── syncPlan.ts          ce que deux côtés devraient faire l'un de l'autre
│   ├── collector.ts         ce qu'une génération dépose dans le projet
│   ├── autoCaption.ts       nommer une image d'après ce que l’API y voit
│   └── protocol.ts          le protocole ia-studio://
├── dictation/               la reconnaissance vocale : permissions, modèle, découpage, handlers
├── assistant/               la pensée de l'assistant, derrière un port, et ce qu'on en relit
├── mission/                 autorité, store, journal versionné, événements et handlers des missions
├── mcp/                     le même catalogue d'actions, offert à un client extérieur
├── settings/                le store chiffré, son adaptateur, ses handlers
├── favorites/               les recettes épinglées, gardées hors des projets
├── styles/                  les réglages de matière qu'on rejoue d'une matière à l'autre
├── scene/                   l'export d'une scène, et sa validation
├── export/                  paquets déterministes de matière, ciel et jeu compilé
├── diagnostics/             le canal par lequel le renderer signale un échec
├── media/                   importer un fichier : sonde, hachage, proxy, forme d'onde
├── fonts/                   les polices embarquées et celles du système
├── menu/                    le menu natif, bâti depuis les registres partagés
├── ipc/                     `handle`, `register`, `broadcast` — la mécanique de l'invariant 2
├── persistence.ts           l'écriture atomique des petits fichiers de l'utilisateur
├── update/                  la vérification de mise à jour
└── window/                  cycle de vie, verrouillage de la navigation, fenêtre de retour vidéo
```

> **`persistence.ts` a été écrit à la troisième copie**, et c'est la règle qu'il porte : les notes
> de jobs, les recettes épinglées et les styles avaient les mêmes vingt lignes, chacune annotée
> « écrit comme les notes de jobs, et pour la même raison ». Le document, lui, garde la sienne dans
> `project/documents.ts` — non par oubli : il tient un registre des noms en transit et crée le
> dossier de l'utilisateur, ce qui n'appartient qu'à lui. **Le nom du fichier de transit est un
> paramètre et non une constante** : les trois stores sérialisent leurs écritures, mais plusieurs
> fenêtres écrivent dans le même dossier de projet.

### Les missions survivent au processus

Le main est l’unique autorité des missions. Le Store sérialise leurs révisions et les projette aux
fenêtres ; le Manager publie les événements métier. Le journal append-only version 1 vit dans
`<userData>/missions.ndjson` et restaure la dernière révision valide de chaque identifiant. Une
ligne invalide est ignorée, une version future est refusée. Une action retrouvée `running` est mise
en pause avec `action_outcome_unknown` et n’est jamais rejouée automatiquement. L’arrêt attend le
flush du Store, puis celui du journal.

Avant qu’une étape réfléchisse, `AssistantContextBuilder` reconstruit un objet typé depuis la
mission et l’état courant : snapshot validé de la fenêtre, projet, document, sélection, résultats,
jobs, contexte projet, souvenirs rappelés et actions recherchées. Chaque source est limitée avant
l’assemblage et publie son propre rapport de budget. Un snapshot appartenant à un autre projet est
écarté en bloc, afin que deux missions ou deux fenêtres ne partagent jamais un état volatil.

Le renderer publie aussi l’état structurel du document actif depuis un registre exhaustif de
providers par type. Les stores de document portent une révision logique distincte du marqueur
`dirty` ; sélection, playhead et autres états de vue empruntent un chemin qui ne la modifie pas.
Chaque incarnation de fenêtre possède une identité propre, afin qu’une mission restaurée ne puisse
pas confondre un compteur neuf avec son ancienne précondition. Le Scheduler compare ces lectures
avant chaque exécution, persiste les nouvelles préconditions et remet les changements au runner :
celui-ci peut relire le contexte et conserver le plan ou demander sa révision, sans transformer une
modification humaine en échec.

### Le JobManager est le seul à poller

Le `job.wait()` du SDK ne rapporte aucune progression et plafonne à 120 secondes — inutilisable
pour une barre de progression, inutilisable pour une génération vidéo. Le `JobManager` poll donc
`jobs.retrieve` lui-même — deux secondes étant le **plancher** et non la cadence, voir plus bas —
et pousse la progression au renderer par
`evt:job-progress`.

**Poller ailleurs est un bug.** Le manager détient aussi la concurrence (trois par défaut,
réglable) et le backoff exponentiel sur 429 et 5xx — aucun seuil de débit n’est publié, donc
aucun n’est supposé. Contourner la file par un appel direct au SDK, c’est ainsi qu’on récolte une
rafale de 429.

### Le moteur d’IA locale est un processus Python, et un `LocalRuntime` de plus

Une image générée sur cette machine ne passe par aucune brique nouvelle du côté de l’ordonnancement :
le moteur Python implémente le même `LocalRuntime` que llama.cpp et sherpa-onnx, et `AiManager`
compose l’aperçu sans savoir lequel des trois répond.

Le noyau du moteur **n’importe aucune bibliothèque de tenseurs** : il salue en 33 ms, là où
`import torch` en coûte 620 à chaud et 8,7 secondes à froid. Ce sont les **workers** qui les
paient, une fois, et qui restent en vie — un worker est un processus, et c’est précisément ce
qu’un plan de libération mémoire peut tuer pour rendre des octets.

**Une porte par modalité, et une porte est un processus.** `engine/diffusion` sert l'image,
`engine/video` la vidéo, `engine/audio` le son, `engine/3d` le maillage, `engine/skybox` le
panorama. C'est le principal qui
nomme la porte sur chaque requête, parce qu'il est le seul à savoir quel modèle a été choisi pour
quelle opération ; le moteur n'en choisit jamais une. Elles sont distinctes pour une raison de mémoire
et non de rangement : un modèle vidéo pèse des dizaines de gigaoctets, et libérer une porte veut
dire **tuer son processus** — colocalisées, on ne pourrait pas libérer l'une sans emporter l'autre.
Ce qui diffère entre deux portes est une modalité et un nom : la boucle est écrite une fois
(`workers/door.py`), et les cinq modules qui la nomment font quatre lignes chacun.

Le dialogue passe par un socket unix — un named pipe sous Windows — en cadres NDJSON, un objet
JSON par ligne. Pas par l’entrée standard, et la raison n’est pas la vitesse : **`stdout` est un
canal partagé**, qu’un seul avertissement d’une bibliothèque Python corrompt, et une pile PyTorch
en écrit. Le moteur parle en premier, comme le fait déjà le moteur de dictée : lire une pile
Python peut échouer, et ça doit échouer à l’ouverture plutôt qu’à la première génération.

**Des chemins, jamais des octets.** Une génération écrit son résultat dans un fichier que le
principal possède, et l’événement porte le chemin ; le collecteur local le range dans le projet
puis efface le passage de main — après l’import et jamais avant, sans quoi un import qui échoue
perdrait la génération.

**Le principal décide, le moteur mesure et exécute.** Le moteur peut refuser pour ce qu’il est
seul à voir — aucun modèle chargé, des poids qui portent du Python — mais il ne replanifie jamais :
il ne libère pas une autre porte, ne réordonne pas, ne substitue pas un modèle. C’est pour ça que
le module s’appelle `core/jobqueue.py` et non `core/scheduler.py` : un fichier nommé « scheduler »
finit par en devenir un, et deux ordonnanceurs se contredisent sur la seule ressource qui compte.

Le détail, les mesures et les inconnues vivent dans la spécification du moteur, hors dépôt.

### Deux backends d’assets, un seul planificateur

Le projet et la bibliothèque du compte sont deux stocks, servis par deux backends de même forme :
`localBackend.ts` pour le dossier sur le disque, `cloudBackend.ts` pour l’API. Ce qui décide de
ce qui devrait bouger entre les deux est ailleurs, et **pur** : `syncPlan.ts`.

Cette séparation porte deux promesses :

- **un plan peut être montré avant de coûter une requête** — « 12 à envoyer, 3 à rapatrier » se
  calcule sans rien transférer ;
- **la synchronisation bidirectionnelle reste une politique, pas une réécriture.** `planSync` gère
  déjà `two-way`, testée, bien que le studio ne demande jamais que `push` ou `pull` depuis une
  sélection explicite. C’est la comparaison pour laquelle les trois horodatages ont été
  enregistrés ; l’écrire plus tard, c’est la greffer.

Trois horodatages, lus l’un contre l’autre : `remoteSyncedAt` sert de référence, `localChangedAt`
et `remoteUpdatedAt` disent qui a bougé depuis. Ils sont **analysés, pas comparés comme du
texte** — un décalage horaire au lieu d’un `Z` donnerait silencieusement la mauvaise réponse. Une
date illisible compte comme « n’a pas bougé » : refuser d’agir sur une date que personne ne
comprend vaut mieux qu’écraser un fichier sur sa foi.

Côté renderer, le badge d’une vignette est **dérivé** par `assetBadgeOf` et jamais stocké : il
dépend du compte actif, et une clé API ouvre sur un projet et un seul. Le stocker obligerait à
réécrire chaque ligne à chaque changement de clé — et à montrer une réponse périmée entre les
deux.

### Le journal d’activité

`project/activityLog.ts` tient le compte de ce que le studio a fait et raté. Trois décisions y
sont figées, et chacune répond à un défaut précis :

- **`record` rend la main immédiatement.** Il est appelé depuis des chemins d’échec : un journal
  qui ferait attendre ses appelants mettrait le disque sur le chemin critique de chaque erreur.
- **Les lignes sont écrites par lots** (`ACTIVITY_FLUSH_MS`, 200 ms), assez court pour qu’un échec
  reste immédiat à l’œil.
- **Le catalogue est relu à chaque vidage, jamais retenu.** Un projet peut être fermé et un autre
  ouvert pendant que des lignes attendent encore dans la file.

### L’import de médias

Importer un fichier est un pipeline à étapes nommées — `probe`, `hash`, `proxy`, `peaks` —
chacune rapportant un ratio sur l’import _entier_, pas sur elle-même : une barre de progression
veut donc dire la même chose à toutes les étapes. Il est annulable à tout moment : le proxy d’un
rush de vingt minutes doit pouvoir s’arrêter sur demande.

`ffprobe` lit ce que le fichier est réellement ; le codec décide de la suite. Ce que WebCodecs
décode nativement se lit directement, le reste reçoit un proxy — les deux orthographes de chaque
codec sont reconnues (`h264` et `avc1`, `av1` et `av01`), parce qu’une sonde lue par la mauvaise
réclame un proxy dont personne n’a besoin.

ffmpeg est résolu à l’exécution et peut être absent. Dans ce cas l’import fonctionne quand même —
on perd le proxy et la forme d’onde, et l’interface sait exactement quelle partie est
indisponible plutôt que d’échouer opaquement.

### SQLite derrière un port

`catalog.ts` parle à une interface `SqliteDriver`, pas à une bibliothèque. La production branche
`better-sqlite3` ; les tests branchent le `node:sqlite` intégré. Un test qui importe
`better-sqlite3` directement est un test qui échouera bizarrement — branchez le port.

`pnpm rebuild:native` est obligatoire après toute montée d’Electron, sinon le module natif refuse
de se charger.

### Un registre d’actions, deux lecteurs

`ACTION_REGISTRY` (`shared/domain/assistant.ts`) déclare ce que le studio sait faire sur demande —
une famille par module `*Actions.ts`, leurs champs, **ce que chacune engage** (`none`, `files`,
`asset`, `remote`, `studio`, `credits`) et **quelle porte l’offre** (`reach`). **Le nombre n’est pas écrit
ici** : il monte à chaque lot, et `exhaustive.test.ts` le tient contre l’union `ActionName`. Il a
deux lecteurs, et **aucun des deux ne décide** :

- **l’assistant**, dans la fenêtre, à qui le briefing donne **tous les NOMS** et rien d’autre ;
- **`main/mcp/tools.ts`**, qui republie **tout**, champs compris, en outils MCP pour un client
  extérieur.

Le main dérive aussi de ce registre un `ActionIndex` reconstructible dans `<userData>/actions.db`.
Les actions, leurs champs, le FTS5 et les vecteurs y sont séparés ; une empreinte du corpus évite
les reconstructions inutiles. Toute lecture SQLite s’exécute dans `actionIndexWorker`. Le service
réutilise l’unique modèle d’embedding déjà partagé avec la mémoire et retombe sur FTS5 lorsqu’il
n’y en a pas. Cet index prépare le runtime de missions ; le briefing historique conserve encore
ses noms jusqu’au raccord complet du nouveau chemin.

**Le briefing porte les noms, jamais les modes d’emploi.** Les 283 actions groupées par famille
coûtent 4 225 caractères, là où leurs descriptions et leurs champs en coûtent 90 994 — que seule la
porte la plus large tenait, à chaque tour. Ce qu’une action EST et ce qu’elle prend n’est composé
que pour celles qu’une chaîne a ouvertes (`loaded`).

**Une action nommée sans son mode d’emploi ne coûte plus la réponse : elle l’ouvre.** Le modèle
écrit son appel, `answeredTurn` (`brainTurn.ts`) voit que les champs manquent, les ajoute au
briefing et redemande dans le même tour — le budget est `TURN_ATTEMPTS`. `actions.find` reste la
même manœuvre par un MOT plutôt que par un nom. **Ce qui est ouvert le reste jusqu’à la fin de la
demande** : la fenêtre renvoie `AssistantThought.loaded` d’un tour au suivant et repart à vide
quand la chaîne se termine — le principal ne garde rien entre deux tours.

**Ce que la place décide n’est plus le catalogue mais les RÈGLES.** Chaque cerveau déclare la place
qu’il tient — Scenario dix mille caractères, le champ `instruction` de son endpoint de génération
(`brainProvider.ts`) · un nuage de discussion la sienne (`brainHttp.ts`) · un modèle local ce que sa
fenêtre laisse (`roomFor`, `promptWindow.ts`). En dessous du plancher que réclament les règles
larges, `studioBriefing` n’en donne que le noyau et garde son état, son contexte et ses modes
d’emploi.

**`studio` est né de cet élargissement** : le modèle de l’assistant voit désormais des actions qui
changent les réglages, le compte qui répond ou le projet ouvert — aucune n’est annulable par ⌘Z, et
le compte décide de quelle bibliothèque et de quelle facture relève la génération suivante. C’est
le seul niveau sans interrupteur de délégation, et c’est le propos.

**Ce qu’un modèle a le droit de nommer est le registre entier**, et `parseReply` s’y tient : un nom
que le registre ne déclare pas est refusé, un nom qu’il déclare mais que le briefing n’a pas décrit
ne l’est plus. `reach` ne décide donc plus rien du briefing ; il ne reste lu que par
`actionsReaching('mcp')`. Un plafond partagé faisait l’inverse — `INSTRUCTION_MAX` vivait dans
`shared/` et s’appliquait aux sept nuages HTTP, qui acceptent des dizaines de fois plus.

**`validatesInput` (`assistantAction.ts`) est la seule validation d’entrée du dispositif**, dérivée
des champs et posée sur `runConfirmedAction`. Rien en amont ne la fait : l’IPC vérifie l’enveloppe,
le parseur de réponse vérifie le NOM, et le serveur MCP passe `params.arguments` tel quel — son
`additionalProperties: false` est une promesse au client, pas une contrainte. Elle refuse **avant**
la question de confirmation, sinon une entrée fautive ferait demander à la personne d’autoriser une
dépense qui n’allait pas partir.

Le nom change de dialecte au passage — `command.runStudioCommand` devient `command_runStudioCommand`, parce que la grammaire
des noms d’outils n’accepte pas le point — et `actionOfTool` fait le chemin inverse. **Une seule
substitution, jamais une seconde colonne dans le registre** : elle dériverait de la première.

**L’exécution, elle, est au même endroit pour les deux** : la fenêtre au premier plan. C’est ce qui
fait que la confirmation d’une action coûteuse est posée à l’écran quel que soit le côté qui a
demandé — et qu’une demande arrivant sans fenêtre est **refusée** (`noWindow`) plutôt que mise en
file. `main/mcp/asking.ts` compose l’aller-retour que l’IPC n’a pas dans ce sens : `invoke` monte,
`broadcast` redescend, un `callId` recoud les deux moitiés, et **toute façon d’échouer répond**,
parce qu’à l’autre bout il y a un client qui attendrait sinon.

**Le niveau déclaré n’est qu’un plancher.** `raises` l’élève depuis l’entrée de l’appel —
`commitmentOfCommand` pour `command.runStudioCommand`, un `amend` pour `git.commit` — et `asksItself` marque
l’action dont le gestionnaire pose sa PROPRE question, ce qui est la raison pour laquelle son
niveau reste au plancher. `commitmentOfCommand` est le seul gardé commande par commande : cinq
commandes du canevas aplatissent et téléversent l’image, ce qui crée un asset permanent. Un oubli
y passerait sans que rien en aval ne le rattrape.

**`files` est délibérément étroit** — détruire, déplacer, renommer, réécrire la copie de travail,
fermer un onglet qui porte du travail non enregistré — et jamais « tout ce qui écrit » : un dossier
neuf et un doublon n’enlèvent rien à personne, et un studio qui demanderait pour ceux-là
apprendrait à son utilisateur à cliquer Autoriser sans lire.

### La porte du MCP, et ses quatre verrous

Le serveur (`main/mcp/server.ts`) est **éteint par défaut** et suit `settings.mcp.enabled`. Allumé,
il écoute sur la boucle locale IPv4 — `127.0.0.1` écrit en toutes lettres, le nom `localhost`
résolvant d’abord en IPv6 sur certaines machines — sur un port que le système choisit, derrière un
jeton neuf à chaque lancement, et refuse toute requête portant une `Origin` qui n’est pas
loopback. `access.ts` décide à partir des seuls en-têtes, ce qui rend les deux refus démontrables
sans ouvrir de socket.

Port et jeton sont écrits dans `mcp.json` à côté des réglages, en `0600` : **ce fichier EST la
porte**, puisqu’un appelant sans `Origin` est admis par construction. `control.ts` l’efface à
l’arrêt **et au démarrage** — un fichier laissé par un plantage désigne un port que le processus
suivant héritera.

**Le SDK MCP n’est chargé qu’à l’allumage**, par un `import()` dans `control.ts` : il tire quelque
deux cents modules, et ce réglage est éteint par défaut. Un import statique les mettrait sur le
démarrage de tous les studios qui n’ouvrent jamais cette porte.

### Un client reçoit une commande, jamais une adresse

Ce que les préférences mettent dans le presse-papiers — et ce que `.mcp.json` porte — est
**l’application elle-même, lancée avec `--mcp-stdio=<chemin de mcp.json>`** (`mcpLaunch`,
`endpoint.ts`). Ce processus-là n’ouvre ni fenêtre ni services, ne prend pas le verrou d’instance
unique — un client se branchant pendant que le studio tourne serait sinon la seconde instance et
quitterait — et relaie stdio ↔ boucle locale (`stdio.ts`).

**Il relit l’adresse à CHAQUE message, jamais une fois.** C’est tout le mécanisme : les quatre
verrous ne bougent pas, et la configuration d’un client cesse de périmer au redémarrage du studio.
Sans cela le point d’entrée était inutilisable sous `electron-vite --watch`, qui relance le
principal plusieurs fois par heure — et coûtait un recollage par lancement à qui l’a installé.

**Le chemin de `mcp.json` voyage DANS la commande**, plutôt que d’être recalculé de l’autre côté :
un studio lancé avec `--user-data-dir` résout un autre profil, et le processus qui écrit l’adresse
ne serait jamais celui qui la lit. Et en développement il y a **un fichier d’adresse par
CHECKOUT** (`mcp-<empreinte>.json`), non par profil : deux studios de développement partagent un
`userData`, donc le second à démarrer reprenait le fichier du premier — ses clients pilotaient
alors le mauvais studio, et sa sortie effaçait le fichier sous un studio qui écoutait encore.

**`.mcp.json` se FUSIONNE, il ne s’écrase pas** (`mcpConfigWith`) : à la racine d’un dépôt, ce
fichier est la configuration client du PROJET et pas la nôtre — d’autres serveurs y vivent, et un
lancement qui le réécrivait les supprimait sans un mot. Un fichier malformé est laissé tel quel.

🛑 **Ce processus fait taire le journal avant toute chose** (`setLogVerbosity('silent')`) :
`log.info` écrit sur STDOUT, qui est ici le flux JSON-RPC du client. Une ligne de nous dessus et le
client ne lit plus rien ; ce qui va mal part sur stderr.

**En développement le réglage est allumé par DÉFAUT** (`defaultSettings`, `shared/domain/settings.ts`,
injecté dans le store) — ce qui ne vaut que pour un profil n'ayant jamais écrit ses réglages : un
`settings.json` existant porte `false`, et `merge` fait gagner le stocké. Sur un profil déjà servi,
il faut cocher la case une fois et le lancement dépose un `.mcp.json` à la racine du checkout, que Claude
Code lit seul. **`main/mcp/production-unchanged.test.ts` tient la différence** : hors développement
le défaut est éteint, le port reste celui du système, le jeton reste minté, et les quatre lignes de
délégation restent à zéro des deux côtés.

---

## Le renderer

```
src/renderer/src/
├── components/   les formes visuelles que PLUSIEURS features se partagent — voir plus bas
├── features/     un domaine par dossier, ses composants sous `components/`, ses outils de dock sous `tools/`
│   ├── shell/      les rails, les zones, l'espace des documents — et `main.tsx`, l'entrée
│   ├── image/ scene/ video/ audio/ code/ material/ skybox/ gui/   un éditeur par type de document
│   ├── explorer/ assets/ models/ git/ inspector/ timeline/ animation/ …   les outils ancrables
│   └── home/ settings/ usage/ manual/ document/ dictation/ assistant/ …   les surfaces hors dock
├── engines/      canvas, scene, timeline, audio, viewport, skybox, material, gpu, et `core/` — ce que tous les moteurs partagent
├── stores/       zustand : documents, tools, layouts, models, assets, jobs, settings, keymap
├── hooks/        raccourcis, menu natif, densité, état de fenêtre, debounce…
├── helpers/      fonctions pures, toutes testées
├── services/     l'accès au pont et la traduction des échecs
├── i18n/         l'initialisation d'i18next côté fenêtre
├── types/        `window.studio`, déclaré en global — le seul fichier de types du renderer
└── splash.ts     l'entrée de l'écran de démarrage, séparée pour ne jamais tirer le bundle
```

### Le premier écran

**Tout ce qu’un import statique atteint depuis `main.tsx` est dans le morceau que l’écran de
démarrage attend.** C’est la seule règle, et elle décide de ce que coûte l’ouverture d’une fenêtre
vide. Le splash lui-même a son entrée à part, précisément pour ne jamais tirer ce bundle.

Sept choses en sont tenues dehors, chacune parce qu’une session ordinaire ne les ouvre pas toutes :

| Ce qui est chargé à la demande                                                             | Pourquoi                                                                                      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Les **six éditeurs**                                                                       | une session en ouvre un ou deux ; les six pèsent plusieurs mégaoctets                         |
| Les **quinze panneaux**                                                                    | un espace en montre trois ou quatre, jamais les quinze                                        |
| Le **formulaire de génération**, et zod, `react-hook-form`, `@hookform/resolvers` avec lui | on ouvre un générateur, on n’arrive pas dessus                                                |
| La fenêtre des **Réglages** — son registre, ses sections, son brouillon                    | une cinquantaine de kilooctets d’une autre fenêtre                                            |
| La fenêtre des **Licences**                                                                | le texte intégral de chaque licence embarquée, que personne ne lit dans une session ordinaire |
| La fenêtre de **Consommation**                                                             | pour une raison plus dure que sa taille : la bibliothèque de graphiques                       |
| Le **parseur de polices** (`opentype.js`)                                                  | seul le texte en volume et les légendes en ont besoin                                         |

**Un `lazy()` qui échoue ne se rattrape pas par un réessai** : React met le rejet en cache, si
bien que le bouton « Réessayer » de la frontière d’erreur ne peut pas gagner sur ces routes. La
frontière est au-dessus des routes — celles des panneaux couvrent les docks, pas le shell qui les
tient — et elle n’attrape que les rendus : ni les gestionnaires d’événements, ni les promesses
rejetées, ni l’évaluation de `main.tsx` lui-même, dont un jet précède la frontière et laisse une
fenêtre vide qu’aucun React ne voit.

**Un test tient les sept lignes**, `eager-graph.test.ts` : il marche le graphe des imports
statiques depuis `main.tsx` et échoue si l’un d’eux réapparaît. Sans lui, un `import` ajouté sans
y penser défait le gain sans rien casser de visible — le pire des régressions, celle qui ne se
voit qu’au chronomètre.

**Les panneaux sont sortis à leur tour**, et c’est ce qui a rétréci la liste des voisins.
`app/toolComponents.ts` les importait tous d’un coup ; il déclare désormais, par panneau, **le
module à charger et ce que son en-tête fait** — cette seconde moitié est nécessaire, parce que la
ligne de titre se dispose au premier rendu et qu’un séparateur qui arriverait une frame plus tard
décalerait une rangée déjà à l’écran. Mesuré sur le même commit des deux côtés, préchargés
comptés, sans sourcemaps : **2 331 395 → 2 081 385 octets, −250 010, soit −10,7 %.**

> **Un glob sur le dossier supprimerait la copie du nom de chaque panneau, et il a été écrit puis
> retiré.** `eager-graph.test.ts` marche les imports **statiques** : un glob lui est invisible, et
> la garde qui surveille précisément cette propriété serait restée verte quoi que le glob fasse au
> chunk d’entrée. La copie reste, et `toolComponents.test.ts` la tient — un `layers` qui
> nommerait le module des mailles échangerait les deux en silence.

**Il reste deux voisins**, et aucun n’est un éditeur : ce sont des helpers que quelque chose du
premier écran va chercher à côté d’un éditeur. Ils étaient six ; **quatre sont partis avec les
panneaux**, puisqu’ils entraient par un panneau et non par le shell. Le test en fait un
**budget** : la liste peut rétrécir, jamais grandir. Une troisième entrée veut dire que le premier
écran est allé chercher plus loin que nécessaire.

**Il vise des dossiers, pas des fichiers.** Une garde posée sur quatre fichiers du dossier des
réglages laisse entrer le cinquième ; c’est ce qui a été corrigé en même temps que les réglages
eux-mêmes.

Les six éditeurs sont chargés à l’ouverture d’un document de leur type, jamais avant : celui
qu’une session ouvre coûte quelques centaines de millisecondes qu’elle allait dépenser de toute
façon.

### Le shell

Dockview tient le centre et **uniquement** le centre : les documents et leurs onglets. Les
fenêtres d’outil sont posées sur la gouttière du châssis par le shell lui-même, parce que leur
comportement — un rail qui bascule entre elles, des moitiés qui coupent une zone — n’est pas ce
qu’une bibliothèque de docking modélise.

Les fenêtres d’outil sont mémoïsées : un glissement de zone écrit une nouvelle taille à chaque
`pointermove`, et sans cela chaque frame re-rend les deux moitiés et tout ce qu’elles
contiennent, y compris une grille d’assets virtualisée. Leurs callbacks sont maintenus stables
pour que cette mémoïsation morde.

### La fenêtre de retour ne passe pas par le pont, et ce n’est pas une entorse

`sequence.mirror` ouvre une seconde fenêtre qui miroite le moniteur Programme, pour un second
écran. **Le pont IPC n’y porte qu’une chose : l’ouverture de la fenêtre** (`main/window/mirror.ts`).
Tout le reste — l’édition, le point de lecture, la lecture — voyage par un `BroadcastChannel`
(`features/video/components/mirrorChannel.ts`).

**Ce n’est pas un contournement de l’invariant 2**, qui garde la frontière entre PROCESSUS. Les
deux fenêtres chargent le même bundle de rendu : elles partagent déjà `SequenceState` comme type,
et le faire transiter par le main obligerait à redéclarer cette forme dans `shared/`, où elle n’a
rien à faire — une séquence appartient à l’espace Vidéo, et le processus principal n’en fait rien.

Trois choix s’y lisent, tous mesurés :

- **Deux sortes de message plutôt qu’une.** `edit` porte la séquence entière et ne part qu’à un
  vrai changement ; `time` ne porte qu’un nombre. Un scrub en émet quelques centaines par seconde,
  et reposter chaque piste à chacun serait la seule chose qui rendrait ce retour coûteux.
- **La lecture n’est pas diffusée image par image.** `playing` dit au retour de lancer SON
  transport depuis le temps qu’il a déjà. Un message par image le mettrait un saut derrière
  l’image qu’il est censé reproduire, et dériverait par-dessus.
- **Le retour RÉCLAME l’état à son ouverture** (`ask`). Un canal ne rejoue rien et la fenêtre
  s’ouvre longtemps après la publication : sans cette poignée de main, le retour restait sur son
  écran d’attente jusqu’à la retouche suivante.

Le moteur, lui, est **reconstruit** de ce côté plutôt que déplacé — invariant 3, pour la raison qui
le fonde : un contexte WebGL ne traverse pas la frontière entre documents. Et il est **muet**, parce
que le studio joue déjà ce son ; deux sorties s’entendraient comme un écho.

Enfin, seul **l’onglet au premier plan publie**. Deux séquences ouvertes se disputeraient sinon la
même fenêtre, et le retour montrerait celle qui a re-rendu en dernier plutôt que celle qu’on
travaille.

### Des registres, pas des listes

`shared/domain/tool.ts` déclare où vit chaque outil et quels espaces il sert.
`shared/domain/workspace.ts` déclare les espaces. Le renderer les enrichit d’icônes et de
composants ; le **menu natif lit les mêmes tables**. Déclarer un septième espace tient en une
entrée, et le compilateur réclame ensuite son icône et sa famille.

C’est pourquoi le registre d’outils vit dans `shared/` et non dans le renderer : le processus
principal a besoin de `{ id, zone, slot, workspaces }` pour ne proposer que ce que la section peut
ouvrir, et le dupliquer dégraderait `ToolId` en `string`.

Un outil peut déclarer **plusieurs placements**, pour des ensembles d’espaces disjoints —
l’Explorateur occupe la même moitié dans tous les espaces et à l’accueil, mais seul celui de
l’accueil exige un projet ouvert. **Aucun outil ne déclare deux moitiés d’espace de travail
depuis le 17/08**, l’Explorateur ayant abandonné la sienne en montant dans la colonne de gauche.
`tool.test.ts` verrouille les deux invariants qui rendent cela lisible :
les espaces de deux placements ne se recouvrent jamais, et les placements d’un même outil partagent
leur moitié — un outil qui changerait de moitié en même temps que de zone atterrirait dans une
autre rangée du rail selon l’endroit d’où l’on vient.

**L’ordre de `TOOL_PLACEMENTS` est celui du rail**, et c’est aussi lui qui désigne le panneau par
défaut ci-dessous — un test l’épingle espace par espace.

**Deux règles échappent au registre**, et deux seulement, parce qu’elles dépendent de l’état ou de
l’espace, quand `shared/` n’a aucune dépendance runtime. D’où une couche au-dessus, dans
`helpers/toolRegistry.ts`, plutôt qu’à l’intérieur :

- le générateur n’est offert que là où un modèle est choisi ou préféré ;
- une moitié que personne n’a choisie affiche le **premier panneau que l’espace y déclare**. Elle
  vaut `null` dans le store — clé absente, la moitié est fermée ; un identifiant, c’est un choix de
  l’utilisateur. La disposition est retenue une fois pour les sept espaces alors que ce premier
  panneau diffère dans chacun : y inscrire un identifiant imposerait la réponse d’un espace aux
  cinq autres. `shownTool` distingue les trois cas, et la migration vers la version 8 repose au
  défaut toute disposition antérieure, moitié par moitié.

---

## Les moteurs

Six, aucun React à l’intérieur d’aucun.

| Moteur             | Adossé à                        | Détient                                                             |
| ------------------ | ------------------------------- | ------------------------------------------------------------------- |
| `CanvasEngine`     | PixiJS 8.19                     | le document image : calques, formes, tracés                         |
| `SceneRenderer`    | three.js 0.185                  | la scène 3D : maillages, lumières, gizmos, caméra                   |
| `TimelineEngine`   | mediabunny + Canvas + Web Audio | la séquence : clips, lecture image ET son, formes d’onde, vignettes |
| `engines/audio`    | tableaux d’échantillons         | l’édition sonore : rogner, fondus, gain, normaliser, silences       |
| `SkyboxRenderer`   | `ViewportEngine`                | le ciel vu de l’intérieur : soleil, étalonnage, sondes              |
| `MaterialRenderer` | `ViewportEngine`                | la matière posée sur une forme : canaux PBR, environnement, tiling  |

Les trois qui montrent de la 3D partagent `engines/viewport/` — canevas, caméra, orbite,
redimensionnement, boucle à la demande, éclairage par image. Chacun écrivant le sien, c’était
trois chances de ne pas être d’accord sur un redimensionnement ou une libération.

**Six moteurs, douze dossiers sous `engines/` : les six autres ne sont pas des moteurs.**
`core/` porte l’historique partagé, `viewport/` le socle des trois vues 3D, `gpu/` les passes
de shader et le compteur de frame, `postfx/` les chaînes de post-traitement et leurs LUT,
`code/` la compilation des scripts hors du thread UI, et `csg/` la découpe booléenne.

**`csg/` est une couche, pas un moteur, et c’est délibéré** : elle ne détient aucune scène, ne
connaît ni document ni sélection, et c’est ce qui la rendra réutilisable hors du studio — pour
faire tourner un jeu, où la découpe a lieu à l’ÉDITION et jamais à l’exécution. Le graphe
(brushes, opérations, placements) est le document ; le maillage évalué est un cache compté par
références, jeté dès que plus aucun nœud ne le désigne, et reconstruit à la demande. Rien n’est
évalué pendant un geste : tout part au relâchement, dans un Worker qui reçoit le GRAPHE et rend
des buffers transférables. Ce que la découpe n’a pas fini de calculer s’affiche en brushes bruts —
le mur plein, sans sa fenêtre — jamais un objet manquant.
[ADR-25](../ci/adr/ADR-25-le-graphe-booleen-fait-foi.md) porte les décisions, y compris celles qui
préparent les collisions sans les livrer.

Celui du son est une paire de modules plutôt qu’une classe — `audioData.ts` fait le travail sur
les échantillons, `edits.ts` tient un `AudioEditState` rejouable depuis le fichier source. Même
invariant que les trois autres : l’édition est l’état, jamais le buffer en mémoire.

**C’est l’ÉDITION sonore. La LECTURE est une seconde paire, ailleurs** — `soundSchedule.ts` et
`soundPort.ts`, dans `engines/timeline/`, parce qu’elle lit une séquence de clips et non un
fichier. Le partage y est le même : l’arithmétique d’un côté, ce que seul un navigateur sait faire
de l’autre.

Chacun va de pair avec un module d’état pur (`canvasState.ts`, `sceneState.ts`,
`timelineState.ts`) et un module de commandes. Les commandes sont la seule voie par laquelle
l’état change, ce qui fait de l’undo un mécanisme générique dans `engines/core/history.ts` plutôt
que trois mécaniques sur mesure.

**La provenance d’une commande se déclare ; elle ne se devine pas.** Un geste ouvert — un curseur
tenu, un glissement en cours — fusionne les commandes qui arrivent pendant qu’il dure, ce qui est
tout son intérêt. Mais **une commande venue d’ailleurs** — une génération qui aboutit, un
double-clic, un dépôt — n’appartient pas au curseur qu’un panneau tient peut-être, et fusionnée
dedans elle fait disparaître une entrée d’undo. Elle passe donc par `runOutsideGesture` plutôt que
par `runCommand`. **Le store ne peut pas déduire cette différence** : aucune règle sur
`command.id` ne dit d’où vient l’écriture, et deviner à partir de la première commande d’un geste
déplace la fenêtre de course au lieu de la fermer — un champ ouvre son geste **au focus**, sans
aucune commande. Un seul appelant est concerné aujourd’hui, `setSkyboxSource`, qui sert les trois
chemins d’entrée d’une image dans un ciel.

`nodeFactory.ts`, `meshPrimitives.ts`, `lightTypes.ts` et `threeFactory.ts` gardent la
_description_ d’un nœud séparée de son instanciation three.js — une scène se sérialise donc sans
traîner le moteur de rendu avec elle, et se reconstruit depuis cette seule sérialisation.

Et une fois l’objet three instancié, **on le mute, on ne le remplace pas** : `.set` plutôt qu’un
`new`. Ces écritures arrivent à chaque image d’un glissement d’inspecteur, et le coût n’est pas
théorique — remplacer une matière expose à une recompilation de son programme de shader, remplacer
une couleur jette l’instance que three détient. Dix écritures de couleur suivent la règle, et
`threeSync.ts`, `MaterialRenderer.ts` et `SkyboxRenderer.ts` la portent chacun en commentaire, au
plus près de ce qu’elle garde.

**Une exception, et elle est délibérée** : `ViewportEngine` remplace bien l’objet du fond de scène,
parce que ce champ accepte `null` — un `.set` ne saurait pas l’effacer, et le fond ne se repeint
qu’au montage, au changement de thème ou au retrait d’un ciel — jamais par image.

La lecture passe par un **jeton unique**, `playbackToken` — une valeur de module dans
`engines/timeline/playback.ts`, pas un gestionnaire : celui qui veut jouer l'acquiert et fournit
de quoi l'arrêter, et l'acquisition suivante coupe le précédent. Deux lecteurs actifs, et le
scrubbing se met à saccader sans raison visible. La timeline et la forme d'onde de l'espace Audio
le prennent tous les deux au même endroit.

**Ce qu'un moniteur fait ENTENDRE passe par un second port, et son arithmétique est pure.**
`engines/timeline/soundSchedule.ts` ne connaît que des nombres : quand un extrait tombe sur
l'horloge de sortie, ce qu'un chargement arrivé en retard doit sauter plutôt que jouer tard,
combien de source dépense un clip accéléré, et **où passe l'enveloppe de fondu** — le `ClipFade`
que porte un `AudioChunk` donne les bords du CLIP en instants, pas en longueurs, parce qu'une
tranche peut commencer AU MILIEU d'un fondu, et `cueFor` en tire les coins de `SoundCue.ramps`.
`soundPort.ts` tient ce que seul un navigateur sait faire — une `AudioContext` unique par fenêtre,
ouverte au premier son et jamais fermée, le décodeur du navigateur, un `AudioBufferSourceNode` par
clip, et l'enveloppe posée sur son `GainNode` : `setValueAtTime` à l'instant du cue **avant** toute
rampe, faute de quoi la rampe partirait de l'instant où le graphe a été monté.

Un clip est planifié **entier** quand il entre dans l'horizon d'une seconde, jamais fenêtre par
fenêtre : une source relancée à chaque jointure s'entend comme un clic. Les échantillons, eux, sont
partagés par asset et comptés par référence (`engines/core/refCache.ts`) — `decodeAudioData`
décode le **fichier**, pas la part qu'un clip en prend.

**L'horloge de sortie est maître dès qu'elle tourne.** `TimelineEngine.play` réveille le son
**avant** de démarrer son horloge, parce que celle-ci demande une seule fois s'il y a une horloge
audio à suivre ; interrogée trop tôt, elle répondrait non pour toute la lecture et l'image
dériverait du son en moins d'une minute. Le port répond `null` tant que la sortie ne tourne pas —
une sortie suspendue fige son temps, et s'y accrocher arrêterait la séquence au lieu de la jouer.

**Ce qu'un moniteur affiche vient d'un sink, et le sink est choisi par le moteur.**
`engines/timeline/sinkPort.ts` ouvre un `VideoSampleSink` mediabunny là où l'asset porte une piste
vidéo, et un sink d'image fixe partout ailleurs — celui-ci rend la même frame à toute position, une
image n'ayant pas de temps à elle. `TimelineEngine.seek` ignore la différence : il demande une
frame et en reçoit une.

**Ce qu'il n'ignore pas, c'est l'absence de frame.** Une position sans échantillon et un asset
qu'on n'a jamais pu ouvrir rendent tous deux `null` ; `DecoderPool.undecodable(assetId)` les
sépare, et c'est de là que vient le message « Ce clip n’a pas pu être affiché » du moniteur, porté
jusqu'à React par `onUnreadable`. Le moteur ne le rapporte que si **aucune** piste n'a peint :
recouvrir une image correcte pour signaler celle du dessus serait un pire silence.

Les sinks ouverts sont bornés par le `DecoderPool`, une LRU par moteur, et il tient **deux
plafonds plutôt qu'un** — parce que les deux genres sont rares pour des raisons différentes. Un
sink vidéo occupe un décodeur matériel, dont un GPU grand public n'offre que deux à quatre ; un
sink d'image n'en tient aucun, il tient un bitmap, et répond donc à un plafond de mémoire.
Confondre les deux faisait évincer un rush pour un logo posé au-dessus.

---

## Une génération, de bout en bout

```
1. l'utilisateur choisit un modèle   panneau Modèles → stores/models
2. le renderer demande son schéma    provider:describe-model
3. le main le récupère               GET /models/{id}
4. le ModelRegistry traduit          schéma JSON → FieldDescriptor[]
5. DynamicForm le rend               react-hook-form + un schéma zod bâti sur les descripteurs
5b. le prix s'affiche                provider:estimate-cost → POST ?dryRun=true → 200 (402 en repli)
5c. le contexte du projet rejoint     promptContext — sur CES DEUX canaux, jamais ailleurs
6. soumission                        provider:generate
7. le JobManager met en file         concurrence bornée
8. il poll                           jobs.retrieve — 2 s est le PLANCHER, pas la cadence
9. la progression remonte            evt:job-progress → ligne d'état
10. succès                           metadata.assetIds → téléchargés dans le projet
11. le catalogue l'enregistre        SQLite → l'asset paraît dans l'Explorateur
```

Les étapes 3 et 4 sont la raison d’être de l’invariant 5. Les entrées d’un modèle lui
appartiennent ; un formulaire écrit à la main est juste pour exactement un modèle, exactement un
jour.

Un `kind` de champ inconnu se rend en saisie brute plutôt que de faire échouer le descripteur —
un formulaire de génération qui perd un champ en silence est pire qu’un formulaire laid.

**L’étape 5c est dans le handler et non dans le `JobManager`, et la file d’attente est pourquoi** :
un job attend des minutes avant de partir, et un contexte modifié entre-temps serait ajouté à un
corps que quelqu’un a déjà lu à l’écran. C’est aussi le seul point que le devis et la génération
partagent : ce qui est chiffré est ce qui est envoyé. La clé du champ de prompt se trouve par
`promptSpark`, jamais par son nom — un contexte tombé dans un _negative prompt_ demanderait
l’inverse de lui-même. Un modèle qui n’en déclare aucun n’est pas touché, en silence.

**Le prompt ÉCRIT voyage à côté** (`AuthoredPrompt`), du handler jusqu’au collecteur : l’API renvoie
ce qu’elle a reçu, et `generatedAssetName` taille le nom d’un asset dans les soixante premiers
caractères de son prompt — un projet à contexte aurait nommé tous ses assets pareil. `AssetGeneration`
ne gagne aucun champ : `withAuthoredPrompt` remet l’écrit dans `params`, ce qui fait qu’un
« regenerate » rouvre sur ce qui a été tapé plutôt que d’empiler le contexte à chaque reprise.
[ADR-24](../ci/adr/ADR-24-ce-qui-voyage-avec-le-projet.md).

**L’étape 8 ralentit quand la charge monte, et c’est ce qui la rend sûre.** L’intervalle est
`max(plancher, ceil(jobs_en_cours × 60 000 ÷ POLL_REQUESTS_PER_MINUTE))` : deux secondes est ce
qu’obtiennent une ou deux générations, pas une cadence fixe. À cadence fixe, quatre générations
simultanées demandent 120 requêtes par minute contre les cent que l’API accorde — le limiteur
retient alors chaque poll, le SDK réessaie, et **une génération qui tourne et qui est facturée est
rapportée comme un échec de débit au bout de quinze secondes**. Le budget lui-même est _dérivé_
des constantes de `rateLimiter.ts` et non écrit en clair, précisément pour qu’il ne devienne pas
faux en silence le jour où l’une d’elles bouge.

**L’étape 5b lit un prix dans deux formes de réponse, parce que la référence et le serveur ne
disent pas la même chose.** Un `?dryRun=true` ne crée aucun job et ne dépense rien. La référence
documente un **402** portant `estimatedCost` ; le serveur, observé sur les deux endpoints, répond
**200** avec `creativeUnitsCost` à côté d’un `job` vide. `main/provider/cost.ts` lit les deux, le
200 d’abord, le 402 en repli — un 500 ou un réseau mort remonte comme n’importe quelle panne,
jusqu’au journal.

> **C’est en ne lisant que le 402 documenté qu’aucun badge n’a jamais affiché de prix.** Le défaut
> était invisible par construction : un bouton sans chiffre se lit comme un modèle que l’API
> refuse de tarifer, exactement comme les trois autres cas qui donnent `null`. Il a fallu lancer
> une génération pour de vrai pour le voir. **Devant une API, la référence dit ce qui était prévu,
> pas ce qui répond.**

Le port est une fonction, pas une méthode : quel point de terminaison tarife le dry run regarde
la cible, pas le port.

Côté renderer, `useCostEstimate` débounce à 600 ms **et** garde un plancher entre deux envois,
dérivé de `INTERACTIVE_REQUESTS_PER_MINUTE` : un débounce seul n’a pas de plafond, seulement une
falaise — tapé plus lentement que son délai, chaque frappe part en requête. La même estimation
n’est pas achetée deux fois, et elle ne se réessaie pas.

**`DynamicForm` est chargé paresseusement**, et les trois fonctions qui appellent zod vivent dans
`helpers/dynamicFormSchema` séparément de `helpers/dynamicForm`. Les deux moitiés vont
ensemble : sans la seconde, `referencePictures` retenait zod dans le graphe eager. zod,
`react-hook-form` et `@hookform/resolvers` sont à **zéro** dans le chunk initial, qui passe de
2 030,50 à 1 810,88 kB — mesuré par décodage VLQ des sourcemaps, et verrouillé par des tests qui
lisent la source. C’est un cas particulier de la règle du [premier écran](#le-premier-écran).

---

## Projets et catalogue

Un projet est un dossier. `project.json` en est le manifeste (version, nom, dates) ; le reste est
la structure que le studio crée à l’ouverture — l’arborescence est dans le
[manuel](manuel/04-projets.md).

**`.project-context.json` est le second fichier du projet à porter de l’écriture humaine** : les
fiches qui disent ce que le projet raconte, ajoutées à toute génération et au briefing de
l’assistant. Il vit dans le DOSSIER et non dans les réglages, contrairement à
`settings.ai.projectRoles` — le critère est dans l’[ADR-24](../ci/adr/ADR-24-ce-qui-voyage-avec-le-projet.md).
Il refuse d’être écrasé quand il est illisible ou d’une version plus récente, l’inverse de
`jobStore.ts` : ce qu’il porte est le texte de quelqu’un.

Le **rôle d’un dossier** est dit par un marqueur qu’il porte, `.ia-studio-role`, et non par son
nom : dix rôles (`shared/domain/folderRole.ts`), un par endroit où le studio dépose quelque chose.
`DEFAULT_ROLE_PATHS` dit où chacun COMMENCE — `Images/`, `Modelling/Scenes/`, `Scripts/`… — et rien
de plus : le dossier est ordinaire dès la première seconde, et un renommage fait dans le Finder ne
lui fait rien perdre, le marqueur voyageant avec lui. Une table de chemins tenue ailleurs serait
fausse dès ce renommage-là.

La résolution est en deux temps (`main/project/folderRoles.ts`). `.index/folder-roles.json`
mémorise le dernier chemin de chaque rôle, et l’ouverture le VÉRIFIE contre le marqueur — dix
lectures. Seul un rôle qui ne répond plus déclenche une marche, qui réutilise `FolderReader.walk`
en montrant les fichiers cachés : un marqueur EN est un. Un rôle dont le dossier a disparu est
absent de la carte plutôt que pointé sur son défaut — absent dit « nulle part encore » quand un
défaut dirait « ici », et on écrit dans ce qui est ici ; le dossier revient au premier besoin
d’écriture (`ProjectStore.folderFor`), jamais à l’ouverture. Deux dossiers réclamant un rôle sont
arbitrés par la profondeur puis par l’ordre de code unit, jamais par un collateur.

Les noms sont en ANGLAIS et fixes : un dossier qui suivrait la langue serait renommé à chaque
changement, et chaque ligne de catalogue en dessous pointerait à côté du fichier. Ce qui se traduit
est le RÔLE — dix clés `folderRoles.*` — que l’explorateur dit par une icône de section et une
infobulle, le nom montré restant toujours celui du disque.

Le **catalogue** est `.index/catalog.db`, un index SQLite de chaque asset : identifiant, nom,
type, emplacement, étiquettes, dates, et le chemin quand l’asset est local. Il existe pour que
l’Explorateur puisse chercher parmi des milliers d’éléments sans toucher au système de fichiers, et
pour qu’un projet reste transportable.

**Il ne se reconstruit pas.** Rien ne redevine ce qu’un fichier EST : le catalogue se remplit au
fil des générations et des imports. Le supprimer perd les noms, les étiquettes, les dimensions, la
recette de génération, `derivedFrom`, le `sourcePath` des médias liés et le journal d’activité —
les fichiers restent, plus rien ne dit ce qu’ils sont. `.ia-studio/items.json` est ce qui reste à
lire ce jour-là : une sauvegarde indexée par empreinte de contenu, écrite après chaque passe de
réconciliation qui a changé quelque chose, que le studio ne relit jamais de lui-même.

**Une passe le remet d’accord avec le disque**, ce qui n’est pas le reconstruire. `catalogRescan.ts`
tourne dans le thread du catalogue à l’ouverture d’un projet et au retour de la fenêtre au premier
plan (plancher de 5 s, un passage à la fois) : elle retrouve par empreinte de contenu un fichier
déplacé hors du studio et refile sa ligne (`repath`), et elle DATE une absence — `missing_at` —
sans jamais supprimer de ligne. Deux passages donnent le même état. En cas d’empreinte ambiguë
elle ne fait rien : réécrire le chemin d’une ligne que personne n’a demandé à déplacer est la
seule panne qu’une réconciliation ne doit pas avoir. `search` et `countByType` masquent ce qui est
daté, si bien que la corbeille — qui date au lieu d’effacer — rend une ligne entière si le fichier
en ressort.

Un asset est soit `local` (un fichier du projet), soit `cloud` (encore uniquement chez le fournisseur).
Une image locale est servie au renderer sous la forme `ia-studio://<id>`.

Les **documents** sont des fichiers rangés où l’utilisateur veut — le dossier de leur section
n’est que là où atterrit une première sauvegarde, et `documents.list()` parcourt le projet entier
pour les trouver. Un par document, **nommé d’après le
document** — `Niveau.gltf`, `Bande annonce.otio`. Son identifiant vit dans l’enveloppe (version 3
du format) et non dans le nom du fichier : c’est ce qui permet de renommer un document, y compris
ouvert, sans qu’il devienne un autre document — la mise en page, la liste des récents et chaque
onglet sont indexés par cet identifiant. Un fichier écrit avant cette version porte son
identifiant comme nom (`<id>.gltf`) et se lit exactement comme avant ; rien n’est réécrit à
l’ouverture, le tampon vient au prochain enregistrement. Le dossier fait foi : un fichier dont l’en-tête annonce un
type que son extension dément est refusé plutôt qu’ouvert dans le mauvais éditeur. L’écriture
passe par un fichier de transit puis un `rename`, atomique dans un même dossier, de sorte qu’une
coupure en cours d’écriture ne laisse jamais un document tronqué là où était le travail.

Le corps du fichier appartient à l’espace qui l’a écrit, et une table par extension
(`main/project/documentBody.ts`) dit comment il est épelé. **Quatre formats ouverts, et
l’enveloppe du studio pour tout le reste.**

Le même mécanisme les tient tous les quatre : la **fenêtre** produit la structure standard, parce
qu’elle seule tient le catalogue, la scène et le GPU ; le `content` du document EST cette
structure ; le **processus principal écrit la syntaxe et la relit**, sans jamais parser l’état du
studio. Ce que le standard ne porte pas voyage à l’endroit que le standard réserve aux tiers, et
l’état y va **verbatim** — relire est alors une seule passe, et aucune règle n’est à tenir en
phase des deux côtés. Un fichier de nous lit de là ; un fichier venu d’ailleurs se reconstruit de
la partie standard seule, et ce que le standard ne dit pas est simplement absent.

Pour la **scène** et le **ciel**, c’est du glTF 2.0, sous la même extension — c’est la métadonnée
du fichier, jamais l’extension, qui dit lequel des deux genres il porte. L’en-tête voyage sur
`asset`, le seul membre que le format exige et que rien ne peut repousser plus bas : derrière la
liste des nœuds racines d’une grosse scène il tombait hors de la tête lue, et le document
disparaissait du listing.

Pour la **matière**, c’est du MaterialX 1.39 : un `standard_surface` alimenté par des
`tiledimage`, et l’état du studio dans un attribut personnalisé que la spécification oblige un
lecteur à préserver. Contrairement au glTF, ce format a une vraie **tête** — la racine est la
première ligne — donc lister n’ouvre jamais une matière en entier.

Pour le **montage**, le fichier EST le format ouvert : il n’y a pas d’enveloppe où loger
l’en-tête, donc le principal parse l’OpenTimelineIO à la lecture comme à l’écriture, et refuse
d’écrire un corps qui n’est pas un montage.

Pour l’**image**, le fichier est une archive OpenRaster — un ZIP, et non plus un dossier. Le
principal l’empaquette et la dépaquette : `mimetype` en premier et stocké, `stack.xml`,
`mergedimage.png` que la spécification exige, un PNG par surface sous `data/`, et l’état du studio
sous `provider/`. La fenêtre produit la pile (le `content` du document EST cette pile, en JSON) et
les surfaces à côté, en octets ; le principal écrit la syntaxe. **Un listing ne lit que les
premiers kilooctets du conteneur** — l’enveloppe du studio y est écrite deuxième et non
compressée, sans quoi lister un projet ouvrirait cent mégaoctets par document.

**L’enveloppe du studio n’est plus le format d’aucun genre** : elle reste le repli d’une extension
que la table ne nomme pas, et le **sursis de migration** des documents déjà sur les disques — une
scène ou une matière écrite avant ce basculement s’ouvre inchangée, et c’est le fichier lui-même,
pas son extension, qui décide de quelle épellation il relève.

**Un fichier revenu enrichi refuse de s’enregistrer.** Une scène rouverte dans Blender revient
avec des `meshes` et des `accessors` ; ses `extras` sont toujours les nôtres, donc elle se liste
et s’ouvre — et l’écriture recompose le document ENTIER depuis l’état. Comme un glTF est lié par
index, reporter ces parties à moitié ne produit pas un fichier à demi juste mais un fichier cassé :
le studio refuse et laisse le fichier tel quel. Même refus pour un ciel qui porte une scène entière
et pour une matière qui en porte plus d’une (`incomplete` dans `IO_BY_KIND`).

Un espace qui apprend à s’enregistrer n’a dans les trois cas pas de canal à lui. **Les six genres
savent s’écrire aujourd’hui** — image, scène, séquence, son, ciel et matière, déclarés en un seul
endroit, `IO_BY_KIND` dans `app/documentIo.ts`. Un genre absent de cette table a un Enregistrer
qui ne fait rien, plutôt qu’un qui écrit un corps vide.

**Aucun genre n’est plus écrit comme un DOSSIER.** L’image l’a été, `Planche.ora/` portant un
manifeste et un PNG par calque ; un dossier qui porte aujourd’hui l’extension d’un document est la
matière de l’utilisateur, et le walk y entre.

**Les pixels ne traversent plus la frontière en base64.** Une pile 4K de dix calques faisait des
centaines de mégaoctets de texte, détenus au même instant par la fenêtre qui encode et le
processus qui décode. `LayerPixels`, `OraSurface` et les parts d’un document portent des
`Uint8Array` ; le moteur extrait par un canvas et un blob, et restitue par une URL d’objet qu’il
révoque — une data URL de calque restait sinon dans le cache du chargeur pour toute la session,
la clé de ce cache ÉTANT la chaîne entière.

---

## Le contrôle de version

Le panneau Git travaille sur le dossier du projet ouvert. Tout ce qui suit vit dans le processus
principal (`main/git/`) ; le rendu ne fait que demander et afficher.

**git est un programme qu’on lance, pas une bibliothèque qu’on appelle.** La conséquence tient en
une question : la machine peut ne pas l’avoir. macOS répond en proposant d’installer les outils de
ligne de commande, une installation Windows nue n’a pas de git du tout. La question est donc posée
à l’ouverture du projet, jamais au premier commit — un panneau qui découvrirait le problème à ce
moment-là aurait laissé préparer un commit impossible. Ce que le panneau regarde est **une seule
union** de cinq états (`GitRepository`, dans `shared/domain/git.ts`) : pas de projet · pas de
binaire · dépôt non initialisé · prêt · une erreur, portant la ligne de git elle-même,
identifiants retirés. Un statut accompagné de trois booléens autoriserait « aucun projet ouvert ET
des fichiers modifiés », une forme que quelqu’un finit par afficher.

**Ce qui CONFIGURE git est retiré de l’environnement avant chaque commande.** Tout ce qui commence
par `GIT_`, plus les trois réglages que git lit sans préfixe — `PAGER`, `EDITOR`, `SSH_ASKPASS`.
Le reste est conservé, `HTTPS_PROXY` et `SSH_AUTH_SOCK` en premier. La raison n’est pas
théorique : un `GIT_DIR` hérité pointe ailleurs, un `GIT_EDITOR` hérité ouvre une fenêtre que
personne ne voit, et simple-git en refuse la plupart d’emblée — la commande échoue alors avant même
d’être lancée. **Côté utilisateur, cela se dit simplement** : exporter ces variables dans son shell
ne change rien au studio, et c’est voulu.

**Aucune invite, jamais.** `GIT_TERMINAL_PROMPT=0`, un `GIT_ASKPASS` vide, et `BatchMode=yes` pour
ssh. Une fenêtre de studio n’a pas de terminal où répondre : git laissé libre de demander
attendrait indéfiniment, sur une commande que l’utilisateur n’a aucun moyen d’annuler. **Le coût
se dit franchement** : une clé protégée par une phrase de passe, sans agent chargé, échoue au lieu
de la réclamer.

**Un git à la fois par projet.** Git prend `.git/index.lock` pour la durée de toute commande qui
écrit, et une seconde commande qui arrive pendant ce temps **meurt au lieu d’attendre** — deux
fenêtres qui se rafraîchissent ensemble suffisent à le produire. L’ordonnanceur de simple-git met
en file dans l’ordre, et c’est pourquoi le studio ne porte pas de seconde file à lui.

**Un jeton appartient à un HÔTE, jamais à un projet ni à un remote.** Un jeton personnel ouvre
tous les dépôts que quelqu’un possède sur GitHub ; le redemander par projet serait redemander la
même chaîne indéfiniment. Un serveur d’entreprise garde le sien. Le rendu peut demander **si** un
hôte en a un, et peut en poser un ; il ne peut jamais en relire un. C’est l’invariant 1 mot pour
mot, et c’est la forme qu’a déjà la clé API.

**Tout ce qui vient du rendu est validé avant d’atteindre git** — chemins, références, messages,
hachages, URL de remote (`main/git/validation.ts`).

---

## Le design system

**Si un composant vit dans un dock, il est maison.** Barres d’outils, inspecteurs, timeline,
outliner, navigateur d’assets, barre de titre, onglets — tout cela dans
`src/renderer/src/components/`.

DaisyUI est réservé aux surfaces où l’application redevient une application : préférences,
dialogues, gestion des clés API, onboarding.

Les primitives, toutes dans `components/` :

|                                                                                                 |                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Panel`, `PanelHeader`                                                                          | la surface sombre arrondie et sa ligne de titre                                                                                                                                      |
| `Row`                                                                                           | **la** ligne, partout — vignette ou icône, titre, sous-titre, actions, infobulle sur un nom tronqué                                                                                  |
| `Collection`, `CollectionBar`                                                                   | la liste virtualisée à deux vues, et sa barre de recherche/facettes/tri                                                                                                              |
| `MediaTile`, `Thumbnail`                                                                        | la tuile carrée légendée, et la même image à taille fixe                                                                                                                             |
| `Toolbar`, `ToolButton`, `Button`, `UiIcon`                                                     | la barre partagée, ses boutons d’icône, ses boutons libellés, l’unique porte des icônes                                                                                              |
| `ProgressRow`, `ProgressBar`                                                                    | « quelque chose se passe, voilà où ça en est » — partagés par le résumé des générations, sa liste dépliée et l’import de médias                                                      |
| `PropertySection` et les champs                                                                 | `TextField`, `NumberField`, `SliderField`, `RangeField`, `ColorField`, `VectorField`, `ToggleField`, `PictureField`, `AssetDropField`, `PropertyRow` — ce dont l’inspecteur est fait |
| `DynamicForm`                                                                                   | le seul formulaire de génération qui existe                                                                                                                                          |
| `Tree`, `Flyout`, `MenuButton`, `MenuRow`, `EmptyState`, `Timecode`, `Separator`, `TooltipHost` |                                                                                                                                                                                      |
| `styles.ts`                                                                                     | les chaînes de classes partagées par plus d’un composant : `FOCUS_RING`, `CONTROL`, `MEDIA_FRAME`                                                                                    |

Écrire à la main une ligne, une surface de panneau ou un cadre d’image est un bug de style, pas
un raccourci.

### Une collection annonce ce qu’elle est, et c’est une seule décision

`Collection` choisit **ensemble** le rôle du conteneur et celui de la cellule — `rolesFor` :
`listbox`/`option` quand les lignes se sélectionnent, `list`/`listitem` quand elles ne peuvent
qu’être ouvertes, aucun rôle quand elles ne répondent à rien. Les deux ne peuvent pas diverger,
et c’est le point : un `option` sans `listbox` autour est de l’ARIA invalide, que les moteurs
ignorent purement et simplement.

Trois conséquences pour l’appelant, et aucune n’est facultative :

- **`label` est requis.** Un `listbox` sans nom est une violation WCAG 2.0 A (4.1.2), et des
  panneaux qui n’en passent pas s’annoncent tous « listbox », sans se distinguer. Chacun donne le
  titre qu’il porte déjà.
- **Le compte annoncé est celui des données, pas de la fenêtre virtualisée.** `aria-posinset` et
  `aria-setsize` sont posés depuis l’index réel : sans eux, un catalogue de 2000 modèles se dit
  « 1 sur 35 », et le nombre change au défilement.
- **`aria-multiselectable` est déclaré, jamais déduit.** `pickFrom` offre shift et ⌘ à tous les
  appelants, mais la plupart n’en gardent qu’un — deux seulement passent `multiple`, l’Explorateur
  d’assets et la liste de nœuds. Le déduire promettrait une plage que les autres ne construisent
  pas.

`aria-selected` ne se pose que sur un `option`, et **une liste qui ne fait qu’ouvrir n’en est
pas une** : `onOpen` la déclare `list`/`listitem`, là où `onSelect` la déclarerait `listbox`.
L’Explorateur a payé la confusion — il peignait « ouvert » en empruntant `selectedIds`, ce qui
teintait des lignes que personne n’avait choisies **et** laissait sans teinte les deux panneaux
qui ont, eux, une vraie sélection. Il porte maintenant sa propre pastille, et le sous-titre dit
la même chose en toutes lettres — d’où l’`aria-hidden` sur le point : un lecteur d’écran ne
l’annonce pas deux fois.

**La même règle vaut pour `Flyout`**, dont le `role` est un paramètre et non une supposition :
`role="menu"` promet des rangées qu’un lecteur d’écran parcourt à la flèche, et un volet qui
contient un formulaire ou une liste de filtres ne tient pas cette promesse. Le composant ne peut
pas deviner lequel des deux il porte ; son appelant, si.

### Ce que le design system a repris à une bibliothèque

**Les bulles d’échec ne viennent plus de `react-toastify`**, qui a quitté les dépendances. Une
bulle est un panneau flottant de ce studio : une bibliothèque apportait sa propre surface, son
propre rayon et sa propre animation, à combattre contre les jetons — exactement la raison pour
laquelle un dock ne porte pas de contrôle DaisyUI. `ActivityToasts` réutilise `MENU_SURFACE`,
donc une bulle et un menu ont le même aspect parce qu’ils partagent la même chaîne de classes.

Deux bibliothèques ont fait le chemin inverse et sont entrées, chacune pour une chose qu’on
n’écrit pas soi-même :

|               |                                                                                       |
| ------------- | ------------------------------------------------------------------------------------- |
| `recharts`    | les courbes de la fenêtre de consommation — dépense par jour, par compte              |
| `opentype.js` | la lecture des tables d’une police, pour le texte en volume et la légende d’une image |

`opentype.js` est **chargé à la demande** : il ne pèse pas sur le premier écran, qui n’a aucune
police à disséquer.

### Jetons et densité

Les couleurs vivent dans le bloc `@theme` de `src/renderer/src/index.css` ; les gauges `--sc-*`
vivent dans `:root`, redéclarées sous `:root[data-density='compact']`. **Aucune valeur
hexadécimale dans un composant**, et aucun pixel là où une gauge existe — cette unique
redéclaration est ce qui fait que le réglage de densité atteint tous les contrôles d’un coup.

**Un cas y échappe, et il a un outil dédié : le code qui a besoin de la gauge en NOMBRE.**
L’estimateur d’une liste virtualisée en est le seul exemple — il prend un nombre, alors que la
ligne qu’il estime est dimensionnée par une classe. Écrire ce nombre en dur, c’est n’avoir raison
qu’à une densité : `useGauge` (`hooks/useGauge.ts`) relit la gauge et suit le réglage, par le même
signal que les moteurs — `onPaletteChange`. **Ce n’est pas une porte de sortie pour écrire des
pixels en JavaScript** : hors de ce cas, la classe reste la seule voie.

**Deux virtualiseurs le font, pour trois gauges** — `Tree` et `Collection`, cette dernière lisant
`--sc-control` et `--sc-row-stacked` **inconditionnellement**, une ligne qui empile un nom sur un
sous-titre ne tenant pas dans la hauteur d’un contrôle. Un hook ne se met pas derrière une
branche, donc les deux se lisent et la forme de la ligne choisit ensuite. Les constantes
`LIST_ROW_HEIGHT` et `STACKED_ROW_HEIGHT` ne sont **que** le repli d’une gauge illisible : aucun
appelant ne les passe plus, et trois le faisaient — chacun juste à une seule densité.

Les surfaces sont **plus sombres** que le châssis, à l’inverse de l’habitude web. C’est cette
inversion qui donne la lecture « panneaux posés sur un cadre ».

Le fond reste opaque : dans un studio on juge des couleurs, et la translucidité fausse tout ce
qui est au-dessus. C’est une décision de métier, pas d’esthétique.

---

## Internationalisation

Un dossier par langue dans `src/shared/i18n/` — `fr/` et `en/`, une section JSON par surface
fonctionnelle, recomposées en un seul objet par l’index du dossier. **Leur nombre n’est écrit
nulle part, et ce paragraphe ne l’écrit pas non plus** : `ls src/shared/i18n/fr/` fait foi, et
`main/i18n-sections.test.ts` lit le dossier au lieu de tenir une liste. Un compte écrit ici se
périme à la surface suivante — il annonçait douze quand le dossier en portait quinze. Les deux
langues sont tenues en parité stricte. Elles vivent dans `shared/` parce que le menu natif est
bâti par le processus principal et l’UI par le renderer, et que les deux doivent dire la même
chose.

Le découpage est un choix de **stockage**, pas de contrat : l’espace de noms reste unique, et
`main/i18n-sections.test.ts` refuse qu’un fichier plat réapparaisse à la racine du dossier.

**Les deux résolveurs ne sont pas d’accord sur ce cas, et c’est ce qui le rend dangereux** :
`tsc` lit `./fr` comme le dossier, donc **le typecheck reste vert** ; Vite lit le JSON, l’export
nommé disparaît, et `TRANSLATIONS.fr` vaut `undefined` à l’exécution — la langue entière. Ce
n’est donc pas le compilateur qui garde ce cas, mais cette suite, et elle seule. Elle tient aussi
la frontière entre les imports : dans `en/index.ts`, un import **de type** par section pointe vers
`../fr/` — c’est ainsi que la forme attendue d’une section anglaise est dérivée de sa jumelle
plutôt que recopiée — et autant d’imports **de valeur** pointent vers `./`. Un import de valeur qui
part vers `fr/` compile vert et rend toute une section en français.

### Une branche antérieure à la découpe entre en conflit : quoi faire

Une branche née avant le 15/08 modifie `fr.json` et `en.json`, que la découpe a supprimés. Git
propose alors un conflit **modify/delete** sur ces deux fichiers, et, si la branche a aussi touché
`shared/i18n/index.ts`, un conflit de contenu sur lui.

**Les deux résolutions réflexes sont fausses, et aucune ne rougit.** Garder le fichier plat —
ce que git laisse par défaut dans l’arbre — détourne l’import et rend `TRANSLATIONS.fr`
indéfini ; c’est le seul des deux cas que `main/i18n-sections.test.ts` attrape. Le supprimer
par `git rm`
**perd en silence toutes les clés que la branche avait ajoutées** : la parité reste bonne, le
typecheck passe, les gardes des bundles passent.

Le geste juste, dans cet ordre :

1. relever les clés que la branche ajoutait, avant de résoudre quoi que ce soit —
   `git diff <base>...<branche> -- src/shared/i18n/fr.json` ;
2. les réécrire dans la section de leur surface, des deux côtés (`fr/<section>.json` et
   `en/<section>.json`) ; une racine neuve qui n’appartient à aucune section demande de
   trancher entre une section existante et un fichier de plus — lequel se déclare dans les
   **deux** `index.ts` ;
3. `git rm` les deux fichiers plats seulement à ce moment-là ;
4. rejouer `main/i18n-sections.test.ts` et le typecheck, puis vérifier que le compte de clés a
   bien augmenté du nombre relevé à l’étape 1.

- **Tous les identifiants, commentaires, JSDoc, noms de fichiers, clés i18n, canaux IPC et
  descriptions de tests sont en anglais**, partout dans `src/`.
- Les seules exceptions sont les sections de `fr/` elles-mêmes, et les valeurs attendues dans
  les tests lorsqu’elles proviennent du bundle français.
- Aucune chaîne visible par l’utilisateur en dur dans un composant. Les clés dynamiques
  (`assetTypes.${type}`, `capabilities.${capability}`) se résolvent contre les mêmes bundles,
  avec le nom brut de l’API en repli, de sorte qu’une valeur inconnue affiche quelque chose de
  lisible plutôt qu’une clé manquante.

Les libellés utilisés dans une liste virtualisée sont résolus **une fois par le panneau**, jamais
par ligne : un défilement re-rend chaque ligne montée à chaque frame, et `useTranslation()` n’est
pas gratuit.

### Ce qui est traduit va plus loin que les phrases

Sept choses passent par les bundles sans en avoir l’air, et chacune répond à un défaut constaté :

- **les noms de touches** — `Espace`, `Suppr`, `Début` ne sont pas des libellés anglais laissés en
  place : l’écran des raccourcis les résout comme le reste ;
- **les unités et les dates** — `formatBytes` calcule une taille mais **ne la nomme pas** : le
  nom de l’unité est fourni par l’appelant, parce que `Mio` et `MiB` sont la même taille dans deux
  langues et que les abréviations avaient fini par vivre en français dans un fichier de calcul ;
- **le signe pourcent** — `formatPercent`, dans le même fichier : le français pose une insécable
  avant le signe et une virgule décimale, l’anglais ni l’une ni l’autre. Trois sites l’écrivaient
  à la main, deux à la française, et cette espace partait telle quelle vers un lecteur anglais.
  **Aucune garde i18n ne pouvait la voir** — un signe n’est pas un mot, donc aucun bundle ne le
  porte. `no-composed-percent.test.ts` refuse les deux façons de le composer, le gabarit et la
  concaténation, et **exempte les longueurs CSS par leur nom** — `width`, `left`, `top`… : une
  longueur est lue par le moteur de rendu, qui n’a pas de langue. **Ce qu’elle ne voit pas** : un
  pourcentage écrit d’un bloc, `'42%'`, qu’aucune interpolation ne trahit ;
- **les nombres écrits DANS une phrase** — `{{count, number}}` plutôt que `{{count}}` : un millier
  s’écrit « 4 000 » d’un côté de la Manche et « 4,000 » de l’autre, et l’espace du français est une
  insécable étroite. Le formateur d’i18next est `Intl.NumberFormat`, rien à configurer. Le compte
  des clés concernées monte à chaque lot ; `bundles.test.ts` est ce qui fait foi, pas un chiffre
  écrit ici. **L’exception est un facteur, pas un dénombrement** :
  `material.tilingPreviewTimes` écrit « 4× », et grouper une répétition serait faux précisément là
  où le groupement se verrait — `bundles.test.ts` tient la règle **et son exception**. Une **unité
  créative** ne passe pas non plus par `{{units, number}}` mais par `formatUnits`, qui ne se
  contente pas de grouper : elle garde deux décimales sous dix unités, parce qu’un appel bon
  marché arrondi à zéro se lirait **gratuit**. Le dernier appelant à l’avoir oubliée écrivait
  « 1 234 UC » avant la génération et « 1234 UC » après ;
- **les portées du journal** — une ligne d’activité affiche une phrase, jamais la clé qui la
  désigne ;
- **la langue du document lui-même** — `document.documentElement.lang` suit la langue choisie.
  `index.html` la portait en dur : un lecteur d’écran choisit sa voix dessus, et une interface
  anglaise sous `lang="fr"` était lue avec une phonétique française ;
- **le texte que le modèle écrit** — libellés, descriptions et options du formulaire de
  génération. Voir juste dessous : c’est le seul mécanisme du studio qui ne s’indexe pas sur une
  clé.

### Une largeur fixe est une décision d’internationalisation

**Le français dépasse l’anglais de moitié sur une clé du bundle sur six.** Partout où une largeur est
figée, cet écart devient un libellé coupé **dans une langue seulement** — « Aperçu de la
répétition » se lisait « Aperçu de la ré… » dans une colonne d’inspecteur de 80 px où
« Repeat preview » tenait entier.

Le remède n’est pas de raccourcir le libellé fautif : cela traite ce cas-ci et laisse le suivant.
**Ce qui est tronqué se lit au survol** — `PropertyRow` pose le `title`, et le pose **aussi en
mode empilé**, là où la colonne ne contraint pourtant rien : un titre qui apparaît et disparaît
selon la disposition serait une seconde règle à retenir.

Les barres d’outils échappent à la question par construction — `ToolButton` ne montre aucun
libellé, il en fait une infobulle.

### Le seul dictionnaire indexé sur du texte, et pourquoi

**L’API de génération ne connaît pas la langue** — ni `Accept-Language`, ni paramètre de locale sur
`models.retrieve`, rien dans le SDK. Le texte qu’un modèle publie pour ses propres entrées
(« Target size », « Max splat points », et les phrases d’explication sous elles) est donc traduit
ici ou nulle part.

`model-text.fr.json` s’indexe sur le **texte anglais**, pas sur la clé du champ, et c’est le seul
endroit du studio qui procède ainsi. La raison est que la moitié de ce que le panneau affiche est
une **phrase que le modèle a écrite**, pas un nom de champ : indexer sur la clé traduirait
« Max splat points » et laisserait sa description en anglais juste dessous.

Trois conséquences, dont une à accepter :

- **un libellé changé côté fournisseur retombe en anglais** au lieu d’échouer. `normalizeModelText`
  absorbe ce qui ne coûte rien à absorber — casse, espaces, apostrophe et tiret typographiques,
  ponctuation finale — et le repli est **la phrase anglaise elle-même, jamais une clé**. Le pire
  cas est donc l’écran d’avant, pas un écran cassé ;
- **sept mots restent en anglais** — `sampler`, `scheduler`, `LoRA`, `checkpoint`, `prompt`,
  `clip skip`, `denoising strength` — sous une règle **vérifiable** : on ne garde en anglais que
  ce qu’aucune surface ni le glossaire ne nomme en français. « C’est le terme du métier » ne l’est
  pas, et laissait passer `seed` quand deux panneaux disaient déjà « Graine ». Un test tient la
  liste, pour qu’en traduire un soit une décision prise contre un test rouge ;
- **la traduction s’applique au rendu, pas à la construction des descripteurs.** Changer de
  langue redit le formulaire ouvert au lieu d’attendre que le modèle soit rechargé. L’invariant 5
  est intact : rien n’est écrit à la main pour un modèle donné.

**Tout texte distant n’appelle pas ce remède, et prendre le mauvais coûte la garde.** Le rapport
d’usage affichait « images-generation » et « video » dans une fenêtre française : même symptôme,
autre outil. Ces valeurs-là sont **trois unions fermées et documentées**, listées par `usages.list`
et recopiées dans `shared/domain/usage.ts` : **21 actions dépensières**, **8 genres d’assets**, et
**100 actions du journal brut** — ces dernières sont une union _différente_ des premières, et le
mot qui les rapproche est un piège. `USAGE_ACTIONS` est ce qui est **facturé** ; `USAGE_EVENT_ACTIONS`
est ce qui **s’est passé**, y compris ce que rien ne facture (`subscription`, `asset-privacy`,
`assistant-message`). Les deux listes se recouvrent aux trois quarts, d’où **une seule table de
libellés que les deux consultent** — donc
**une clé de bundle par valeur**, tenue par `bundles.test.ts` comme le sont déjà les canaux PBR et
les portées du journal. Une action ajoutée par le fournisseur sans sa ligne fait rougir la garde.

La règle qui départage les deux :

| Le texte distant…                                           | L’outil                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| appartient à une **liste fermée** que l’API documente       | une clé de bundle par valeur, plus une garde exhaustive |
| est **écrit librement** et change avec chaque modèle publié | le dictionnaire indexé sur le texte source              |

Dans les deux cas le repli est **le texte brut de l’API, jamais une clé** : un écran en anglais
reste lisible, un écran qui affiche `usage.action.images-generation` ne l’est pas.

**Et une troisième catégorie attend son prochain cas** : un texte distant que le CODE lit autant
que l’œil ne se traduit pas du tout. Traduit d’un côté d’une comparaison et pas de l’autre, il
cesse silencieusement de dire ce qu’il disait.

C’est le même partage que `name` et `message` dans les gardes de texte en dur : **une chaîne qui
est aussi une donnée n’est pas un libellé**, et la traduire la casse comme donnée.

### Les gardes, et ce que chacun tient

Ce ne sont pas les mêmes tests, et les confondre laisse croire qu’une seule chose est surveillée.
Ils se partagent l’arbre sans se recouvrir, et tournent tous dans `pnpm validate`.

| Garde                                                                | Ce qu’il refuse                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/i18n/bundles.test.ts`                                        | une clé présente d’un côté et pas de l’autre, un ordre qui diverge, une valeur vide, une apostrophe ASCII en français, **une espace sécable devant `; : ! ?` ou dans les guillemets français**, un trou d’interpolation perdu — **et une phrase anglaise recopiée dans le bundle français** |
| `renderer/src/no-hardcoded-text.test.ts`                             | dans un `.tsx` : du texte entre balises, un littéral entre accolades, derrière un ternaire ou un `&&`, et tout attribut qu’un humain lit                                                                                                                                                    |
| `main/no-hardcoded-text.test.ts`, § _the main process_               | un mot écrit dans un dialogue natif ou dans un `label` de menu                                                                                                                                                                                                                              |
| `main/no-hardcoded-text.test.ts`, § _the registries_                 | dans `renderer`, `shared` ou `preload` : un libellé écrit là où une clé est attendue                                                                                                                                                                                                        |
| `main/no-hardcoded-text.test.ts`, § _the words nobody puts in a tag_ | dans les **quatre** arbres — `main` compris : une phrase liée à un nom, `const message = 'This project could not be opened'`, que ni les balises ni les champs de registre ne montrent                                                                                                      |
| `shared/licences.i18n.test.ts`                                       | de la prose dans un champ **affiché** de `src/shared/licences.json`, que `pnpm licences:collect` génère et que la fenêtre Licences rend tel quel. Le champ `text` est exempté : une licence se reproduit dans la langue de ses auteurs                                                      |

**Le dernier est arrivé le 11 août, et il ferme une voie qu'aucun des quatre autres ne pouvait
voir** : ils lisent tous l'arbre TypeScript, et ce texte-là n'est écrit dans aucun `.ts` — c'est
`scripts/collect-licences.mjs` qui l'écrit dans un JSON. Deux phrases anglaises s'affichaient
ainsi à un lecteur français. **Un fichier généré puis rendu tel quel est une voie vers l'écran**,
et la règle qui en sort vaut pour tous : le script porte le fait (`unmodified: true`), le rendu
porte la phrase, et la phrase vient d'un bundle.

**Les fixtures sont hors de TOUS les balayages, `*-fixtures.ts` comme `*-fixtures.tsx`, et des deux
gardes à la fois.** Une fixture construit la donnée qu'une suite affirme et n'atteint aucun écran —
mesuré : aucun fichier de fixtures de `src/` n'est importé par du code de production. Le
libellé qu'elle porte est celui que l'API rend, pas un mot que ce studio écrit. C'est une
**décision**, prise le 11/08 : forcer une fixture à passer par une clé de bundle ne rend rien plus
vrai et se lit plus mal.

**Ce que l'exclusion coûterait si elle dérivait, et le garde qui l'en empêche** : un fichier
nommé `*-fixtures.ts` qu'un panneau importerait serait invisible aux deux gardes — deux angles
morts sur un même fichier, dont aucun ne dirait un mot.
`main/import-cycles.test.ts`, § _what a shipped file may reach_, refuse cet import. Il juge sur le
chemin RÉSOLU, si bien qu'un alias, un `.js` écrit pour un `.ts` et le suffixe `?worker` de Vite
atterrissent tous au même endroit. **Ce qu'il ne voit pas**, et il le dit : un worker nommé par
`new URL(…, import.meta.url)` est une URL, pas un import.

**Une garde qui lit des données peut devenir aveugle sans rougir**, et c’est la raison du § _what
the guards would catch_ de `bundles.test.ts`. Ses huit vérifications passent par quatre helpers
locaux : un helper qui rendrait un tableau vide les ferait **toutes passer au vert en ne vérifiant
plus rien**. Cinq sondes tiennent maintenant ce que les gardes doivent voir — un trou
d’interpolation renommé d’une langue à l’autre, un formateur de nombre tombé d’un seul côté, deux
bundles qui ont cessé de s’aligner, une clé imbriquée que l’aplatissement doit atteindre. Vérifiées
**en cassant** : `holes()` neutralisé, deux sondes rougissent là où la garde des interpolations,
elle, restait verte. Les deux fichiers `no-hardcoded-text` en portent vingt entre eux depuis
toujours ; celui-ci n’en avait aucune.

**Une garde typographique n’est pas un luxe : elle tient ce qu’aucun éditeur ne montre.** Le
bundle français écrivait sa ponctuation double avec une espace ordinaire — quatre-vingt-quatre
valeurs, zéro insécable — et une espace ordinaire est un endroit où la ligne a le droit de se
couper. « Impossible d’importer « {{name}} » » vit dans le journal d’activité, une colonne étroite
où le nom interpolé fait ce qu’il veut de la longueur : le guillemet fermant se retrouvait seul en
début de ligne. Le choix est **U+00A0 et non la fine U+202F** — indiscernables à onze pixels, et
la large est celle que toutes les polices ont. La garde a mordu **dix minutes après sa livraison**,
sur trois clés d’un lot fusionné en parallèle : le motif étant invisible dans un éditeur, personne
ne l’aurait vu à la relecture.

**Le premier voit ce qu’aucun des trois autres ne peut voir.** Une phrase anglaise collée dans
une section de `fr/` passe _par_ le bundle : elle est irréprochable pour les gardes qui traquent le texte en
dur, et elle s’affiche pourtant en anglais devant un utilisateur français. Le test la reconnaît à
ceci qu’elle est **identique dans les deux fichiers**. Il ne compare que les phrases, jamais les
mots seuls : `Position`, `Rotation`, `Saturation` s’écrivent pareil dans les deux langues —
quatre-vingt-quatorze clés — et les inventorier coûterait plus cher que ce que ça attraperait.
Sept phrases sont identiques à dessein, et elles sont nommées : la marque, deux noms de format,
deux chemins, une ligne de copyright, un exemple de saisie.

### La seule surface qui embarque ses mots

Aucun garde ne peut atteindre le raccourci de bureau Linux : le `.desktop` est **écrit à la
compilation** et lu par l’environnement de bureau bien avant qu’un bundle existe. Il se localise
de la seule façon qu’il connaisse — une clé par langue, `Comment` servant de repli — et c’est
`electron-builder.yml` qui les porte.

Ce qui reste sous cette ligne n’est traduisible nulle part : la **description du paquet `.deb`**
n’a qu’une langue, comme le `synopsis` dont elle est la longue forme. Les deux sont désormais
la même phrase anglaise, au lieu d’un anglais dans le raccourci et d’un français dans le
gestionnaire de paquets — c’est la convention des métadonnées de paquet, et c’est l’endroit
exact où « tout est traduit » cesse d’être une promesse tenable.

---

## La configuration

Trois couches, qui ne se mélangent jamais : ce que règle l’utilisateur, ce que règle un
développeur, et ce dont le build a besoin.

### Ce que règle l’utilisateur

`shared/domain/settings.ts` déclare la forme entière, groupe par groupe — de l’apparence à la
dictée, en passant par la 3D, les raccourcis et l’accueil.
C’est le contrat, et c’est délibérément le **seul** type de réglages que le renderer puisse
voir : **les identifiants d’API n’y figurent jamais**. Le renderer lit un `AuthState`, pas une
clé.

La persistance passe par un port `PersistenceAdapter`. La production branche `electron-store`
et `safeStorage` (`settings/adapter.ts`) ; les tests branchent un adaptateur en mémoire. Les
valeurs simples atterrissent dans `settings.json`, dans le dossier de configuration de
l’utilisateur ; les identifiants sont chiffrés d’abord, puis rangés en base64 — `safeStorage`
rend des octets, et un fichier JSON tient des chaînes.

Si `safeStorage.isEncryptionAvailable()` est faux, l’enregistrement des identifiants **lève**
plutôt que de retomber sur du texte clair. Ce refus _est_ la fonctionnalité.

Tout ce qui est relu est validé (`settings/validation.ts`) : un fichier de configuration est
non typé par nature, et une valeur éditée à la main ou héritée d’une version antérieure doit
être écartée, pas crue.

### Ce que règle un développeur

`ELECTRON_RENDERER_URL` est posée par electron-vite en mode watch : c’est elle qui fait charger
la fenêtre depuis le serveur de développement plutôt que depuis le disque.

Les clés API se saisissent dans les réglages, chiffrées par le trousseau. Le packaging lit
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` et `APPLE_TEAM_ID` dans l’environnement s’ils y sont.

### Ce que l’environnement fournit sans qu’on le règle

Trois variables ne se renseignent nulle part : elles viennent du système, de la CI ou du lanceur
de tests. Chacune a un **repli qui marche** — aucune n’est requise, et c’est la raison de les
lire plutôt que de les exiger.

| Variable       | Posée par                     | Ce qu’elle change                                                          | Si elle manque                                               |
| -------------- | ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `LOCALAPPDATA` | Windows                       | ajoute les polices installées pour l’utilisateur seul aux dossiers balayés | seules les polices de la machine sont vues                   |
| `NODE_ENV`     | le lanceur de tests, à `test` | fait taire le journal du processus principal                               | le journal écrit, et une suite bavarde noie sa propre sortie |
| `GITHUB_SHA`   | GitHub Actions                | grave l’empreinte du commit dans le build, sans appeler git                | l’empreinte est demandée à git ; hors dépôt, elle vaut `dev` |

### Ce dont le build a besoin

`scripts/dist.sh` appelle electron-builder. Absentes de l’environnement, les trois variables
Apple lui font sauter la signature et la notarisation — il le journalise, et `pnpm dist` produit
quand même une application. Elle n’est simplement pas signée, et Gatekeeper le signalera à la
première ouverture. Les renseigner active la chaîne complète, sans toucher au code.

Le binaire ffmpeg se résout dans un ordre fixe — **embarqué**, puis **configuré**, puis le
**`PATH`** — et rend null plutôt que de lever quand aucun des trois ne répond. L’interface sait
alors quelle partie du pipeline est indisponible, et peut le dire au lieu d’échouer opaquement.

---

## Les tests

**Plus de 9 000 tests, sur près de 700 fichiers**, exécutés par Vitest — le chiffre exact bouge à
chaque fusion, `pnpm test` le dit (9 315 sur 686 le 17/08). Les tests unitaires sont colocalisés
(`*.test.ts` à côté du code) et écrits dans le même mouvement que le code, jamais après.

`pnpm validate` doit être vert avant tout commit. Il enchaîne les maillons que `package.json`
déclare, et c'est là qu'ils se lisent : les réécrire ici ferait une seconde liste, qui se
périmerait au premier maillon ajouté — c'est arrivé au job de CI, qui appelle désormais la
commande elle-même.

**Aucune mesure de couverture**, retirée le 2026-08-13 : elle était payée à chaque tour de boucle
pour un bénéfice qui ne compensait pas le temps pris sur les fonctionnalités ([ADR-14](../ci/adr/ADR-14-portee-de-la-validation-continue.md)).

Ce qui est couvert, en pratique : chaque helper, chaque module d’état et de commandes de chaque
moteur, la traduction de schéma, la file et le backoff du job manager, le catalogue, le contrat
IPC, et les panneaux via Testing Library.

---

## Ajouter quelque chose

| Ce que vous ajoutez               | Par où commencer                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Un panneau                        | une entrée dans `TOOL_PLACEMENTS`, puis `panels/<nom>/` avec un `index.ts` exportant `definition: { Content, Actions }` |
| Un espace de travail              | `WORKSPACE_IDS`, puis son icône et sa famille dans `helpers/workspaces.ts` — le compilateur réclame les deux            |
| Un canal IPC                      | `shared/ipc.ts` d’abord, le handler ensuite ; la signature en est dérivée, donc partez du contrat                       |
| Un type de maillage ou de lumière | `meshPrimitives.ts` / `lightTypes.ts` — la barre d’outils, les panneaux et le menu natif lisent ces tables              |
| Un outil image                    | `features/image/components/imageTools.ts`, dans le bon groupe                                                           |
| Une forme visuelle partagée       | `components/`, un composant par fichier, avec son test — et son nom porte le préfixe de ses dossiers                    |

Deux règles qui font gagner le plus de temps : vérifier qu’un helper n’existe pas déjà avant d’en
écrire un, et lire le voisinage avant d’y toucher. Les registres font que la plupart des ajouts
tiennent en une entrée dans une table, et non en une modification dans cinq fichiers.

---

## Livrer une version

Le studio se distribue en **installeurs par plateforme**, produits par GitHub Actions et
publiés sur les GitHub Releases, que l’application consulte elle-même pour se mettre à jour.

### Deux branches, deux rôles

`develop` intègre les features au fil de l’eau ; `main` ne reçoit que des merges de release et
porte les tags. **Un tag `v*` poussé sur `main` est le seul déclencheur du pipeline.**

```
feat/<nom> ──▶ develop ──▶ main ──tag v*──▶ build 3 OS ──▶ release en draft ──▶ publiée
```

### Ce que le pipeline produit

| Fichier                                            | Pour                                               |
| -------------------------------------------------- | -------------------------------------------------- |
| `.dmg` arm64 et x64                                | macOS Apple Silicon et Intel                       |
| `.zip` arm64 et x64                                | ce que consomme `electron-updater` — pas distribué |
| `.exe` (NSIS)                                      | Windows x64                                        |
| `.AppImage` et `.deb`                              | Linux x64                                          |
| `latest.yml`, `latest-mac.yml`, `latest-linux.yml` | les manifestes d’auto-update                       |
| `*.blockmap`                                       | le téléchargement différentiel                     |

Les trois plateformes sont packagées en parallèle mais **ne publient rien** : un job final agrège
les artefacts, **vérifie qu’aucun manifeste ni blockmap ne manque**, et crée la release en
**draft**. Une release incomplète casserait l’auto-update de toute la base installée sans erreur
visible — d’où ce contrôle bloquant, et d’où le fait que la publication reste un geste humain.

### La version

Semver, et le tag fait foi : `package.json` doit porter le même numéro que le tag. Un
désalignement produit des manifestes qui annoncent une version inexistante.

### L’auto-update dans l’application

`src/main/updater.ts` traduit les événements d'`electron-updater` en un `UpdateState` unique
(`idle`, `checking`, `available`, `downloading`, `ready`, `failed`), poussé au renderer par
`EVENTS.updateState` et rendu par `UpdateStatus` dans la barre de statut. Trois traits comptent :

- **`electron-updater` n’est chargé qu’au premier contrôle**, jamais à l’import — sans quoi le
  démarrage paierait une trentaine de millisecondes avant même le splash, y compris en
  développement où le contrôle n’a pas lieu.
- **Rien ne s’installe sans un geste** : le téléchargement est automatique, l’installation se
  fait au prochain quit, ou immédiatement si l’utilisateur clique.
- **Un échec est silencieux** : ne pas savoir si une version plus récente existe n’est pas un
  problème que l’utilisateur doit lire.

### Où lire la suite

|                                                          |                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| [`docs/ci/RELEASE.md`](../ci/RELEASE.md)                 | la check-list de publication et le rollback                     |
| [`docs/ci/SECRETS.md`](../ci/SECRETS.md)                 | les secrets de signature, leur obtention, leur rotation         |
| [`docs/ci/TROUBLESHOOTING.md`](../ci/TROUBLESHOOTING.md) | symptôme → cause → correction                                   |
| [`docs/ci/adr/`](../ci/adr/)                             | les décisions du pipeline, avec ce qui a été écarté et pourquoi |
