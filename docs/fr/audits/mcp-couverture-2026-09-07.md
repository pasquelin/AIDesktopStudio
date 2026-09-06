# Audit MCP global — 2026-09-07

## Périmètre mesuré

L’audit relit les commits des sept derniers jours, le registre `ActionName`, les handlers du
renderer, la publication `tools/list`, les scénarios de `scripts/banc/` et les commandes de
document repérées par `no-unreachable-command.test.ts`.

Les contrôles statiques distinguent trois choses : une action déclarée, une action atteignable sur
le fil MCP et un comportement exercé par un scénario. Ils ne mesurent pas encore la compréhension
par un vrai modèle : `pnpm banc` reste volontairement hors porte car il appelle un modèle payant.

## Ajouté dans ce lot

| Commande MCP | Description |
| --- | --- |
| `world.setLayers` | Remplace la liste complète, validée et durable des couches de relief et de semis. Elle couvre les paramètres persistants des terrains et semis après lecture de `scene.state`. |
| `canvas.setDocumentProperties` | Règle DPI, mode couleur et profondeur de l’image ouverte, puis `canvas.state` les relit. |
| `ai.localState` | Lit modèles locaux, rôles, téléchargements, mémoire machine, runtime et erreurs. |
| `ai.manageLocalRuntime` | Choisit, installe, retire, charge, décharge ou diagnostique un modèle local et son runtime. Toute mutation demande le consentement `studio`. |
| `animation.reopenMotion` | Rouvre dans la timeline le mouvement sauvegardé d’un asset pour un modèle donné. Le routage est testé directement avec un asset simulé. |

## Écarts maintenus explicitement

| Fonctionnalité non publiée comme action autonome | Pourquoi elle reste hors MCP aujourd’hui | Suite nécessaire |
| --- | --- | --- |
| Sculpture terrain et peinture de masques | Les commandes reçoivent des blocs binaires de relief, produits par le pinceau GPU. Une action brute accepterait des données opaques sans aperçu ni garde spatiale. | Définir un protocole sémantique de pinceau ou une opération de masque par région, avec oracle de rendu. |
| Atelier de retargeting : aperçu et application | Le flux dépend d’une fenêtre propriétaire, de deux squelettes, d’un worker GPU, d’un choix de clip et d’un export GLB. Ouvrir un faux outil « appliquer » ne garantirait ni aperçu ni asset valide. | Extraire un service de retargeting sans React/fenêtre, puis publier `preview` et `apply` avec un asset résultat relisible. |
| Création et reprise de missions | Une mission peut lancer de la planification et des appels modèle payants. Le contrat actuel ne transporte ni estimation ni plafond budgétaire. | Ajouter estimation, budget maximal et consentement `credits` avant `missions.create` et `missions.resume`. |
| Ajout d’un modèle fourni par la personne | Le pont ouvre un sélecteur natif sans chemin en entrée ; un client MCP ne peut pas remplir ce dialogue. | Ajouter une importation par chemin validé, licence et empreinte, avec consentement `files`. |
| Dictée et réglages de confidentialité | Ils utilisent microphone et panneau système ; ce sont des permissions de personne, pas des appels automatisables. | Conserver hors MCP, ou introduire une action limitée à l’état et aux refus de permission. |
| Réouverture d’un mouvement dans le banc réel | `animation.reopenMotion` est testé unitairement, mais le scénario 49.1 ne fait que lister les animations : il ne prépare pas encore d’asset de mouvement persistant. | Ajouter un fixture `.glb` contenant un mouvement compatible, puis un scénario qui constate l’ouverture de l’atelier. |

## Contrôles à conserver

- `src/main/mcp/wire.test.ts` vérifie la publication et un appel réel sur socket.
- `scripts/banc/coverage.ts` relie chaque action du registre à une phrase de scénario.
- Ce lien de couverture est déclaratif : il ne remplace pas l’oracle de l’effet. Le cas
  `animation.reopenMotion` ci-dessus est donc explicitement **non mesuré par le banc réel**.
- `src/renderer/src/no-unreachable-command.test.ts` signale les commandes de document sans porte
  assistant ; il ne doit pas être contourné par une exemption sans justification durable.
- Le banc réel doit être lancé avec trois passes avant toute conclusion de couverture comportementale.
