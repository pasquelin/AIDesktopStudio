# Make-It-Animatable — personnage multi-mesh réel

Date de mesure : 4 septembre 2026. Source : asset fourni localement par le propriétaire du dépôt.
Le fichier n’est pas distribué avec l’application ; il sert uniquement à la recette Auto Rig.

## Diagnostic avant Auto Rig

| Mesh              | Sommets | Triangles | Primitives | Étendue fonctionnelle observée |
| ----------------- | ------: | --------: | ---------: | ------------------------------ |
| `Cube009_Cube000` |   2 112 |       704 |          3 | détail du visage               |
| `Cube006_Cube001` |  16 512 |     5 504 |          2 | corps et membres               |
| `Cube007_Cube000` |     672 |       224 |          1 | détail de tête                 |
| `Cube001`         |   1 596 |       532 |          2 | cheveux/tête                   |
| `Cube008_Cube000` |   9 024 |     3 008 |          3 | tête et accessoires            |
| `Cube000`         |     498 |       166 |          1 | chaussures/accessoire bas      |

Total : 6 meshes, 7 nodes, 12 primitives, 30 414 sommets uniques, 10 138 triangles et
8 matériaux. Les six nodes de mesh portent une transformation locale non identité. Le fichier
source ne contient ni skeleton, ni skin, ni animation.

Plusieurs primitives d’un même mesh partagent leur accesseur de positions. Le prétraitement les
présente une seule fois à MIA, puis l’adaptateur réutilise la plage de poids pour chaque primitive.
La concaténation naïve mesurait 70 794 sommets ; la concaténation corrigée en mesure 30 414.

## Résultat MIA et déformations

- 52 bones, racine `Hips`, dont 30 bones de doigts ;
- poids finis, sans valeur négative ;
- sommes source : `0,99999972…1,00000032` ;
- sommes après réduction à quatre : `0,99999988…1,00000012` ;
- 3 078 sommets dominés par les doigts et 4 662 déplacés par leur flexion ;
- bras levés, coudes, genou, tête, bassin et doigts déformés sans sous-mesh resté au repos ni projeté.

Le plus grand écart 52 → 4 influences vaut 0,3373 % de la diagonale sur la pose des coudes ;
l’écart RMS correspondant vaut 0,02344 %. La capture colore séparément les six meshes.

## Performance CPU

| Étape                             |    Temps |
| --------------------------------- | -------: |
| Chargement des quatre checkpoints |  5,396 s |
| Inférence froide                  |  6,385 s |
| Inférence chaude                  |  5,644 s |
| Prétraitement GLB de validation   |  0,177 s |
| Adaptateur et réduction à quatre  | 51,98 ms |
| `applyRig`                        |  2,16 ms |
| Export GLB                        |  3,01 ms |
| Réimport GLB                      |  5,32 ms |

Pic RSS du processus d’inférence : 3 441 573 888 octets. MPS n’a pas été remesuré : PyTorch l’a
refusé dans cette session en déclarant le système antérieur à macOS 14. Le fallback CPU a terminé.

## Round-trip

Le GLB riggé réimporté conserve 6 meshes, 12 primitives, 8 matériaux et les six transformations
locales. Il contient un skin partagé par 6 nodes, 52 bones et 12 objets `SkinnedMesh` côté Three.js.
Les indices sont identiques et les poids diffèrent de moins de `1e-6`. Une rotation de
`LeftForeArm` après réimport déplace un sommet de 7,558 unités sans charger MIA.

Verdict multi-mesh réel : **GO**.
