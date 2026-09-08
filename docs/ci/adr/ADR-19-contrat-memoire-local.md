# ADR-19 — La mémoire est un seul pot, et personne ne la déduit par soustraction

- **Statut** : Proposé
- **Date** : 2026-08-21
- **Dépend de** : [ADR-18](ADR-18-capacites-runtime-par-porte.md) — `residency` et
  `RuntimeEndpointId` y sont définis, et `reclaimable` ci-dessous en dérive

**Provenance.** `[M]` **mesuré ici** — soit lu dans un dépôt avec `fichier:ligne`, soit obtenu en
exécutant, le protocole étant alors cité · `[D]` documenté — source nommée · `[?]` aucune donnée,
et c'est dit. **La définition a été élargie le 21/08** : elle disait « lu dans le dépôt », et les
amendements y logent des lectures de dépôts étrangers et des mesures d'exécution.

## Contexte

`[M]` Le dépôt ne contient aujourd'hui **aucun** `totalmem`, `freemem`, `statfs`, `getGPUInfo` ni
`nvidia-smi` — `grep` sur `src/` et `scripts/`, vide. Son unique budget de ressource est un compte
de cœurs : `main/services.ts:257`, `spareCores = max(1, availableParallelism() − 2)`.

Deux décisions doivent être prises **avant** qu'un runtime local soit expédié, parce qu'elles sont
chères à défaire ensuite.

**La première : un pot ou deux.** `[D]` Apple Silicon expose une mémoire unifiée entre le
processeur et le GPU ; `[?]` la fraction réellement allouable au GPU n'est mesurée nulle part ici.
Sur une telle machine, `{ ramBytes, vramBytes }` comme budgets **indépendants** est faux par
construction : ce sont deux vues d'un même pot, et les additionner surestime la place du double.

**La seconde : qui répond.** `[D]` `app.getGPUInfo()` rend les informations GPU de Chromium ; `[?]`
qu'un champ de VRAM y figure, et sur quelles plateformes, n'est vérifié par personne ici.

## Décision

### A. `MemorySnapshot` porte `domain`, et jamais deux budgets indépendants

```ts
// shared/domain/aiMemory.ts
export type MemoryDomain = 'unified' | 'split'

/**
 * `readonly` de bout en bout, et c'est PORTEUR : sans lui, `available += taille_libérée` — la
 * forme que R2 interdit nommément — compile proprement. Ajouté le 21/08, voir l'amendement.
 */
export type MemorySnapshot = {
  readonly domain: MemoryDomain
  /** Qui a répondu. Jamais « calculé » : voir R2. */
  readonly source: 'runtime' | 'probe' | 'none'
  readonly at: number
  readonly physicalBytes: number
  /** Ce que le studio s'autorise à prendre au total, runtimes compris. */
  readonly appBudgetBytes: number
  /** Ce que la fenêtre occupe. Sur `unified`, sort du MÊME pot que les poids. */
  readonly rendererReservedBytes: number
  readonly runtimeBytes: Readonly<Record<RuntimeEndpointId, RuntimeOccupancy>>
  /** Jamais engagée : fragmentation, cache d'allocateur, ce que le système ne rend pas. */
  readonly headroomBytes: number
  readonly availableBytes: number
}

export type RuntimeOccupancy = {
  readonly bytes: number
  /**
   * Ces octets peuvent-ils entrer dans un plan de libération, MAINTENANT.
   *
   * Dérivé de deux choses, jamais renseigné à la main, et **jamais de `residency` seul** :
   * `opaque` répond toujours faux ; **`owned` comme `advisory` répondent faux jusqu'à ce qu'une
   * re-mesure ait confirmé qu'une libération demandée a bien eu lieu, puis vrai.**
   *
   * Sa valeur change donc dans le temps SANS que les capacités du runtime changent, et c'est
   * exactement pourquoi ce n'est pas une projection d'un champ.
   *
   * `owned` était écrit « toujours vrai » ici, et c'était FAUX — voir l'amendement du
   * 21 août 2026 ci-dessous, et celui d'ADR-18 qui retire la conséquence correspondante.
   */
  readonly reclaimable: boolean
}
```

**Sur `domain: 'unified'`, il n'existe qu'un budget** : les besoins d'un modèle s'y expriment en
une grandeur, pas deux.

### B. Trois règles d'autorité

> **R1. Le runtime fait autorité sur son occupation ; la sonde ne fait autorité que sur le
> physique.** `source: 'probe'` sert à trier un catalogue avant qu'un runtime existe, et à dire
> pourquoi rien n'est proposé — **jamais à admettre un job**.

> **R2. Après une libération, l'ordonnanceur ne suppose rien : il redemande un `MemorySnapshot`.**
> Toute forme d'`available += taille_libérée` est interdite. Conséquence de signature : une
> libération rend un `Promise<MemorySnapshot>`, jamais `void`.

> **R3. Le pic d'un job n'est pas la somme des tailles déclarées.** Le manifeste donne une
> réservation *a priori* ; le pic réel inclut les activations, le cache d'allocateur, la
> fragmentation et la réserve du renderer. Une réservation démentie est une mesure à écrire, pas
> une erreur à ignorer.

### C. Un verdict de compatibilité fermé, `unknown` compris

```ts
export type Compatibility =
  | 'compatible' | 'slow' | 'experimental'
  | 'insufficient-memory' | 'incompatible'
  /** Aucune autorité n'a répondu. L'état par DÉFAUT, jamais un échec. */
  | 'unknown'
```

R1 rend `unknown` fréquent : sans relevé de runtime, c'est l'honnête réponse.

### D. `requested` / `constraint` / `effective` : deux champs, un sélecteur

```ts
/** Ce qui a posé la borne. NON publié : un axe interne, comme ceux de `RuntimeCapabilities`. */
type ConstraintSource = 'memory-pressure'

export type Governed<T> = {
  /** Ce que la personne a réglé. Le SEUL des trois qui soit persisté. */
  requested: T
  /** Une BORNE, jamais une valeur. Temporaire, révocable, jamais écrite au disque. */
  constraint?: { bound: T; by: ConstraintSource }
}

/** Dérivé, jamais stocké — composé par la règle que le réglage utilise déjà. */
export function effectiveOf<T>(governed: Governed<T>, compose: (a: T, b: T) => T): T
```

`effective` n'est pas un champ : stocker une valeur dérivable ferait deux sources de vérité,
exactement ce que R2 interdit un cran plus bas.

`[M]` La forme existe déjà dans le dépôt, entre deux préférences :
`engines/scene/viewportQuality.ts`, où `shadowMapSizeFor(quality, preferred)` est **un plafond et
non une valeur** — « les deux réglages composent au lieu de s'écraser : quelqu'un qui a choisi
1024 garde 1024 ». Une contrainte système est une troisième origine, non persistée, composée par
la même règle.

## Alternatives écartées

- **`{ ramBytes, vramBytes }` indépendants.** Le retrofit est le point entier de cette ADR.
  Expédier deux budgets puis découvrir la mémoire unifiée oblige à changer **ensemble** :
  l'ordonnanceur, les champs `vramMinBytes` / `ramMinBytes` du manifeste — `[M]` dont l'ancêtre
  `SttModelFile` (`shared/domain/dictation.ts:155`) est **dans le binaire**, donc tout manifeste
  expédié est réécrit et tout manifeste fourni par la personne exige une migration de
  `schemaVersion` —, la règle d'admission, et le verdict `Compatibility`. Et jusqu'à la **phrase de
  refus** : « 24 Go de VRAM requis » est faux sur une machine unifiée, ce qui touche
  `shared/i18n/{fr,en}/models.json`, `renderer/src/hooks/usePlanRefusal.ts` et les gardes qui
  exigent une clé par valeur d'union (`renderer/src/dynamic-keys.i18n.test.ts`,
  `shared/i18n/bundles.test.ts`). Trois couches, un seul changement.
- **Un champ `trusted` sur `RuntimeOccupancy`.** Supprimé : il n'avait aucune conséquence propre.
  La fiabilité d'un relevé est `memoryReporting` (ADR-18), une propriété du runtime et non de
  chaque relevé.
- **Faire migrer `generation.concurrentJobs` vers un budget en octets.** Écarté, et il faut le
  dire : un budget mémoire local et un compte de jobs distants **peuvent coexister**. On ajoute un
  réglage, on n'en migre pas un — le retrofit est bon marché, donc ce n'est pas un contrat.

## Ce que cette décision ne tranche pas

Les seuils de `appBudgetBytes` et `headroomBytes` · les niveaux de pression et toute politique de
réduction de qualité · qui choisit `appBudgetBytes` · le comportement quand `source: 'none'` et
qu'un job est demandé quand même · si `rendererReservedBytes` est mesurable autrement que par
convention `[?]` · la fréquence de rafraîchissement d'un relevé.

## Ce qui l'invaliderait

| Mesure | Résultat qui casse la décision |
|---|---|
| Relevé du runtime contre occupation système réelle, sur macOS unifié et sur CUDA | Un relevé faux de façon systématique ⇒ `source: 'runtime'` n'est plus une autorité, R1 tombe |
| Libération puis re-mesure immédiate, sur chaque pile | Si la mémoire revient exactement et immédiatement **partout**, R2 devient une précaution inutile |
| Occupation GPU du viewport, scène ouverte contre scène fermée | Si elle est négligeable, `rendererReservedBytes` sort du relevé |

## Conséquences

- `[M]` **Trois libérations existantes contredisent R2** et doivent être alignées :
  `main/dictation/session.ts:126` (inactivité), `:149` (panne), `:290` (arrêt) ferment le moteur, et
  la JSDoc de la première annonce « returning around 700 MB » — une soustraction, pas une mesure.
- `[M]` **Un défaut de la section D est déjà en place dans le code** :
  `renderer/src/hooks/useViewportSetting.ts:45` retient une écriture et la compare **par
  identité** — `pending?.against === stored`. Une contrainte poussée par le processus principal
  remplace `stored`, l'identité change, et le réglage que la personne était en train de bouger
  disparaît sans un mot.
- Le refus local passe par le canal de refus existant — `usePlanRefusal` + `isBeyondPlan`,
  consommé par `panels/models/Models/Models.tsx:141` et `panels/generator/Generator.tsx:117`
  `[M]` — ou il y en aura deux.

**Fichiers** : `shared/domain/aiMemory.ts` *(neuf)* ·
`shared/domain/{settings.ts,settingsRegistry.ts,model.ts}` ·
`shared/i18n/{fr,en}/{settings,models}.json` ·
`renderer/src/hooks/{useViewportSetting.ts,usePlanRefusal.ts}` ·
`renderer/src/spaces/three/SceneDocument.tsx:202` ·
`renderer/src/engines/scene/{SceneRenderer.ts:2136,viewportQuality.ts}` ·
`renderer/src/panels/{models/Models/Models.tsx,generator/Generator.tsx}` ·
`main/dictation/session.ts` *(R2)*.

---

## Amendement du 21 août 2026 — `reclaimable` corrigé, et R2 tient pour une raison neuve

### `reclaimable` ne fait plus d'exception pour `owned`

La JSDoc de `RuntimeOccupancy` disait « `owned` répond toujours vrai ». C'est faux, et la raison
complète est dans l'amendement d'ADR-18 : `owned` dit qui tient le **cycle de vie**, jamais que
les octets rentrent. La dérivation devient donc :

> `opaque` → jamais récupérable. **`owned` et `advisory` → récupérables seulement après une
> re-mesure qui le confirme.**

C'est **R2 appliqué partout** au lieu d'être suspendu pour un cas. `reclaimableOf` était déjà une
fonction à deux arguments : sa signature ne bouge pas, seule sa première branche disparaît.

### L'occupation GPU du viewport est mesurée : `rendererReservedBytes` RESTE, et R2 est démontrée sur le studio lui-même

`[M]` La troisième ligne de « Ce qui l'invaliderait » demandait l'occupation GPU du viewport,
scène ouverte contre fermée, et prévoyait que le champ **sorte** du relevé si elle était
négligeable. Mesuré le 21/08 sur M2 Max / 96 Gio unifiés, Electron 43.4.0, `footprint -p` sur le
processus GPU : **107 Mo à vide → 475 Mo** avec une scène 3D de 8 000 blocs, canvas monté et
vérifié. La catégorie « (graphics) » passe de **10 Mo à 322 Mo**, un facteur 32. Le champ reste.

`[M]` **Et la même mesure démontre R2 sans qu'aucun runtime IA soit en jeu.** Tous les documents
fermés — `documents: []`, `canvases: 0` — l'empreinte se stabilise à **353 Mo**, et le plateau
tient plusieurs minutes : **246 Mo ne reviennent pas**, dont 239 Mo de mémoire graphique. Le
studio possédait ces octets de bout en bout. Une soustraction se serait trompée de 246 Mo, sur son
propre viewport.

`[?]` Ce que la mesure ne dit pas : la proportionnalité à la charge. Les paliers 500 et 2 000
blocs ont été écartés plutôt que rapportés — le protocole ne remontait pas le canvas après une
fermeture, donc les relevés décrivaient un état ambigu.

### `app.getGPUInfo()` est interrogé : la sonde ne gagne pas de rang

`[M]` Le `[?]` du Contexte — « qu'un champ de VRAM figure dans `app.getGPUInfo()`, et sur quelles
plateformes, n'est vérifié par personne » — est levé pour macOS, et **le typage le lève partout** :
dans `electron.d.ts` de la 43.4.0 la signature est `getGPUInfo(infoType): Promise<unknown>`, et
**aucun champ de mémoire GPU n'est déclaré nulle part dans le fichier**. À l'exécution sur ce Mac,
`basic` et `complete` rendent les mêmes 4 clés, 34 feuilles, et **zéro** dont le nom évoque une
mémoire ; `gpuDevice` ne porte que `active`, `deviceId`, `gpuPreference`, `vendorId`.

**Cela RENFORCE § A.** Sur une machine unifiée il n'y a rien d'autre à lire que la mémoire
système — `os.totalmem()` a rendu 103 079 215 104 octets — ce qui est exactement ce que
`domain: 'unified'` décrit. `getGPUInfo` identifie le GPU et ses capacités ; il n'alimente aucun
budget. `[?]` Une seule plateforme mesurée ; sur un GPU dédié la réponse d'exécution peut être
plus riche, mais le type ne le promettra jamais.

### R2 tient — mais la ligne qui devait l'invalider a répondu OUI sur le runtime testé

`[M]` La deuxième ligne de « Ce qui l'invaliderait » prévoyait que R2 devienne « une précaution
inutile » si la mémoire revenait exactement et immédiatement **partout**. Mesuré le 21/08 sur
Ollama 0.4.6 : **elle revient, et totalement.** Le modèle vit dans un `ollama_llama_server`
enfant, et sur `keep_alive: 0` **ce processus disparaît en moins de 300 ms** — `/api/ps` se vide
entre t+0 et t+250 ms, et le système reprend les 981 Mo que le runner occupait.

**R2 tient quand même, et le mot qui la sauve est « partout ».** Le contre-exemple est dans ce
dépôt, mesuré le même jour : le studio est `owned` sur son propre viewport, il ferme tous ses
documents, et **246 Mo ne reviennent pas**. Un ordonnanceur qui aurait généralisé depuis Ollama
se serait trompé sur le viewport, et l'inverse aussi.

**Et la leçon est plus utile que la règle** : ce qui prédit le retour des octets n'est ni
`residency`, ni `memoryReporting`, mais **si la libération tue un processus**. Ollama tue et rend
tout ; le studio ne tue pas et ne rend rien. Voir l'amendement d'ADR-18.

### R3 est confirmée, et chiffrée

`[M]` « Le pic d'un job n'est pas la somme des tailles déclarées » se mesure sur le cas le plus
simple qui soit : `llama3.2:3b` pèse **2,02 Go sur le disque** et le runtime en rapporte
**4,03 Go** une fois chargé — exactement le double — puis **8,21 Go** en portant `num_ctx` à 8192.
Une réservation lue dans un manifeste aurait annoncé 2,02 Go.

`[?]` Et l'écart symétrique reste ouvert, il appartient à V13 : `footprint` ne voit que **981 Mo**
pour ce même runner, quand `/api/ps` en annonce 4,03. Facteur 4 entre deux façons de compter. Ne
pas en conclure que le runtime surestime — sur Metal, des allocations peuvent échapper au footprint
d'un processus.

### Deux citations `[M]` de la version initiale étaient décalées

Vérifiées le 21/08 : `panels/models/Models/Models.tsx:141` est un `onSelect` — le canal de refus
est consommé aux lignes **59, 146, 152 et 159** ; `panels/generator/Generator.tsx:117` est une fin
de bloc de commentaire, l'appel est en **118**. Le fait annoncé est juste, les deux pointeurs ne
l'étaient pas.
