import type { FieldDescriptor } from './model'
import type { AssetType } from './asset'

/**
 * The form a LOCAL model offers, derived rather than declared per model — see
 * `docs/ci/adr/ADR-22-le-formulaire-d-un-modele-local.md`.
 *
 * A Scenario model publishes its own inputs and `ModelRegistry` turns them into
 * `FieldDescriptor[]`; a model on this machine has no server to ask. Writing twenty fields per
 * catalogue entry would be the hand-written form invariant 5 forbids, so the knobs come from the
 * MODALITY — they are the same for every text model, and the same for every diffusion model — and
 * the manifest carries only what it disagrees with.
 */

/** What a runtime takes, as far as a form is concerned. Never a model id, never a runtime name. */
export type LocalModality = 'text' | 'image' | 'video' | 'audio' | 'mesh' | 'skybox'

/** A modality that writes a FILE. Everything but `text`, which answers a sentence and files none. */
export type ProducingModality = Exclude<LocalModality, 'text'>

/**
 * Whether this modality writes a file at all — the one narrowing, so nothing tests `=== 'text'`
 * in three places and forgets the fourth.
 */
export function producesFile(modality: LocalModality): modality is ProducingModality {
  return modality !== 'text'
}

/**
 * The shelf a modality's output lands on.
 *
 * An identity, and it is the COMPILER that makes it worth writing: every producing modality is
 * named after its shelf, so one added without a shelf to land on fails to compile here.
 */
export function assetTypeOfModality(modality: ProducingModality): AssetType {
  return modality
}

const EXTENSIONS: Record<ProducingModality, string> = {
  image: 'png',
  video: 'mp4',
  audio: 'wav',
  mesh: 'ply',
  // Same raster as an image: the collector files by modality, not by suffix.
  skybox: 'png',
}

/**
 * The extension a generation of this modality lands under, without its dot — what the collector
 * reads back off the path to file the asset.
 *
 * `ply` for a mesh because diffusers' own writer decides it: `export_to_ply` is what ShapE hands
 * back, where a `.glb` would need a converter this studio does not carry.
 */
export function outputExtensionOf(modality: ProducingModality): string {
  return EXTENSIONS[modality]
}

/**
 * One knob, before a language is chosen. `labelKey` rather than `label`: a descriptor field is
 * screen text, and `no-hardcoded-text.test.ts` is right to refuse one written here.
 */
export type LocalFieldTemplate = Omit<FieldDescriptor, 'label' | 'help' | 'options'> & {
  labelKey: string
  helpKey?: string
  /** A closed list, named by key too — a `FieldOption.label` is screen text like any other. */
  optionKeys?: readonly { readonly value: string; readonly labelKey: string }[]
}

/** The key every modality names its prompt by — read rather than spelled a second time. */
export const PROMPT_FIELD_KEY = 'prompt'

/**
 * The key the seed is named by. Exported for the one form that has to DROP it: a chat cloud is
 * asked over three wire formats and only some of them take a seed, so offering the knob there
 * would be a control that does nothing on two clouds out of three.
 */
export const SEED_FIELD_KEY = 'seed'

/**
 * The group a form folds away — § 14 of the unified panel.
 *
 * Shared because both sides write it: the templates below file their knobs under it, and the
 * renderer decides what to fold on it. A second spelling would fold nothing and say nothing.
 */
export const ADVANCED_GROUP = 'advanced'

const PROMPT: LocalFieldTemplate = {
  key: PROMPT_FIELD_KEY,
  kind: 'longText',
  labelKey: 'localFields.prompt',
  required: true,
  promptSpark: true,
}

const SEED: LocalFieldTemplate = {
  key: SEED_FIELD_KEY,
  kind: 'seed',
  labelKey: 'localFields.seed',
  helpKey: 'localFields.seedHelp',
  required: false,
  group: ADVANCED_GROUP,
}

/**
 * The picture a generation starts FROM, and the area of it to redo. Both optional, and that is
 * what makes one catalogue entry serve three employments: left empty the model draws from the
 * description alone, filled it edits, filled with a mask it repaints inside it.
 *
 * `AutoPipelineForImage2Image` reads the same signal — the adapter derives its pipeline from
 * which of the two arrived, so nothing has to carry the employment down to the engine.
 */
const SOURCE_IMAGE: LocalFieldTemplate = {
  key: 'image',
  kind: 'image',
  labelKey: 'localFields.image',
  helpKey: 'localFields.imageHelp',
  required: false,
}

/** The sequence a generation reworks. Empty, the model draws the whole thing from the words. */
const SOURCE_VIDEO: LocalFieldTemplate = {
  key: 'video',
  kind: 'raw',
  labelKey: 'localFields.video',
  helpKey: 'localFields.videoHelp',
  required: false,
}

/** The take a generation reworks. Empty, the model composes from the words alone. */
const SOURCE_AUDIO: LocalFieldTemplate = {
  key: 'audio',
  kind: 'raw',
  labelKey: 'localFields.audio',
  helpKey: 'localFields.audioHelp',
  required: false,
}

const LYRICS: LocalFieldTemplate = {
  key: 'lyrics',
  kind: 'longText',
  labelKey: 'localFields.lyrics',
  helpKey: 'localFields.lyricsHelp',
  required: false,
}

const MASK: LocalFieldTemplate = {
  key: 'mask',
  kind: 'image',
  labelKey: 'localFields.mask',
  helpKey: 'localFields.maskHelp',
  required: false,
  // What the file input above is masking — an edit action fills the pair without naming either.
  maskFrom: 'image',
}

/**
 * How far from the picture it started on. Shown always and IGNORED where none was given:
 * `dependsOn` is an equality against one value, so "whenever a picture is there" cannot be
 * spelled with it, and a knob that vanished on a value nobody typed would read as a bug.
 */
const STRENGTH: LocalFieldTemplate = {
  key: 'strength',
  kind: 'number',
  labelKey: 'localFields.strength',
  helpKey: 'localFields.strengthHelp',
  required: false,
  default: 0.8,
  min: 0,
  max: 1,
  step: 0.05,
  group: ADVANCED_GROUP,
}

const NEGATIVE_PROMPT: LocalFieldTemplate = {
  key: 'negativePrompt',
  kind: 'longText',
  labelKey: 'localFields.negativePrompt',
  required: false,
  group: ADVANCED_GROUP,
}

/** Written once and shared: three modalities count denoise steps, with bounds of their own. */
function steps(base: { default: number; max: number }): LocalFieldTemplate {
  return {
    key: 'steps',
    kind: 'integer',
    labelKey: 'localFields.steps',
    helpKey: 'localFields.stepsHelp',
    required: false,
    min: 1,
    group: ADVANCED_GROUP,
    ...base,
  }
}

function cfgScale(base: { default: number; max: number }): LocalFieldTemplate {
  return {
    key: 'cfgScale',
    kind: 'number',
    labelKey: 'localFields.cfgScale',
    required: false,
    min: 0,
    step: 0.5,
    group: ADVANCED_GROUP,
    ...base,
  }
}

/**
 * A pixel side. Bounds are the runtime's: a model wanting others says so in its manifest.
 *
 * The step is a parameter because the DEFAULT has to sit on the grid it draws: the form renders a
 * real `<input type="number">`, and a browser refuses to submit a `stepMismatch` — a video at
 * 480 high on a grid of 64 is a generation that never starts.
 */
function side(
  key: 'width' | 'height',
  base: { default: number; max: number; step: number },
): LocalFieldTemplate {
  return {
    key,
    kind: 'integer',
    labelKey: `localFields.${key}`,
    required: false,
    min: 256,
    group: ADVANCED_GROUP,
    ...base,
  }
}

/**
 * What every local model of a modality offers. Bounds are the runtime's, not a model's: a model
 * that wants another default says so in its manifest rather than growing a template of its own.
 */
const TEMPLATES: Record<LocalModality, readonly LocalFieldTemplate[]> = {
  text: [
    PROMPT,
    {
      key: 'temperature',
      kind: 'number',
      labelKey: 'localFields.temperature',
      helpKey: 'localFields.temperatureHelp',
      required: false,
      default: 0.8,
      min: 0,
      max: 2,
      step: 0.05,
    },
    {
      key: 'topP',
      kind: 'number',
      labelKey: 'localFields.topP',
      required: false,
      default: 0.95,
      min: 0,
      max: 1,
      step: 0.05,
      group: ADVANCED_GROUP,
    },
    {
      key: 'maxTokens',
      kind: 'integer',
      labelKey: 'localFields.maxTokens',
      required: false,
      default: 1024,
      min: 16,
      max: 32_768,
      group: ADVANCED_GROUP,
    },
    SEED,
  ],
  image: [
    PROMPT,
    NEGATIVE_PROMPT,
    SOURCE_IMAGE,
    MASK,
    STRENGTH,
    side('width', { default: 1024, max: 2048, step: 64 }),
    side('height', { default: 1024, max: 2048, step: 64 }),
    steps({ default: 20, max: 150 }),
    cfgScale({ default: 7, max: 30 }),
    SEED,
  ],
  video: [
    PROMPT,
    NEGATIVE_PROMPT,
    SOURCE_IMAGE,
    SOURCE_VIDEO,
    side('width', { default: 832, max: 1280, step: 16 }),
    side('height', { default: 480, max: 720, step: 16 }),
    {
      key: 'frames',
      kind: 'integer',
      labelKey: 'localFields.frames',
      helpKey: 'localFields.framesHelp',
      required: false,
      default: 81,
      min: 9,
      max: 241,
      step: 4,
    },
    {
      key: 'fps',
      kind: 'integer',
      labelKey: 'localFields.fps',
      required: false,
      default: 16,
      min: 1,
      max: 60,
    },
    steps({ default: 30, max: 100 }),
    cfgScale({ default: 5, max: 20 }),
    STRENGTH,
    SEED,
  ],
  audio: [
    PROMPT,
    SOURCE_AUDIO,
    SOURCE_VIDEO,
    LYRICS,
    {
      key: 'seconds',
      kind: 'number',
      labelKey: 'localFields.seconds',
      helpKey: 'localFields.secondsHelp',
      required: false,
      default: 10,
      min: 1,
      max: 600,
      step: 0.5,
    },
    steps({ default: 8, max: 200 }),
    cfgScale({ default: 3.5, max: 20 }),
    SEED,
  ],
  mesh: [
    { ...PROMPT, required: false },
    SOURCE_IMAGE,
    steps({ default: 25, max: 100 }),
    cfgScale({ default: 15, max: 30 }),
    SEED,
  ],
  skybox: [
    PROMPT,
    NEGATIVE_PROMPT,
    SOURCE_IMAGE,
    side('width', { default: 2048, max: 4096, step: 64 }),
    side('height', { default: 1024, max: 2048, step: 64 }),
    steps({ default: 20, max: 150 }),
    cfgScale({ default: 7, max: 30 }),
    SEED,
  ],
}

/**
 * The values beside the type, so a schema checks against them rather than against a copy.
 *
 * Read off `TEMPLATES`, which the compiler holds complete: a modality added to the union without
 * a form would otherwise be missing here in silence, and both readers are silent about it —
 * `z.enum` would refuse a valid manifest, and the thumbnail generator would write no picture.
 */
// `as`: `Object.keys` widens to `string[]` where this record is keyed by the union itself.
export const LOCAL_MODALITIES = Object.keys(TEMPLATES) as readonly LocalModality[]

/**
 * What a manifest may disagree with, by field key. Bounds and defaults only — a model never adds
 * a knob its runtime cannot honour, and one that could would be a second runtime.
 */
export type LocalFieldOverrides = Readonly<
  Record<string, Partial<Pick<FieldDescriptor, 'default' | 'min' | 'max' | 'step'>>>
>

/**
 * The form, in the reader's language. `translate` is handed in rather than imported: this runs in
 * the main process, where the language is a service and never a module-level read.
 */
const MOTION_FIELDS: readonly LocalFieldTemplate[] = [
  PROMPT,
  {
    key: 'seconds',
    kind: 'number',
    labelKey: 'localFields.seconds',
    required: false,
    default: 5,
    min: 1,
    max: 30,
    step: 0.5,
  },
  steps({ default: 50, max: 100 }),
  SEED,
]

export function localFieldsOf(
  modality: LocalModality,
  overrides: LocalFieldOverrides,
  translate: (key: string) => string,
  profile?: 'motion',
): FieldDescriptor[] {
  return fieldsFrom(
    profile === 'motion' ? MOTION_FIELDS : TEMPLATES[modality],
    translate,
    overrides,
  )
}

/**
 * A form, in the reader's language. The ONE place a template becomes a descriptor: a second
 * mapping would let a new `FieldDescriptor` member reach half the forms and nothing would redden.
 */
export function fieldsFrom(
  templates: readonly LocalFieldTemplate[],
  translate: (key: string) => string,
  overrides: LocalFieldOverrides = {},
): FieldDescriptor[] {
  return templates.map(({ labelKey, helpKey, optionKeys, ...field }) => ({
    ...field,
    ...overrides[field.key],
    label: translate(labelKey),
    ...(helpKey ? { help: translate(helpKey) } : {}),
    ...(optionKeys
      ? { options: optionKeys.map(one => ({ value: one.value, label: translate(one.labelKey) })) }
      : {}),
  }))
}

/** Every key a set of templates names, so a bundle guard reads them rather than a copy. */
export function fieldKeysOf(templates: readonly LocalFieldTemplate[]): readonly string[] {
  return templates.flatMap(field => [
    field.labelKey,
    ...(field.helpKey ? [field.helpKey] : []),
    ...(field.optionKeys ?? []).map(one => one.labelKey),
  ])
}

/** The keys a bundle has to name, so a guard reads them off the templates rather than a copy. */
export function localFieldKeys(): readonly string[] {
  return fieldKeysOf(Object.values(TEMPLATES).flat())
}
