import { isRecord } from '../guards'
import type { JobNote } from './job'
import type { FieldDescriptor, ModelDescriptor } from './model'
import { fieldKeysOf, fieldsFrom, type LocalFieldTemplate } from './localFields'

/**
 * The Tripo catalogue, as DATA — their API publishes no model listing, so the studio carries one.
 *
 * Same shape as `localFields.ts`, and for the same reason: a form written per entry would be the
 * hand-written form invariant 5 forbids. What differs is that a Tripo entry is an ENDPOINT × a
 * model, because their v3 gives one endpoint per capability rather than one model id per run.
 */

import { TRIPO_CLOUD, tripoModelId, type TripoEntry, type TripoLane } from './tripoTypes'
export * from './tripoTypes'

import {
  AUTOFIX,
  MESH_KNOBS,
  NEGATIVE_PROMPT,
  PROMPT,
  TEXTURE_ALIGNMENT,
  input,
} from './tripoFields'

type TripoLine = { readonly model: string; readonly name: string; readonly lane: TripoLane }

const LINES: readonly TripoLine[] = [
  { model: 'v3.1-20260211', name: 'Tripo v3.1', lane: 'model-h' },
  { model: 'v3.0-20250812', name: 'Tripo v3.0', lane: 'model-h' },
  { model: 'v2.5-20250123', name: 'Tripo v2.5', lane: 'model-h' },
  { model: 'P1-20260311', name: 'Tripo P1', lane: 'model-p' },
  /**
   * 🛑 Named by the service and by NOTHING else — neither their model page nor the plan this was
   * written from mentions a P2. Its lane is the P one by its name alone, which is the only
   * assumption left in this list.
   */
  { model: 'P2-20260801', name: 'Tripo P2', lane: 'model-p' },
]

/**
 * The picture models, PER ENDPOINT: the service publishes a different list for each, and the
 * plan's `gemini-*` exist nowhere. Measured — `text-to-image` takes `seedream_v4` where
 * `image-to-image` refuses it, and `edit-multiview` takes two names of its own.
 */
const TEXT_TO_IMAGE_MODELS: readonly string[] = [
  'seedream_v4',
  'seedream_v5',
  'banana',
  'banana2',
  'banana_pro',
  'chat_image_1',
  'chat_image_1.5',
  'chat_image_2',
]

const IMAGE_TO_IMAGE_MODELS: readonly string[] = TEXT_TO_IMAGE_MODELS.filter(
  model => model !== 'seedream_v4',
)

const EDIT_MULTIVIEW_MODELS: readonly string[] = ['seedream_v4', 'default']

/** What one line offers, across the three endpoints that start a model from scratch. */
function meshEntries(line: TripoLine): TripoEntry[] {
  const common: Pick<TripoEntry, 'family' | 'model' | 'lane' | 'credits'> = {
    family: '3d',
    model: line.model,
    lane: line.lane,
    credits: 20,
  }

  return [
    {
      ...common,
      endpoint: 'generation/text-to-model',
      name: `${line.name} · Text`,
      capability: 'txt23d',
      fields: [PROMPT, NEGATIVE_PROMPT, ...MESH_KNOBS],
    },
    {
      ...common,
      endpoint: 'generation/image-to-model',
      name: `${line.name} · Image`,
      capability: 'img23d',
      // `file`, measured: « file is required for image_to_model ».
      fields: [
        input('image', 'tripoFields.sourceImage', 'file'),
        AUTOFIX,
        TEXTURE_ALIGNMENT,
        ...MESH_KNOBS,
      ],
    },
    {
      ...common,
      endpoint: 'generation/multiview-to-model',
      name: `${line.name} · Multiview`,
      capability: 'img23d',
      // `files`, measured: « files or inputs are required for multiview_to_model ».
      fields: [
        // 🛑 SEVERAL, and their refusal says so: « files or inputs are required for
        // multiview_to_model ». One view was wrapped into a list of one — refused or degenerate.
        { ...input('image', 'tripoFields.sourceViews', 'files'), repeated: true },
        AUTOFIX,
        TEXTURE_ALIGNMENT,
        ...MESH_KNOBS,
      ],
    },
  ]
}

import { PROCESSING, TRIPO_RIG_TYPES } from './tripoProcessing'
export { TRIPO_RIG_TYPES } from './tripoProcessing'

function imageModelName(model: string): string {
  const named = IMAGE_MODEL_NAMES[model]
  if (named) return named

  // A model the service adds before this table does: readable, and never a missing entry.
  return model.replace(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

/** The word each picture endpoint is known by, in the register the 3D lines already use. */
const ENDPOINT_WORDS: Readonly<Record<string, string>> = {
  'generation/text-to-image': 'Text',
  'generation/image-to-image': 'Image',
  'generation/image-to-multiview': 'Multiview',
  'generation/edit-multiview': 'Multiview edit',
}

/** 🛑 Their own spellings, measured 2026-08-31 — no `gemini-*` among them, whatever the docs say. */
const IMAGE_MODEL_NAMES: Readonly<Record<string, string>> = {
  seedream_v4: 'Seedream v4',
  seedream_v5: 'Seedream v5',
  banana: 'Banana',
  banana2: 'Banana 2',
  banana_pro: 'Banana Pro',
  chat_image_1: 'Chat Image 1',
  'chat_image_1.5': 'Chat Image 1.5',
  chat_image_2: 'Chat Image 2',
}

/**
 * A picture endpoint, once per model the service admits FOR THAT ENDPOINT — measured, the four
 * lists differ, and a cartesian product over one of them offers runs that are refused.
 */
function imageEntries(
  endpoint: string,
  capability: string,
  models: readonly string[],
  fields: readonly LocalFieldTemplate[],
): TripoEntry[] {
  return models.map(model => ({
    endpoint,
    model,
    name: `${imageModelName(model)} · ${ENDPOINT_WORDS[endpoint] ?? endpoint}`,
    family: 'image',
    capability,
    lane: 'image',
    credits: 5,
    fields,
  }))
}

/** Every runnable thing Tripo publishes, endpoint by model. */
export const TRIPO_CATALOGUE: readonly TripoEntry[] = [
  ...LINES.flatMap(meshEntries),
  ...PROCESSING,
  ...imageEntries('generation/text-to-image', 'txt2img', TEXT_TO_IMAGE_MODELS, [
    PROMPT,
    NEGATIVE_PROMPT,
  ]),
  // `prompt` is required « when template is not set », measured — so it stays required here.
  ...imageEntries('generation/image-to-image', 'img2img', IMAGE_TO_IMAGE_MODELS, [
    PROMPT,
    input('image', 'tripoFields.sourceImage'),
    NEGATIVE_PROMPT,
  ]),
  /**
   * 🛑 Its model list is the one thing the service would not name: it validates the input first,
   * so an incomplete body never reaches the model. Left on the text-to-image list, which a real
   * run will confirm or refuse — and a refusal costs nothing.
   */
  ...imageEntries('generation/image-to-multiview', 'img2img', TEXT_TO_IMAGE_MODELS, [
    input('image', 'tripoFields.sourceImage'),
    NEGATIVE_PROMPT,
  ]),
  ...imageEntries('generation/edit-multiview', 'img2img', EDIT_MULTIVIEW_MODELS, [
    PROMPT,
    // 🛑 NOT `repeated`, and not an oversight: its key is `input`, which no wrapper touches, and
    // nothing measured says this one takes a list. Its twin at `multiview-to-model` does.
    input('raw', 'tripoFields.sourceViews'),
  ]),
]

const BY_ID = new Map(TRIPO_CATALOGUE.map(entry => [tripoModelId(entry), entry]))

/** The entry a target names, or nothing — a stored id this build no longer publishes is one. */
export function tripoEntryOf(modelId: string): TripoEntry | null {
  return BY_ID.get(modelId) ?? null
}

/** The form, in the reader's language — through the one mapping `localFields.ts` publishes. */
export function tripoFieldsOf(
  entry: TripoEntry,
  translate: (key: string) => string,
): FieldDescriptor[] {
  return fieldsFrom(entry.fields, translate)
}

/**
 * One entry as the model registry publishes it.
 *
 * 🛑 `installed`, `downloadable` and `diskBytes` are LEFT OUT, and `model.ts` says why: they are
 * absent for a model that runs in a cloud, where there is nothing to install. Answered as
 * `false`, every row wore « Pas de moteur » — the badge for weights no engine can open.
 *
 * Here rather than in `services.ts` so the shape is testable: the composition lived inside a
 * module with no test, and nothing said what a Tripo row promises.
 */
export function tripoDescriptorOf(
  entry: TripoEntry,
  translate: (key: string) => string,
): ModelDescriptor {
  return {
    id: tripoModelId(entry),
    name: entry.name,
    family: entry.family,
    runsOn: TRIPO_CLOUD,
    source: TRIPO_CLOUD,
    // Nothing on another company's servers is published by the cloud this studio was built on.
    origin: 'community',
    featured: false,
    capabilities: [entry.capability],
    tags: [],
    thumbnail: '',
    fields: tripoFieldsOf(entry, translate),
  }
}

/** The keys a bundle has to name, read off the catalogue rather than off a copy of it. */
export function tripoFieldKeys(): readonly string[] {
  return fieldKeysOf(TRIPO_CATALOGUE.flatMap(entry => entry.fields))
}

/**
 * What `animations/rig-check` answers — the one Tripo result that is not a file, said as the row
 * will say it. A topology no bundle has a word for drops the short sentence rather than showing
 * a raw key, which is this repo's costliest defect.
 */
export function tripoRigCheckNote(output: unknown): JobNote | null {
  if (!isRecord(output) || typeof output['riggable'] !== 'boolean') return null
  if (!output['riggable']) return { labelKey: 'tripoRigCheck.notRiggable', tone: 'warning' }

  const rigType = output['rig_type']
  return typeof rigType === 'string' && TRIPO_RIG_TYPES.includes(rigType)
    ? {
        labelKey: 'tripoRigCheck.riggableAs',
        params: { topology: `tripoFields.rig_type_${rigType}` },
      }
    : { labelKey: 'tripoRigCheck.riggable' }
}
