import { ADVANCED_GROUP } from '@shared/domain/localFields'
import { FAMILY_TAGS, SKYBOX_TAG } from '@shared/domain/model'
import type { FieldDescriptor, FieldKind, ModelFamily } from '@shared/domain/model'

/**
 * Shape of a model input as returned by `GET /models/{id}`. Copied rather than imported from
 * the SDK: this is the boundary with the outside world, and it must survive the day Scenario
 * adds a field we know nothing about.
 */
export type ProviderInput = {
  name: string
  type: string
  label?: string
  description?: string
  hint?: string
  placeholder?: string
  group?: string
  kind?: string
  /** On a mask input: the name of the file input it masks. */
  maskFrom?: string
  color?: boolean
  prompt?: boolean
  /** Whether the input is the one prompt assistance rewrites. */
  promptSpark?: boolean
  default?: unknown
  min?: number
  max?: number
  step?: number
  minLength?: number
  maxLength?: number
  allowedValues?: unknown[]
  /** Bytes, on a file input. Uthana's character rigger answers 30000000 and refuses above it. */
  maxSize?: number
  /** Whether choosing this input changes what the run costs — Tripo marks its `animation` so. */
  costImpact?: boolean
  required?: { always?: boolean } | null
}

function isInteger(value: number | undefined): boolean {
  return value !== undefined && Number.isInteger(value)
}

function kindOf(input: ProviderInput): FieldKind {
  if (input.name === 'seed') return 'seed'

  switch (input.type) {
    case 'boolean':
      return 'boolean'
    case 'number':
      // A fractional step (guidance 0.5) means a real number; with no step, integer bounds
      // are enough to decide — otherwise we stay on a real, which accepts integers anyway.
      if (input.step !== undefined) return isInteger(input.step) ? 'integer' : 'number'
      return isInteger(input.min) && isInteger(input.max) ? 'integer' : 'number'
    case 'string':
      if (input.allowedValues?.length) return 'choice'
      if (input.color) return 'color'
      if (input.prompt) return 'longText'
      return 'text'
    case 'file':
      if (input.kind === 'image' || input.kind === 'image-hdr') return 'image'
      // The six riggers and the motion models all take their mesh under `kind: '3d'`; without
      // this they fell to `raw`, and the form asked for an asset id to be typed out by hand.
      return input.kind === '3d' ? 'mesh' : 'raw'
    default:
      return 'raw'
  }
}

/** `numInferenceSteps` → `Num inference steps`: an API name stays readable instead of raw. */
function humanize(text: string): string {
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function labelOf(input: ProviderInput): string {
  return input.label ?? humanize(input.name)
}

/**
 * A choice reads as a phrase where it was written as one, and stays untouched everywhere else:
 * `original_image` was shown with its underscore, in both languages, while the field ABOVE it had
 * been humanised all along.
 *
 * Only letters and separators qualify. A digit means a code rather than a word — `mp3_44100_128`,
 * `480p`, `1:1` — and humanising those would trade an odd label for a wrong one.
 */
function optionsOf(input: ProviderInput): FieldDescriptor['options'] {
  if (!input.allowedValues?.length) return undefined

  return input.allowedValues.map(value => {
    const text = String(value)
    return { value: text, label: /^[a-zA-Z]+([_-][a-zA-Z]+)+$/.test(text) ? humanize(text) : text }
  })
}

/**
 * Translates a model's inputs into field descriptors. An unknown type falls back to raw
 * input: a model Scenario just added must stay usable, and must never make the form
 * disappear — see spec § 6.
 */
function decorateDescriptor(input: ProviderInput, descriptor: FieldDescriptor): void {
  const help = input.description ?? input.hint ?? input.placeholder
  if (help !== undefined) descriptor.help = help
  if (input.group !== undefined) descriptor.group = input.group
  if (input.default !== undefined) descriptor.default = input.default
  if (input.min !== undefined) descriptor.min = input.min
  if (input.max !== undefined) descriptor.max = input.max
  if (input.step !== undefined) descriptor.step = input.step
  if (input.maxSize !== undefined) descriptor.maxSize = input.maxSize
  if (input.costImpact === true) descriptor.costImpact = true

  if (input.maskFrom !== undefined) descriptor.maskFrom = input.maskFrom
  if (input.promptSpark === true || input.prompt === true) descriptor.promptSpark = true

  const options = optionsOf(input)
  if (options) descriptor.options = options

  if (descriptor.group === undefined && foldsByDefault(descriptor)) {
    descriptor.group = ADVANCED_GROUP
  }
}

function descriptorOf(input: ProviderInput): FieldDescriptor {
  const descriptor: FieldDescriptor = {
    key: input.name,
    kind: kindOf(input),
    label: labelOf(input),
    required: input.required?.always === true,
  }
  decorateDescriptor(input, descriptor)

  return descriptor
}

export function translateSchema(inputs: readonly ProviderInput[] | undefined): FieldDescriptor[] {
  return inputs?.map(descriptorOf) ?? []
}

/** Compared without its separators: the same knob is `cfg_scale` on one model and `cfgScale` on the next. */
const bare = (key: string): string => key.toLowerCase().replace(/[-_\s]/g, '')

/**
 * The knobs a first generation never touches, spelled as the catalogue spells them.
 *
 * 🛑 The blind spot, written rather than hidden: only `seed` and the mask are told by CONTRACT —
 * a kind of ours and the field that names what it masks. The rest is a LIST OF NAMES, so a model
 * spelling its guidance otherwise shows it unfolded, and nothing reddens.
 */
const FOLDED = new Set([
  'negativeprompt',
  'guidancescale',
  'guidance',
  'cfgscale',
  'strength',
  'numinferencesteps',
  'inferencesteps',
  'steps',
])

function foldsByDefault(field: FieldDescriptor): boolean {
  return field.kind === 'seed' || field.maskFrom !== undefined || FOLDED.has(bare(field.key))
}

const FAMILY_BY_CAPABILITY: readonly { pattern: RegExp; family: ModelFamily }[] = [
  { pattern: /video$/, family: 'video' },
  { pattern: /3d$/, family: '3d' },
  { pattern: /audio$/, family: 'audio' },
  { pattern: /texture/, family: 'material' },
  // Ahead of the image pattern, which `img2txt` would otherwise match: what a model produces
  // decides its family, and only `model_scenario-llm` produces text among the public models.
  { pattern: /txt$/, family: 'other' },
  { pattern: /img|inpaint|outpaint|reference/, family: 'image' },
]

/**
 * Infers a model's family from its capabilities. Order matters: `img2video` is a video model,
 * not an image one, and suffixes must win over broader patterns.
 *
 * `SKYBOX_TAG` is trusted on its own, ahead of everything: it belongs to Scenario's own `sc:`
 * namespace, so only the platform posts it, and it is the only signal there is — a panorama
 * model answers `txt2img` like every other image model.
 *
 * Every other tag is settled AFTER the capabilities, and only when those answered `image`. Those
 * are authors' words, which land where they please: two of the nine models carrying
 * `remove-background` remove it from video, and the canvas cannot use them. Trusting that tag
 * first would file them under cutout. `skybox-upscale` is judged there too, with the rest of
 * them — it is Scenario's word for one model, not a namespaced claim like `SKYBOX_TAG`.
 */
export function familyOf(
  capabilities: readonly string[] | undefined,
  tags: readonly string[],
): ModelFamily {
  if (tags.includes(SKYBOX_TAG)) return 'skybox'
  if (!capabilities?.length) return 'other'

  const matched = FAMILY_BY_CAPABILITY.find(({ pattern }) =>
    capabilities.some(capability => pattern.test(capability)),
  )
  if (!matched) return 'other'
  if (matched.family !== 'image') return matched.family

  // `SKYBOX_TAG`'s own entry is unreachable here — the tag above already answered. Do not drop
  // it as dead weight: it is the SECOND skybox row, and `tagOfFamily` answers nothing only for
  // a family holding more than one. Alone, `skybox-upscale` would become the pre-filter and cut
  // that space to the single model carrying it. `model.test.ts` is what catches the removal.
  return FAMILY_TAGS.find(entry => tags.includes(entry.tag))?.family ?? matched.family
}
