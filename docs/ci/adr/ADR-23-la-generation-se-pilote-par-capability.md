# ADR-23 — La génération se pilote par capability, dans un panneau unique

- **Statut** : Proposé
- **Date** : 2026-08-23
- **Dépend de** : [ADR-21](ADR-21-le-fournisseur-se-choisit-par-emploi.md), dont il étend le
  vocabulaire des emplois à toutes les familles · [ADR-22](ADR-22-le-formulaire-d-un-modele-local.md)
  pour le formulaire que le panneau rend

**Provenance.** `[M]` mesuré — lu dans le dépôt, avec `fichier:ligne` · `[D]` documenté — source
nommée · `[?]` aucune donnée, et c'est dit.

## Contexte

Choisir un modèle et l'utiliser sont deux panneaux qui se disputent la même moitié d'écran.
`[M]` `shared/domain/tool.ts` place `models`, `generator` et `assets` en `zone: 'left',
slot: 'primary'` : un seul est visible à la fois. Générer demande donc d'ouvrir Modèles, choisir,
ouvrir Génération, remplir — et recommencer à chaque essai.

Sous cette rupture, une seconde : **deux systèmes de préférence coexistent et s'arbitrent en
silence.**

- `[M]` `shared/domain/aiRole.ts` — `RoleChoices`, indexé par `AiRoleId = <famille>/<capability>`,
  avec portée projet écrasant l'application, rôle par rôle. Écrit par `Réglages > Modèles d'IA`.
- `[M]` `shared/domain/settings.ts:100` — `generation.defaultModels`, indexé par **famille**, sans
  portée. Écrit par `Réglages > Génération > <famille>`.

`[M]` `renderer/src/helpers/modelForFamily.ts:resolveModelForFamily` arbitre les deux en douze
lignes : le rôle **primaire** de la famille est lu, un fournisseur local gagne, un fournisseur
cloud refuse un identifiant local, sinon la sélection du panneau puis la préférence. Le résultat
est qu'une famille ne peut avoir qu'**un** modèle, alors que les Réglages permettent déjà d'en
choisir un par emploi — et que le panneau ne sait pas les lire.

La cause du dédoublement est mesurable. `[M]` Avant cet ADR, `CAPABILITIES_BY_FAMILY` laissait
`upscale`, `background-removal` et `vectorization` sur une liste vide. `primaryRoleOf` répondait
donc `null`, aucun rôle n'existait pour elles, et `RoleChoices` ne pouvait pas les servir :
`generation.defaultModels` était le seul endroit où leur donner un modèle.

## Décision

### A — Toute famille qui génère a au moins une capability

`upscale: ['upscale']`, `background-removal: ['cutout']`, `vectorization: ['vectorize']`. `other`
est la seule famille qui n'en a aucune, et elle ne génère rien.

Conséquence : `RoleChoices` devient la source **unique** de préférence, avec sa portée
projet > application. `generation.defaultModels` est migré puis supprimé.

### B — Le rig et la motion sont des capabilities, dérivées des tags

`3d` gagne `rig` et `motion`, **appendues** : `primaryRoleOf('3d')` reste `txt23d`, donc ce que
l'espace 3D génère par défaut ne bouge pas.

Ces deux-là ne sont pas des valeurs de l'énumération de l'API, et trois autres non plus. Elles
portent donc leur règle de détection, dans `STUDIO_CAPABILITIES` :

| capability | famille | ce qui la trouve |
|---|---|---|
| `rig` | `3d` | capability `3d23d` **et** tag `rigging` |
| `motion` | `3d` | tags `motion`/`animation`, **sauf** `rigging` |
| `upscale` · `cutout` · `vectorize` | leur famille | toute la famille — `FAMILY_TAGS` l'a déjà filtrée |

`[M]` Mesuré le 18/08 et repris de `rigProvider.ts`, qui délègue désormais à cette table plutôt
que de la réécrire : `3d23d` couvre 19 modèles publics et cinq riggent — les autres remaillent,
retexturent, déplient ou segmentent. La capability n'est **pas** lue pour la motion : ces modèles
couvrent `txt23d`, `video23d` et `3d23d`, donc une liste bâtie dessus serait aux trois quarts
fausse ou serait la liste de tout.

**🛑 L'angle mort, écrit plutôt que caché.** Ces tags sont des mots d'AUTEUR, hors du namespace
`sc:` que seule la plateforme poste. Rien ne les rend contractuels. Un éditeur qui orthographie
autrement disparaît de l'emploi, **et rien ne rougit**. C'est le seul signal qui existe.

`[M]` Aucun modèle local ne sert ces deux emplois : les onze entrées 3D de `localModels.json`
déclarent `txt23d`, `img23d` ou `3d23d`. Le panneau dira « aucun modèle local », ce qui est la
vérité, plutôt que de faire disparaître l'opération.

**Ce qui a été vérifié le 23/08 avant de décider**, parce qu'un emploi qu'aucun modèle libre ne
peut servir localement mérite d'être dit :

- `[D]` **UniRig** — code MIT (API GitHub, `VAST-AI-Research/UniRig`), poids MIT déclarés sur
  `VAST-AI/UniRig`, aucun `.py` dans le dépôt de poids, format `.ckpt` avec une conversion
  communautaire en safetensors (`apozz/UniRig-safetensors`, MIT). Il franchit `ADMITTED_LICENCES`,
  `admitsLoad` et `weightsCarryCode`, et le vendoring de son code emprunterait le mécanisme que
  `engine/src/aidesktopstudio_engine/vendor/` sert déjà à cinq arbres. Candidat, pas une décision : il
  manquerait une porte `engine/rig`, `core/router.py` n'en déclarant que cinq.
- `[D]` **MDM** — code MIT, mais les poids sont sur Google Drive, ce que `ModelFile` ne peut ni
  épingler ni vérifier, et le pipeline dépend de SMPL, sous licence de recherche non commerciale.
  Refusé par deux règles indépendantes.

### C — Le sélecteur du panneau écrit la capability courante, et elle seule

`[M]` Aujourd'hui, un clic dans le panneau Modèles appelle `familyChoiceWrites()`, qui écrit la
préférence de **toutes** les capabilities du modèle d'un coup, en portée projet dès qu'un projet
est ouvert. Choisir SSD-1B pour retoucher réquisitionne aussi `txt2img`, `outpaint` et les deux
emplois texture, sans un mot.

Le sélecteur intégré au panneau écrit l'emploi en cours, en portée application par défaut, avec
une case « pour ce projet ».

### D — Deux usages, deux surfaces

Le **sélecteur** vit dans le panneau de génération : rapide, contextuel, filtré par la capability
en cours, et il télécharge ou renvoie configurer sans quitter le panneau.

Le **gestionnaire** vit dans `Réglages > Modèles d'IA`, où le catalogue Scenario rejoint ce que
cet écran tient déjà — installer, charger, mémoire et VRAM, Ollama, modèle fourni, portée. Le
panneau `models` quitte les docks.

## Conséquences

- `allRoles()` passe de 23 à 28 emplois. Chacun gagne sa ligne dans l'aperçu et son écran de
  réglage : `ai.upscale`, `ai.background-removal`, `ai.vectorization`.
- `roleLabel` nomme une famille à emploi unique par la famille seule — « Agrandissement ·
  Agrandissement » ne disait rien de plus que « Agrandissement ».
- `matches` du registre sait narrower sur une capability studio ; le menu de facettes n'offre que
  celles qui narrowent réellement — `upscale`, `cutout` et `vectorize` sont toute leur famille, et
  une option qui ne raccourcit rien est aussi vaine qu'une qui ne répond rien.
- `generation.<famille>` disparaîtra des réglages avec `defaultModels`. C'est pourquoi
  `generation.texture`, absent depuis toujours, n'a pas été ajouté : `ai.texture` existe déjà.

## Ce que cet ADR ne décide pas

Les emplois skybox — `txt2skybox`, `img2skybox` — sont eux aussi des mots du studio que
l'énumération de l'API ne connaît pas, `[D]` les panoramas Scenario répondant `txt2img` comme
n'importe quel modèle image. Ils pourraient rejoindre `STUDIO_CAPABILITIES` avec `answers`, mais
la mesure n'a pas été refaite contre le vrai compte. Ils restent hors du menu de facettes, comme
avant.
