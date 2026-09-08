# ADR-18 — Les capacités d'un runtime local se déclarent par porte d'accès

- **Statut** : Proposé
- **Date** : 2026-08-21

> **`Proposé` est un statut neuf dans ce dossier**, où les dix-sept ADR précédentes sont `Accepté`
> ou `Caduc`. Il est introduit ici délibérément : cette ADR et les deux suivantes portent des `[?]`
> explicites et des critères d'invalidation nommés. Les marquer `Accepté` dirait qu'elles ont été
> vérifiées, ce qui est faux, et effacerait la distinction que tout leur contenu sert à construire.

**Provenance.** Chaque affirmation porte un marqueur : `[M]` **mesuré ici** — soit lu dans un
dépôt avec `fichier:ligne`, soit obtenu en exécutant, le protocole étant alors cité · `[D]`
documenté — source nommée · `[?]` aucune donnée, et c'est dit.

> **La définition de `[M]` a été élargie le 21/08**, et il faut le dire : elle promettait
> « lu dans **le** dépôt, avec `fichier:ligne` ». Les amendements y logent désormais des lectures
> de dépôts **étrangers** et des mesures d'**exécution**, qui n'ont pas de `fichier:ligne`. Le
> marqueur promettait donc autre chose que ce qu'il portait.

## Contexte

`[M]` Le studio pilote aujourd'hui **un** moteur local, la dictée, par **une** porte : un
`utilityProcess` ([ADR-17](ADR-17-moteur-de-dictee-hors-processus.md)) parlé à travers
`main/processClient.ts`. Il n'y a aucune négociation de capacités — le code sait ce que
sherpa-onnx sait faire parce qu'il a été écrit pour lui.

Avec plusieurs runtimes, un ordonnanceur ne peut plus savoir : il doit décider à partir de
déclarations. Deux façons de rater ça sont déjà identifiées.

**La première : indexer par runtime.** ✅ **Vérifié** — sur `/v1/chat/completions` d'Ollama,
`keep_alive` est **ignoré** et `num_ctx` n'y est pas réglable, il faut un Modelfile. `[D]` Son API
native `/api/chat` accepte `keep_alive` en paramètre de requête. **Le même runtime a deux profils
selon la porte.** `[?]` Le même cas est attendu d'un runtime à graphe — soumission HTTP,
progression WebSocket — mais rien ne l'a vérifié ici.

**La seconde : écrire des booléens.** `supportsKeepAlive: true` ne dit pas ce que l'ordonnanceur
fait de différent. `[M]` Le dépôt refuse déjà ce défaut ailleurs : `RowTone` a été supprimé pour
qu'un appelant ne puisse plus demander un second ton, et `incomplete` dans `IO_BY_KIND` porte **la
phrase du refus** plutôt qu'un drapeau.

## Décision

**La clé est `(runtime, porte d'accès)`, et chaque valeur d'énumération porte une conséquence
écrite sur l'ordonnanceur.**

```ts
// shared/domain/aiRuntime.ts

/**
 * `<runtime>/<porte>`, deux segments en kebab-case minuscule : `ollama/api-chat`,
 * `ollama/v1-chat`, `llamacpp/embedded`.
 *
 * Marqué plutôt que laissé `string`, et le format FAIT PARTIE du contrat : c'est la clé de
 * `runtimeBytes` dans ADR-19, et une clé mal formée dans un `Record` ne rougit nulle part — elle
 * compte zéro octet. `'ollama'` seul et `'Ollama/v1-chat'` sont refusés à la construction, ce qui
 * est la seule façon d'empêcher trois orthographes d'une même porte de coexister.
 */
export type RuntimeEndpointId = string & { readonly brand: unique symbol }

export function runtimeEndpointId(runtime: string, door: string): RuntimeEndpointId

export type RuntimeCapabilities = {
  residency: 'owned' | 'advisory' | 'opaque'
  memoryReporting: 'authoritative' | 'best-effort' | 'none'
  context: 'per-request' | 'per-install' | 'unknown'
  progress: 'push' | 'poll' | 'none'
  cancellation: 'cooperative' | 'process-only' | 'none'
  submission: 'params' | 'workflow-graph'
  occupancy: 'multi-job' | 'exclusive-process'
}
```

Une ligne par valeur d'énumération, et ce que l'ordonnanceur en fait :

| Axe · valeur | Ce que l'ordonnanceur fait **différemment** |
|---|---|
| `residency: owned` | Nous décidons du chargement et de la libération. ~~Ses octets sont **récupérables** : un plan de libération peut compter dessus.~~ **La seconde phrase est FAUSSE — voir l'amendement du 21 août 2026.** Nous tenons le cycle de vie ; nous ne tenons pas le retour des octets, qui **ne deviennent récupérables qu'après une re-mesure qui le confirme, exactement comme `advisory`.** |
| `residency: advisory` | Un processus étranger garde **sa** politique. Nous pouvons demander ; il peut refuser pour des raisons invisibles d'ici. Les octets ne deviennent récupérables qu'**après** une re-mesure qui le confirme, et aucun plan ne les engage à l'avance. |
| `residency: opaque` | Nombre non fiable au budget, **jamais** récupérable. La seule libération garantie est l'arrêt du processus : un job qui a besoin de cette place est planifié comme si elle n'existait pas. |
| `memoryReporting: authoritative` | Alimente `MemorySnapshot.source = 'runtime'` et sert à l'admission (ADR-19). |
| `memoryReporting: best-effort` | Affichable, **jamais** décisif. L'admission retombe sur la réservation du manifeste. |
| `memoryReporting: none` | Aucune admission ne lit ce runtime : réservation du manifeste seule. **Ne change pas la topologie de processus.** |
| `context: per-request` | Nos bornes s'appliquent telles qu'elles sont écrites. |
| `context: per-install` | La fenêtre est fixée hors de notre contrôle. Nous la **découvrons** et **rabattons nos bornes dessus** ; un dépassement est une panne du runtime, pas un défaut de notre invite. |
| `context: unknown` | Rabattre sur la borne la plus basse que le manifeste connaisse ; tout dépassement est rapporté comme panne. |
| `progress: push` | Le gestionnaire **s'abonne**. Il ne boucle pas. |
| `progress: poll` | Boucle de sondage existante. |
| `progress: none` | État **indéterminé** à l'écran. Aucun pourcentage n'est composé. |
| `cancellation: cooperative` | La mémoire revient sans tuer. Le job peut cohabiter. |
| `cancellation: process-only` | Annuler = tuer le worker, donc **tuer tous ses jobs**. L'ordonnanceur ne co-localise jamais un tel job. |
| `cancellation: none` | Le bouton est **désactivé**, pas silencieux. |
| `submission: params` | `FieldDescriptor[]` s'applique directement. |
| `submission: workflow-graph` | L'unité soumise est un **graphe versionné**, pas un `generate(params)`. Voir la note ci-dessous. |
| `occupancy: multi-job` | Plusieurs jobs par processus. |
| `occupancy: exclusive-process` | Un job par processus : la topologie devient fonction du parallélisme voulu. **Irréversible une fois expédiée.** |

**`residency` et `memoryReporting` sont orthogonaux, et la combinaison qui le prouve est
`owned` + `none`** : nous décidons du chargement et du déchargement, mais nous n'interrogeons pas
l'allocateur. Un `llama.cpp` embarqué est ce cas. **La libération est demandable et son effet
n'est pas confirmable** : on décharge, on ne tue pas, et l'admission qui suit repart de la
réservation du manifeste plutôt que d'une soustraction. Coupler les deux axes produirait la
décision inverse — tuer un worker qu'on pouvait simplement décharger.

**Ce que `submission: 'workflow-graph'` impose au port provider, et rien de plus** : l'artefact
installable a version et intégrité propres ; `capabilities()` se dérive des **graphes** installés
et non des modèles ; les `FieldDescriptor[]` sont publiés depuis l'artefact. `[?]` Aucun runtime à
graphe n'a été lancé ici — les types de liaison ne sont pas écrits, ils seraient plausibles et
faux, et personne ne pourrait dire lesquels.

### Le tableau, par porte

| | llama.cpp *(embarqué)* | MLX | Ollama `/api/chat` | Ollama `/v1/chat/completions` | Runtime à graphe |
|---|---|---|---|---|---|
| `residency` | `owned` `[M]` — la C API donne `llama_model_load_from_file` / `llama_model_free` au client | `owned` `[M]` — cycle de vie porté par les `mx.array` | **`advisory`** `[M]` — `keep_alive` honoré, mesuré | **`advisory`** — `keep_alive` **ignoré** ✅ `[M]` | `opaque` `[?]` |
| `memoryReporting` | `[?]` | `[?]` | **rapporte** `[M]` — `size` et `size_vram`, autorité non tranchée | idem — même serveur | `[?]` |
| `context` | `[?]` | `[?]` | **`per-request`** ✅ `[M]` — `options.num_ctx` déplace l'allocation | **`per-install`** — non réglable ✅ `[M]` | s.o. |
| `progress` | `[?]` | `[?]` | **`push`** ✅ `[M]` — 118 fragments, le premier à 67 ms | `[?]` | `push` `[D]` |
| `cancellation` | `[?]` | `[?]` | **`cooperative`** ✅ `[M]` — couper la requête ne tue pas le serveur | `[?]` | `[?]` |
| `submission` | `params` `[?]` | `params` `[?]` | `params` `[M]` | `params` `[M]` | **`workflow-graph`** `[D]` |
| `occupancy` | `[?]` | `[?]` | **`multi-job`** ✅ `[M]` — deux requêtes concurrentes, **un** modèle chargé | idem — même serveur | `[?]` |

**Un tableau plausible coûterait plus qu'un tableau vide.** Chaque case se remplit par une
vérification nommée — charger, demander une libération, re-mesurer, annuler à mi-course, dépasser
le contexte — avant qu'on y écrive quoi que ce soit.

**Les cases ✅ ont été remplies le 21/08 par exécution**, contre Ollama **0.4.6** sur Apple M2 Max,
modèle `llama3.2:3b`. Les deux colonnes Ollama partagent un serveur : ce qui ne dépend pas de la
porte y est reporté à l'identique, et **ce qui en dépend est précisément ce que cette ADR
existe pour dire**. Les colonnes llama.cpp et MLX restent `[?]` sur tout ce qui demande une
exécution — leur `residency` seule est établie, et par lecture de source.

## Alternatives écartées

- **Indexer par runtime.** Faux, et c'est vérifié : les deux portes d'Ollama ne déclarent pas la
  même chose.
- **Des booléens (`supportsKeepAlive`).** Un drapeau ne dit pas ce que l'ordonnanceur fait ; c'est
  exactement le défaut que cette ADR existe pour interdire.
- **Déduire d'un numéro de version.** Ce n'est pas la version qui change le comportement ici,
  c'est l'endpoint.
- **Coupler `memoryReporting: none` à `residency: opaque`.** Produit une décision fausse — voir la
  note sur `owned` + `none`.
- **Laisser `RuntimeEndpointId` en `string`.** Trois orthographes d'une même porte coexisteraient
  dans un `Record`, et la clé morte compterait zéro octet sans que rien ne rougisse.

## Ce que cette décision ne tranche pas

Les valeurs réelles du tableau · comment un runtime déclare ses capacités — poignée de main,
manifeste d'adaptateur, ou les deux · la topologie de processus qui en découle · si les capacités
peuvent changer à chaud · le format d'un graphe.

## Ce qui l'invaliderait

| Vérification | Résultat qui casse la décision |
|---|---|
| **`advisory` contre `owned`** — chercher si un runtime **cède contractuellement** sa politique de résidence : un mode documenté qui la désactive, une API qui en transfère la propriété | **RENDUE le 21/08, et l'axe NE fusionne PAS — mais pas pour la raison écrite ici.** Un mode documenté existe bel et bien (`llama-server --models-max 0`) : le critère est donc atteint, et la ligne aurait dû fusionner l'axe. Deux faits l'en empêchent, tous deux découverts le même jour — voir l'amendement. |
| ~~Dépasser la fenêtre de contexte de la porte `/v1` avec le préambule complet~~ **RENDUE le 21/08** | **`context` est CONFIRMÉ comme axe.** La troncature est bien silencieuse — HTTP 200, `finish_reason: "stop"` — mais son effet est massif et observable, et **elle coupe la TÊTE** : voir l'amendement |
| ~~Annuler à mi-inférence sur chaque pile~~ **partiellement rendue le 21/08** | Ollama annule **sans mourir** (`cooperative`), donc la réduction à un booléen ne se déclenche pas. Il en faudrait d'autres pour rendre la ligne entièrement |

## Conséquences

- `[M]` La chaîne `HISTORY_MAX = 10` (`shared/domain/assistantModel.ts:47`) est appliquée en quatre
  points sur trois couches : `main/assistant/validation.ts:20`, `main/assistant/instruction.ts:87`,
  `main/assistant/brainProvider.ts:50`, `renderer/src/stores/assistant.ts:144`. `[M]` Le préambule
  qui l'accompagne concatène **le catalogue complet des actions** (`instruction.ts:103-112`) sous un
  `INSTRUCTION_MAX` de 10 000. Sous `context: 'per-install'`, cette borne devient un **rabattement**
  contre une fenêtre découverte, et les cinq fichiers changent ensemble.
- `progress: 'push'` ajoute `subscribe?` à `JobRunner` — modification **additive** de
  `main/provider/jobManager.ts`, dont le plancher de sondage est aujourd'hui de deux secondes
  `[M]` (`jobManager.ts:139`).
- `cancellation` s'appuie sur l'existant : `main/processClient.ts` transforme déjà un `AbortSignal`
  en message `cancel`, et `main/dictation/session.ts` porte déjà le drapeau `discarding` qui
  empêche un résultat tardif d'atterrir `[M]`.
- **Dépendance de compilation** : `RuntimeOccupancy.reclaimable` d'ADR-19 est dérivé de `residency`
  déclaré ici **et d'une libération re-mesurée** — jamais de `residency` seul, voir l'amendement du
  21 août 2026 — et `RuntimeEndpointId` y est la clé de `runtimeBytes`. **Cette ADR précède
  ADR-19 : son énumération et son type marqué doivent exister avant qu'ADR-19 compile.**

**Fichiers** : `shared/domain/aiRuntime.ts` *(neuf)* · `shared/domain/assistantModel.ts` ·
`shared/domain/job.ts` · `main/assistant/{validation.ts,instruction.ts,brainProvider.ts}` ·
`renderer/src/stores/assistant.ts` · `main/provider/jobManager.ts` · `main/processClient.ts` ·
`preload/index.ts` · `renderer/src/stores/jobs.ts`.

---

## Amendement du 21 août 2026 — `owned` dit qui tient le cycle de vie, jamais que les octets rentrent

**Une phrase de la version initiale était fausse**, et c'est la seule que le lot 0 avait déjà
transformée en code : « Ses octets sont **récupérables** : un plan de libération peut compter
dessus. » Non. `owned` dit que **nous** décidons du chargement et de la libération. Il ne dit rien
de ce que l'allocateur, le système ou un cache intercalé font ensuite.

**Deux mesures indépendantes, le 21/08, et c'est leur convergence qui tranche.**

`[M]` **Par lecture de source des runtimes** — les deux runtimes réellement `owned` ont chacun un cache
entre eux et le système. llama.cpp en `LLAMA_LOAD_MODE_MMAP` (`llama.h:205-212`) tient ses poids
en **page cache** : le nombre est juste, mais libérer ne rend pas ce qu'on croit, et il faut
`LLAMA_LOAD_MODE_NONE` ou `MLOCK` pour que « chargé » veuille dire « résident ». MLX rend au cache
de son allocateur et non au système — `memory.h:11-14`, « will not always match memory use
reported by the system because it does not include cached memory buffers » ; la re-mesure honnête
y vaut `get_active_memory() + get_cache_memory()`, et le plan n'est tenu qu'après `clear_cache()`.

`[M]` **Par mesure locale du viewport du studio** — le cas le plus `owned` qui soit : le **studio lui-même**. Son
processus GPU passe de 107 Mo à 475 Mo à l'ouverture d'une scène 3D, puis ses documents sont
fermés — `documents: []`, `canvases: 0` — et il se stabilise à **353 Mo**. **246 Mo ne reviennent
pas**, dont 239 Mo de mémoire graphique, et le plateau tient plusieurs minutes. Nous possédions
ces octets de bout en bout ; ils ne sont pas rentrés.

**Ce qui change.** `residency` garde ses trois valeurs et son sens — **seule la conséquence
écrite sur `owned` est retirée**. La dérivation devient : `opaque` jamais récupérable ; **`owned`
et `advisory` récupérables seulement après une re-mesure qui le confirme.** C'est R2 d'ADR-19
appliqué partout au lieu d'être suspendu pour un cas, et le lot 0 avait déjà rendu la correction
possible en faisant de `reclaimableOf` une fonction à **deux** arguments plutôt qu'une projection
de `residency`.

**Ce que ça coûte, et c'est assumé** : l'ordonnanceur ne peut plus rien engager d'avance, même sur
ce qu'il possède. Un plan de libération se vérifie ; il ne se prévoit pas.

`[M]` **Une seconde conséquence de V3, qui ne change pas l'énumération mais son usage** :
`residency` est une propriété de l'**instance**, jamais de la famille de runtime. Le même
`llama-server` est `advisory` avec `--models-max 4` et `owned` avec `--models-max 0` — et il
**republie sa politique** par `GET /props` (`server-models.cpp:1881-1882`), donc elle se vérifie.
Ne pas coder `residency` en dur par produit.

`[M]` **Et le cas fondateur de cette ADR est CONFIRMÉ, plus fortement qu'il n'était écrit.**
Ollama ne cède pas : `keep_alive: -1` devient `math.MaxInt64` (`api/types.go:1253-1254`), soit un
minuteur d'inactivité de ~292 ans — pas un épinglage — et **trois chemins l'écrasent à zéro sans
le regarder** (`sched.go:265-268`, `:326`, `:1632`). Ce que `-1` achète est une **priorité** dans
l'ordre des victimes, pas une immunité. **Le piège vaut d'être écrit** : ce fait est lu dans le
code, quand la FAQ affirme « any negative number which will keep the model loaded in memory »
sans réserve. Qui s'en tient à la documentation conclut l'inverse de la vérité.

`[?]` **Portée de la lecture `llama-server`** : « le même binaire est `advisory` avec
`--models-max 4` et `owned` avec `0` » est une **traduction d'un drapeau étranger dans notre
taxonomie**, donc une déduction. Seul « il republie sa politique par `GET /props` » est mesuré.

### Le tableau se remplit — Ollama, par exécution

`[M]` Mesuré le 21/08 contre **Ollama 0.4.6** sur Apple M2 Max, modèle `llama3.2:3b`. **Le fait
fondateur de cette ADR est reproduit à l'exécution** : `keep_alive: -1` sur `/api/chat` rend une
expiration en **2318** — `math.MaxInt64` nanosecondes, exactement ce que la lecture du code annonçait
code — quand la **même valeur sur `/v1/chat/completions` rend 300 s**, le défaut. Une porte
honore, l'autre ignore, sur le même serveur et le même modèle.

`[M]` `context` est **`per-request`** sur la porte native, et l'effet se chiffre :
`options.num_ctx: 8192` fait passer l'occupation rapportée de **4,03 Go à 8,21 Go**. Sur `/v1`,
aucun effet — ce qui confirme `per-install`. `[M]` `progress` est **`push`** : 118 fragments, le
premier à 67 ms. `[M]` `cancellation` est **`cooperative`** : couper la requête HTTP à mi-course
laisse le serveur vivant et le modèle chargé. `[M]` `occupancy` est **`multi-job`** : deux
requêtes concurrentes aboutissent avec **un seul** modèle chargé.

### 🛑 Ce que la même campagne a montré, et qui renverse l'intuition

`[M]` **Ollama libère en TUANT son processus.** Le modèle vit dans un `ollama_llama_server`
enfant ; sur `keep_alive: 0` ce processus **disparaît en moins de 300 ms** et le système reprend
tout. Le studio, lui, est `owned` sur son propre viewport et **ne rend rien** — 246 Mo restent
après fermeture, mesuré le même jour.

**L'`advisory` rend donc tout, et le `owned` ne rend rien.** Ce n'est pas `residency` qui prédit la
récupérabilité : c'est **si la libération tue un processus**. C'est une seconde raison, indépendante
de la première, de retirer cette promesse à `owned` — et elle explique pourquoi la ligne
d'invalidation « `advisory` contre `owned` » ne fusionne pas l'axe alors que **son critère est
atteint** : `--models-max 0` est bien un mode documenté qui désactive la politique, mais depuis cet
amendement les deux valeurs produisent le **même** `reclaimable`. Fusionner ferait perdre la seule
chose que l'axe dit encore, et qui reste utile ailleurs — **qui décide**, dont dépendent la
topologie, `cancellation`, et le droit de tuer.

`[?]` **Un écart que V13 doit trancher, et qu'on ne conclut pas ici** : `/api/ps` annonce
**4,03 Go** quand `footprint` ne voit que **981 Mo** pour le runner. Facteur 4. Ce n'est **pas**
une preuve que le runtime surestime — sur Metal, une part des allocations peut échapper au
footprint d'un processus. C'est un écart entre deux façons de compter, et c'est l'objet même de V13.

`[?]` **La version mesurée n'est pas celle qui a été lue.** Le code d'Ollama lu date du 20/08/2026 ;
la machine porte la **0.4.6**. Les deux concordent sur `keep_alive`, ce qui est un signal fort, mais
aucune mesure ci-dessus ne vaut pour une version qu'on n'a pas exécutée.

### 🛑 `context` est confirmé comme axe, et le défaut est pire que « silencieux »

`[M]` La ligne d'invalidation prévoyait que `context` cesse d'être un axe si la troncature était
silencieuse **et sans effet observable**. Mesuré le 21/08 avec un repère placé en **tête** de
prompt : elle est silencieuse — **HTTP 200, `finish_reason: "stop"`, jamais `length`, aucune
erreur, sur les deux portes** — et son seul indice est `prompt_tokens`, qui **plafonne à 2048**
que le prompt en fasse 3 700 ou 58 000. Mais l'effet est massif : le repère disparaît dès qu'on
dépasse.

**Et la coupe se fait par la TÊTE.** Le modèle répond avec du contenu de la **fin** du prompt —
« Ligne de remplissage numéro 5912 » sur un prompt de 6 000 lignes. **Or le préambule du studio
est en tête** : `instruction.ts:103-112` y concatène le catalogue complet des actions. Sous
dépassement, **c'est le préambule système qui est jeté en premier**, et l'historique récent qui
survit. L'assistant perdrait ses instructions en gardant la conversation, sans une ligne de
journal.

`[M]` **La porte native s'en sort, `/v1` non** : `options: { num_ctx: 16384 }` sur `/api/chat`
porte `prompt_tokens` à 16384. C'est exactement ce que `per-request` contre `per-install` veut
dire, et cela donne à la conséquence écrite pour `context: 'per-install'` — « nous la découvrons
et rabattons nos bornes dessus » — un contenu opératoire : sur `/v1`, **rabattre est la seule
option**, puisque élargir est impossible.

~~`[?]` Le seuil exact auquel le studio rencontrerait le mur n'est pas mesuré : il faudrait brancher
l'assistant, avec son vrai préambule et `HISTORY_MAX = 10`, sur Ollama.~~ **Branché le 21/08 — voir
l'amendement ci-dessous.**

---

## Amendement du 21 août 2026 — l'assistant EST branché, et deux mesures s'ajoutent

`[M]` **Le studio parle à `llama3.2:3b` par `/api/chat`, et cela marche de bout en bout.** Mesuré
en pilotant l'application par CDP : « open the 3d workspace and create a document » rend
`{"say":"Opening a 3D file.","calls":[{"action":"workspace.open","input":{"workspace":"3d",
"createDocument":true}}]}` en **3,8 s** chargement du modèle compris, pour un coût de 0. Le
préambule complet — le catalogue d'actions — a donc bien survécu au voyage.

`[M]` **`format: "json"` existe sur cette porte et rend un objet propre.** L'ADR ne le mentionnait
pas, et c'est la mesure qui change le plus la fiabilité : la reprise à une seule chance
(`brainRetry.ts`) était écrite pour un modèle de cloud sans mode JSON, et ici elle ne sert
quasiment plus. Ce n'est PAS un huitième axe — c'est une option de requête, pas une propriété que
l'ordonnanceur lit.

`[M]` **Le coût du contexte se chiffre en deux points, pas un.** `/api/ps` rend **5,42 Go** à
`num_ctx: 4096` et **8,21 Go** à `8192` — le second confirme la campagne du matin. Le manifeste
demande 8192 et réserve les 8,21 Go, parce que le préambule seul pèse quelque quinze cents jetons
et que `HISTORY_MAX` en vaut dix : 4096 serait dépensé avant que la conversation commence.

`[M]` **La troncature par la tête est traitée dans le code plutôt que subie.**
`main/assistant/promptWindow.ts` rabat l'HISTORIQUE contre la fenêtre déclarée, jamais le
préambule, et dit `overrun` quand l'instruction seule ne tient pas — le seul cas où il ne reste
rien à faire. Le ratio sert de garde-fou : **4,19 caractères par jeton mesuré** sur du texte de
cette forme, et le code compte **3**, un sous-comptage délibéré — surestimer les jetons coûte un
tour d'historique, les sous-estimer coûte le préambule.

`[?]` **Ce que cet amendement ne mesure toujours pas** : le seuil exact en tours réels avant que la
fenêtre déborde. Le rabattement le rend inoffensif ; il ne le chiffre pas.

---

## Amendement du 8 septembre 2026 — le studio peut enfin fermer une porte, et pas seulement la vider

`[M]` **Le « droit de tuer » que cet ADR décrit n'existait pas pour les portes du moteur.**
`models.unload` rendait les tenseurs par `adapter.unload()` puis `release_cache()` ; il ne
terminait pas le processus. Le seul chemin qui tuait une porte était `DoorRouter.close()`, appelé
uniquement à l'arrêt du moteur. Une session qui touchait l'image, la vidéo, le son, la 3D et le
skybox laissait donc cinq interpréteurs vivants jusqu'à la fermeture du studio.

`[M]` **Ce que cela coûtait, mesuré ce jour sur le runtime embarqué (torch 2.14.0, macOS arm64)** :
une porte à l'accueil pèse **33 Mo** et répond en **106 ms** ; après un seul appel à `device()`
elle pèse **208 Mo** et n'en redescend jamais ; avec l'extra `diffusion` chargé, **682 Mo**. Sur
Apple Silicon cette RSS sort du même pot que le rendu — c'est le `domain: 'unified'` d'ADR-19.

**Décision : un op `door.close`, répondu par le NOYAU et jamais routé vers la porte.** Une porte
bloquée dans son propre `import torch` ne lirait pas la trame qui lui demande de partir ; c'est
le noyau qui ferme le socket depuis l'extérieur. Il vit dans `memory_handlers`, à côté de
`memory.ledger` et de l'annulation, et `DoorRouter.close_door` fait le retrait de `_workers`, le
`ledger.forget`, puis `begin_close()` et `wait_closed()`.

🛑 `[M]` **Le piège que cette décision oblige à traiter** : `begin_close()` pose `_closing`, ce qui
empêche le fil de pompe d'appeler `_on_gone`. `_worker_left` ne tourne donc pas, et les entrées de
`_runs` de cette porte ne seraient jamais réglées — tout job en vol resterait en attente pour
toujours côté studio. `close_door` fait explicitement échouer les runs orphelins de la porte, sous
le même code `door-gone`, et `test_router.py` le prouve.

**Ce que cela coûte en échange** : la première génération après une fermeture repaie le démarrage
à froid — `import torch` seul vaut **1 317 ms** mesuré ce jour, diffusers en plus. Arbitrage
mémoire contre latence, assumé : une porte fermée se rouvre seule au chargement suivant, `_live`
la relance à la première demande.

`[?]` **Non mesuré** : le coût réel de `wait_closed` sur une porte fermée juste après un
déchargement. La borne est posée à 3 s puis `kill`, sous les 5 s de `REQUEST_TIMEOUT_MS`, pour
qu'un client qui abandonne ne tue pas le moteur entier afin de libérer une seule porte.
