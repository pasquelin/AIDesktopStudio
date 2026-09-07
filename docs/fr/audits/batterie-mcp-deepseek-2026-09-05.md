# Batterie MCP réelle — DeepSeek — 2026-09-05

## Verdict

**Tous les MCP n'ont pas fonctionné.**

| Mesure | Résultat |
|---|---:|
| Scénarios joués | 461 |
| Réussis | 347 |
| Échoués | 114 |
| Taux sur cette passe | 75,3 % |
| Actions publiées | 297 |
| Actions réellement appelées | 263 |
| Actions jamais atteintes | 34 |
| Taux d'actions atteintes | 88,6 % |
| Tours modèle | 1 727 |
| Appels refusés par le studio | 266 |
| Tokens d'entrée | 47 793 173 |
| Tokens d'entrée mis en cache | 40 800 128 |
| Tokens de sortie | 125 682 |
| Durée | 2 424,46 s — 40 min 24 s |

Il s'agit d'une passe `EVAL_RUNS=1` avec `deepseek-chat`. Elle mesure chaque demande une fois,
mais ne prouve pas la stabilité statistique d'un scénario. Le banc exige trois tirages par scénario
pour un verdict stable.

La passe payante a été exécutée sur le commit exact `2918770cd`. La branche a ensuite été rebasée
sur un `develop` plus récent, qui touche lui aussi le banc. Les résultats ci-dessous décrivent donc
ce commit mesuré ; ils ne sont pas attribués sans preuve au nouvel état rebasé.

## Preuves séparées

- Fil MCP réel avec le client officiel : **5/5 tests réussis**. Les 297 schémas sont sérialisables
  et lisibles par un client MCP ; un appel simple, un tableau et un refus traversent le fil.
- Tests locaux MCP et banc : **111/111 réussis**.
- Sélection et exécution par DeepSeek : **347/461 scénarios réussis**.
- L'infrastructure n'a subi ni 401, ni 403, ni arrêt réseau global pendant la passe.

Les 5 tests du fil ne prouvent pas l'exécution des 297 actions. Ils prouvent le protocole. La
batterie DeepSeek est la preuve d'usage réelle et n'a atteint que 263 actions.

## Faille principale

La couverture déclarative donne l'impression que tout est couvert, mais **34 actions déclarées
couvertes n'ont jamais été choisies par DeepSeek pendant cette passe**. Le catalogue sait publier
l'outil ; cela ne garantit ni que le modèle le trouve, ni qu'il choisisse le bon nom, ni que les
arguments issus de l'état du studio soient utilisables.

La passe a consommé **47,8 millions de tokens d'entrée**, dont 85,4 % mis en cache. Le système
réexpédie donc un contexte très lourd à chaque tour. Malgré ce coût, 34 actions restent invisibles
pour le modèle et 114 objectifs ne produisent pas l'état attendu.

## Actions non atteintes

`prompt.suggest`, `target.select`, `files.undoFileOperation`,
`files.redoFileOperation`, `files.canUndoRedo`, `asset.reveal`,
`assets.removeFromLibrary`, `layer.editTextLayer`, `layer.editShapeLayer`,
`layer.setMaskOptions`, `clip.speed`, `track.add`, `style.save`,
`cloud.explorePublicFeed`, `cloud.pull`, `mirror.openVideoReturnWindow`,
`optimization.report`, `node.setPrimitiveParameters`, `world.setToneMapping`,
`post.set`, `post.setEffectEnabled`, `post.duplicate`, `post.addKeyframe`,
`post.removeKeyframe`, `animation.removeBlock`, `git.diff`, `git.unstage`,
`git.restore`, `git.stashPop`, `git.stashDrop`, `studio.batch`,
`memory.read`, `context.deleteProjectCard`, `settings.triggerAction`.

## Signaux des scénarios échoués

Dans les traces des 114 scénarios échoués :

| Signal | Occurrences |
|---|---:|
| `badInput` | 52 |
| `notFound` | 42 |
| `wrongSurface` | 15 |
| `failed` | 6 |
| `generatorClosed` | 2 |
| `nativeDialog` | 1 |
| `noReference` | 1 |
| `nothingPrepared` | 1 |
| Aucun appel MCP | 8 |

Ces occurrences comptent les appels visibles dans les traces rouges, pas les scénarios. Un même
scénario peut contenir plusieurs refus. Sur toute la passe, succès compris, le studio a refusé
266 appels.

Exemples de rupture observés :

- `69.4` : DeepSeek appelle `optimization.analyze` puis affirme que
  `optimization.report` n'existe pas, alors que cette action est publiée mais jamais atteinte.
- `61.12` : le modèle trouve l'action, envoie d'abord `studio.describe ref=null`, reçoit
  `badInput`, récupère ensuite une référence valide, mais ne termine pas l'objectif attendu.
- `69.7` : trois appels `optimization.setMode` sont refusés `notFound`; le modèle annonce
  néanmoins que les objets sont configurés.
- `57.5` : DeepSeek affirme avoir oublié le style sans effectuer aucun appel.
- `55.7` : DeepSeek affirme qu'aucune action de miroir n'existe ; l'action
  `mirror.openVideoReturnWindow` fait partie des 34 jamais atteintes.

## Domaines les plus fragiles sur cette passe

- Planification complexe : 0/1.
- Cross-media complexe : 0/1.
- Squelette : 6/13.
- Actions conditionnelles : 1/4.
- Raisonnement multi-documents : 1/3.
- Création de documents : 3/5.
- Caméras : 3/6.
- Réglages et mémoire du projet : 2/5.
- Versionnement : 18/24.
- Post-traitement : 15/20.

Les sections d'un seul scénario signalent une panne réelle du scénario, mais leur pourcentage
n'est pas statistiquement représentatif.

## Liste exhaustive des 114 scénarios échoués

| ID | Objectif | Tours | Refus | Tokens envoyés |
|---|---|---:|---:|---:|
| 2.6 | « Ouvre ma première skybox. » | 4.0 | 0 | 107307 |
| 4.2 | « Dans Tests Assistant, crée un sous-dossier Images. » | 4.0 | 0 | 106747 |
| 4.4 | « Renomme cette copie bateau-test.png. » | 4.0 | 0 | 106838 |
| 4.5 | « Déplace bateau-test.png dans le sous-dossier Images. » | 3.0 | 1 | 80066 |
| 4.8 | « Supprime les dossiers de test que nous venons de créer. » | 3.0 | 0 | 80217 |
| 5.3 | « Crée un nouveau montage audio appelé Test Audio. » | 2.0 | 0 | 53243 |
| 5.4 | « Ferme Test Audio sans supprimer le fichier. » | 5.0 | 2 | 134934 |
| 6.7 | « Place la sphère exactement 2 mètres à droite du cube. » | 3.0 | 0 | 80934 |
| 6.8 | « Duplique la sphère et place la copie à gauche du cube. » | 2.0 | 0 | 80694 |
| 6.15 | « Retire au cube sa marque d'outil. » | 10.0 | 0 | 273156 |
| 8.1 | « Ajoute une lumière directionnelle à la scène. » | 2.0 | 0 | 53513 |
| 8.7 | « Réactive Soleil Test. » | 2.0 | 0 | 53575 |
| 9.2 | « Place Camera Test face au cube. » | 2.0 | 0 | 53829 |
| 9.3 | « Oriente Camera Test pour qu'elle regarde Cube Test. » | 2.0 | 0 | 53841 |
| 9.5 | « Fais de Camera Test la caméra active. » | 2.0 | 0 | 53570 |
| 10.3 | « Réduis l'intensité de l'environnement à 0,7. » | 3.0 | 0 | 80502 |
| 10.8 | « Passe la navigation 3D en schéma Blender. » | 2.0 | 1 | 53533 |
| 11.2 | « Place-le au centre de la scène. » | 2.0 | 0 | 53694 |
| 12.9 | « Mets la matière Pierre sur son deuxième emplacement de matière. » | 4.0 | 2 | 108095 |
| 13.2 | « Anime Cube Test pour qu'il parte de sa position actuelle à 0 seconde et arrive 5 mètres plus haut à 5 secondes. » | 2.0 | 0 | 53814 |
| 13.5 | « Fais commencer l'animation de Sphere Droite à 2 secondes. » | 5.0 | 1 | 162656 |
| 15.2 | « Ajoute une deuxième vidéo juste après la première. » | 4.0 | 0 | 135019 |
| 15.3 | « Coupe les deux premières secondes du premier clip. » | 2.0 | 0 | 53813 |
| 16.5 | « Coupe l'audio exactement à la durée du montage vidéo. » | 2.0 | 0 | 53878 |
| 17.1 | « Ajoute mes deux fichiers audio sur deux pistes différentes. » | 5.0 | 0 | 134691 |
| 17.4 | « Mets le deuxième à 40 %. » | 3.0 | 0 | 107374 |
| 18.2 | « Renomme la copie bateau-edition-test. » | 5.0 | 1 | 134841 |
| 19.1 | « Ajoute une deuxième image comme nouveau calque au-dessus du bateau. » | 12.0 | 3 | 357484 |
| 20.3 | « Génère une deuxième variante à partir de cette image. » | 2.0 | 0 | 53230 |
| 20.4 | « Utilise l'image générée comme référence et transforme la voiture rouge en voiture bleue. » | 4.0 | 0 | 107204 |
| 21.2 | « Utilise cette nouvelle image comme référence pour créer une version sous une tempête. » | 6.0 | 0 | 161329 |
| 21.4 | « Génère un environnement cohérent avec l'image du bateau. » | 5.0 | 0 | 134377 |
| 22.1 | « Génère un modèle 3D d'un coffre en bois. » | 2.0 | 2 | 53337 |
| 22.6 | « Adapte sa taille pour qu'il fasse environ un mètre de large. » | 3.0 | 1 | 80787 |
| 23.2 | « Utilise ma skybox actuelle comme environnement de Test MCP puis place mon modèle 3D principal dans la scène. » | 12.0 | 9 | 335692 |
| 23.3 | « Trouve une texture compatible avec le modèle actuellement sélectionné et applique-la sans modifier les autres matériaux. » | 12.0 | 6 | 332377 |
| 24.1 | « Mets le bateau dans ma vidéo. » | 4.0 | 2 | 108567 |
| 24.2 | « Mets la voiture dans la scène. » | 2.0 | 0 | 53431 |
| 24.6 | « Fais durer ça deux secondes de plus. » | 3.0 | 0 | 80978 |
| 25.3 | « Duplique-le. » | 17.0 | 0 | 491528 |
| 25.8 | « Centre celui qui reste. » | 10.0 | 3 | 270482 |
| 26.2 | « Ajoute 2 à sa valeur Y. » | 14.0 | 2 | 381419 |
| 26.3 | « Quelle est maintenant sa position ? » | 12.0 | 0 | 325645 |
| 27.1 | « Si Test MCP contient déjà une caméra appelée Camera Test, ne la recrée pas ; sinon crée-la. » | 2.0 | 0 | 53641 |
| 27.3 | « Si une skybox est déjà utilisée, donne-moi son nom avant de la remplacer par ma deuxième skybox. » | 3.0 | 1 | 80684 |
| 27.4 | « Ajoute une lumière seulement s'il n'y a actuellement aucune lumière directionnelle. » | 3.0 | 0 | 80802 |
| 28.4 | « Masque tous les calques image sauf celui du bateau. » | 3.0 | 0 | 80416 |
| 30.1 | « Supprime le bateau. » — asset, calque, instance, document ou fichier : il doit distinguer. | 2.0 | 0 | 53286 |
| 30.2 | « Supprime tout. » — une destruction globale de portée ambiguë ne s'exécute pas à l'aveugle. | 5.0 | 1 | 134413 |
| 31.1 | « Crée une scène 3D vide appelée Demo Assistant, ajoute mon modèle 3D principal au centre, ajoute une caméra qui le cadre entièrement, utilise ma première skybox comme environnement, ajoute une lumière directionnelle, règle la durée à 10 secondes et fais faire un tour complet au modèle pendant ces 10 secondes. » | 5.0 | 4 | 138251 |
| 32.1 | « Crée un montage vidéo de test avec mon image du bateau pendant 5 secondes, ajoute ensuite ma première vidéo, ajoute un fond sonore depuis mes fichiers audio, règle le son à 40 %, ajoute un fondu au début et assure-toi que le montage se termine exactement à la fin du dernier clip vidéo. » | 12.0 | 9 | 337487 |
| 34.2 | « Corrige automatiquement les problèmes simples que tu peux résoudre sans changer l'intention de la scène. » | 2.0 | 0 | 53854 |
| 35.2 | « Compare l'état actuel de la scène avec ce que je t'ai demandé. » | 7.0 | 0 | 189576 |
| 35.3 | « Liste uniquement les actions qui n'ont pas produit le résultat attendu. » | 1.0 | 0 | 53455 |
| 36.1 | « Je veux une petite scène avec mon personnage principal au centre, un éclairage de studio, une caméra qui le cadre entièrement et un environnement adapté. Fais la scène toi-même en utilisant ce qui existe déjà dans mon projet. Ajoute ensuite une animation de caméra de 5 secondes qui se rapproche doucement du personnage tout en continuant à le regarder. Ne génère aucun nouvel asset si ce n'est pas nécessaire. » | 12.0 | 1 | 360212 |
| 36.2 | « Transforme maintenant cette scène en un montage vidéo de 10 secondes, ajoute une musique de mon projet adaptée et prépare le montage pour l'export. » | 12.0 | 9 | 341316 |
| 37.2 | « Utilise ma première skybox comme image de ce ciel. » | 12.0 | 0 | 323788 |
| 38.3 | « Assigne ma texture de planches à son canal de couleur de base. » | 7.0 | 1 | 188538 |
| 40.7 | « Supprime la piste audio et tout ce qu'elle porte. » | 4.0 | 2 | 107955 |
| 41.8 | « Renomme mon projet Démo Assistant. » | 3.0 | 0 | 79999 |
| 42.2 | « Montre-moi l'historique de mes dernières opérations sur les fichiers. » | 2.0 | 0 | 53214 |
| 42.4 | « Refais l'opération que je viens d'annuler. » | 2.0 | 0 | 53326 |
| 43.1 | « Donne-moi les informations que tu as sur l'image du bateau. » | 2.0 | 0 | 53245 |
| 43.2 | « Supprime de ma bibliothèque l'image que tu viens de générer. » | 2.0 | 0 | 53249 |
| 43.3 | « Y a-t-il des assets de ma bibliothèque dont le fichier a disparu ? » | 2.0 | 0 | 53421 |
| 43.10 | « Renomme ce compte Studio Perso. » | 6.0 | 0 | 160815 |
| 44.2 | « Donne-moi le résultat de ma dernière génération. » | 2.0 | 0 | 79900 |
| 45.1 | « Ouvre les préférences par le menu, comme si je cliquais dessus. » | 2.0 | 0 | 53202 |
| 45.2 | « De quoi es-tu capable au sujet des calques ? » | 6.0 | 0 | 188972 |
| 45.5 | « Propose-moi trois prompts pour générer un port au coucher du soleil. » | 2.0 | 1 | 53289 |
| 46.7 | « Supprime le dernier point du chemin. » | 3.0 | 0 | 80371 |
| 46.8 | « Range la sphère sous le cube, pour qu'elle le suive quand je le déplace. » | 3.0 | 0 | 80792 |
| 47.3 | « Mets Camera Test en premier dans la liste des caméras. » | 2.0 | 1 | 53611 |
| 48.4 | « Passe le rendu en qualité maximale. » | 2.0 | 0 | 53501 |
| 49.1 | « Quelles animations porte cette scène ? » | 2.0 | 1 | 53549 |
| 49.2 | « Découpe cette animation en un bloc de 0 à 5 secondes. » | 4.0 | 2 | 135866 |
| 50.1 | « Ce personnage a-t-il déjà un squelette ? » | 2.0 | 0 | 53621 |
| 50.4 | « Ajoute un os supplémentaire au bout de son bras droit. » | 6.0 | 2 | 163384 |
| 50.5 | « Renomme cet os Main Droite. » | 3.0 | 2 | 80411 |
| 50.6 | « Dis que cet os est la main droite du personnage. » | 6.0 | 1 | 162150 |
| 50.7 | « Supprime l'os que je viens d'ajouter. » | 4.0 | 0 | 108369 |
| 50.9 | « Retire cette contrainte IK. » | 4.0 | 1 | 135741 |
| 50.10 | « Enlève complètement le squelette de ce personnage. » | 3.0 | 1 | 81210 |
| 51.1 | « Regroupe mes deux calques dans un groupe appelé Fond. » | 12.0 | 11 | 328841 |
| 51.6 | « Ajoute un masque au calque Bateau. » | 5.0 | 2 | 134096 |
| 53.2 | « Enregistre le style de mon image du bateau sous le nom Marine. » | 5.0 | 0 | 133839 |
| 54.5 | « Télécharge dans mon projet les images en ligne qui manquent ici. » | 3.0 | 2 | 80126 |
| 55.3 | « Ouvre les préférences. » | 3.0 | 1 | 79848 |
| 55.7 | « Ouvre un miroir de la vue sur mon second écran. » | 2.0 | 0 | 53238 |
| 56.2 | « Installe la mise à jour et redémarre. » | 3.0 | 1 | 79931 |
| 56.7 | « Ajoute à mon projet la vidéo que je viens de déposer sur la fenêtre. » | 3.0 | 0 | 80448 |
| 57.2 | « Remets les réglages d'affichage à leurs valeurs par défaut. » | 9.0 | 5 | 243006 |
| 57.3 | « Qu'as-tu retenu de ce projet jusqu'ici ? » | 2.0 | 0 | 53230 |
| 57.5 | « Oublie ce que tu avais retenu sur le style de ce projet. » | 2.0 | 0 | 53265 |
| 58.4 | « Montre-moi ce qui a changé dans l'image du bateau depuis la dernière version. » | 3.0 | 1 | 80120 |
| 58.8 | « Prépare l'image du bateau pour la prochaine version. » | 3.0 | 0 | 79979 |
| 58.9 | « Retire l'image du bateau de ce qui est préparé. » | 5.0 | 4 | 133678 |
| 58.10 | « Annule mes modifications sur l'image du bateau et reviens à la dernière version. » | 4.0 | 2 | 107321 |
| 58.15 | « Reprends le travail que j'avais mis de côté. » | 9.0 | 0 | 243009 |
| 58.16 | « Jette la mise de côté que je n'utiliserai pas. » | 6.0 | 0 | 160464 |
| 59.3 | « Monte la force du halo lumineux à 1,5. » | 3.0 | 0 | 80605 |
| 59.4 | « Désactive le halo lumineux sans le retirer. » | 2.0 | 0 | 53488 |
| 59.13 | « Duplique le halo lumineux pour en avoir un second. » | 4.0 | 0 | 107410 |
| 59.15 | « Pose une clé sur la force du halo lumineux, à 2. » | 8.0 | 3 | 216784 |
| 59.16 | « Retire la clé posée sur la force du halo lumineux. » | 4.0 | 1 | 107615 |
| 60.3 | « Fais aller Cube Test de gauche à droite. » | 4.0 | 4 | 108320 |
| 61.12 | « Qu’est-ce que je peux régler sur un composant Santé ? » | 5.0 | 1 | 161811 |
| 62.1 | « Fais s’ouvrir la porte à deux secondes de cinématique. » | 2.0 | 0 | 53720 |
| 62.4 | « Cette timeline est une intro : ne me propose que ce qu’il faut. » | 3.0 | 0 | 80489 |
| 66.2 | « Demande au modèle de réécrire ce script pour qu'il aille deux fois plus vite. » | 3.0 | 1 | 107296 |
| 66.4 | « Fais écrire un nouveau script de saut, sans toucher à celui qui est ouvert. » | 4.0 | 1 | 134338 |
| 67.3 | « Donne-moi le détail de ce que tu sais sur les caméras. » | 4.0 | 1 | 135341 |
| 69.4 | « Trouve ce qui provoque le plus de draw calls et donne-moi le rapport. » | 2.0 | 0 | 80437 |
| 69.7 | « Force les deux sphères à utiliser des instances. » | 5.0 | 3 | 135326 |

## Reproductibilité

Commandes exécutées :

```bash
pnpm test src/main/mcp scripts/banc
EVAL_RUNS=1 pnpm banc
```

Le premier essai du test de fil MCP dans le sandbox a produit 5 échecs `listen EPERM
127.0.0.1`. Rejoué hors sandbox, le même test a donné 5/5. Ce rouge était environnemental et
n'est pas compté comme une panne MCP.

Le journal terminal brut de la passe a été conservé pendant l'analyse dans
`/private/tmp/ia-studio-mcp-banc-2026-09-05.log`. Aucun secret n'est imprimé dans ce journal.
