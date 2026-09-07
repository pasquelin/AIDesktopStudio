# ADR-17 — Le moteur de dictée tourne dans un `utilityProcess`

- **Statut** : Accepté
- **Date** : 2026-08-09

## Contexte

La dictée vocale hors ligne fait tourner Parakeet TDT 0.6b — six cents millions de paramètres,
640 Mo de poids en int8 — sur la machine de l'utilisateur. Il fallait décider **où**.

Trois endroits étaient possibles, et l'invariant 6 du guide en désigne déjà un : « toute
opération susceptible de dépasser 16 ms part ailleurs », avec `utilityProcess` en quatrième
réflexe pour ffmpeg, l'indexation et le hachage.

Les mesures qui ont servi, prises sur cette machine avec le modèle réel :

| Opération | Durée |
|---|---|
| Chargement du modèle | ~3,3 s |
| Décodage d'un segment de 7 s | 250 à 1 600 ms |
| Aperçu (décodage partiel) | 75 à 800 ms |

## Décision

**Le moteur tourne dans un `utilityProcess` dédié**, forké à la première dictée et oublié à sa
mort. Ni le processus principal ni le renderer n'exécutent d'inférence.

## Alternatives écartées

- **Dans le processus principal.** Il tient SQLite, le `JobManager`, le protocole `ai-desktop-studio://`
  et le menu natif. Un décodage d'une seconde y gèlerait **toutes** les fenêtres à la fois, et
  le chargement initial de 3,3 s bloquerait le studio entier au moment précis où l'utilisateur
  vient d'appuyer sur une touche. `better-sqlite3` étant synchrone, une requête de catalogue
  tombant pendant une inférence attendrait derrière elle.

- **Dans le renderer, par un Web Worker.** Le worker ne gèlerait pas la fenêtre, mais
  `sherpa-onnx` est un addon natif : un Web Worker ne peut pas le charger. Il aurait fallu une
  compilation WebAssembly du moteur — plus lente, et un wasm de cette taille embarqué « au cas
  où » est exactement ce que l'invariant 6 refuse.

- **Dans un `worker_threads` du processus principal.** C'est ce que fait le catalogue. Mais un
  thread partage le heap et le cycle de vie de son processus : 700 Mo de poids resteraient dans
  l'empreinte du processus principal, et un plantage de l'addon natif emporterait le studio
  entier. Le `utilityProcess` isole les deux — un moteur qui meurt coûte la phrase en cours, et
  la session le redémarre.

## Conséquences

- Le squelette est celui qui existait déjà pour les formes d'onde (`media/peaks-*`) : protocole
  typé, client à port injecté, résolution du chemin par `import.meta.url`, entrée Rollup dédiée
  dans `electron.vite.config.ts`. Rien de neuf n'a été inventé pour cette feature.

- **La poignée de main est obligatoire.** Lire 640 Mo peut échouer, et ça doit échouer à
  l'ouverture plutôt qu'à la première phrase — c'est le `ready` que `catalogThread` attend déjà.

- **Le processus se redémarre au plus trois fois.** Un moteur qui meurt sur le premier chunk
  serait sinon reforké par le suivant, tant que quelqu'un parle.

- **Le modèle est déchargé après un temps sans dicter** (dix minutes par défaut, réglable, `0`
  pour ne jamais décharger). C'est le seul moyen de rendre les 700 Mo sans quitter le studio.

- **Deux pannes n'existent que parce que le moteur tourne dans Electron**, et aucune n'était
  visible sous Node :
  - le paquet est CommonJS et construit ses exports par accès de propriété, ce que l'analyseur
    de Node ne traverse pas : `import { Vad }` compile et lève au premier lancement. Seul
    l'import par défaut fonctionne ;
  - le détecteur rend ses échantillons dans un **tampon externe**, qu'Electron refuse (« External
    buffers are not allowed ») là où Node l'accepte. `front(false)` demande une copie.

  Les deux sont tenues par le type partagé.

- **Un décodage à la fois.** L'audio arrive toutes les 100 ms et un décodage en prend plusieurs
  centaines ; `decodeAsync` rendant la main, les messages doivent être enchaînés (`serial.ts`)
  ou deux décodages se partagent un recogniseur qui n'est pas fait pour.
