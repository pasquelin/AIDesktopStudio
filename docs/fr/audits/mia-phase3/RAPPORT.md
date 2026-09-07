# Make-It-Animatable — validation Phase 3

Date de mesure : 4 septembre 2026. Machine : Apple M2 Max, 96 Go. Statut technique :
`evaluation`. Statut de distribution : `blocked` tant que la licence des checkpoints et des
données d'entraînement n'est pas établie.

## Verdict

**GO WITH FIXES.** Le contrat commun, la conversion vers `Rig + SkinBinding[]`, `applyRig`, les
poses, la réduction à quatre influences et le round-trip GLB sont fonctionnels sur les deux GLB.
Restent avant une intégration produit : un vrai asset multi-mesh, la convention d'orientation
locale des os à figer, un chronométrage bout en bout dans un seul processus et la décision
juridique. Aucune UI, aucun téléchargement et aucun packaging n'ont été ajoutés.

## Résultats mesurés

| Mesure                         | asset B6KV — 11 020 sommets | tripo-character — 716 371 sommets |
| ------------------------------ | --------------------------: | --------------------------------: |
| Bones / racine                 |                 52 / `Hips` |                       52 / `Hips` |
| Backend                        |                         MPS |                               MPS |
| Chargement des modèles         |                     5,018 s |                           3,683 s |
| Inférence froide               |                     1,907 s |                           6,255 s |
| Inférence chaude               |                     1,229 s |                           8,155 s |
| Prétraitement GLB isolé        |                     0,573 s |                           0,560 s |
| Adaptateur TypeScript + top-4  |                     15,1 ms |                          752,9 ms |
| `applyRig`                     |                     1,18 ms |                           5,58 ms |
| Export GLB                     |                    13,53 ms |                          48,55 ms |
| Réimport géométrie + skin      |                     6,94 ms |                          38,26 ms |
| Total froid reconstruit        |                     7,528 s |                          11,305 s |
| Pic RSS inférence réel         |             2 499 837 952 o |                   3 779 379 200 o |
| Pic RSS validation déformation |               412 631 040 o |                   1 914 863 616 o |

Le total est la somme de phases mesurées séparément, pas un chronomètre unique : c'est l'un des
correctifs encore requis. L'inférence chaude dense a été plus lente que la froide lors de ce
passage unique ; aucune médiane ne permet d'en faire une conclusion de performance.

Le CPU avait déjà été mesuré en Phase 2 sur `asset B6KV` : chargement 1,996 s, inférence froide
2,064 s, chaude 2,502 s. La Phase 3 n'a pas répété le pipeline complet CPU.

## Déformations et doigts

Les captures couvrent repos, bras levés, coudes pliés, genou plié, tête, bassin et doigts. Les
déformations suivent le squelette sans explosion, NaN ni inversion globale. Les zones épaules,
aisselles, coudes, entrejambe, genoux et poignets restent plausibles sur les projections mesurées.

- `asset B6KV` : 30 os de doigts, 455 sommets dominés par les doigts, 1 907 sommets déplacés par
  la pose de flexion.
- `tripo-character` : 30 os de doigts, 27 591 sommets dominés par les doigts, 160 551 sommets
  déplacés par la pose de flexion.
- La hiérarchie compte trois phalanges pour chacun des cinq doigts et des deux mains.
- Aucun repli silencieux sans doigts n'est activé ; la capability publiée reste `fingers: true`.

Les captures sont des projections de points avec LBS, pas un rendu matériau du viewport : elles
prouvent la déformation numérique et permettent la revue anatomique, mais ne remplacent pas une
recette visuelle finale dans l'application.

## Réduction 52 → 4 influences

Tous les poids source et réduits sont finis, non négatifs et normalisés. Sommes après réduction :
`0,99999994…1,00000012` sur B6KV et `0,99999988…1,00000012` sur tripo-character.

L'écart RMS maximal observé sur les poses vaut 0,0194 % de la diagonale du modèle pour B6KV et
0,0173 % pour tripo-character. L'écart ponctuel maximal vaut respectivement 0,371 % et 0,196 %.
Aucune perte visible n'a été identifiée sur les projections, mais le maximum B6KV justifie une
inspection rapprochée des mains avant activation produit.

## Multi-mesh et GLB

Les deux fichiers réels fournis contiennent chacun un seul mesh et une seule primitive. Le contrat
multi-mesh a donc été validé par un cas déterministe dérivé : les plages globales sont redistribuées
vers deux couples `(mesh, primitive)`, sans fusion, et une plage manquante, chevauchée, négative ou
dupliquée est refusée. **Un personnage réel séparant corps, vêtements, cheveux et chaussures reste
à mesurer.**

Le harnais réel refuse désormais tout GLB contenant plusieurs meshes au lieu d'écrire une fausse
correspondance. La levée de ce refus exige un asset multi-mesh réel et les associations du parser
glTF ; elle fait partie des correctifs du verdict.

Les deux GLB produits ont été fermés puis relus sans MIA. Résultats : 52 bones, un `SkinnedMesh`,
indices identiques, poids à moins de `1e-6`, puis mouvement mesuré après rotation de l'avant-bras.
Tailles : 14 345 980 o et 57 389 396 o. Le harnais headless retire uniquement images et matériaux
de la copie passée à `GLTFLoader`, qui sinon attend leur décodage ; le GLB écrit sur disque reste
intact.
Un round-trip synthétique MIA → adaptateur → GLB → `GLTFLoader` est aussi exécuté sans variables
d'environnement dans la suite ordinaire ; les deux cas réels restent un banc explicite.

## Architecture retenue

```text
AutoRigService
  ├── AutoRigBackend<Input>
  │     ├── id / requiresModel / capabilities
  │     └── run(input, AbortSignal, progress, primitive targets) → AutoRigResult
  ├── simpleAutoRigBackend    → adaptateur du rigger actuel
  └── makeItAnimatableBackend
        └── MakeItAnimatableAdapter
              └── Rig + bindings (mesh, primitive, JOINTS_0, WEIGHTS_0)
```

Le service exige la liste des primitives source et valide le `Rig`, la couverture exacte des
cibles, le nombre de sommets, les indices et les poids avant le runtime. Une association explicite
résout ensuite chaque binding par `(mesh, primitive)`, jamais par ordre de tableau. Le service
impose lui-même l'identité du backend dans les métadonnées. Les noms Mixamo, transforms de
preprocessing et poids à 52 influences restent confinés à l'adaptateur MIA. Aucun contrat Python
parallèle n'est déclaré dans cette phase : le branchement effectif au worker/IPC existant devra
sérialiser exactement ce résultat neutre pendant la phase produit. Le seul ajout moteur suivi ici
est le FPS NumPy du prototype ; il n'ajoute ni second moteur Python ni nouveau protocole.

## `torch-cluster` et checkpoints

Décision proposée : **supprimer `torch-cluster`**. Le FPS NumPy exact et déterministe mesure
53–76 ms pour 256 sélections parmi 16 384 points, contre 46–58 ms pour l'extension native. Sur les
deux inférences MPS, l'écart de joints avec le prototype `torch-cluster` est de 0,30–0,32 % RMS de
l'étendue du squelette et l'accord de l'influence dominante de 95,2–95,8 %. Les captures restent
anatomiquement plausibles. Cela évite une compilation locale de 1 min 57 s, une wheel par cible et
le détour CPU spécifique sous MPS.

Baseline conservée : `joints_coarse.pth`, `joints.pth`, `pose.pth`, `bw.pth`, exactement
1 901 082 275 octets. `bw_normal.pth` (429 008 352 octets) n'a pas été benchmarké en Phase 3 ; il
reste optionnel et n'entre pas dans le périmètre de distribution.
