import { partsOfRole, type AiRoleId } from './aiRole'
import { hostedUrl } from './asset'
import type { LocalFieldOverrides, LocalModality } from './localFields'
import type { ModelFamily } from './model'

/**
 * What a local model declares about itself — see
 * `docs/ci/adr/ADR-20-surface-de-confiance-des-poids.md`.
 *
 * The ancestor of this type is `SttModelFile`, which carried role, name, url, bytes and digest and
 * NOT the three things that decide whether a model may be loaded at all: its format, its loader,
 * and its licence.
 */

/** Formats the studio can be handed. Whether one may be LOADED depends on the loader — see `admitsLoad`. */
export type ModelFormat = 'safetensors' | 'gguf' | 'onnx' | 'pickle'

/** The values beside the type, so a schema checks against them rather than against a copy. */
export const MODEL_FORMATS: readonly ModelFormat[] = ['safetensors', 'gguf', 'onnx', 'pickle']

/** What opens the weights. The pair, not the format, is what the whitelist is written on. */
export type ModelLoader = 'sherpa-onnx' | 'ollama' | 'llamacpp' | 'diffusers' | 'plugin'

/** The values beside the type, so a table keyed by loader can be walked without a cast. */
export const MODEL_LOADERS: readonly ModelLoader[] = [
  'sherpa-onnx',
  'ollama',
  'llamacpp',
  'diffusers',
  'plugin',
]

/**
 * Where the manifest came from, which is what decides how much the studio vouches for it.
 *
 * 1 — shipped with the application, versioned with the binary.
 * 2 — served by an endpoint the studio names. `[?]` None exists today.
 * 3 — supplied by the person, and installing it is an EXPLICIT action, never the consequence of
 *     a click on "Install".
 */
export type ProvenanceRank = 1 | 2 | 3

export type ModelFile = {
  /** What the loader asks for — `encoder`, `tokens`. Named so nothing spells file names twice. */
  readonly role: string
  readonly name: string
  readonly url: string
  readonly bytes: number
  readonly sha256: string
  /**
   * The commit the URL is pinned to. `/resolve/main/` is MUTABLE — a repository owner can push a
   * different file behind the same address, and the digest then refuses a download nobody broke.
   */
  readonly revision?: string
  /**
   * Where the weights are published, when the file is fetched from a MIRROR. A third party's
   * `license:` field is not a licence: what governs is the upstream one, and this is what says
   * which upstream. Absent when the file comes from the publisher itself.
   */
  readonly upstream?: string
}

/**
 * How a set of weights ATTACHES to another rather than standing on its own.
 *
 * `controlnet` is a second network the pipeline runs beside its own; `ip-adapter` are weights
 * grafted onto the attention of the one already loaded. Neither generates anything alone, so an
 * entry carrying this names the model it completes — and that one is what gets loaded first.
 */
export type ModelAttachment = {
  readonly model: string
  readonly as: 'controlnet' | 'ip-adapter'
  /** Where inside the download the weights sit, for a repository shipping several sets. */
  readonly subfolder?: string
  readonly weightName?: string
}

export type LocalModel = {
  readonly id: string
  /** Generic engine id for a model-backed Auto Rig entry. */
  readonly backendId?: string
  /**
   * `name` rather than `title`, and the guard's own reason applies: this is DOCUMENT DATA, not a
   * word of the interface. A model is called what its publisher calls it, in every language.
   */
  readonly name: string
  readonly format: ModelFormat
  readonly loader: ModelLoader
  readonly rank: ProvenanceRank
  /** SPDX identifier. The licence travels WITH the weights — ADR-20 § E. */
  readonly licence: string
  readonly licenceUrl: string
  /** Where the weights are published, for the attribution the licence may ask for. */
  readonly source: string
  /**
   * The files the studio fetches ITSELF, each with the digest it is checked against.
   *
   * Empty for a model a runtime pulls on its own: none of its bytes pass through here, so there
   * is no url to resolve and no digest we could verify. What it weighs is `diskBytes`.
   */
  readonly files: readonly ModelFile[]
  /**
   * What the weights take on disk — what a disk verdict is read against, and the figure shown.
   *
   * Declared rather than summed from `files`, because a runtime-pulled model has no file list
   * here. A model that DOES ship one must declare their sum, and `catalogue.test.ts` says so.
   */
  readonly diskBytes: number
  /**
   * The context window the studio asks the runtime for, in tokens.
   *
   * Absent for a model that holds no conversation — recognition reads audio. Where it is present
   * it is a REQUEST, honoured only where the runtime declares `context: 'per-request'` (ADR-18);
   * elsewhere it is the ceiling our own prompt is trimmed against.
   */
  readonly contextTokens?: number
  /**
   * What it is expected to take once loaded. A RESERVATION, never a measured peak — R3 of ADR-19.
   *
   * `[?]` for every catalogue entry but the recognition model: the figures come from what a
   * publisher announces, not from a runtime this studio has asked. The verdict says `unknown`
   * where no runtime answered, which is the honest reading of an unmeasured number.
   */
  readonly reservationBytes: number
  /**
   * The space this model serves, when it serves one. Absent for a model that answers a ROLE —
   * the assistant and dictation belong to no space, and never appear in the Models panel.
   */
  readonly family?: ModelFamily
  /** What it does within its family, in the vocabulary `CAPABILITIES_BY_FAMILY` already uses. */
  readonly capabilities?: readonly string[]
  /**
   * Employments OUTSIDE its family that these same weights serve — `<family>/<capability>`.
   *
   * A texture is an image, and a model that draws one draws the other: what differs is where the
   * result is filed, never the pipeline. Written as whole roles rather than as a second family,
   * because a model has one family — the one its card is filed under.
   */
  readonly serves?: readonly string[]
  /** Which form it offers. A modality, never a model: see `localFields.ts`. */
  readonly modality?: LocalModality
  readonly outputExtension?: 'glb'
  readonly fieldProfile?: 'motion'
  /** What this entry disagrees with in its modality's form — bounds and defaults only. */
  readonly fieldOverrides?: LocalFieldOverrides
  /** Shipped beside the catalogue, so a card draws with no network and no dead link. */
  readonly thumbnail?: string
  /** One line under the name, in the publisher's words. Data, not a word of the interface. */
  readonly summary?: string
  /** ISO date these weights were published. `catalogueLineOf` is what shows the year. */
  readonly releasedAt?: string
  /** Studio highlight of a strong pick. The machine's verdict still greys it if it cannot run. */
  readonly featured?: boolean
  /** Where the weights come from. `direct-download` where a manifest says nothing. */
  readonly distribution?: ModelDistribution
  /** What the licence permits, as the catalogue presents it. `commercial` by default. */
  readonly licenceStatus?: LicenceStatus
  /** Whether anything here can run it today. `supported` by default. */
  readonly runtimeStatus?: RuntimeStatus
  /** Whether this release may expose the model, independently of its technical state. */
  readonly distributionStatus?: DistributionStatus
  /**
   * The official pipelines for these weights are CUDA kernels (spconv, nvdiffrast). MPS and CPU
   * cannot open them; the verdict says so rather than offering a Generate that dies at import.
   */
  readonly needsCuda?: boolean
  /** What this completes, when it completes something rather than standing alone. */
  readonly attaches?: ModelAttachment
  /**
   * Whether this ONE model may be read from `.bin` tensors rather than safetensors alone.
   *
   * 🛑 It weakens a rule, so it is written per entry and never per loader. What still protects,
   * and both were measured: `torch.load` has refused pickles by default since PyTorch 2.6, so a
   * `.bin` carrying a `__reduce__` does not run — and every file this manifest names carries a
   * digest pinned to a commit, so what lands on the disk cannot change under the same address.
   * What it does NOT protect against is the publisher itself, which safetensors would.
   *
   * Shap-E is why it exists: it is the only 3D pipeline diffusers 0.40 carries, and its renderer
   * is published in `.bin` alone — measured 2026-08-22. Without this, the studio has no 3D at all.
   */
  readonly readsTorchWeights?: boolean
  /**
   * Where the weights ALREADY sit — an absolute path, for a model the person pointed at.
   *
   * Absent for everything the studio fetches itself, whose files land in the model folder under
   * the names their manifest gives. Its presence is what says "there is nothing to download".
   */
  readonly weightsPath?: string
  /**
   * What an EMBEDDING model wants in front of a document and in front of a question.
   *
   * In the manifest and not in a table beside it, for the reason `contextTokens` is here: it is
   * what the weights were trained to read. `[M]` 2026-08-28, EmbeddingGemma separated a matching
   * pair from an unrelated one by 0.427 with its two prompts, and by 0.379 without.
   */
  readonly embedPrompts?: { readonly document: string; readonly query: string }
}

/**
 * The host serving the picture of a local model — shipped under `resources/models`, like the
 * template stills, and common to every project.
 */
export const MODEL_HOST = 'model'

/** Where a card reads a model's picture from. No network, no dead link, and no third party. */
export function modelThumbnailUrl(model: LocalModel): string {
  // The generic picture of its modality where a manifest names none — which is every model the
  // person supplied, since nothing can know what their file looks like.
  return hostedUrl(MODEL_HOST, model.thumbnail ?? `${model.modality ?? 'text'}.png`)
}

/** Year plus the publisher line — one caption for pickers and rows. */
export function catalogueLineOf(
  model: Pick<LocalModel, 'summary' | 'releasedAt'>,
): string | undefined {
  if (model.summary === undefined) return undefined
  const year = model.releasedAt?.slice(0, 4)
  return year ? `${year} · ${model.summary}` : model.summary
}

/**
 * What this model offers in `family`, native or via `serves`.
 * `null` if it does not serve that space.
 */
export function capabilitiesIn(model: LocalModel, family: ModelFamily): readonly string[] | null {
  if (model.family === family) return model.capabilities ?? []

  const capabilities: string[] = []
  for (const role of model.serves ?? []) {
    // `serves` is data; `partsOfRole` is what refuses a malformed one.
    const parts = partsOfRole(role as AiRoleId)
    if (parts?.family === family) capabilities.push(parts.capability)
  }
  return capabilities.length > 0 ? capabilities : null
}

/** Bytes across the whole model, not within the file being fetched. */
export type DownloadProgress = { received: number; total: number }

/** Suffix of a download in flight. An orphan is kept, not swept: a resume starts from it. */
export const PART_SUFFIX = '.part'

/**
 * Whether the studio may load this pair, per ADR-20 § A: a pair is admitted when the loader, AS
 * CONFIGURED HERE, cannot execute code the file supplies.
 *
 * A LIST of what is admitted, never a list of what is refused: written the other way round, a
 * fourth loader entering `ModelLoader` would be admitted for every format nobody thought to
 * exclude. Here the compiler asks for its line, and the line asks for a measurement.
 *
 * `pickle` appears nowhere, and not "with a warning": the format executes arbitrary code at read
 * time. ONNX is admitted for `sherpa-onnx` alone, on a MEASURED property of that loader — it
 * registers no operator library and exposes no field to pass one — verified against ONNX
 * Runtime 1.27.1 on 2026-08-21. `[?]` `llamacpp` is wired to nothing and measured by nobody; its
 * line reproduces what the previous form admitted rather than deciding anything new.
 */
const ADMITTED: Record<ModelLoader, readonly ModelFormat[]> = {
  'sherpa-onnx': ['onnx'],
  ollama: ['gguf', 'safetensors'],
  llamacpp: ['gguf', 'safetensors'],
  /**
   * safetensors ALONE, and the line was measured on 2026-08-22 rather than assumed.
   *
   * `use_safetensors=True` raises `OSError` on a folder holding only a `pytorch_model.bin` — it
   * refuses rather than falling back, which is what this line rests on. Underneath, `torch.load`
   * has refused pickles by default since PyTorch 2.6: a `.bin` carrying a `__reduce__` that runs a
   * command was refused twice over.
   *
   * 🛑 **`trust_remote_code=False` does NOT close the third hole**, and that is the measurement
   * that matters here: on a LOCAL folder whose architecture Transformers knows, the `.py` beside
   * the weights is executed without anything being asked
   * (`transformers/dynamic_module_utils.py:788` — the guard only fires when there is no local
   * code). What keeps such a file off the disk is the manifest, whose every entry carries a
   * digest, and `noPythonInWeights` refuses one that names a `.py` at all.
   */
  diffusers: ['safetensors'],
  /**
   * safetensors, and pickle only through `torch.load(..., weights_only=True)` — measured on
   * PyTorch 2.6, the same property Shap-E's `readsTorchWeights` rests on. The adapter is OURS
   * (`plugin_adapter.py`); a `.py` beside the weights is still refused by `weightsCarryCode`.
   */
  plugin: ['safetensors', 'pickle'],
}

export function admitsLoad(format: ModelFormat, loader: ModelLoader): boolean {
  return ADMITTED[loader].includes(format)
}

/**
 * Where the weights come from — and the studio REDISTRIBUTES none of them but the interpreter.
 *
 * `direct-download` is the whole catalogue: the manifest names the publisher's own address, and
 * the person's machine fetches from there. What the studio ships is a pointer and a digest, which
 * is why a licence that forbids redistribution does not, by itself, keep a model out.
 */
export type ModelDistribution = 'bundled' | 'direct-download' | 'user-import'

/**
 * What the licence permits, as the catalogue PRESENTS it — never a legal opinion.
 *
 * `commercial` is the only one held to `ADMITTED_LICENCES`: it is the promise that a studio sold
 * to someone may generate with it. The others are offered with the reservation shown on screen,
 * because the person downloads them from the publisher and answers for their own use.
 * `unsupported-region` is the one that keeps a model out entirely — a licence that excludes the
 * territory the studio is used from is not a reservation, it is an absence of permission.
 */
export type LicenceStatus = 'commercial' | 'non-commercial' | 'restricted' | 'unsupported-region'

/** Whether anything here can actually RUN it today. Orthogonal to the licence, and to the disk. */
export type RuntimeStatus = 'supported' | 'plugin-required' | 'unsupported'
export type DistributionStatus = 'public' | 'blocked'

/** Where a local model comes from, as the manager groups it — derived, never stored on the choice. */
export type ModelSource = 'studio' | 'ollama' | 'custom'

export const MODEL_SOURCES: readonly ModelSource[] = ['studio', 'ollama', 'custom']

export function sourceOf(model: LocalModel): ModelSource {
  if (model.rank === 3) return 'custom'
  if (model.loader === 'ollama') return 'ollama'
  return 'studio'
}

/** Why a model cannot be offered at all, whatever the machine could hold. */
export type ModelRefusal =
  | 'format-not-admitted'
  | 'weights-carry-code'
  | 'licence-not-admitted'
  | 'licence-excludes-region'
  | 'distribution-blocked'

export function distributionStatusOf(model: LocalModel): DistributionStatus {
  return model.distributionStatus ?? 'public'
}

/**
 * The licences the studio may offer a download of — SPDX identifiers, and the list IS the policy.
 *
 * A LIST of what is admitted, like `ADMITTED` above and for the same reason: written the other
 * way round, a licence nobody thought to exclude would be admitted by default, and OpenRAIL, the
 * Gemma terms and every `other` would walk in. What each of these permits is redistribution with
 * the studio and commercial use by the person, which is the question `LICENSE` leaves to each
 * third party — the studio's own PolyForm terms govern its code and nothing else.
 *
 * 🛑 **The angle this cannot see, and it is measured**: a manifest declares ONE licence for a
 * package of weights that may hold several. Sana 600M is `apache-2.0` and its text encoder is
 * `google/gemma-2-2b-it`, whose terms are neither Apache nor on this list. Nothing here reads
 * inside a download — only the NOTICE names components, and only because someone wrote it.
 */
const ADMITTED_LICENCES: readonly string[] = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
]

/**
 * Whether the studio may present this model as COMMERCIALLY safe.
 *
 * The strict list applies to that promise alone — amended 2026-08-22. The studio redistributes
 * nothing: a manifest names the publisher's address and a digest, so a licence that forbids
 * redistribution says nothing about whether the person may fetch it themselves. What the others
 * get is a reservation shown on screen, not an exclusion.
 *
 * Rank 3 is exempt whatever it says: the person's OWN file, already on their disk.
 */
export function licenceAdmitted(model: LocalModel): boolean {
  if (model.rank === 3 || licenceStatusOf(model) !== 'commercial') return true

  return ADMITTED_LICENCES.includes(model.licence)
}

/** `commercial` where a manifest says nothing — every entry written before the three dimensions. */
export function licenceStatusOf(model: LocalModel): LicenceStatus {
  return model.licenceStatus ?? 'commercial'
}

/** `supported` where a manifest says nothing: it is what every entry did before this existed. */
export function runtimeStatusOf(model: LocalModel): RuntimeStatus {
  return model.runtimeStatus ?? 'supported'
}

/**
 * Extensions that are CODE, whatever the manifest calls them.
 *
 * Measured 2026-08-22, and this list exists because of it: on a local folder whose architecture
 * Transformers knows, `from_pretrained` executes a `.py` sitting beside the weights **without
 * asking**, and `trust_remote_code=False` does not fire — the guard only looks at code it would
 * have to fetch. What keeps such a file off the disk is the manifest, and until this nothing
 * stopped a manifest from simply naming one.
 *
 * `.pyc` and `.pyd` are here because a compiled module loads the same way a source one does.
 */
const CODE_EXTENSIONS: readonly string[] = ['.py', '.pyc', '.pyd', '.pyw', '.so', '.dylib', '.dll']

/** Whether any file this manifest names would put executable code beside the weights. */
export function weightsCarryCode(model: LocalModel): boolean {
  return model.files.some(file => {
    const name = file.name.toLowerCase()
    return CODE_EXTENSIONS.some(extension => name.endsWith(extension))
  })
}

/**
 * Whether a model may enter the catalogue, and why not.
 *
 * 🛑 Rank 3 is no longer refused here, and that is the amendment of 2026-08-21: ADR-20 § B admits
 * it under an EXPLICIT gesture, and the gesture now exists — the person points at a weights file
 * they already hold. What rank 3 earns is a mark, never a lock.
 */
export function modelRefusalOf(model: LocalModel): ModelRefusal | null {
  if (distributionStatusOf(model) === 'blocked') return 'distribution-blocked'
  // Before everything else, and it is not a reservation: a licence that excludes the territory
  // the studio is used from grants no permission at all, whoever does the downloading.
  if (licenceStatusOf(model) === 'unsupported-region') return 'licence-excludes-region'

  // The pair is judged only where a runtime can actually OPEN the weights. A format that nothing
  // deserialises executes nothing: what ADR-20 guards is the read, and there is no read here. The
  // day `runtimeStatus` becomes `supported`, this line judges it again.
  if (runtimeStatusOf(model) === 'supported' && !admitsLoad(model.format, model.loader)) {
    return 'format-not-admitted'
  }

  // The whitelist is written on (format, loader) and cannot see a FILE. A manifest naming a `.py`
  // passes `admitsLoad` and hands the loader something it will run — measured, § I.2.
  if (weightsCarryCode(model)) return 'weights-carry-code'

  return licenceAdmitted(model) ? null : 'licence-not-admitted'
}

/**
 * Whether this loader is handed a FOLDER rather than a file.
 *
 * `from_pretrained` and the plugin trees (`pipeline.json`, `config.yaml`) occupy the folder
 * root, so two of them sharing the catalogue's single folder overwrite each other's index.
 * A loader handed a file has no such problem, and keeps sharing.
 */
export function needsOwnFolder(loader: ModelLoader): boolean {
  return loader === 'diffusers' || loader === 'plugin'
}

/**
 * Whether the studio vouches for where this model came from. Rank 3 is the person's own file:
 * its licence is unknown, so it stays out of the notices and says so on screen.
 */
export function provenanceUnverified(model: LocalModel): boolean {
  return model.rank === 3
}

/**
 * Whether the weights are the person's own file rather than something the studio fetched.
 *
 * 🛑 The ONE reading of that, and it decides three gestures: nothing is downloaded, nothing is
 * deleted, and the entry alone is dropped. Read off `rank` in one place and off `weightsPath` in
 * another, the label said "delete" while the effect forgot — or the reverse, and the reverse
 * erases a file that was only ever pointed at.
 */
export function isSuppliedModel(model: LocalModel): model is LocalModel & { weightsPath: string } {
  return model.weightsPath !== undefined
}
