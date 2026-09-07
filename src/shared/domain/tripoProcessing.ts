import type { TripoEntry } from './tripoTypes'
import { ADVANCED_GROUP } from './localFields'
import {
  FACE_LIMIT,
  PBR,
  PROMPT,
  QUAD,
  TEXTURE,
  TEXTURE_ALIGNMENT,
  input,
  quality,
  seed,
} from './tripoFields'

/** The topologies rigging fits a skeleton to, and the only ones `animations/rig-check` names. */
export const TRIPO_RIG_TYPES: readonly string[] = [
  'biped',
  'quadruped',
  'avian',
  'aquatic',
  'serpentine',
  'hexapod',
  'octopod',
]

/**
 * Their whole animation catalogue, measured 2026-08-31 by a body the service refused, which
 * enumerates it. The `preset:` prefix stays out of the key — `:` is what i18next splits a ns on.
 */
const RETARGET_PRESETS: readonly string[] = [
  'walk',
  'run',
  'idle',
  'jump',
  'climb',
  'dive',
  'fall',
  'hurt',
  'shoot',
  'slash',
  'turn',
]

/**
 * What is done TO a model that already exists — their post-process and mesh endpoints, plus the
 * two that rig and the one that retargets. None takes a `model`: the line is the one that made
 * the input, which travels as a task id.
 */
export const PROCESSING: readonly TripoEntry[] = [
  {
    endpoint: 'models/texture',
    name: 'Tripo Texture',
    family: '3d',
    capability: '3d23d',
    lane: 'post-process',
    credits: 20,
    fields: [
      input('mesh', 'tripoFields.sourceModel'),
      { ...PROMPT, key: 'texture_prompt', required: false, labelKey: 'tripoFields.texture_prompt' },
      TEXTURE,
      PBR,
      quality('texture_quality'),
      TEXTURE_ALIGNMENT,
      seed('texture_seed', 'tripoFields.texture_seed'),
    ],
  },
  {
    endpoint: 'models/refine',
    name: 'Tripo Refine',
    family: '3d',
    capability: '3d23d',
    lane: 'post-process',
    credits: 20,
    fields: [
      /**
       * 🛑 A TASK, never a file — measured. Declared `mesh`, the id of an asset was rewritten
       * into a path, the file uploaded, and the token it answered sent under a field wanting a
       * task id: an upload spent, then refused 1004.
       */
      {
        ...input('task', 'tripoFields.sourceTask', 'draft_model_task_id'),
        helpKey: 'tripoFields.sourceTaskHelp',
      },
      quality('geometry_quality'),
      FACE_LIMIT,
    ],
  },
  {
    endpoint: 'models/stylize',
    name: 'Tripo Stylize',
    family: '3d',
    capability: '3d23d',
    lane: 'post-process',
    credits: 10,
    fields: [
      // `original_model_task_id or file_token`, measured.
      input('mesh', 'tripoFields.sourceModel', 'original_model_task_id'),
      {
        key: 'style',
        kind: 'text',
        labelKey: 'tripoFields.style',
        helpKey: 'tripoFields.styleHelp',
        required: true,
      },
    ],
  },
  {
    endpoint: 'models/convert',
    name: 'Tripo Convert',
    family: '3d',
    capability: '3d23d',
    lane: 'post-process',
    credits: 10,
    fields: [
      input('mesh', 'tripoFields.sourceModel'),
      {
        key: 'format',
        kind: 'choice',
        labelKey: 'tripoFields.format',
        required: true,
        default: 'GLTF',
        optionKeys: ['GLTF', 'USDZ', 'FBX', 'OBJ', 'STL', '3MF'].map(value => ({
          value,
          labelKey: `tripoFields.format_${value}`,
        })),
      },
      QUAD,
      FACE_LIMIT,
    ],
  },
  {
    endpoint: 'mesh/segment',
    name: 'Tripo Segment',
    family: '3d',
    capability: '3d23d',
    lane: 'mesh',
    credits: 10,
    fields: [input('mesh', 'tripoFields.sourceModel')],
  },
  {
    endpoint: 'mesh/complete',
    name: 'Tripo Complete',
    family: '3d',
    capability: '3d23d',
    lane: 'mesh',
    credits: 10,
    fields: [input('mesh', 'tripoFields.sourceModel')],
  },
  {
    endpoint: 'mesh/decimate',
    name: 'Tripo Decimate',
    family: '3d',
    capability: '3d23d',
    lane: 'mesh',
    credits: 10,
    fields: [input('mesh', 'tripoFields.sourceModel'), FACE_LIMIT, QUAD],
  },
  {
    endpoint: 'animations/rig',
    name: 'Tripo Rig',
    family: '3d',
    capability: 'rig',
    lane: 'animation',
    // 25, not the 10 their price page quotes — measured on a paid rig, 2026-08-31.
    credits: 25,
    // 🛑 It takes a `model` of ITS OWN — measured: « allowed values: v1.0-20240301, v2.5-20260210 ».
    model: 'v2.5-20260210',
    fields: [
      // Said here rather than nowhere: a rig that does not fit its mesh is only visible once the
      // animation after it has been paid for, and that one costs again.
      { ...input('mesh', 'tripoFields.sourceModel'), helpKey: 'tripoFields.rigSourceHelp' },
      /**
       * 🛑 The skeleton CONVENTION, and the reason a rig came back unusable. Sent nothing, they
       * fall back to their own — bones called `tripo0_Right_Limb_0..9` and seven anonymous
       * `bone_N`, which no retarget of ours can read. `mixamo` names them the standard way.
       */
      {
        key: 'spec',
        kind: 'choice',
        labelKey: 'tripoFields.spec',
        helpKey: 'tripoFields.specHelp',
        required: false,
        default: 'mixamo',
        optionKeys: [
          { value: 'mixamo', labelKey: 'tripoFields.spec_mixamo' },
          { value: 'tripo', labelKey: 'tripoFields.spec_tripo' },
        ],
      },
      /**
       * The topology to rig FOR. `animations/rig-check` answers it for free and this is what it
       * is answered for — a biped walk laid on their default made the character crawl.
       */
      {
        key: 'rig_type',
        kind: 'choice',
        labelKey: 'tripoFields.rig_type',
        helpKey: 'tripoFields.rig_typeHelp',
        required: false,
        default: 'biped',
        optionKeys: TRIPO_RIG_TYPES.map(value => ({
          value,
          labelKey: `tripoFields.rig_type_${value}`,
        })),
      },
      {
        key: 'out_format',
        kind: 'choice',
        labelKey: 'tripoFields.out_format',
        required: false,
        default: 'glb',
        optionKeys: [
          { value: 'glb', labelKey: 'tripoFields.format_GLTF' },
          { value: 'fbx', labelKey: 'tripoFields.format_FBX' },
        ],
        group: ADVANCED_GROUP,
      },
    ],
  },
  {
    endpoint: 'animations/rig-check',
    name: 'Tripo Rig check',
    family: '3d',
    capability: 'rig',
    lane: 'animation',
    credits: 0,
    answersFacts: true,
    fields: [input('mesh', 'tripoFields.sourceModel')],
  },
  {
    endpoint: 'animations/retarget',
    name: 'Tripo Retarget',
    family: '3d',
    capability: 'motion',
    lane: 'animation',
    credits: 10,
    fields: [
      input('mesh', 'tripoFields.sourceRig'),
      {
        key: 'animation',
        kind: 'choice',
        labelKey: 'tripoFields.animation',
        helpKey: 'tripoFields.animationHelp',
        required: true,
        default: 'preset:walk',
        optionKeys: RETARGET_PRESETS.map(preset => ({
          value: `preset:${preset}`,
          labelKey: `tripoFields.animation_${preset}`,
        })),
      },
    ],
  },
]

/**
 * What a picture model is CALLED, spelt as the 3D lines are — `Tripo v3.1 · Image`, never a slug.
 *
 * 🛑 The word after the dot carries its weight and cannot be dropped: THREE picture endpoints
 * serve `img2img`, so the model alone would list `Banana Pro` three times in one picker.
 */
