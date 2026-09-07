# Rig / Auto Rig — fermeture des gates avant merge

Date de recette : 5 septembre 2026. Base : `develop@13a2c1661`. Candidat initial :
`feat/rig-integration-clean@b9145e8d7`.

## Amendement — activation de MIA

La décision produit prise après cette fermeture remplace uniquement sa politique de distribution :
Make-It-Animatable est désormais proposé dans la configuration, ses quatre checkpoints restent
téléchargés à la demande avec contrôle d'empreinte et ne sont pas inclus dans le package. Le profil
d'exécution Python/Torch épinglé est, lui, préparé avant le packaging afin que ses bibliothèques
natives soient signées avec l'application.

La recette macOS arm64 amendée mesure un package de 1,3 Go, dont 704 Mo pour le moteur embarqué,
et zéro checkpoint MIA. L'import réel de Torch et du backend MIA depuis le package passe. Les
sections ci-dessous consignent l'état historique de la fermeture initiale ; leurs mentions d'un
runtime MIA exclu du package sont donc remplacées par le présent amendement.

## Verdict

`READY TO MERGE`

Les gates dépôt et package public sont closes. La recette humaine complète est validée sur B6KV,
JRPG et le personnage multi-mesh, ainsi que les smokes Bone, IK, timeline, playback et retargeting.

| Gate | Verdict |
| --- | --- |
| Repository validation | PASS — `pnpm validate` intégralement vert |
| Public package | PASS — package macOS arm64 construit et inspecté |
| P0 Simple | PASS — recette utilisateur complète A/B/C |
| P0 MIA dev | N/A — environnement développeur MIA non matérialisé pendant cette recette |
| GLB | PASS automatisé et recette réelle A/B/C |
| Undo/Redo | PASS automatisé et recette réelle A/B/C |
| Animation/IK/Timeline | PASS — smokes utilisateur |
| Security/races | PASS automatisé |
| Performance Simple | PASS — médianes à cinq runs, écart inférieur à 1 % après correction |

## Gate A — validation du dépôt

La comparaison a été faite dans le même environnement sur `develop` et sur le candidat avant toute
correction.

| Test en échec | `develop` | candidat initial | Conclusion |
| --- | --- | --- | --- |
| MCP | 30 échecs sur 75, `listen EPERM 127.0.0.1` | identique | ENVIRONMENT |
| `pythonProcess` | 8 échecs sur 8, socket Unix refusée | identique | ENVIRONMENT |
| watcher | 1 échec sur 10 | identique | ENVIRONMENT |
| integration bench | 22/22 | 2 échecs `rig.fit` | REGRESSION |
| timeout | conséquence des sockets refusées | identique | ENVIRONMENT |

La régression du banc venait d'une scène factice qui ne matérialisait pas le nouveau chemin
`AutoRigService`. La fixture construit désormais un renderer headless minimal avec une cible et un
binding valides. Une seconde régression de test utilisait des modèles Diffusers/ONNX désormais
refusés par la gate de sécurité ; la fixture déclare maintenant le format sûr attendu.

Résultat final isolé, avec les sockets locales autorisées :

- `pnpm validate` : PASS ;
- Vitest : 1 605 fichiers, 16 550 tests verts ;
- Python : 202 tests verts, 1 test conditionnel ignoré ;
- Knip : aucune anomalie ;
- licences : 73 paquets permissifs, mentions présentes ;
- typecheck, lint, format, tailles et compilation du moteur Python : PASS.

## Gate B — package public

L'échec Electron Builder initial n'était pas une régression Rig. Le binaire global
`/usr/local/bin/pnpm` était en version 8.15.4 alors que le projet exige `pnpm@11.21.0`, ce qui
faisait échouer le collecteur avec `reference.startsWith is not a function`. Le même échec existait
sur `develop`. Le package a été reconstruit avec Corepack/pnpm 11.21.0 et la signature automatique
désactivée pour cette recette locale.

Commande validée :

```text
corepack pnpm exec electron-builder --dir --mac --arm64
```

Artefact : `release/mac-arm64/IA Studio.app`.

| Élément | Mesure |
| --- | ---: |
| Package public candidate | 776 584 Kio |
| Moteur Python public | 75 116 Kio |
| Checkpoints MIA | 0 octet |
| Runtime lourd MIA / Torch | 0 octet |
| Implémentation Python MIA | 0 octet |
| Instance Rig / BodyPix / SkinTokens / TokenRig / Motius | 0 octet |

Le filtre de packaging conserve seulement le point d'enregistrement Python générique requis au
démarrage du worker et exclut l'implémentation MIA ainsi que son code vendored. Le code TypeScript
léger du backend peut rester compilé, mais la politique
centrale refuse sélection, installation et exécution sous les surfaces UI, Command/MCP et host.
Les tests confirment aussi qu'une ancienne préférence MIA retombe sur Simple, même si runtime et
checkpoints sont physiquement présents.

Un smoke exécuté avec l'interpréteur et le `PYTHONPATH` du package importe réellement
`ia_studio_engine.workers.door`. Il a détecté puis permis de corriger une première exclusion trop
large du dossier `autorig`, qui cassait le worker avant même son démarrage.

Un package `develop` de 1 667 104 Kio a été produit avec un cache moteur historique contenant
956 448 Kio de Torch. Il n'est pas comparable au candidat propre : aucun delta develop/candidate
n'est donc publié.

## Gate C — recette P0

Les trois assets réels ont été retrouvés :

| Corpus | Caractéristiques mesurées |
| --- | --- |
| B6KV | 11 020 vertices, mono-mesh |
| JRPG / Tripo | 716 371 vertices, mono-mesh |
| Multi-mesh | 6 meshes, 12 primitives, 30 414 vertices uniques, accessors partagés, 8 matériaux, 6 transforms non identité |

Les tests P0 automatisés Auto Rig, transaction multi-mesh, adapter MIA, skin GLB et round-trip Rig
sont verts : 50/50. Ils couvrent notamment validation, échec injecté au milieu du commit,
Undo/Redo sans nouvelle inférence, cancellation tardive, document/objet disparu, crash Python,
accessors partagés, confinement des chemins et transforms locales.

L'instrumentation dev a utilisé le mécanisme produit qui cible le personnage ouvert, puis
`runConfirmedAction('rig.fit')`. Elle ne modifie aucun store et n'appelle ni `rigFit`, ni
`SimpleBackend.run`, ni `applyRig`. B6KV s'ouvre, devient le personnage actif et la vraie action
Auto Rig réussit : l'état passe de non riggé à un Rig Simple valide de 22 bones.

La recette humaine a ensuite validé les gestes Character non pilotables par le harnais, sans
modification supplémentaire du produit.

| Parcours | B6KV | JRPG | Multi |
| --- | --- | --- | --- |
| Open | PASS | PASS | PASS |
| Select | PASS | PASS | PASS |
| Auto Rig | PASS | PASS | PASS |
| Pose | PASS | PASS | PASS |
| Undo | PASS | PASS | PASS |
| Redo | PASS | PASS | PASS |
| Save/Reopen | PASS | PASS | PASS |
| Export GLB | PASS | PASS | PASS |
| Reimport | PASS | PASS | PASS |
| Pose après import | PASS | PASS | PASS |

| Smoke | Verdict |
| --- | --- |
| Bone edit | PASS |
| IK | PASS |
| Timeline | PASS |
| Playback | PASS |
| Retargeting | PASS |

## Performance Simple

Mesure locale M2 Max, cinq runs par chemin, mêmes données et mêmes calculs. Une première mesure a
révélé +11,1 % sur JRPG, causé par une allocation `slice()` pour chaque vertex dans la validation
commune. La boucle a été remplacée par une validation sans allocation intermédiaire.

| Asset | Médiane directe | Médiane `AutoRigService` | Écart final |
| --- | ---: | ---: | ---: |
| B6KV | 30,777 ms | 30,668 ms | -0,35 % |
| JRPG | 836,035 ms | 841,396 ms | +0,64 % |

Ces résultats ne montrent plus de régression significative du chemin Simple.

## Corrections de cette fermeture

- fixtures du banc alignées sur le vrai contrat `AutoRigService` ;
- fixture Model Manager rendue conforme à la politique de format sûr ;
- validation top-4 réécrite sans allocations par vertex ;
- runtime Python MIA exclu du package public ;
- import du worker public restauré en conservant uniquement son point d'enregistrement Auto Rig
  sans l'implémentation MIA ;
- test de garde du filtre Electron Builder ajouté ;
- type de la factory de renderer de test élargi au contrat réellement surchargé.

## Dette restante

### Dettes non bloquantes

- l'annulation ne peut pas interrompre un kernel tiers déjà engagé ; tout résultat tardif reste
  rejeté avant mutation ;
- les droits des checkpoints MIA restent non établis ; ils sont techniquement exclus du package
  public et leur distribution reste bloquée ;
- le package `develop` historique ne fournit pas de baseline de taille comparable à cause de son
  cache Torch contaminé.

## Commits proposés au merge

Ne merger aucune branche historique complète. Après fermeture de la recette P0, proposer seulement :

1. `b9145e8d7` — patch Rig/Auto Rig correctif propre ;
2. le commit de fermeture courant — corrections des gates, exclusion du runtime MIA public, tests
   et présent rapport.

Les branches SkinTokens, Instance Rig, Motius et les assets/captures de recette n'apportent aucun
code au patch.
