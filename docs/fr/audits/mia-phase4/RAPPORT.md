# Make-It-Animatable — intégration produit Phase 4

Date de mesure : 4 septembre 2026. Machine : Apple M2 Max, 96 Go, macOS 26.5.2.

## Verdict

**GO WITH BLOCKERS.** L’intégration produit est complète sur macOS Apple Silicon en évaluation :
catalogue, téléchargement vérifié, sélection persistante, action Auto Rig unique, IPC générique,
sidecar supervisé, progression, annulation, cache mémoire, Undo et erreurs produit. Le backend reste
expérimental et sa distribution demeure bloquée par les points listés à la fin de ce rapport.

## Architecture livrée

```text
Réglages / action Auto Rig
  → backendId générique
  → Model Manager et Download Manager existants
  → AutoRigHost
  → IPC autorig:run et RunningTasks
  → sidecar Python existant / porte engine/3d
  → PluginAdapter
       └── Make-It-Animatable
  → AutoRigInferenceResult neutre
  → MakeItAnimatableAdapter
  → AutoRigResult { Rig, SkinBinding[] }
  → applyRig / Undo / export GLB
```

Aucun appel produit `runMIA`, `downloadMIA` ou `isMIAInstalled` n’existe. Un futur backend pourra
déclarer un autre `backendId` et d’autres modèles sans changer l’IPC, le téléchargement, la page de
réglages ni le runtime de rig. Aucun backend SkinTokens n’est présent.

## Mesures bout en bout

Le chronomètre part de l’action sur un personnage déjà chargé et couvre la collecte des meshes,
l’IPC local, le chargement éventuel, l’inférence, l’adaptateur 52 → 4 et `applyRig`, jusqu’au graphe
Three.js mis à jour. Le cold run décharge réellement la porte `engine/3d` avant chaque asset. Le
warm run réutilise les quatre réseaux. Mesures effectuées avec le CPython 3.12.14 embarqué et MPS.

| Asset                      | Sommets / meshes Three.js | Total cold | Total warm | Chargement cold | Inférence cold / warm | Adaptateur cold / warm | `applyRig` cold / warm | Pic RSS process |
| -------------------------- | ------------------------: | ---------: | ---------: | --------------: | --------------------: | ---------------------: | ---------------------: | --------------: |
| B6KV mono-mesh             |                11 020 / 1 |    5,412 s |    0,797 s |         4,213 s |       1,166 / 0,772 s |       21,56 / 17,64 ms |         1,39 / 0,72 ms | 1 495 531 520 o |
| Tripo/JRPG mono-mesh       |               716 371 / 1 |    5,708 s |    3,722 s |         1,871 s |       2,407 / 2,321 s |        1,127 / 1,128 s |         4,35 / 8,94 ms | 1 773 748 224 o |
| Personnage multi-mesh réel |               70 794 / 12 |    2,847 s |    0,933 s |         1,852 s |       0,872 / 0,808 s |     110,92 / 106,72 ms |         1,41 / 0,87 ms | 2 038 136 832 o |

Le chiffre multi-mesh correspond aux douze primitives chargées comme douze objets Three.js ; les
six meshes sources et leurs accesseurs partagés restent décrits dans `MULTI-MESH.md`. Le pic RSS
est le maximum réel du processus sidecar depuis son démarrage, pas un RSS lu après inférence.
La préparation du JRPG dure 223 à 229 ms au total mais cède le thread UI tous les 32 768 sommets
ou indices ; elle est annulable avant l’IPC et aucune tranche longue monolithique ne subsiste.

## Runtime et packaging mesurés

- CPython embarqué récupéré avec digest vérifié : 3.12.14 arm64, 68 Mo avec les sources moteur ;
- wheel `ia_studio_engine-0.1.0-py3-none-any.whl` construite et inspectée : backend, FPS NumPy,
  modèles vendored et licence MIT présents ;
- installation des dépendances dans ce CPython : uniquement des wheels natives/précompilées, sans
  compilation de `torch-cluster` ;
- exécution B6KV avec ce runtime : MPS, 52 bones, cold et warm terminés ;
- paquet `.app` arm64 non signé produit avec Electron Builder : 1,9 Go avec le runtime de recette,
  CPython et les modules natifs importables ; la tentative signée a été interrompue au codesign et
  ne constitue pas une validation de distribution ;
- `torch-cluster` absent du manifeste et du lock ; FPS NumPy déterministe conservé ;
- quatre checkpoints seulement, révision `eb12b71253361fd1a7216625a95144af3c58263e`, exactement
  1 901 082 275 octets ; `bw_normal.pth` absent.

## Couverture fonctionnelle

- modèle absent, corrompu, installé et supprimé via le Model Manager existant ;
- téléchargement `.part`, reprise, annulation, retry, SHA-256 et renommage atomique déjà gardés par
  le Download Manager commun ;
- backend simple toujours disponible, sans bascule silencieuse ;
- progression réelle : préparation, chargement, analyse, squelette, pose, skinning, application ;
- annulation par `RunningTasks`, suppression du dossier temporaire et absence d’application
  partielle ;
- transformations locales non identité, orientations locales, bind/inverse bind, top-4 et
  redistribution multi-mesh ;
- Undo restaure le modèle et ses bindings précédents ;
- export/réimport mono et multi-mesh conservé par les validations Phase 3 et multi-mesh réelle.

Tests ajoutés ou étendus : contrat Python générique et arbre vendored ; hôte Electron (absence,
corruption, annulation, résultat) ; service/registre de backends ; concaténation multi-mesh,
transform locale et annulation du prétraitement ; orientations locales, hiérarchie, top-4 et
bindings ; Undo du rig avancé ; application/retrait dans le document ; affichage des phases ;
round-trip GLB ; harnais cold/warm. Les tests unitaires n’effectuent aucun téléchargement réseau.

## Fichiers du lot

```text
THIRD-PARTY-NOTICES.md
docs/fr/audits/mia-phase4/RAPPORT.md
engine/licences.json
engine/pyproject.toml
engine/src/ia_studio_engine/adapters/diffusers_adapter.py
engine/src/ia_studio_engine/adapters/model_adapter.py
engine/src/ia_studio_engine/adapters/plugin_adapter.py
engine/src/ia_studio_engine/adapters/plugin_contract.py
engine/src/ia_studio_engine/adapters/plugin_runtime.py
engine/src/ia_studio_engine/adapters/routing_adapter.py
engine/src/ia_studio_engine/autorig/make_it_animatable.py
engine/src/ia_studio_engine/autorig/plugin.py
engine/src/ia_studio_engine/autorig/support.py
engine/src/ia_studio_engine/autorig/torch_fps.py
engine/src/ia_studio_engine/core/supervisor.py
engine/src/ia_studio_engine/vendor/MAKE-IT-ANIMATABLE-LICENSE
engine/src/ia_studio_engine/vendor/make_it_animatable/__init__.py
engine/src/ia_studio_engine/vendor/make_it_animatable/model.py
engine/src/ia_studio_engine/vendor/make_it_animatable/models_ae.py
engine/src/ia_studio_engine/workers/door.py
engine/tests/test_adapter_contract.py
engine/tests/test_vendored_trees.py
engine/uv.lock
scripts/banc/miaPhase3RoundTrip.test.ts
scripts/banc/miaPhase4Measure.test.ts
scripts/banc/miaPhase4Measure.ts
scripts/collect-licences.mjs
scripts/collect-python-licences.mjs
src/main/ai/autoRigHandlers.ts
src/main/ai/autoRigHost.test.ts
src/main/ai/autoRigHost.ts
src/main/ai/localModelSchema.ts
src/main/ai/pythonClient.ts
src/main/ai/pythonProtocol.ts
src/main/ipc/handle.ts
src/main/ipc/register.ts
src/main/no-literal-nul-byte.test.ts
src/main/pythonPackages.test.ts
src/main/pythonPackages.ts
src/main/serviceLocalAi.ts
src/main/serviceTypes.ts
src/main/services.ts
src/preload/index.ts
src/renderer/src/engines/character/autoRig.test.ts
src/renderer/src/engines/character/autoRigBackends.test.ts
src/renderer/src/engines/character/autoRigBackends.ts
src/renderer/src/engines/character/autoRigInput.test.ts
src/renderer/src/engines/character/autoRigInput.ts
src/renderer/src/engines/character/characterCommands.test.ts
src/renderer/src/engines/character/characterCommands.ts
src/renderer/src/engines/character/characterState.ts
src/renderer/src/engines/character/makeItAnimatableAdapter.test.tsx
src/renderer/src/engines/character/makeItAnimatableAdapter.ts
src/renderer/src/engines/character/rigBuild.ts
src/renderer/src/engines/scene/SceneRendererSkinning.ts
src/renderer/src/features/character/components/Character/Inspector/CharacterInspector.tsx
src/renderer/src/features/character/components/Character/Inspector/CharacterInspectorFit.tsx
src/renderer/src/features/character/components/CharacterDocument/CharacterDocument.test.tsx
src/renderer/src/features/character/components/CharacterDocument/CharacterDocument.tsx
src/renderer/src/features/settings/components/Ai/AiRoleCloudCandidates.tsx
src/renderer/src/features/settings/components/Ai/AiRoleEmptyNotices.tsx
src/renderer/src/features/settings/components/Ai/AiRoleLocalCandidates.tsx
src/renderer/src/features/settings/components/Ai/AiRoleOptions.tsx
src/renderer/src/features/settings/components/Ai/AiRoleRow.tsx
src/renderer/src/features/shell/components/TasksStatus.test.tsx
src/renderer/src/features/shell/components/TasksStatus.tsx
src/renderer/src/hooks/useCharacterFit.ts
src/renderer/src/services/fakeAiOverview.ts
src/renderer/src/services/fakeBridge.ts
src/renderer/src/stores/tasks.ts
src/shared/channels.ts
src/shared/domain/autoRigInference.ts
src/shared/domain/localModel.ts
src/shared/domain/localModels.json
src/shared/domain/taskProgress.ts
src/shared/i18n/en/common.json
src/shared/i18n/en/inspector.json
src/shared/i18n/fr/ai.json
src/shared/i18n/fr/common.json
src/shared/i18n/fr/inspector.json
src/shared/ipc.ts
src/shared/ipcChannels.ts
src/shared/licences.json
src/shared/studioBridgeAutoRig.ts
```

## Blockers restants exacts

1. **Licence des checkpoints et des données d’entraînement** : l’Apache-2.0 du code upstream ne
   démontre pas les droits de redistribution des poids ni du corpus. Le modèle reste
   `licenceStatus: restricted`; aucune distribution production ne doit être activée.
2. **Dépendances natives après signature macOS** : les wheels téléchargées au premier usage ont
   fonctionné dans le CPython embarqué de développement, mais leur chargement après signature et
   notarisation d’un `.app` hardened runtime n’est pas encore démontré. Il faut produire et signer
   l’archive runtime par cible, puis refaire la recette sur une installation propre.
3. **Matrice de plateformes** : MPS et CPU arm64 sont mesurés sur M2 Max. M1, M3, M4, macOS Intel,
   Windows et Linux ne sont pas testés ; ils ne doivent pas être annoncés comme supportés.
4. **Licences des extras 3D historiques** : 42 dépendances de l’extra `plugin`, étrangères au
   chemin MIA minimal, restent explicitement non collectées dans `UNREAD_PENDING_COLLECTION`.
   Les dépendances MIA (`torch`, `torchvision`, `numpy`, `einops`, `timm`) sont collectées.

Le vrai asset multi-mesh n’est plus un blocker. Il reste uniquement dans le corpus de recette,
avec la provenance et la restriction de distribution déjà consignées dans `MULTI-MESH.md`.
