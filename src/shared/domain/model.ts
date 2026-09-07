/**
 * A Scenario model's inputs are specific to each model and are discovered at runtime
 * (`GET /models/{id}`). `FieldDescriptor` is their normalized shape, the only one the
 * renderer ever sees — see spec § 6.
 */
import type { ApiFailure, EngineFailure } from './failure'

export type FieldKind =
  | 'text'
  | 'longText'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'choice'
  | 'image'
  /** A 3D file — `kind: '3d'` on the API. What every rigger takes its character under. */
  | 'mesh'
  | 'color'
  | 'seed'
  | 'raw'
  /** An object whose top-level keys are known. `raw` is the one whose shape is NOT. */
  | 'record'
  /**
   * A run the same service already finished, named by ITS id — never a file. What fills the
   * list is the window, which is the only side that knows what has run; a runner that uploaded
   * here would spend the upload and be refused, the endpoint wanting a task and not a token.
   */
  | 'task'

export type FieldOption = {
  value: string
  label: string
}

export type FieldDescriptor = {
  key: string
  kind: FieldKind
  /** A LIST of `kind` rather than one — the word `ActionField` already uses for the same thing. */
  repeated?: true
  label: string
  help?: string
  required: boolean
  default?: unknown
  min?: number
  max?: number
  step?: number
  options?: FieldOption[]
  group?: string
  dependsOn?: { key: string; value: unknown }
  /**
   * The file input this one masks, when the model takes an inpainting mask — Scenario calls it
   * "the name of the file input field to use as the mask source". Present only on the mask
   * field itself, which is what lets an edit action fill the pair without naming either.
   */
  maskFrom?: string
  /**
   * Whether this is the field prompt assistance rewrites. The API marks it itself — measured on
   * `model_google-gemini-3-1-flash`, whose `prompt` input carries `promptSpark: true` — so no
   * field name is ever guessed at here.
   */
  promptSpark?: boolean
  /**
   * The biggest file this input takes, in bytes, when the model names one. What lets a mesh be
   * refused BEFORE the upload rather than after it — a rigged GLB runs to tens of megabytes.
   */
  maxSize?: number
  /** Whether filling this field changes what the run costs. The API says so; nothing guesses. */
  costImpact?: boolean
}

export type ModelFamily =
  | 'image'
  | 'video'
  | '3d'
  | 'audio'
  | 'material'
  | 'skybox'
  /** Source text, and the one family no catalogue of this studio publishes — see `CODE_FAMILY`. */
  | 'code'
  | 'upscale'
  | 'background-removal'
  | 'vectorization'
  | 'other'

export const MODEL_FAMILIES: readonly ModelFamily[] = [
  'image',
  'video',
  '3d',
  'audio',
  'material',
  'skybox',
  'code',
  'upscale',
  'background-removal',
  'vectorization',
  'other',
]

/**
 * The family a language model serves and a diffusion catalogue does not.
 *
 * 🛑 It is served by CHAT — a cloud that answers `/v1/chat/completions`, or a text model on this
 * machine — never by the Scenario catalogue, which publishes no code model and no code
 * capability. Named rather than spelled, because three modules narrow on it: what Scenario is
 * asked for, which clouds hold a library to browse, and which target the job runner routes to a
 * chat rather than to a generation.
 */
export const CODE_FAMILY: ModelFamily = 'code'

/**
 * The families a catalogue of generated ASSETS publishes — every one but `code`.
 *
 * What Scenario declares it serves, and what a remote library is browsable for. Derived rather
 * than listed: a family added to the studio joins the catalogue unless it is `code`, which is
 * the exception this constant exists to state once.
 */
export const CATALOGUE_FAMILIES: readonly ModelFamily[] = MODEL_FAMILIES.filter(
  family => family !== CODE_FAMILY,
)

/**
 * What a family a settings file still spells the old way is called today — `texture` named the
 * material family until 2026-08-26.
 *
 * A family name is half of a key WRITTEN TO DISK (`ai.roles`, `ai.ownModels`, the browser's own
 * choice), and nothing reddens when one goes unread: the choice comes back as "none made".
 */
const RENAMED_FAMILIES: Record<string, ModelFamily> = { texture: 'material' }

/** Left alone when the family never moved, so it may be run over a whole stored record. */
export function currentModelFamily(stored: string): string {
  return RENAMED_FAMILIES[stored] ?? stored
}

/**
 * Who published the model. The API exposes no author name — only an opaque `authorId` — so
 * `PROVIDER_MAINTAINER` is the closest thing to an authorship signal there is to filter on.
 */
export type ModelOrigin = 'official' | 'community'

export const MODEL_ORIGINS: readonly ModelOrigin[] = ['official', 'community']

/**
 * How many model ids one preview request may carry — the batch becomes a single request body
 * downstream. Shared, because the IPC channel refuses more and a refused batch would be lost
 * without a word.
 */
export const MODEL_IDS_BATCH_LIMIT = 100

/**
 * What puts a model in Scenario's own catalogue, read off `complianceMetadata.maintainer`.
 *
 * MEASURED 2026-08-15 over the 640 public models: the field is set on EVERY one of them and
 * holds four values — Scenario 425, Fal 106, Replicate 82, Provider 27.
 *
 * It names who PUBLISHES a model and answers for it, not who designed it: 216 of those 425
 * name someone else in `modelProvider` — Google, Tencent, BFL. That is the reading this filter
 * wants, and the one the manual promises. Said here because the field giving the other answer
 * sits in the same object, and the next reader would take it for an oversight.
 *
 * It replaces the `sc:scenario` tag, which named 220 of those same 425 — every model carrying
 * it is maintained by Scenario, so it was a subset nobody kept up, not a second opinion.
 * Neither Scenario Skybox was in it, which is how "Official" emptied a space whose every model
 * Scenario maintains.
 */
export const PROVIDER_MAINTAINER = 'Scenario'

/** Scenario's own highlight, and the badge their grid shows: 29 of the 640 public models. */
export const FEATURED_TAG = 'sc:featured'

/**
 * What marks a model as producing 360 panoramas. The ONLY signal there is: the capability enum
 * holds no skybox value — measured against `models.list`'s own enum — and these models answer
 * `txt2img`/`img2img` like any image model. Skyboxes are a `jobType` of the generation API, not
 * a category of the catalogue, so without this tag the workspace could not tell them apart.
 */
export const SKYBOX_TAG = 'sc:skybox'

/**
 * The namespace Scenario keeps for its own tags — and the one `GET /models?tags=` does not index.
 *
 * MEASURED 2026-08-14, one request per tag against the real catalogue: `sc:skybox`, `sc:scenario`,
 * `sc:featured`, `sc:texture` and `sc:tool` each answer 0 models, while `image-upscale` answers
 * 13, `remove-background` 9 and `vectorize` 4. The three skybox models carry `sc:skybox` in the
 * records that same endpoint serves when asked for no tag at all, so the tag is real and only the
 * filter is blind to it. Asking for one does not narrow the walk, it ends it — which is what left
 * the skybox workspace with no model to choose from. `POST /search/models` is no way around it
 * either: filtering its hits by the same tag answers nothing too.
 */
export const SYSTEM_TAG_PREFIX = 'sc:'

/**
 * The families no capability can name, and the tags that name each one. Skyboxes were the first;
 * upscaling, cutout and vectorization are the same case — the capability enum holds no value for
 * any of them, and all 30 of those models answer `img2img` like every other image model.
 *
 * Read in both directions, which is why it is a list of pairs: `familyOf` classifies a model by
 * it, and the registry narrows a listing server-side by the ones the API indexes — every family
 * but the skyboxes, whose tag lives in the namespace above. Twenty-six models out of 640 are not
 * worth walking six pages of catalogue to find.
 *
 * A family may claim MORE THAN ONE tag, and the skyboxes do: Scenario Skybox Upscale carries
 * `skybox-upscale` and no `sc:skybox`, so the tag that DEFINES the family does not name it and
 * the space listed three of the four skyboxes the catalogue holds. Measured 2026-08-15, the two
 * tags never meet on one model, and neither meets `image-upscale` — which is precisely why such
 * a family can no longer be pre-filtered at all, see `tagOfFamily`.
 *
 * A tag alone never decides — see `familyOf`: two of the nine models carrying `remove-background`
 * remove it from video, and they belong to the montage, not to the canvas.
 *
 * A tag listed here belongs to its own family and to no other: offering it in `TAGS_BY_FAMILY`
 * elsewhere would filter a listing down to models that listing has already excluded. Under its
 * own family it is just as useless — every row already carries it.
 *
 * ORDER IS A PRIORITY: a model carrying two of these tags has no right answer — they name
 * different outputs — and the first entry here wins, a choice for a stable answer over the order
 * the API happens to serve its tags in.
 */
export type FamilyTag = { family: ModelFamily; tag: string }

export const FAMILY_TAGS: readonly FamilyTag[] = [
  { family: 'skybox', tag: SKYBOX_TAG },
  { family: 'skybox', tag: 'skybox-upscale' },
  { family: 'upscale', tag: 'image-upscale' },
  { family: 'background-removal', tag: 'remove-background' },
  { family: 'vectorization', tag: 'vectorize' },
]

/**
 * The one tag a listing may be narrowed by server-side, or nothing.
 *
 * NOTHING for a family claiming several, because no model carries them all: asking for one
 * would drop every model that carries only another. Skyboxes would come back one model deep
 * instead of four, and nothing would redden or say why. Read off the data rather than left to
 * the order the entries happen to be written in — the alternative was keeping an unindexed tag
 * first on purpose, an invariant no reader could see and no test could name.
 */
export function tagOfFamily(family: ModelFamily): string | undefined {
  const [only, second] = FAMILY_TAGS.filter(entry => entry.family === family)
  return second ? undefined : only?.tag
}

/**
 * Where a model runs, when it is not a cloud's: this machine.
 *
 * A value of `ModelSummary.runsOn` beside the cloud ids of `aiCloud.ts`, and NOT a second field —
 * a model knows where it runs, and the panel never switches "to the cloud": ADR-21 as amended.
 */
export const LOCAL_RUNTIME = 'local'

export type ModelSummary = {
  id: string
  name: string
  family: ModelFamily
  /** `LOCAL_RUNTIME`, or the id of the cloud that serves it. What the Local/Scenario facet reads. */
  runsOn: string
  /**
   * Where the model comes from — `scenario`, `civitai`, `huggingface`, … Left a plain string
   * rather than a union: the API adds values without warning, and an unknown origin must not
   * make a model disappear from the picker.
   */
  source: string
  origin: ModelOrigin
  /**
   * Whether the weights are on THIS disk — absent for a model that runs in a cloud, where there
   * is nothing to install and the question means nothing.
   *
   * A model of this machine that has not been fetched cannot generate: the panel greys it and
   * offers the download, rather than letting a click end in a failure the person cannot read.
   */
  installed?: boolean
  /**
   * Whether a click can fetch the weights. Absent means yes when `installed` is false.
   * False for a card listed before any engine can open it: nothing to pull, so no dialog.
   */
  downloadable?: boolean
  /** What the download weighs. Absent for a cloud model, which downloads nothing. */
  diskBytes?: number
  /**
   * Why a model of THIS machine cannot run right now, whatever its weights: the engine that
   * would serve it is not installed, or would not start. A picker that lists it without saying
   * so sends a client into a job that fails — measured 2026-09-06, Codex by MCP, on `ssd-1b`.
   */
  unavailable?: EngineFailure
  featured: boolean
  capabilities: readonly string[]
  tags: readonly string[]
  description?: string
  thumbnail?: string
  /**
   * An example picture published by the model's owner, to stand in when `thumbnail` is unset —
   * which it is on 480 of the 640 public models. Its URL is signed and short-lived, so it is
   * resolved when the card is actually seen, never here.
   */
  previewAssetId?: string
  createdAt?: string
  /**
   * The plan grade the API refuses this model below — its `accessRestrictions`. Read against
   * `PlanAccess` by `isBeyondPlan`; absent when the API grades the model with nothing.
   *
   * A plain number, NOT the SDK's `0 | 25 | 50 | 75 | 100` union: two public models answer `1`
   * (Neo3D Realism, Scenario Flux Upscale), which that union does not admit. Measured — the
   * generated type is wrong about its own values, and a closed union would drop the field.
   */
  requiredPlanLevel?: number
}

export type ModelDescriptor = ModelSummary & {
  fields: FieldDescriptor[]
}

/**
 * `relevance` maps to the API's own `score`, which it documents as blending usage and
 * popularity, and which `GET /models?privacy=public` already sorts by when asked for nothing
 * else. There is no rating and no duration to sort on: both come back empty on every model.
 */
export type ModelSort = 'relevance' | 'recent' | 'oldest'

export const MODEL_SORTS: readonly ModelSort[] = ['relevance', 'recent', 'oldest']

/**
 * Every capability a family has, and the ONE list a role may be composed from — `aiRoleId`
 * refuses anything absent here, so a family with none can be served by nothing.
 *
 * Mostly the API's own enum. Five are the studio's own words, and they are NOT enum values:
 * skybox panoramas answer image capabilities, and the last five of this record name employments
 * the enum has no value for at all. What finds their models is `STUDIO_CAPABILITIES`, and a
 * listing narrowed by one of them server-side answers nothing.
 *
 * ORDER IS A CONTRACT: `primaryRoleOf` takes the first, so a capability appended to a family
 * leaves what that family generates by default alone. `rig` and `motion` are appended for that
 * reason. Combinations like `controlnet_inpaint_ip_adapter` are filtered by their parts.
 */
export const CAPABILITIES_BY_FAMILY: Record<ModelFamily, readonly string[]> = {
  image: ['txt2img', 'img2img', 'inpaint', 'outpaint', 'controlnet', 'reference'],
  video: ['txt2video', 'img2video', 'video2video'],
  '3d': ['txt23d', 'img23d', '3d23d', 'rig', 'motion'],
  audio: ['txt2audio', 'audio2audio', 'video2audio'],
  material: ['txt2img_texture', 'img2img_texture', 'controlnet_texture', 'reference_texture'],
  skybox: ['txt2skybox', 'img2skybox'],
  // Written and rewritten, and nothing else: what a chat can be asked for that lands in a script.
  // Neither is an API enum value — no catalogue publishes them, and `STUDIO_CAPABILITIES` does
  // not name them either, since what serves them is a cloud key or a text model, never a listing.
  code: ['txt2code', 'code2code'],
  upscale: ['upscale'],
  'background-removal': ['cutout'],
  vectorization: ['vectorize'],
  other: [],
}

/**
 * A capability the studio NAMES and the API's enum does not hold, with what finds its models.
 *
 * Without this a role like `3d/rig` would key a preference nothing could ever serve: `matches`
 * narrows on the capabilities the API published, and no model publishes `rig`.
 *
 * Three shapes, and each one is measured rather than chosen:
 *   - neither `answers` nor `tags` — every model of the family serves it. The three families
 *     whose whole membership IS the employment: `FAMILY_TAGS` already filed them.
 *   - `answers` and `tags` — the enum value is too coarse alone. Measured 2026-08-18: `3d23d`
 *     covers 19 public models and 5 of them rig; the rest remesh, retexture, unwrap or segment.
 *   - `tags` alone — no enum value narrows them at all. The motion models span `txt23d`,
 *     `video23d` and `3d23d`, so a list built on the capability would be either three quarters
 *     wrong or a list of everything.
 *
 * 🛑 The tags are AUTHORS' words, not Scenario's `sc:` namespace, so nothing makes them
 * contractual. They are the only signal there is; a publisher who spells one differently
 * disappears from the employment and nothing reddens.
 */
export type StudioCapability = {
  capability: string
  family: ModelFamily
  /** The API capability its models actually answer, when one narrows them. */
  answers?: string
  /** Author tags, one of which a model must carry. Matched case-insensitively. */
  tags?: readonly string[]
  /** Author tags that disqualify: a rigger is not a motion generator, and both carry `Animation`. */
  excludes?: readonly string[]
}

export const STUDIO_CAPABILITIES: readonly StudioCapability[] = [
  // The panoramas answer image capabilities and are found by tag — the family is what
  // `SKYBOX_TAG` already filed them under, and `answers` is what tells the two apart.
  { capability: 'txt2skybox', family: 'skybox', answers: 'txt2img' },
  { capability: 'img2skybox', family: 'skybox', answers: 'img2img' },
  { capability: 'rig', family: '3d', answers: '3d23d', tags: ['rigging'] },
  { capability: 'motion', family: '3d', tags: ['motion', 'animation'], excludes: ['rigging'] },
  { capability: 'upscale', family: 'upscale' },
  { capability: 'cutout', family: 'background-removal' },
  { capability: 'vectorize', family: 'vectorization' },
]

/** The rule that finds a studio capability's models, or nothing when it names none. */
export function studioCapability(capability: string): StudioCapability | undefined {
  return STUDIO_CAPABILITIES.find(entry => entry.capability === capability)
}

function ownsTag(tags: readonly string[], wanted: readonly string[]): boolean {
  return tags.some(tag => wanted.includes(tag.toLowerCase()))
}

/**
 * Whether a model of the right family serves this studio capability.
 *
 * Takes the two fields it reads rather than a `ModelSummary`: the catalogue answers one shape and
 * `LocalModel` another, and both sides ask this question.
 */
export function servesStudioCapability(
  entry: StudioCapability,
  model: { capabilities: readonly string[]; tags: readonly string[] },
): boolean {
  if (entry.answers !== undefined && !model.capabilities.includes(entry.answers)) return false
  if (entry.excludes && ownsTag(model.tags, entry.excludes)) return false
  return entry.tags === undefined || ownsTag(model.tags, entry.tags)
}

/**
 * 🛑 Named rather than described: in a DESCRIPTION these say bit depth, not a genre — « outputs
 * 16-bit color », « 8-bit quantization » — and promoting a depth map as pixel art is worse than
 * missing a sprite model, a promotion costing nothing when it does not fire. Measured 2026-09-02
 * on the catalogue this profile reaches: 24 image models, zero tags, none carrying either word.
 */
export {
  PUBLISHERS_BY_FAMILY,
  RETRO_NAMES,
  TAGS_BY_FAMILY,
  TAG_LABEL_KEYS,
  TAG_LABEL_KEY_LIST,
  pixelArtFirst,
  suitsPixelArt,
  tagLabel,
} from './modelTags'

export type ModelPeriod = 'day' | 'week' | 'month' | 'quarter'

export const MODEL_PERIODS: readonly ModelPeriod[] = ['day', 'week', 'month', 'quarter']

/** Days each span covers, applied by the main process against its own clock. */
export const PERIOD_DAYS: Record<ModelPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 90,
}

export type ModelQuery = {
  family?: ModelFamily
  /** Narrows to what runs in one place — `LOCAL_RUNTIME`, or a cloud id. Applied by the registry. */
  runsOn?: string
  search?: string
  origin?: ModelOrigin
  capabilities?: readonly string[]
  /** Matched by the API, which narrows to models carrying them. */
  tags?: readonly string[]
  /**
   * Keeps only models created within the span. Forces the date order: the API refuses
   * `createdAfter` under any other, and says so with a 400.
   */
  since?: ModelPeriod
  sort?: ModelSort
  /** Opaque continuation handed back by the previous page; absent asks for the first one. */
  cursor?: string
  limit?: number
}

export type ModelPage = {
  items: ModelSummary[]
  /** `null` once the catalogue is exhausted, which is how the list knows to stop asking. */
  cursor: string | null
  /**
   * Why the cloud half of the catalogue is missing from this page, when it is. `items` still
   * holds what needs no account — local models, a published catalogue — and a page that says why
   * is what a client can act on, where a thrown code was a handler printed in a terminal.
   */
  refused?: ApiFailure
}
