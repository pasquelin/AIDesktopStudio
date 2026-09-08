import { aiRoleId, type AiRoleId } from './aiRole'
import type { AssetType } from './asset'
import type { ModelFamily } from './model'

/**
 * What each employment consumes and what it produces — see
 * `docs/ci/adr/ADR-23-la-generation-se-pilote-par-capability.md`.
 *
 * `CAPABILITIES_BY_FAMILY` names the employments; this says what they TAKE. Without it the panel
 * cannot know that a selected mesh makes `3d/3d23d` reachable and a selected picture does not,
 * and every surface would have to spell the answer again.
 *
 * 🛑 It is NOT the form. A model publishes its own inputs (`FieldDescriptor[]`, ADR-22) and those
 * remain the only thing a body is built from — this is coarser on purpose: which KINDS an
 * employment works from, which of them it cannot do without, and what lands at the end.
 */

/** What an input is FOR, which is what lets a source be carried across a model switch. */
type CapabilityInputRole = 'prompt' | 'source' | 'mask' | 'reference'

/**
 * What a generation is made of and lands as: an asset the catalogue files, or source text.
 *
 * `AssetType` rather than a second vocabulary — `assetKind.ts` and `fileRole.ts` already answer
 * what a file is, and a parallel table would be free to disagree with them. `code` is the one
 * value beside them, and it is NOT an `AssetType`: a script is a document of the project, never
 * a row of the shelf, so widening `AssetType` would have put it in every catalogue query.
 */
type CapabilityMedium = AssetType | 'code'

/** What an input is MADE of: words, or one of the media above. */
type CapabilityInputKind = 'text' | CapabilityMedium

export type CapabilityInput = {
  role: CapabilityInputRole
  kind: CapabilityInputKind
  /** Whether the employment is not itself without it — a mask is what makes an inpaint one. */
  required: boolean
  /** Whether several may be given. The real ceiling is the model's, and it is asked for it. */
  many?: boolean
}

export type CapabilityContract = {
  inputs: readonly CapabilityInput[]
  output: CapabilityMedium
}

const PROMPT: CapabilityInput = { role: 'prompt', kind: 'text', required: true }
const OPTIONAL_PROMPT: CapabilityInput = { role: 'prompt', kind: 'text', required: false }

function source(kind: CapabilityInputKind): CapabilityInput {
  return { role: 'source', kind, required: true }
}

function reference(kind: CapabilityInputKind): CapabilityInput {
  return { role: 'reference', kind, required: true, many: true }
}

/** The area to redo. What tells an inpaint from an image-to-image, so never optional. */
const MASK: CapabilityInput = { role: 'mask', kind: 'image', required: true }

type ContractEntry = CapabilityContract & { family: ModelFamily; capability: string }

/**
 * Every employment, with what it works from.
 *
 * Written out rather than derived from the capability NAME: `img23d` and `video2audio` would read
 * the same way, and `rig` and `motion` read as nothing at all. What each takes is a fact about the
 * employment, and a parser over `<in>2<out>` would invent the rest.
 *
 * `required` is what the employment cannot BE without, never what a given model demands — that
 * one is `FieldDescriptor.required`, published per model and asked of it. This is what decides
 * whether an operation is reachable at all from what is selected.
 */
const ENTRIES: readonly ContractEntry[] = [
  // Image. The prompt is required across the family: none of these employments composes without
  // words, and the two that start from a picture still need to be told what to make of it.
  { family: 'image', capability: 'txt2img', inputs: [PROMPT], output: 'image' },
  { family: 'image', capability: 'img2img', inputs: [PROMPT, source('image')], output: 'image' },
  {
    family: 'image',
    capability: 'inpaint',
    inputs: [PROMPT, source('image'), MASK],
    output: 'image',
  },
  {
    // Same three as an inpaint, and the mask is what says WHERE it grows: without one the
    // employment is an image-to-image, which is a different model choice.
    family: 'image',
    capability: 'outpaint',
    inputs: [PROMPT, source('image'), MASK],
    output: 'image',
  },
  {
    // The picture STEERS rather than starts: a depth map, a pose, an edge map. It is a source
    // all the same — one picture in, and the model reads it as a constraint.
    family: 'image',
    capability: 'controlnet',
    inputs: [PROMPT, source('image')],
    output: 'image',
  },
  {
    family: 'image',
    capability: 'reference',
    inputs: [PROMPT, reference('image')],
    output: 'image',
  },

  // Video.
  { family: 'video', capability: 'txt2video', inputs: [PROMPT], output: 'video' },
  { family: 'video', capability: 'img2video', inputs: [PROMPT, source('image')], output: 'video' },
  {
    family: 'video',
    capability: 'video2video',
    inputs: [PROMPT, source('video')],
    output: 'video',
  },

  // 3D. The prompt is optional wherever a mesh or a picture already says what to make — measured
  // against `localFields.ts`, whose `mesh` template declares `{ ...PROMPT, required: false }`.
  { family: '3d', capability: 'txt23d', inputs: [PROMPT], output: 'mesh' },
  {
    family: '3d',
    capability: 'img23d',
    inputs: [OPTIONAL_PROMPT, source('image')],
    output: 'mesh',
  },
  { family: '3d', capability: '3d23d', inputs: [OPTIONAL_PROMPT, source('mesh')], output: 'mesh' },
  // A skeleton put INTO a mesh: nothing is described, and the answer is the same mesh, rigged.
  { family: '3d', capability: 'rig', inputs: [source('mesh')], output: 'mesh' },
  // What a character is made to PLAY. The mesh is optional — a motion can be generated from
  // words alone and laid on a character afterwards, which is how the library's own are used.
  {
    family: '3d',
    capability: 'motion',
    inputs: [PROMPT, { role: 'source', kind: 'mesh', required: false }],
    output: 'animation',
  },

  // Audio.
  { family: 'audio', capability: 'txt2audio', inputs: [PROMPT], output: 'audio' },
  {
    family: 'audio',
    capability: 'audio2audio',
    inputs: [PROMPT, source('audio')],
    output: 'audio',
  },
  // The sequence says what is happening; the words only colour it.
  {
    family: 'audio',
    capability: 'video2audio',
    inputs: [OPTIONAL_PROMPT, source('video')],
    output: 'audio',
  },

  // Material. The same four employments as the image family, landing on the material shelf —
  // which is exactly what `LocalModel.serves` already says: a model that draws one draws the
  // other, and only where the result is filed differs.
  { family: 'material', capability: 'txt2img_texture', inputs: [PROMPT], output: 'image' },
  {
    family: 'material',
    capability: 'img2img_texture',
    inputs: [PROMPT, source('image')],
    output: 'image',
  },
  {
    family: 'material',
    capability: 'controlnet_texture',
    inputs: [PROMPT, source('image')],
    output: 'image',
  },
  {
    family: 'material',
    capability: 'reference_texture',
    inputs: [PROMPT, reference('image')],
    output: 'image',
  },

  // Skybox.
  { family: 'skybox', capability: 'txt2skybox', inputs: [PROMPT], output: 'skybox' },
  {
    family: 'skybox',
    capability: 'img2skybox',
    inputs: [PROMPT, source('image')],
    output: 'skybox',
  },

  // Code. The prompt is required in both: a chat is told what to write, and rewriting a script
  // without saying what to change is a request no model can answer.
  { family: 'code', capability: 'txt2code', inputs: [PROMPT], output: 'code' },
  { family: 'code', capability: 'code2code', inputs: [PROMPT, source('code')], output: 'code' },

  // The three the canvas edits reach for. No prompt at all: none of them is told what to make,
  // and offering an empty box would read as a parameter that does nothing.
  { family: 'upscale', capability: 'upscale', inputs: [source('image')], output: 'image' },
  {
    family: 'background-removal',
    capability: 'cutout',
    inputs: [source('image')],
    output: 'image',
  },
  {
    family: 'vectorization',
    capability: 'vectorize',
    inputs: [source('image')],
    output: 'image',
  },
]

/**
 * Built once, and `aiRoleId` is what validates it: a capability its family does not declare
 * throws here, at module load, rather than keying a contract nothing can reach.
 */
const BY_ROLE: ReadonlyMap<AiRoleId, CapabilityContract> = new Map(
  ENTRIES.map(({ family, capability, ...contract }) => [aiRoleId(family, capability), contract]),
)

/** What the employment works from and produces. `null` for a standalone role, which makes no file. */
export function contractOf(role: AiRoleId): CapabilityContract | null {
  return BY_ROLE.get(role) ?? null
}

/**
 * Whether the employment is HANDED the medium it produces — what tells a rework from a fresh
 * make, and the one fact `landingOfRole` and `bodyExtras` both turn on.
 */
export function reworksItsOutput(role: AiRoleId): boolean {
  const contract = contractOf(role)
  if (contract === null) return false

  return contract.inputs.some(input => input.role === 'source' && input.kind === contract.output)
}

/** Every employment that has a contract, which is every generation role. */
export function rolesWithContract(): readonly AiRoleId[] {
  return [...BY_ROLE.keys()]
}

/** What the employment cannot start without, `text` included. */
function requiredInputsOf(contract: CapabilityContract): readonly CapabilityInput[] {
  return contract.inputs.filter(input => input.required)
}

/**
 * An asset the workspace can offer, and what it can stand for.
 *
 * The role is carried and NOT deduced from the kind, which is the whole subtlety: a mask and the
 * picture it masks are both `image`, so a bare list of kinds made a retouch look reachable from
 * one selected picture — and running it would have repainted the whole canvas.
 *
 * A `source` also answers a `reference`: they differ in what the model does with the picture,
 * never in where it came from.
 *
 * 🛑 NOTHING emits `mask` today — `availableInputsOf` tags every input `source`, so `inpaint` and
 * `outpaint` are never DETECTED and are reached only by forcing the operation. The panel names a
 * catalogue row, and a canvas has no asset until it is flattened, which is not this panel's.
 */
export type AvailableInput = { role: 'source' | 'mask'; kind: CapabilityMedium }

/**
 * Whether what is at hand answers this one input.
 *
 * The words are never counted: a prompt is typed, not selected, so an employment that asks for
 * one is reachable from an empty workspace — which is where every session starts.
 */
export function fills(input: CapabilityInput, available: readonly AvailableInput[]): boolean {
  if (input.kind === 'text') return true
  if (input.role === 'mask') return available.some(one => one.role === 'mask')

  const kind = input.kind
  return available.some(one => one.role === 'source' && one.kind === kind)
}

/** Whether this employment can work from what is at hand, ignoring what is only optional. */
export function reachableFrom(
  contract: CapabilityContract,
  available: readonly AvailableInput[],
): boolean {
  return requiredInputsOf(contract).every(input => fills(input, available))
}
