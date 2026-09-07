# Local AI Engine

Le moteur d'IA locale d'AI Desktop Studio : un processus Python supervisé par le processus principal
d'Electron, qui **mesure et exécute** — jamais un second ordonnanceur.

## Ce qu'il est aujourd'hui

Le socle, le tuyau, et **cinq portes**, une par modalité. Le noyau se connecte, se présente,
répond `hardware.info`, et route vers un worker ce qu'il ne peut pas répondre lui-même —
`models.load`, `models.unload`, `generate`, `worker.status`. **C'est le principal qui nomme la
porte** sur chaque requête : lui seul sait quel modèle a été choisi pour quel emploi.

**Ni le noyau ni le salut d'une porte n'importent torch.** Mesuré le 22/08 sur la chaîne
complète : le noyau salue à **33 ms**, le worker paie l'import une fois, et le modèle reste chaud
entre deux générations. Une porte tenait le sien à **573 ms** — elle nommait son device, et le lire
importe torch ; sans ce champ elle salue à **34 ms** (médianes de 7, à chaud, extra `diffusion`
installé). Le device employé pour un calcul voyage sur le cadre de résultat de ce calcul.

## Les portes

Une porte est un **processus**, et c'est ce qu'un plan de libération peut tuer. Le noyau la
démarre à la première demande — une porte que personne n'a demandée est un processus qui n'a
jamais tourné — et lui parle par un `socketpair` hérité, dans le même NDJSON.

Ce qui diffère entre deux portes est une modalité et un nom, et **c'est une ligne de table** :
`protocol/doors.py` apparie porte et modalité, `workers/door.py` est la boucle, et le noyau lance
`python -m ia_studio_engine.workers.door <porte> <fd>`. Cinq modules répétaient ces quatre
lignes ; la table est lue par le noyau **et** par le studio, que `localRuntimes.test.ts` tient en
phase.

| Porte | Modalité | Adapter | Backend |
|---|---|---|---|
| `engine/diffusion` | image | `RoutingAdapter` (diffusers, plugin au swap) | PyTorch (MPS, CUDA ou CPU, **rapporté** par run) |
| `engine/video` | vidéo | idem | idem |
| `engine/audio` | son | idem | idem |
| `engine/3d` | maillage | idem | idem |
| `engine/skybox` | panorama 360 | idem | idem |

Les familles hors diffusers passent par `plugin_adapter.py`, dont la table `PLUGINS` porte les
trois faits d'une famille — ce qui l'ouvre, ce qui l'exécute, si elle exige CUDA — et `vendor/`
porte leur Python — un arbre par famille, chacun avec son fichier de licence, ce dont
`test_vendored_trees.py` fait foi plutôt que cette phrase. Tous sauf TripoSR et MMAudio demandent
CUDA, et sur Metal la carte le dit. MMAudio tourne sur MPS. Extra `plugin`, pas dans
`engine:check`.

**Deux extensions CUDA sont volontairement absentes, et ce n'est pas un oubli** : `nvdiffrast`
(licence NVIDIA non commerciale) et `diff_gaussian_rasterization` (Inria, non commerciale). Le
code vendu ne les atteint jamais — InstantMesh sort en couleurs de sommets plutôt qu'en carte de
texture, LGM écrit son nuage de gaussiens plutôt qu'un maillage. Les rétablir changerait la
licence de ce qui est distribué.

**Une op routée répond IMMÉDIATEMENT avec le job qu'elle a ouvert**, jamais avec son résultat :
un chargement lit des gigaoctets et une génération dure des secondes. Le résultat arrive en
`job.completed` ou `job.failed`.

## Ce que le moteur ne décide pas

Il **mesure et exécute**. Il peut refuser pour ce qu'il est seul à voir — aucun modèle chargé, un
dossier de poids qui porte du Python — et il ne **replanifie jamais**.

**Une garde à connaître** : l'adapter refuse un dossier de poids contenant un `.py`, **avant tout
import**. Mesuré le 22/08 : `trust_remote_code=False` ne protège PAS un dossier local dont
l'architecture est connue de Transformers — le `.py` s'exécute sans que rien ne soit demandé. Ce
qui protège vraiment est la liste de fichiers du manifeste, côté studio ; ceci est le second
verrou, et il nomme le fichier plutôt que de faire confiance à un drapeau.

## Le partage des rôles

Le processus principal **décide** : admission mémoire, quelle porte libérer, arbitrage entre
portes. Le moteur **mesure et exécute** : sa file technique, l'état de ses workers, les octets
réellement résidents, le device employé. Il peut refuser pour ce qu'il est seul à voir ; il ne
replanifie jamais. C'est la raison pour laquelle le module s'appelle `core/jobqueue.py` et pas
`core/scheduler.py` — un fichier nommé « scheduler » finit par en devenir un.

## Le contrat

Socket unix (macOS, Linux) ou named pipe (Windows), cadres **NDJSON**, un objet JSON par ligne.
Le moteur parle en premier : `engine.hello` porte la version du protocole, et un désaccord tue le
processus plutôt que de le dégrader.

```jsonc
{"v": 2, "id": 42, "op": "hardware.info", "params": {}}   // requête
{"v": 2, "id": 42, "ok": {…}}                             // réponse
{"v": 2, "id": 42, "err": {"code": "…", "message": "…"}}  // refus
{"v": 2, "evt": "engine.hello", …}                        // événement
```

La version vit à deux endroits, `__init__.py` et `pythonProtocol.ts`, et rien ne les compile
ensemble — `main/ai/pythonProtocol.test.ts` lit le fichier Python pour tenir les deux en phase.

**Des chemins, jamais des octets.** Une génération écrit son résultat dans un fichier que le
principal contrôle, et le cadre porte le chemin.

## Autonomie

`engine/` **n'importe rien du dépôt à l'exécution**. Ce qu'il lui faut lui est passé par le
protocole. C'est la condition de son extraction future : le jour où elle se décide, c'est un
`git filter-repo --subdirectory-filter engine` et un workflow à déplacer.

## Développer

Le moteur est gardé par la porte du dépôt, sixième maillon :

```bash
pnpm engine:check        # ruff check + ruff format --check + pytest
```

À la main, depuis la racine du dépôt :

```bash
uv run --project engine ruff check engine
uv run --project engine ruff format engine
uv run --project engine pytest engine/tests
```

`uv` matérialise l'environnement seul ; aucun `pip install` n'est à lancer. Python 3.12 minimum.
Le groupe `dev` porte **numpy et Pillow** en plus de pytest et ruff — 37 Mo installés, ce qu'il faut pour que
`skybox_fill` soit gardé sans que la porte paie les 682 Mo de `diffusion`.

**La porte n'installe JAMAIS le groupe `diffusion`** — elle téléchargerait 682 Mo pour être verte.
Les tests d'`engine/tests` sont écrits pour n'en avoir aucun besoin : ce qu'un vrai backend fait
est prouvé par une exécution de bout en bout, pas par la porte. Pour travailler sur un worker :

```bash
uv pip install --project engine --extra diffusion
```

## Angle mort connu

Le named pipe Windows n'a **jamais été exécuté** — aucune machine Windows n'a été mesurée. Node
sert le pipe nativement, et Python l'ouvre comme un fichier ; c'est écrit dans `_open_stream`, et
la spécification garde la question ouverte.
