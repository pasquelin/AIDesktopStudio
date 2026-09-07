import { action, ENVIRONMENT_FIELDS, type AssistantAction } from './assistantAction'
import { CAPTURE_QUALITIES } from './sceneCapture'
import {
  BACKGROUND_BLUR,
  BACKGROUND_KINDS,
  DISPLAY_MODES,
  ENV_INTENSITY,
  ENVIRONMENT_PRESETS,
  EXPOSURE,
  FOG_DENSITY,
  FOG_KINDS,
  GROUND_SIZE,
  TONE_MAPPINGS,
  VIEW_DIRECTIONS,
} from './scene'

export const SCENE_WORLD_ACTIONS: readonly AssistantAction[] = [
  /**
   * The two the native menu offers by NAME and no command can: `scene.display` cycles, and
   * cycling to a chosen mode means counting the ones in between.
   */
  action({
    name: 'view.direction',
    titleKey: 'assistant.actions.viewDirection.title',
    descriptionKey: 'assistant.actions.viewDirection.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      {
        key: 'direction',
        kind: 'choice',
        labelKey: 'assistant.fields.viewDirection',
        required: true,
        options: VIEW_DIRECTIONS,
      },
    ],
  }),
  action({
    name: 'view.setDisplayMode',
    titleKey: 'assistant.actions.viewSetDisplayMode.title',
    descriptionKey: 'assistant.actions.viewSetDisplayMode.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      {
        key: 'mode',
        kind: 'choice',
        labelKey: 'assistant.fields.displayMode',
        required: true,
        options: DISPLAY_MODES,
      },
    ],
  }),
  action({
    /**
     * A still of the view, into the project's pictures. The keyboard and the palette take the
     * view's own pixels; the four qualities are the menu's rows, and this is the only door onto
     * the other three.
     *
     * `none` for the reason `command.runStudioCommand scene.capture` already is: the picture lands in the
     * project's own library, which the studio treats as no question asked.
     */
    name: 'scene.capture',
    titleKey: 'assistant.actions.sceneCapture.title',
    descriptionKey: 'assistant.actions.sceneCapture.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'quality',
        kind: 'choice',
        labelKey: 'assistant.fields.captureQuality',
        required: false,
        options: CAPTURE_QUALITIES,
      },
    ],
  }),
  action({
    /**
     * A ready-made world, in one call — the flyout of the environment panel. Each one is a PATCH
     * and leaves what it is not about exactly as it was, so a ground somebody turned on stays on.
     */
    name: 'world.applyPreset',
    titleKey: 'assistant.actions.worldApplyPreset.title',
    descriptionKey: 'assistant.actions.worldApplyPreset.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'preset',
        kind: 'choice',
        labelKey: 'assistant.fields.environmentPreset',
        required: true,
        options: ENVIRONMENT_PRESETS,
      },
    ],
  }),
  /**
   * The half of a 3D document that belongs to no node — what lights it, what hangs behind it,
   * what it stands on. Five actions rather than one, following the sections of the panel that
   * writes them: each of these unions carries its own fields, and a single flat call would offer
   * a density to a linear fog.
   */
  action({
    name: 'world.setSceneLighting',
    titleKey: 'assistant.actions.worldSetSceneLighting.title',
    descriptionKey: 'assistant.actions.worldSetSceneLighting.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      ...ENVIRONMENT_FIELDS,
      {
        key: 'intensity',
        kind: 'number',
        labelKey: 'assistant.fields.intensity',
        required: false,
        min: ENV_INTENSITY.min,
        max: ENV_INTENSITY.max,
      },
      { key: 'rotation', kind: 'number', labelKey: 'assistant.fields.rotationY', required: false },
    ],
  }),
  action({
    name: 'world.setBackground',
    titleKey: 'assistant.actions.worldSetBackground.title',
    descriptionKey: 'assistant.actions.worldSetBackground.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'kind',
        kind: 'choice',
        labelKey: 'assistant.fields.backgroundKind',
        required: true,
        options: BACKGROUND_KINDS,
      },
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      {
        key: 'blur',
        kind: 'number',
        labelKey: 'assistant.fields.blur',
        required: false,
        min: BACKGROUND_BLUR.min,
        max: BACKGROUND_BLUR.max,
      },
    ],
  }),
  action({
    name: 'world.setFog',
    titleKey: 'assistant.actions.worldSetFog.title',
    descriptionKey: 'assistant.actions.worldSetFog.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'kind',
        kind: 'choice',
        labelKey: 'assistant.fields.fogKind',
        required: true,
        options: FOG_KINDS,
      },
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      { key: 'near', kind: 'number', labelKey: 'assistant.fields.near', required: false },
      { key: 'far', kind: 'number', labelKey: 'assistant.fields.far', required: false },
      {
        key: 'density',
        kind: 'number',
        labelKey: 'assistant.fields.fogDensity',
        required: false,
        min: FOG_DENSITY.min,
        max: FOG_DENSITY.max,
      },
    ],
  }),
  action({
    name: 'world.setGroundPlane',
    titleKey: 'assistant.actions.worldSetGroundPlane.title',
    descriptionKey: 'assistant.actions.worldSetGroundPlane.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'visible', kind: 'boolean', labelKey: 'assistant.fields.visible', required: false },
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      {
        key: 'size',
        kind: 'number',
        labelKey: 'assistant.fields.groundSize',
        required: false,
        min: GROUND_SIZE.min,
        max: GROUND_SIZE.max,
      },
      {
        key: 'opacity',
        kind: 'number',
        labelKey: 'assistant.fields.opacity',
        required: false,
        min: 0,
        max: 1,
      },
      {
        key: 'receiveShadow',
        kind: 'boolean',
        labelKey: 'assistant.fields.receiveShadow',
        required: false,
      },
    ],
  }),
  action({
    name: 'world.setLayers',
    titleKey: 'assistant.actions.worldSetLayers.title',
    descriptionKey: 'assistant.actions.worldSetLayers.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'layers',
        kind: 'raw',
        labelKey: 'assistant.fields.worldLayers',
        required: true,
        repeated: true,
      },
    ],
  }),
  action({
    name: 'world.setToneMapping',
    titleKey: 'assistant.actions.worldSetToneMapping.title',
    descriptionKey: 'assistant.actions.worldSetToneMapping.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'toneMapping',
        kind: 'choice',
        labelKey: 'assistant.fields.toneMapping',
        required: false,
        options: TONE_MAPPINGS,
      },
      {
        key: 'exposure',
        kind: 'number',
        // Its own label: this one multiplies what three.js maps down, where `exposure` elsewhere
        // is a count of stops on a grading dial. One sentence for two quantities said neither.
        labelKey: 'assistant.fields.toneExposure',
        required: false,
        min: EXPOSURE.min,
        max: EXPOSURE.max,
      },
    ],
  }),
]
