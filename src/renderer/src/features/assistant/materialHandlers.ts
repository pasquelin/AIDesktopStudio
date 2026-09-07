import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { HEX_COLOR } from '@shared/domain/color'
import { SKYBOX_VIEWS, type SkyboxContent } from '@shared/domain/skybox'
import { PBR_CHANNELS, type PbrChannel } from '@shared/domain/material'
import type { Command } from '@/engines/core/history'
import {
  resetAdjustments,
  setAdjustment,
  setEnvironmentSetting,
  setSunSetting,
} from '@/engines/skybox/commands'
import { setChannel, setPreview, setMaterialSetting } from '@/engines/material/commands'
import {
  PREVIEW_SHAPES,
  TILING_PREVIEWS,
  type MaterialState,
} from '@/engines/material/materialState'
import { activeMaterialId, activeSkyboxId, useDocuments } from '@/stores/documents'
import { setSkyboxSource, skyboxOf, useSkyboxes } from '@/stores/skyboxes'
import { skyboxViewOf, useSkyboxViews } from '@/stores/skyboxViews'
import { useStyles } from '@/stores/styles'
import { materialOf, useMaterials } from '@/stores/materials'
import { answered, withAsset, type ActionHandlers } from './actionHandler'
import { boolOf, composedNamedOf, namedOf, numberOf, oneOf, textOf } from './actionInputs'
import { environmentFromInput } from './environmentInput'

/**
 * The sky and the material, driven by value.
 *
 * Both engines take one dial at a time, and that is what these hand them: an entry per dial, never
 * wrapped in a gesture. Coalescing merges commands sharing an `id` and keeps the FIRST one's
 * revert, so one entry around three different dials would undo the exposure and leave the blur.
 */

/** What a caller does about it — one sentence per surface, for the sites that answer `wrongSurface`. */
const NO_SKY =
  'the document in front is no sky — documents.list answers what is open and of which kind, and ' +
  'document.activate brings a skybox forward'

const NO_MATERIAL =
  'the document in front is no material — documents.list answers what is open and of which kind, ' +
  'and document.activate brings a material forward'

/** The sky in front and its state, or nothing — which reads as `wrongSurface`. */
function skyOpen(): { documentId: string; state: SkyboxContent } | null {
  const documentId = activeSkyboxId(useDocuments.getState())
  return documentId === null
    ? null
    : { documentId, state: skyboxOf(useSkyboxes.getState(), documentId) }
}

function materialOpen(): { documentId: string; state: MaterialState } | null {
  const documentId = activeMaterialId(useDocuments.getState())
  return documentId === null
    ? null
    : { documentId, state: materialOf(useMaterials.getState(), documentId) }
}

function runSky(
  commands: readonly Command<SkyboxContent>[],
  /** What a caller does when it named nothing this sky could write. */
  nothing: string,
  /** What the call answers, read off the sky AFTER the commands — see `namedOf`. */
  answer?: (state: SkyboxContent) => unknown,
): ActionOutcome {
  const open = skyOpen()
  if (!open) return refused('wrongSurface', NO_SKY)
  if (commands.length === 0) return refused('badInput', nothing)

  for (const command of commands) useSkyboxes.getState().runCommand(open.documentId, command)
  return answered(answer, () => skyboxOf(useSkyboxes.getState(), open.documentId))
}

function runMaterial(
  commands: readonly Command<MaterialState>[],
  /** What a caller does when it named nothing this material could write. */
  nothing: string,
  answer?: (state: MaterialState) => unknown,
): ActionOutcome {
  const open = materialOpen()
  if (!open) return refused('wrongSurface', NO_MATERIAL)
  if (commands.length === 0) return refused('badInput', nothing)

  for (const command of commands) useMaterials.getState().runCommand(open.documentId, command)
  return answered(answer, () => materialOf(useMaterials.getState(), open.documentId))
}

/**
 * The dials a call actually named, each as its own command. Absent means "leave it alone".
 *
 * A table of concrete builders rather than a key and a cast: `setAdjustment<K>` wants a value of
 * `AdjustmentStack[K]`, which no generic hand-off can promise, and the cast that silences it is
 * exactly what would let a renamed dial through.
 */
type Dials<S> = Record<string, (value: number) => Command<S>>

function dialsOf<S>(input: Record<string, unknown>, dials: Dials<S>): Command<S>[] {
  return Object.entries(dials).flatMap(([key, build]) => {
    const value = numberOf(input, key)
    return value === null ? [] : [build(value)]
  })
}

/** The same for a switch, read through the KEY: absent leaves it, present writes it. */
function switchesOf<S>(
  input: Record<string, unknown>,
  switches: Record<string, (value: boolean) => Command<S>>,
): Command<S>[] {
  return Object.entries(switches).flatMap(([key, build]) =>
    input[key] === undefined ? [] : [build(boolOf(input, key))],
  )
}

const ADJUSTMENTS: Dials<SkyboxContent> = {
  exposure: value => setAdjustment('exposure', value),
  contrast: value => setAdjustment('contrast', value),
  saturation: value => setAdjustment('saturation', value),
  temperature: value => setAdjustment('temperature', value),
  tint: value => setAdjustment('tint', value),
  rotationY: value => setAdjustment('rotationY', value),
  blur: value => setAdjustment('blur', value),
}

const adjust = (input: Record<string, unknown>): ActionOutcome =>
  runSky(
    dialsOf(input, ADJUSTMENTS),
    `this call named no dial — it takes ${Object.keys(ADJUSTMENTS).join(', ')}`,
    state => namedOf(input, state.adjustments),
  )

const SUN: Dials<SkyboxContent> = {
  elevation: value => setSunSetting('elevation', value),
  azimuth: value => setSunSetting('azimuth', value),
  intensity: value => setSunSetting('intensity', value),
}

function sun(input: Record<string, unknown>): ActionOutcome {
  const colour = textOf(input, 'color')

  return runSky(
    [
      ...dialsOf(input, SUN),
      // The registry already refuses anything but a hex, so one that arrives here is readable.
      ...(colour !== null && HEX_COLOR.test(colour) ? [setSunSetting('color', colour)] : []),
    ],
    `this call named no dial of the sun — it takes ${Object.keys(SUN).join(', ')}, color`,
    state => namedOf(input, state.sun),
  )
}

function environment(input: Record<string, unknown>): ActionOutcome {
  return runSky(
    [
      ...dialsOf<SkyboxContent>(input, {
        intensity: value => setEnvironmentSetting('intensity', value),
      }),
      ...switchesOf<SkyboxContent>(input, {
        showBackground: value => setEnvironmentSetting('showBackground', value),
      }),
    ],
    'this call named neither "intensity" nor "showBackground"',
  )
}

function readSky(): ActionOutcome {
  const open = skyOpen()
  if (!open) return refused('wrongSurface', NO_SKY)

  return {
    ok: true,
    data: {
      documentId: open.documentId,
      source: open.state.source,
      adjustments: open.state.adjustments,
      sun: open.state.sun,
      environment: open.state.environment,
      // How it is being LOOKED at, which `skybox.view` writes: a client that could write it
      // without reading it back would be half served.
      view: skyboxViewOf(useSkyboxViews.getState(), open.documentId),
      ...(open.state.generation === undefined ? {} : { generation: open.state.generation }),
    },
  }
}

const MATERIAL_DIALS: Dials<MaterialState> = {
  roughness: value => setMaterialSetting('roughness', value),
  metalness: value => setMaterialSetting('metalness', value),
  normalScale: value => setMaterialSetting('normalScale', value),
  heightScale: value => setMaterialSetting('heightScale', value),
  aoIntensity: value => setMaterialSetting('aoIntensity', value),
  edgeIntensity: value => setMaterialSetting('edgeIntensity', value),
  emissiveIntensity: value => setMaterialSetting('emissiveIntensity', value),
  rotation: value => setMaterialSetting('rotation', value),
}

const PREVIEW_DIALS: Dials<MaterialState> = {
  envIntensity: value => setPreview('envIntensity', value),
  envRotation: value => setPreview('envRotation', value),
}

type VectorKey = 'tiling' | 'offset'

const VECTOR_KEYS: readonly VectorKey[] = ['tiling', 'offset']

/** `tiling` and `offset` are one vector each, so a call naming one axis has to carry the other. */
function vectorCommands(
  input: Record<string, unknown>,
  state: MaterialState,
): Command<MaterialState>[] {
  return VECTOR_KEYS.flatMap(key => {
    const x = numberOf(input, `${key}X`)
    const y = numberOf(input, `${key}Y`)
    return x === null && y === null
      ? []
      : [
          setMaterialSetting(key, {
            x: x ?? state.material[key].x,
            y: y ?? state.material[key].y,
          }),
        ]
  })
}

/** Each double handle, and the stem its two fields are named from. */
const RANGES: readonly (readonly ['roughnessRange' | 'metalnessRange', string])[] = [
  ['roughnessRange', 'roughness'],
  ['metalnessRange', 'metalness'],
]

// Each bound held against the other, as `RangeField` holds a drag that ran past its twin: a floor
// above its ceiling is a remap the shader reads and no gesture on screen can undo.
function rangeCommands(
  input: Record<string, unknown>,
  state: MaterialState,
): Command<MaterialState>[] {
  return RANGES.flatMap(([key, stem]) => {
    const min = numberOf(input, `${stem}Min`)
    const max = numberOf(input, `${stem}Max`)
    if (min === null && max === null) return []

    const held = state.material[key]
    return [
      setMaterialSetting(key, {
        min: Math.min(min ?? held.min, max ?? held.max),
        max: Math.max(max ?? held.max, min ?? held.min),
      }),
    ]
  })
}

/** The fields a call named, the two vectors and the two ranges under the stem their axes carry. */
function writtenMaterial(
  input: Record<string, unknown>,
  material: MaterialState['material'],
): Partial<MaterialState['material']> {
  return {
    ...namedOf(input, material),
    ...composedNamedOf(input, material, VECTOR_KEYS, ['X', 'Y']),
    ...composedNamedOf(
      input,
      material,
      RANGES.map(([key]) => key),
      ['Min', 'Max'],
      key => key.replace(/Range$/, ''),
    ),
  }
}

function material(input: Record<string, unknown>): ActionOutcome {
  const open = materialOpen()
  if (!open) return refused('wrongSurface', NO_MATERIAL)

  const colour = textOf(input, 'color')
  const emissive = textOf(input, 'emissive')

  return runMaterial(
    [
      ...dialsOf(input, MATERIAL_DIALS),
      ...vectorCommands(input, open.state),
      ...rangeCommands(input, open.state),
      ...(colour === null ? [] : [setMaterialSetting('color', colour)]),
      ...(emissive === null ? [] : [setMaterialSetting('emissive', emissive)]),
      ...switchesOf<MaterialState>(input, {
        invertNormalGreen: value => setMaterialSetting('invertNormalGreen', value),
      }),
    ],
    `this call named no setting — it takes ${Object.keys(MATERIAL_DIALS).join(', ')}, color, emissive, invertNormalGreen, tilingX, tilingY, offsetX, offsetY, roughnessMin, roughnessMax, metalnessMin, metalnessMax`,
    state => writtenMaterial(input, state.material),
  )
}

function preview(input: Record<string, unknown>): ActionOutcome {
  const shape = oneOf(input, 'shape', PREVIEW_SHAPES)
  // One, two or four: a bound cannot say « three is not offered », so the refusal is here.
  const repeat = oneOf(input, 'tilingPreview', TILING_PREVIEWS)
  if (input.tilingPreview !== undefined && repeat === null)
    return refused('badInput', `"tilingPreview" wants one of: ${TILING_PREVIEWS.join(', ')}`)

  return runMaterial(
    [
      ...dialsOf(input, PREVIEW_DIALS),
      ...switchesOf<MaterialState>(input, {
        showBackground: value => setPreview('showBackground', value),
        autoSpin: value => setPreview('autoSpin', value),
        showSeam: value => setPreview('showSeam', value),
      }),
      ...(shape === null ? [] : [setPreview('shape', shape)]),
      ...(repeat === null ? [] : [setPreview('tilingPreview', repeat)]),
    ],
    `this call named no setting of the preview — it takes ${Object.keys(PREVIEW_DIALS).join(', ')}, showBackground, autoSpin, showSeam, shape, tilingPreview`,
  )
}

/** A preview needs a source: unlike a scene, there is no intensity to set on its own. */
function environmentOf(input: Record<string, unknown>): ActionOutcome | Promise<ActionOutcome> {
  return environmentFromInput(input, environment =>
    environment === null
      ? refused(
          'badInput',
          'a preview is lit by a source, and this call named none — "assetId" for a picture of the library, "sky" for the title of a sky document, or kind "studio" for the room the studio ships',
        )
      : runMaterial(
          [setPreview('environment', environment)],
          'that source wrote nothing on the preview',
        ),
  )
}

// Session state through the store, never a command: how a sky is LOOKED at is not the document,
// exactly as the 3D space's own display mode is not.
function skyboxView(input: Record<string, unknown>): ActionOutcome {
  const open = skyOpen()
  if (!open) return refused('wrongSurface', NO_SKY)

  const view = oneOf(input, 'view', SKYBOX_VIEWS)
  const fieldOfView = numberOf(input, 'fieldOfView')
  const patch = {
    ...(view === null ? {} : { view }),
    ...(fieldOfView === null ? {} : { fieldOfView }),
    ...(input.probes === undefined ? {} : { probes: boolOf(input, 'probes') }),
  }
  if (Object.keys(patch).length === 0)
    return refused(
      'badInput',
      `this call named none of view, fieldOfView, probes — "view" wants one of: ${SKYBOX_VIEWS.join(', ')}`,
    )

  useSkyboxViews.getState().set(open.documentId, patch)
  return { ok: true }
}

function readMaterial(): ActionOutcome {
  const open = materialOpen()
  if (!open) return refused('wrongSurface', NO_MATERIAL)

  return {
    ok: true,
    data: {
      documentId: open.documentId,
      channels: open.state.channels,
      material: open.state.material,
      preview: open.state.preview,
    },
  }
}

/**
 * Fills one channel from the library, or empties it when no asset is named.
 *
 * Through `placeMaterialChannel`, which the drop and the shelf menu already go through: it is the
 * one place that refuses an asset with no local file, and a second way in would be a second answer
 * to that question.
 */
async function channel(input: Record<string, unknown>): Promise<ActionOutcome> {
  const open = materialOpen()
  if (!open) return refused('wrongSurface', NO_MATERIAL)

  const which: PbrChannel | null = oneOf(input, 'channel', PBR_CHANNELS)
  if (!which) return refused('badInput', `"channel" wants one of: ${PBR_CHANNELS.join(', ')}`)

  const assetId = textOf(input, 'assetId')
  if (assetId === null)
    return runMaterial([setChannel(which, null)], `emptying "${which}" wrote nothing`)

  // Loaded on the call rather than imported at the top: this table is evaluated by the first
  // screen, and `eager-graph.test.ts` holds that chunk to reaching no third module out of an
  // editor's folder.
  const { placeMaterialChannel } = await import('@/features/material/components/placeChannel')
  return withAsset(assetId, asset =>
    placeMaterialChannel(open.documentId, asset, which)
      ? { ok: true }
      : refused(
          'badInput',
          `asset "${assetId}" has no file on this machine to fill a channel from — assets.searchProjectCatalogue answers which do, and a generated one has to finish downloading first`,
        ),
  )
}

export const MATERIAL_HANDLERS: ActionHandlers = {
  'skybox.state': readSky,
  'skybox.setViewportOptions': skyboxView,
  'skybox.adjustImage': adjust,
  'skybox.resetAdjustments': () => runSky([resetAdjustments()], 'there was nothing to reset'),
  'skybox.setSun': sun,
  'skybox.setPreviewLighting': environment,

  'skybox.setSourceImage': input => {
    const open = skyOpen()
    if (!open) return refused('wrongSurface', NO_SKY)

    return withAsset(textOf(input, 'assetId') ?? '', asset => {
      // Answers nothing, and refuses in silence for an asset with no local file — the same guard
      // the drop meets. Reading the source back is what tells the two apart.
      setSkyboxSource(open.documentId, asset)
      return skyboxOf(useSkyboxes.getState(), open.documentId).source?.assetId === asset.id
        ? { ok: true }
        : refused(
            'badInput',
            `asset "${asset.id}" has no file on this machine to light a sky from — assets.searchProjectCatalogue answers which do, and a generated one has to finish downloading first`,
          )
    })
  },

  'material.state': readMaterial,
  'material.setSurfaceSettings': material,
  'material.setPreviewEnvironment': environmentOf,
  'material.setPreviewDisplay': preview,
  'material.setChannelImage': channel,

  'styles.list': async () => {
    await useStyles.getState().load()
    return { ok: true, data: useStyles.getState().styles }
  },

  /**
   * From the material in front, never from values a client restates: a style IS a material kept
   * aside, and a second way of building one is a second set of defaults to keep in step.
   */
  'style.save': async input => {
    const open = materialOpen()
    if (!open) return refused('wrongSurface', NO_MATERIAL)

    const name = textOf(input, 'name')
    if (name === null) return refused('badInput', '"name" is wanted — what to keep this look under')

    await useStyles.getState().save(open.state.material, name)
    return { ok: true, data: useStyles.getState().styles }
  },

  'style.rename': async input => {
    const name = textOf(input, 'name')
    const styleId = textOf(input, 'styleId')
    if (name === null || styleId === null)
      return refused(
        'badInput',
        '"styleId" and "name" are both wanted — styles.list answers what is kept here, with their ids',
      )

    await useStyles.getState().rename(styleId, name)
    return { ok: true, data: useStyles.getState().styles }
  },

  'style.remove': async input => {
    const styleId = textOf(input, 'styleId')
    if (styleId === null)
      return refused(
        'badInput',
        '"styleId" is wanted — styles.list answers what is kept here, with their ids',
      )

    await useStyles.getState().remove(styleId)
    return { ok: true, data: useStyles.getState().styles }
  },
}
