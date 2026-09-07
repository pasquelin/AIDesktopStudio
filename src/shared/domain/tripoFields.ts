import {
  ADVANCED_GROUP,
  SEED_BOUNDS,
  PROMPT_FIELD_KEY,
  type LocalFieldTemplate,
} from './localFields'

export const PROMPT: LocalFieldTemplate = {
  key: PROMPT_FIELD_KEY,
  kind: 'longText',
  labelKey: 'localFields.prompt',
  required: true,
  promptSpark: true,
}

export const NEGATIVE_PROMPT: LocalFieldTemplate = {
  key: 'negative_prompt',
  kind: 'longText',
  labelKey: 'localFields.negativePrompt',
  required: false,
  group: ADVANCED_GROUP,
}

export function input(
  kind: 'image' | 'mesh' | 'raw' | 'task',
  labelKey: string,
  key = 'input',
): LocalFieldTemplate {
  return { key, kind, labelKey, required: true }
}

export function seed(key: string, labelKey: string): LocalFieldTemplate {
  return { key, kind: 'seed', labelKey, required: false, group: ADVANCED_GROUP, ...SEED_BOUNDS }
}

export const TEXTURE: LocalFieldTemplate = {
  key: 'texture',
  kind: 'boolean',
  labelKey: 'tripoFields.texture',
  helpKey: 'tripoFields.textureHelp',
  required: false,
  default: true,
  costImpact: true,
}

/** Documented as overriding `texture` to true, which is why its help says so rather than hiding it. */
export const PBR: LocalFieldTemplate = {
  key: 'pbr',
  kind: 'boolean',
  labelKey: 'tripoFields.pbr',
  helpKey: 'tripoFields.pbrHelp',
  required: false,
  default: true,
  costImpact: true,
}

export function quality(key: 'texture_quality' | 'geometry_quality'): LocalFieldTemplate {
  return {
    key,
    kind: 'choice',
    labelKey: `tripoFields.${key}`,
    required: false,
    default: 'standard',
    optionKeys: [
      { value: 'standard', labelKey: 'tripoFields.qualityStandard' },
      { value: 'detailed', labelKey: 'tripoFields.qualityDetailed' },
    ],
    group: ADVANCED_GROUP,
    costImpact: true,
  }
}

export const FACE_LIMIT: LocalFieldTemplate = {
  key: 'face_limit',
  kind: 'integer',
  labelKey: 'tripoFields.face_limit',
  helpKey: 'tripoFields.face_limitHelp',
  required: false,
  min: 100,
  max: 2_000_000,
  group: ADVANCED_GROUP,
}

export const QUAD: LocalFieldTemplate = {
  key: 'quad',
  kind: 'boolean',
  labelKey: 'tripoFields.quad',
  helpKey: 'tripoFields.quadHelp',
  required: false,
  default: false,
  group: ADVANCED_GROUP,
  costImpact: true,
}

export const SMART_LOW_POLY: LocalFieldTemplate = {
  key: 'smart_low_poly',
  kind: 'boolean',
  labelKey: 'tripoFields.smart_low_poly',
  required: false,
  default: false,
  group: ADVANCED_GROUP,
  costImpact: true,
}

export const GENERATE_PARTS: LocalFieldTemplate = {
  key: 'generate_parts',
  kind: 'boolean',
  labelKey: 'tripoFields.generate_parts',
  helpKey: 'tripoFields.generate_partsHelp',
  required: false,
  default: false,
  group: ADVANCED_GROUP,
  costImpact: true,
}

export const AUTO_SIZE: LocalFieldTemplate = {
  key: 'auto_size',
  kind: 'boolean',
  labelKey: 'tripoFields.auto_size',
  required: false,
  default: false,
  group: ADVANCED_GROUP,
}

export const EXPORT_UV: LocalFieldTemplate = {
  key: 'export_uv',
  kind: 'boolean',
  labelKey: 'tripoFields.export_uv',
  required: false,
  default: true,
  group: ADVANCED_GROUP,
}

export const TEXTURE_ALIGNMENT: LocalFieldTemplate = {
  key: 'texture_alignment',
  kind: 'choice',
  labelKey: 'tripoFields.texture_alignment',
  required: false,
  default: 'original_image',
  optionKeys: [
    { value: 'original_image', labelKey: 'tripoFields.alignmentImage' },
    { value: 'geometry', labelKey: 'tripoFields.alignmentGeometry' },
  ],
  group: ADVANCED_GROUP,
}

export const AUTOFIX: LocalFieldTemplate = {
  key: 'enable_image_autofix',
  kind: 'boolean',
  labelKey: 'tripoFields.enable_image_autofix',
  helpKey: 'tripoFields.enable_image_autofixHelp',
  required: false,
  default: false,
  group: ADVANCED_GROUP,
}

/** Every knob a mesh generation shares, in the order the form reads them. */
export const MESH_KNOBS: readonly LocalFieldTemplate[] = [
  TEXTURE,
  PBR,
  quality('texture_quality'),
  quality('geometry_quality'),
  FACE_LIMIT,
  QUAD,
  SMART_LOW_POLY,
  GENERATE_PARTS,
  AUTO_SIZE,
  EXPORT_UV,
  seed('model_seed', 'tripoFields.model_seed'),
  seed('texture_seed', 'tripoFields.texture_seed'),
]

/**
 * The 3D lines their v3 serves — FOUR, not the five their model page lists: Turbo and v1.4 did
 * not follow the migration. `lane` is what tells a P line from an H one, which is also the two
 * concurrency buckets they are counted in.
 */
