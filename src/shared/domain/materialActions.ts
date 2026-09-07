import {
  action,
  ENVIRONMENT_FIELDS,
  type ActionField,
  type AssistantAction,
} from './assistantAction'
import { MAX_FIELD_OF_VIEW, MIN_FIELD_OF_VIEW, SKYBOX_VIEWS } from './skybox'
import { PBR_CHANNELS, PREVIEW_SHAPES } from './material'

/**
 * The sky and the material, driven by value.
 *
 * Unlike the image and the montage, both of these keep their state in `shared/` already — a sky is
 * a `SkyboxContent`, a material a `MaterialSettings` — so the closed lists here are IMPORTED
 * rather than written out, and no test has to hold a copy to its original.
 *
 * Angles are in RADIANS, which is what the state holds and what the panels write. The image family
 * takes degrees because a layer carries one angle a person types; these carry several a program
 * computes, and converting them back for every read would be the greater cost.
 */

const NUMBER = (key: string, labelKey: string, min?: number, max?: number): ActionField => ({
  key,
  kind: 'number',
  labelKey,
  required: false,
  ...(min === undefined ? {} : { min }),
  ...(max === undefined ? {} : { max }),
})

export const MATERIAL_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'skybox.state',
    titleKey: 'assistant.actions.skyboxState.title',
    descriptionKey: 'assistant.actions.skyboxState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * How a sky is being LOOKED AT — the projection, the lens, and whether the test objects stand
     * in it. Session state, exactly as `view.setDisplayMode` is in the 3D space: none of it is saved with
     * the document and ⌘Z never touches it.
     */
    name: 'skybox.setViewportOptions',
    titleKey: 'assistant.actions.skyboxSetViewportOptions.title',
    descriptionKey: 'assistant.actions.skyboxSetViewportOptions.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      {
        key: 'view',
        kind: 'choice',
        labelKey: 'assistant.fields.skyboxView',
        required: false,
        options: SKYBOX_VIEWS,
      },
      NUMBER('fieldOfView', 'assistant.fields.fieldOfView', MIN_FIELD_OF_VIEW, MAX_FIELD_OF_VIEW),
      { key: 'probes', kind: 'boolean', labelKey: 'assistant.fields.probes', required: false },
    ],
  }),
  action({
    /**
     * Every dial optional, like `layer.setOpacityBlendAndVisibility`: a client changing the exposure alone must not have
     * to restate a temperature it never read.
     */
    name: 'skybox.adjustImage',
    titleKey: 'assistant.actions.skyboxAdjustImage.title',
    descriptionKey: 'assistant.actions.skyboxAdjustImage.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NUMBER('exposure', 'assistant.fields.exposure'),
      NUMBER('contrast', 'assistant.fields.contrast', 0),
      NUMBER('saturation', 'assistant.fields.saturation', 0),
      NUMBER('temperature', 'assistant.fields.temperature', -1, 1),
      NUMBER('tint', 'assistant.fields.tint', -1, 1),
      NUMBER('rotationY', 'assistant.fields.rotationY'),
      NUMBER('blur', 'assistant.fields.blur', 0, 1),
    ],
  }),
  action({
    name: 'skybox.resetAdjustments',
    titleKey: 'assistant.actions.skyboxResetAdjustments.title',
    descriptionKey: 'assistant.actions.skyboxResetAdjustments.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'skybox.setSun',
    titleKey: 'assistant.actions.skyboxSetSun.title',
    descriptionKey: 'assistant.actions.skyboxSetSun.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NUMBER('elevation', 'assistant.fields.elevation'),
      NUMBER('azimuth', 'assistant.fields.azimuth'),
      NUMBER('intensity', 'assistant.fields.intensity', 0),
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
    ],
  }),
  action({
    name: 'skybox.setPreviewLighting',
    titleKey: 'assistant.actions.skyboxSetPreviewLighting.title',
    descriptionKey: 'assistant.actions.skyboxSetPreviewLighting.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NUMBER('intensity', 'assistant.fields.intensity', 0),
      {
        key: 'showBackground',
        kind: 'boolean',
        labelKey: 'assistant.fields.showBackground',
        required: false,
      },
    ],
  }),
  action({
    name: 'skybox.setSourceImage',
    titleKey: 'assistant.actions.skyboxSetSourceImage.title',
    descriptionKey: 'assistant.actions.skyboxSetSourceImage.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['projectAssetCandidates'],
    fields: [
      {
        key: 'assetId',
        kind: 'text',
        labelKey: 'assistant.fields.assetId',
        required: true,
        reference: 'asset',
      },
    ],
  }),
  action({
    name: 'material.state',
    titleKey: 'assistant.actions.materialState.title',
    descriptionKey: 'assistant.actions.materialState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'material.setSurfaceSettings',
    titleKey: 'assistant.actions.materialSetSurfaceSettings.title',
    descriptionKey: 'assistant.actions.materialSetSurfaceSettings.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      NUMBER('roughness', 'assistant.fields.roughness', 0, 1),
      NUMBER('metalness', 'assistant.fields.metalness', 0, 1),
      // The double handle of the panel: what a map holds, remapped. Identity by default, and
      // written a bound at a time so a client raising a floor keeps the ceiling it never read.
      NUMBER('roughnessMin', 'assistant.fields.roughnessMin', 0, 1),
      NUMBER('roughnessMax', 'assistant.fields.roughnessMax', 0, 1),
      NUMBER('metalnessMin', 'assistant.fields.metalnessMin', 0, 1),
      NUMBER('metalnessMax', 'assistant.fields.metalnessMax', 0, 1),
      NUMBER('normalScale', 'assistant.fields.normalScale'),
      NUMBER('heightScale', 'assistant.fields.heightScale'),
      NUMBER('aoIntensity', 'assistant.fields.aoIntensity', 0),
      NUMBER('edgeIntensity', 'assistant.fields.edgeIntensity', 0),
      { key: 'emissive', kind: 'color', labelKey: 'assistant.fields.emissive', required: false },
      NUMBER('emissiveIntensity', 'assistant.fields.emissiveIntensity', 0),
      NUMBER('tilingX', 'assistant.fields.tilingX'),
      NUMBER('tilingY', 'assistant.fields.tilingY'),
      NUMBER('offsetX', 'assistant.fields.offsetX'),
      NUMBER('offsetY', 'assistant.fields.offsetY'),
      NUMBER('rotation', 'assistant.fields.rotationY'),
      {
        key: 'invertNormalGreen',
        kind: 'boolean',
        labelKey: 'assistant.fields.invertNormalGreen',
        required: false,
      },
    ],
  }),
  action({
    name: 'material.setPreviewDisplay',
    titleKey: 'assistant.actions.materialSetPreviewDisplay.title',
    descriptionKey: 'assistant.actions.materialSetPreviewDisplay.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      NUMBER('envIntensity', 'assistant.fields.intensity', 0),
      NUMBER('envRotation', 'assistant.fields.rotationY'),
      {
        key: 'showBackground',
        kind: 'boolean',
        labelKey: 'assistant.fields.showBackground',
        required: false,
      },
      { key: 'autoSpin', kind: 'boolean', labelKey: 'assistant.fields.autoSpin', required: false },
      { key: 'showSeam', kind: 'boolean', labelKey: 'assistant.fields.showSeam', required: false },
      {
        key: 'shape',
        kind: 'choice',
        labelKey: 'assistant.fields.previewShape',
        required: false,
        options: PREVIEW_SHAPES,
      },
      /**
       * A multiplier OVER the material's own tiling, never written into it: judging a repeat and
       * choosing one are two different acts. One, two or four — the handler refuses the rest,
       * since a bound cannot say « three is not offered ».
       */
      {
        key: 'tilingPreview',
        kind: 'integer',
        labelKey: 'assistant.fields.tilingPreview',
        required: false,
        min: 1,
        max: 4,
      },
    ],
  }),
  action({
    /**
     * The sibling of `world.setSceneLighting`, and it names its sources the same way: a PICTURE by asset
     * id, a sky DOCUMENT by title. A preview judged under a different world than the scene it is
     * headed for is a preview that decided nothing.
     */
    name: 'material.setPreviewEnvironment',
    titleKey: 'assistant.actions.materialSetPreviewEnvironment.title',
    descriptionKey: 'assistant.actions.materialSetPreviewEnvironment.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: ENVIRONMENT_FIELDS,
  }),
  action({
    /**
     * No `assetId` means EMPTY the channel, which is the one thing an optional field can say here
     * that a required one cannot — clearing a map is a real gesture of the panel.
     */
    name: 'material.setChannelImage',
    titleKey: 'assistant.actions.materialSetChannelImage.title',
    descriptionKey: 'assistant.actions.materialSetChannelImage.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'channel',
        kind: 'choice',
        labelKey: 'assistant.fields.pbrChannel',
        required: true,
        options: PBR_CHANNELS,
      },
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: false },
    ],
  }),
  action({
    name: 'styles.list',
    titleKey: 'assistant.actions.stylesList.title',
    descriptionKey: 'assistant.actions.stylesList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * A style is a MATERIAL kept aside, so it is saved from the one in front rather than from
     * values a client would have to restate. The name is a prefix — the studio makes it unique.
     */
    name: 'style.save',
    titleKey: 'assistant.actions.styleSave.title',
    descriptionKey: 'assistant.actions.styleSave.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true }],
  }),
  action({
    name: 'style.rename',
    titleKey: 'assistant.actions.styleRename.title',
    descriptionKey: 'assistant.actions.styleRename.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'styleId', kind: 'text', labelKey: 'assistant.fields.styleId', required: true },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    /**
     * `files` rather than `none`: a style lives outside every project, so nothing in the studio
     * gives it back — not ⌘Z, not the Explorer.
     */
    name: 'style.remove',
    titleKey: 'assistant.actions.styleRemove.title',
    descriptionKey: 'assistant.actions.styleRemove.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'styleId', kind: 'text', labelKey: 'assistant.fields.styleId', required: true },
    ],
  }),
]
