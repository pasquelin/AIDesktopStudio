# Auto Rig / Make-It-Animatable — Phase 5

Date de mesure : 4 septembre 2026. Machine disponible : Apple M2 Max, 96 Go,
macOS 26.5.2 (Darwin 25.5.0), arm64.

## Verdict

**GO WITH BLOCKERS**

| Axe | Statut | Motif |
| --- | --- | --- |
| TECHNICAL READY | oui, macOS arm64 | Pipeline fonctionnel, runtime minimal reproductible, smoke MPS complet. |
| DISTRIBUTION READY | non | Aucun certificat Developer ID ni notarisation disponible ; Gatekeeper rejette le bundle ad hoc. |
| PLATFORM READY | partiel | M2 Max MPS/CPU validé ; aucune autre machine n’a été mesurée. |
| LEGAL READY | non | La provenance et les droits dérivés des quatre checkpoints ne sont pas établis. |

La fonctionnalité doit rester expérimentale et `licenceStatus: restricted`. Elle ne doit pas être
activée dans une release publique avant la levée des blockers exacts en fin de rapport.

## Technique

### Package macOS arm64

- Bundle `.app` réel construit par Electron Builder avec Electron 43.4.0 ; les quatre checkpoints
  sont absents du bundle.
- Taille logique de l’app : **1 352 131 224 octets** ; taille allouée : 1 462 689 792 octets.
- Moteur embarqué : **652 217 106 octets** logiques ; `site-packages` minimal :
  **590 776 731 octets** logiques.
- CPython : **3.12.14 arm64**, build `python-build-standalone` 20260814, archive épinglée et
  vérifiée par SHA-256.
- Coût du chemin MIA hors checkpoints : environ **590,8 Mo logiques** de packages Python, dont
  Torch constitue l’essentiel. Gradio, Blender/bpy, FBX2glTF, notebooks, training stack,
  TensorBoard, CUDA, `torch-cluster`, `timm`, `torchvision` et Hugging Face Hub sont absents.
- Une copie complète dans un répertoire temporaire hors worktree importe Torch 2.14.0, NumPy 2.5.2 et
  einops 0.8.2, et détecte MPS. Elle ne consulte ni Homebrew Python, ni Conda, ni compilateur.
- Les imports du sidecar définissent `PYTHONDONTWRITEBYTECODE=1`; aucun `__pycache__` n’est créé
  dans le bundle et le sceau ne change pas après le probe.

### Signature et Gatekeeper

| Contrôle | Résultat mesuré |
| --- | --- |
| Identité Developer ID | **absente** : `security find-identity` retourne 0 identité valide. |
| Signature Electron Builder | ad hoc uniquement quand la découverte d’identité est désactivée. |
| Hardened runtime | configuration présente ; bundle ad hoc resigné avec le flag `runtime`. |
| Modules Python natifs | 38 Mach-O inventoriés ; globs `binaries` ajoutés au packaging. |
| `codesign --verify --deep --strict` | passe avant exécution sur le bundle scellé. |
| Chargement Torch en hardened ad hoc | **échec** : Team ID différent/absent sur `libtorch_global_deps.dylib`. |
| Notarisation / staple | non exécutés : certificat et credentials Apple absents. |
| Gatekeeper | **rejeté**, résultat attendu pour une signature ad hoc non notariée. |

La signature ad hoc ne peut pas simuler une identité d’équipe Apple. Le pipeline CI sait déjà lire
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` et
`APPLE_TEAM_ID`. Dès que les secrets existent, il faut signer les Mach-O listés par `mac.binaries`,
signer l’app, soumettre à `notarytool`, stapler, puis refaire le smoke depuis le bundle installé.

### Runtime Python exact

Le manifeste commité `engine/autorig-runtime.json` est la référence de la cible macOS arm64. Les
fichiers de licence inclus par les wheels restent dans leurs `dist-info`.

| Package | Version | Wheel | Native | Licence vérifiée |
| --- | ---: | --- | :---: | --- |
| einops | 0.8.2 | `einops-0.8.2-py3-none-any.whl` | non | MIT |
| filelock | 3.32.3 | `filelock-3.32.3-py3-none-any.whl` | non | MIT |
| fsspec | 2026.7.0 | `fsspec-2026.7.0-py3-none-any.whl` | non | BSD-3-Clause |
| jinja2 | 3.1.6 | `jinja2-3.1.6-py3-none-any.whl` | non | BSD-3-Clause |
| markupsafe | 3.0.3 | `markupsafe-3.0.3-cp312-cp312-macosx_11_0_arm64.whl` | oui | BSD-3-Clause |
| mpmath | 1.3.0 | `mpmath-1.3.0-py3-none-any.whl` | non | BSD-3-Clause |
| networkx | 3.6.1 | `networkx-3.6.1-py3-none-any.whl` | non | BSD-3-Clause |
| numpy | 2.5.2 | `numpy-2.5.2-cp312-cp312-macosx_14_0_arm64.whl` | oui | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| pip | 26.2.1 | `pip-26.2.1-py3-none-any.whl` | non | MIT |
| setuptools | 84.0.0 | `setuptools-84.0.0-py3-none-any.whl` | non | MIT |
| sympy | 1.14.0 | `sympy-1.14.0-py3-none-any.whl` | non | BSD-3-Clause |
| torch | 2.14.0 | `torch-2.14.0-cp312-cp312-macosx_14_0_arm64.whl` | oui | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT |
| typing-extensions | 4.16.0 | `typing_extensions-4.16.0-py3-none-any.whl` | non | PSF-2.0 |

Le chemin MIA a donc **zéro licence inconnue**. Les 42 dépendances historiques de l’extra `plugin`
restent un backlog distinct : elles ne sont ni installées ni chargées par le profil `autorig` du
package arm64. Les 19 packages CUDA verrouillés pour Linux sont également hors de ce bundle.

### Performance et mémoire

Le harnais `pnpm bench:autorig:smoke -- <python> <sources> <checkpoints> <sortie> <assets...>`
enregistre machine, OS, RAM, device réel, cold, warm, pic RSS et mémoire après unload. Il signale,
sans faire échouer la CI, un dépassement de 3× la baseline Phase 4.

| Asset | Cold Phase 5 | Warm Phase 5 | Pic RSS | Device |
| --- | ---: | ---: | ---: | --- |
| B6KV mono-mesh | 4,594 s | 1,321 s | 1 304 444 928 o | MPS |
| Tripo/JRPG mono-mesh | 14,488 s | 5,437 s | 1 639 972 864 o | MPS |
| Multi-mesh réel | 7,291 s | 3,117 s | 1 971 372 032 o | MPS |

Les trois résultats sont valides. B6KV reste sous le seuil. Le warm multi-mesh atteint 3,34× sa
baseline et déclenche l’avertissement non bloquant du harnais ; le JRPG n’a pas de baseline associée
à son nom de fichier actuel. Cela doit être surveillé, pas transformé en test unitaire fragile.

Après la dernière inférence, `models.unload` libère les réseaux et appelle le collecteur/allocator.
La mémoire Metal tenue, relue par `torch.mps.driver_allocated_memory()`, passe de
**4 146 724 864 octets** avant unload à **36 306 944 octets** après unload, soit 99,1 % restitués.
Le pic RSS est un maximum historique et ne peut donc pas mesurer une baisse ; le compteur Metal
prouve la restitution de la mémoire accélérateur, tandis que le processus garde normalement les
bibliothèques Torch mappées.

## Audit juridique et documentaire

Ce chapitre est factuel et ne constitue pas un avis juridique.

### Code MIA

- Source officielle auditée : commit
  [`d60cc7e01ff8da46448e458dbf450e8967b34e77`](https://github.com/jasongzy/Make-It-Animatable/tree/d60cc7e01ff8da46448e458dbf450e8967b34e77).
- Auteur du copyright : Zhiyang Guo, 2025.
- Licence du code : **MIT**, d’après le
  [fichier LICENSE officiel](https://github.com/jasongzy/Make-It-Animatable/blob/d60cc7e01ff8da46448e458dbf450e8967b34e77/LICENSE).
- Redistribution et usage commercial du code : permis par la MIT sous réserve du maintien de la
  notice. `THIRD-PARTY-NOTICES.md` distingue désormais le code MIT des checkpoints.

### Quatre checkpoints

Source commune : dépôt officiel Hugging Face `jasongzy/Make-It-Animatable`, révision immuable
`eb12b71253361fd1a7216625a95144af3c58263e`, publiée sous le compte `jasongzy`. La
[model card à cette révision](https://huggingface.co/jasongzy/Make-It-Animatable/blob/eb12b71253361fd1a7216625a95144af3c58263e/README.md)
déclare `license: apache-2.0` et `datasets: jasongzy/Mixamo`. Elle ne documente pas la chaîne de
droits des données ni une autorisation spécifique des détenteurs des données.

| Checkpoint | Taille | SHA-256 | Licence déclarée | Pipeline documenté | Redistribution / commercial | Certitude |
| --- | ---: | --- | --- | --- | --- | --- |
| `bw.pth` | 424 693 698 | `8ff6abc9ed78665513d2dcd7b2d7e8430f6c86335389120281be3bd999d27830` | Apache-2.0, model card | weights + Mixamo + échantillons 3DBiCar/RaBit | **UNKNOWN** | faible |
| `joints.pth` | 525 833 771 | `595587abb2ef9977bc9e49f8221c326da473de8ff1cd8785eb55ac63acde2b8e` | Apache-2.0, model card | joints + Mixamo + échantillons 3DBiCar/RaBit | **UNKNOWN** | faible |
| `joints_coarse.pth` | 424 706 373 | `389e18f92a65e7925c1a940dfff22cc85e9ac4ead17ab4a65fd4ef5d6088b96b` | Apache-2.0, model card | coarse joints + Mixamo + échantillons 3DBiCar/RaBit | **UNKNOWN** | faible |
| `pose.pth` | 525 848 433 | `4996440d7d90064516e134e748abacd3b96e17856a7d8a4a245bbeb205402b7e` | Apache-2.0, model card | pose + Mixamo + échantillons 3DBiCar/RaBit | **UNKNOWN** | faible |

Total exact : **1 901 082 275 octets**. L’auteur individuel des quatre fichiers et la preuve que
les poids publiés proviennent exactement du `train.sh` public sont **UNKNOWN**.

### Données et impact

```text
bw / joints / joints_coarse / pose
  → train.sh documenté : data/Mixamo + character_rabit_refined
  → Mixamo : 95 personnages, 2 453 animations, dérivés character_refined
  → character_rabit_refined : échantillons 3DBiCar/RaBit riggés par Mixamo
  → droits ML, dérivation des poids et redistribution : UNKNOWN
```

- Le [dataset card officiel Mixamo](https://huggingface.co/datasets/jasongzy/Mixamo/blob/main/README.md)
  décrit 95 personnages et 2 453 animations téléchargés depuis Mixamo, puis transformés avec
  Blender. Il ne déclare aucune licence de dataset exploitable dans cette card.
- Le README/code officiel MIA indique que `character_rabit_refined` participe à l’entraînement des
  quatre tâches et que certains exemples 3DBiCar, riggés par Mixamo, améliorent la généralisation.
- La [FAQ officielle Adobe Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
  autorise l’usage royalty-free des personnages/animations dans des projets personnels,
  commerciaux et non lucratifs. Elle ne traite pas explicitement l’entraînement ML, les poids
  dérivés, la redistribution du corpus ou des checkpoints : ces droits restent **UNKNOWN**.
- La [page officielle RaBit/3DBiCar](https://gaplab.cuhk.edu.cn/projects/RaBit/) annonce 1 500
  modèles artisanaux et une diffusion « à la communauté de recherche ». Aucune licence publique
  autorisant usage commercial, entraînement dérivé ou redistribution n’a été trouvée : **UNKNOWN**.

L’Apache-2.0 déclarée par la model card couvre ce que son déclarant est habilité à licencier ; elle
ne prouve pas à elle seule que les droits amont permettent la distribution commerciale des poids.

### Deux modes de distribution

**A — hébergement IA Studio.** IA Studio copie et redistribue directement les quatre fichiers. Il
faut une autorisation certaine de redistribution commerciale des checkpoints et respecter les
notices applicables. Cette option est **bloquée**.

**B — téléchargement depuis Hugging Face officiel.** IA Studio ne réhéberge pas les octets et
épingle la source officielle. Cela réduit le rôle technique d’hébergeur, mais ne transforme pas une
licence inconnue en autorisation : l’application organise toujours l’acquisition et l’usage des
poids dans un produit commercial. Cette option est également **bloquée** en l’absence de
clarification.

### Message prêt à envoyer aux auteurs

> Subject: Commercial desktop use and checkpoint licensing for Make-It-Animatable
>
> Hello, we are evaluating Make-It-Animatable as an optional local Auto Rig backend in a desktop
> 3D application. Could you please confirm in writing whether the four published checkpoints
> `bw.pth`, `joints.pth`, `joints_coarse.pth`, and `pose.pth` may be used commercially in such an
> application, both (1) when users download them directly from your official Hugging Face
> repository and (2) if we redistribute unchanged copies? Please also confirm the provenance and
> applicable terms of the Mixamo and 3DBiCar/RaBit training data, whether those terms permit the
> resulting weights to be used and redistributed commercially, and whether users may commercially
> use and distribute the rigs/skin weights generated by the checkpoints. If Apache-2.0 is intended
> to cover the checkpoint files, please confirm that you have the necessary rights to grant it for
> those files. Thank you.

Aucun auteur n’a été contacté pendant cette phase.

## Plateformes

| Plateforme | CPU | GPU | Statut |
| --- | --- | --- | --- |
| macOS Apple M2 Max | validé | MPS validé | Validé techniquement |
| macOS Apple M1 | non testé | non testé | Non testé |
| macOS Apple M3 | non testé | non testé | Non testé |
| macOS Apple M4 | non testé | non testé | Non testé |
| macOS Intel | non testé | — | Non testé |
| Windows | non testé | non testé | Non testé |
| Linux | non testé | non testé | Non testé |

Le descriptor générique expose `available`, `unavailable`, `untested` et `unsupported`. MIA ne
déclare actuellement que `darwin/arm64` disponible ; toute cible non déclarée répond `untested`,
jamais `unsupported` par supposition. Le runtime Auto Rig n’est matérialisé automatiquement que
pour le package macOS arm64.

## Produit

| Parcours | État |
| --- | --- |
| MIA visible sans modèle | validé Phase 4, inchangé |
| téléchargement, `.part`, reprise, annulation, SHA, renommage atomique | tests Model/Download Manager conservés |
| suppression et restitution des 1 901 082 275 octets | tests Phase 4 conservés |
| checkpoint corrompu | SHA refusé avant `torch.load`; retéléchargement proposé |
| offline avec checkpoints | inférence locale sans accès réseau validée |
| offline sans checkpoints | téléchargement indisponible, Simple proposé |
| fallback Simple | disponible, jamais silencieux |
| Undo | validé Phase 4, tests conservés |
| GLB round-trip mono/multi | validé Phases 3/4, indépendant de MIA après réimport |
| installation propre | bundle copié hors worktree : runtime/MPS validés ; DMG Gatekeeper bloqué par signature/notarisation |

Le test packagé hardened s’arrête avant `torch.load` lorsque la signature ad hoc échoue : le
checkpoint n’est donc jamais désérialisé dans cet état. Le code MIA n’appelle que
`torch.load(..., weights_only=True)` ; les quatre chemins viennent du dossier contrôlé par le Model
Manager après comparaison SHA-256. Aucun `.pth` fourni par un projet utilisateur n’est accepté.

## Architecture

Ajouter SkinTokens ne nécessite aucune refonte produit. Un futur chantier doit fournir uniquement
un backend, son adaptateur vers `AutoRigResult`, son profil runtime/dépendances et ses entrées de
modèles. L’action Auto Rig, l’IPC générique, le Download Manager, les Réglages, `Rig`,
`SkinBinding`, `applyRig`, Undo et GLB restent inchangés. Aucun code SkinTokens n’a été ajouté.

## Tests Phase 5

- manifeste runtime exact et licences non vides ;
- absence des dépendances inutiles et de `torch-cluster` dans le profil Auto Rig ;
- matérialisation verrouillée à partir de wheels binaires uniquement ;
- globs de signature des Mach-O Python ;
- quatre hashes SHA-256 complets et `licenceStatus: restricted` ;
- chargement exclusivement avec `weights_only=True` ;
- disponibilité plateforme générique et cible non mesurée `untested` ;
- DropPath local identique en inférence et stochastique par échantillon en entraînement ;
- absence d’écriture bytecode dans le bundle signé ;
- smoke MPS, cold/warm, pic mémoire et unload mesurés pendant la phase.

Les résultats Phase 4 restent archivés. Leur harnais externe et ses assets ne font pas partie du
patch produit courant ; ils doivent être recréés à partir du corpus local pour une nouvelle mesure.

## Blockers restants exacts

1. **Juridique checkpoints** : obtenir une confirmation écrite couvrant provenance Mixamo et
   3DBiCar/RaBit, dérivation, usage commercial, outputs et redistribution directe ou via la source
   officielle. Tant qu’elle manque : `licenceStatus: restricted` et aucune release publique MIA.
2. **Developer ID** : fournir un certificat valide, signer l’ensemble des 38 Mach-O Python avec le
   même Team ID que l’app, puis prouver le chargement de Torch sous hardened runtime.
3. **Notarisation/Gatekeeper** : fournir les credentials Apple, notariser, stapler, vérifier
   Gatekeeper et refaire le parcours DMG complet sur une installation propre.
4. **Matrice** : avant d’annoncer une autre cible, exécuter le smoke reproductible dessus. Ce point
   ne bloque pas une release limitée à macOS Apple Silicon une fois les blockers 1 à 3 levés.
5. **Performance multi-mesh** : son warm run atteint 3,34× la baseline Phase 4. Aucune sortie n’est
   incorrecte et ce seuil ne bloque pas la CI, mais la dérive doit être confirmée sur le package
   Developer ID/notarié avant release.

Les 42 licences historiques de plugins 3D ne sont pas un blocker du package MIA minimal ; elles
restent un backlog global si ces plugins sont à leur tour matérialisés dans un package public.

## Fichiers modifiés

```text
THIRD-PARTY-NOTICES.md
electron-builder.yml
engine/autorig-runtime.json
engine/pyproject.toml
engine/src/ia_studio_engine/autorig/drop_path.py
engine/src/ia_studio_engine/vendor/make_it_animatable/models_ae.py
engine/tests/test_drop_path.py
engine/uv.lock
package.json
pnpm-workspace.yaml
scripts/before-pack.mjs
scripts/collect-licences.mjs
scripts/licence-model-notes.mjs
scripts/make-it-animatable-licence.mjs
scripts/prepare-engine-runtime.mjs
src/main/ai/autoRigRelease.test.ts
src/main/ai/pythonProcess.ts
src/renderer/src/engines/character/autoRig.ts
src/renderer/src/engines/character/makeItAnimatableBackend.ts
src/shared/domain/autoRig.ts
src/shared/domain/autoRigAvailability.test.ts
src/shared/domain/localModels.json
src/shared/licences.json
docs/fr/audits/mia-phase5/RAPPORT.md
```
