import { colourFromLinearRgb, linearRgbOf } from '@shared/domain/color'
import {
  MTLX_BASE_COLOR,
  MTLX_DISPLACEMENT,
  MTLX_EMISSION,
  MTLX_EMISSION_COLOR,
  MTLX_METALNESS,
  MTLX_NORMAL,
  MTLX_ROUGHNESS,
  MTLX_SRGB,
  mtlxStudioState,
  type MtlxDocument,
  type MtlxImage,
  type MtlxType,
  type MtlxValue,
  type MtlxWrap,
} from '@shared/domain/materialX'
import {
  DEFAULT_TEXTURE_MATERIAL,
  PBR_CHANNELS,
  type MaterialSettings,
  type PbrChannel,
} from '@shared/domain/material'
import {
  contentOf,
  newMaterial,
  parseMaterial,
  type ChannelSet,
  type MaterialState,
} from './materialState'

/**
 * A material as MaterialX holds one, and back.
 *
 * The split is the sky's: the standard part is what ANOTHER application reads — `standard_surface`
 * fed by `tiledimage` nodes — and the studio's own state rides verbatim in a custom attribute,
 * which the specification requires a reader to preserve. A file of ours reopens from that
 * attribute in one pass; a file from elsewhere is rebuilt from the graph alone.
 *
 * **Two of the eight channels cannot be carried at all**: `standard_surface` has no
 * ambient-occlusion input and no cavity input, checked against the table in `MaterialX.PBRSpec.md`.
 * They ride in the studio attribute and are invisible to every other reader.
 */

/** Which `standard_surface` input each channel feeds. The two absent ones have no slot at all. */
const INPUT_BY_CHANNEL: Partial<Record<PbrChannel, string>> = {
  baseColor: MTLX_BASE_COLOR,
  roughness: MTLX_ROUGHNESS,
  metalness: MTLX_METALNESS,
  normal: MTLX_NORMAL,
  emissive: MTLX_EMISSION_COLOR,
  height: MTLX_DISPLACEMENT,
}

const CHANNEL_BY_INPUT = new Map<string, PbrChannel>(
  Object.entries(INPUT_BY_CHANNEL).map(([channel, input]) => [input, channel as PbrChannel]),
)

/** Which channel a surface input stands for, or `undefined` for one this studio does not write. */
export const channelOfInput = (input: string): PbrChannel | undefined => CHANNEL_BY_INPUT.get(input)

/** `color3` for what was authored as colour, `vector3` for a normal, `float` for the rest. */
function typeOf(channel: PbrChannel): MtlxType {
  if (channel === 'normal') return 'vector3'
  return contentOf(channel) === 'color' ? 'color3' : 'float'
}

export type MtlxMaterialOptions = {
  /**
   * Where each channel's picture sits, relative to the document's own folder — resolved by the
   * window, which alone holds the catalogue. A channel with no path writes no image.
   */
  files: Partial<Record<PbrChannel, string>>
}

const WHITE = '#ffffff'

/** The node a channel passes through, or nothing — only two of the eight have one. */
function wrapFor(channel: PbrChannel, material: MaterialSettings): MtlxWrap | undefined {
  if (channel === 'normal') return { node: 'normalmap', scale: material.normalScale }
  if (channel === 'height') return { node: 'displacement', scale: material.heightScale }
  return undefined
}

function imageFor(channel: PbrChannel, file: string, state: MaterialState): MtlxImage {
  const { material } = state
  const transform = state.channels[channel]?.transform ?? material
  const wrap = wrapFor(channel, material)
  return {
    input: INPUT_BY_CHANNEL[channel] ?? channel,
    type: typeOf(channel),
    file,
    ...(contentOf(channel) === 'color' ? { colorspace: MTLX_SRGB } : {}),
    tiling: [transform.tiling.x, transform.tiling.y],
    offset: [transform.offset.x, transform.offset.y],
    ...(wrap ? { wrap } : {}),
    // The tint the studio multiplies over the base map, written as the `<multiply>` the standard
    // has — carried as a value instead, it would be a colour no other reader applies.
    ...(channel === 'baseColor' && material.color !== WHITE
      ? { multiply: linearRgbOf(material.color) }
      : {}),
  }
}

export function mtlxMaterialOf(state: MaterialState, { files }: MtlxMaterialOptions): MtlxDocument {
  const images: MtlxImage[] = []
  for (const channel of PBR_CHANNELS) {
    const file = files[channel]
    if (!INPUT_BY_CHANNEL[channel] || !state.channels[channel] || !file) continue
    images.push(imageFor(channel, file, state))
  }

  const mapped = new Set(images.map(image => image.input))
  const values: MtlxValue[] = []
  const uniform = (input: string, type: MtlxType, value: number | readonly number[]): void => {
    if (!mapped.has(input)) values.push({ input, type, value })
  }

  const { material } = state
  uniform(MTLX_BASE_COLOR, 'color3', linearRgbOf(material.color))
  uniform(MTLX_ROUGHNESS, 'float', material.roughness)
  uniform(MTLX_METALNESS, 'float', material.metalness)
  uniform(MTLX_EMISSION_COLOR, 'color3', linearRgbOf(material.emissive))
  // The dial rather than a map: `emission` is the scalar `emission_color` is multiplied by, so it
  // is written whether or not a picture feeds the colour beside it.
  values.push({ input: MTLX_EMISSION, type: 'float', value: material.emissiveIntensity })

  return { images, values, studio: { ...state } }
}

const numberAt = (value: MtlxValue | undefined, fallback: number): number =>
  typeof value?.value === 'number' ? value.value : fallback

function colourAt(value: MtlxValue | undefined, fallback: string): string {
  return Array.isArray(value?.value) ? colourFromLinearRgb(value.value) : fallback
}

/**
 * A material read back off its file.
 *
 * A file of ours answers from the studio attribute, which holds the whole state — including the
 * two channels no MaterialX input can carry. Only the pictures are relinked from the standard
 * part, exactly as a sky's are: a material copied into another project keeps ids that name
 * nothing there, while the files beside it are found by path.
 */
export function materialFromMtlx(
  payload: MtlxDocument,
  assetIdOf: (file: string) => string,
): MaterialState {
  const studio = mtlxStudioState(payload)
  const relinked = relinkedChannels(payload, assetIdOf)

  if (Object.keys(studio).length > 0) {
    const held = parseMaterial(studio)
    return { ...held, channels: relinkChannels(held.channels, relinked) }
  }

  return foreignMaterial(payload, relinked)
}

function relinkChannels(stored: ChannelSet, relinked: ChannelSet): ChannelSet {
  const channels = { ...stored }
  for (const channel of PBR_CHANNELS) {
    const fresh = relinked[channel]
    if (!fresh) continue
    const transform = stored[channel]?.transform
    const sampling = stored[channel]?.sampling
    channels[channel] = {
      ...fresh,
      ...(transform ? { transform } : {}),
      ...(sampling ? { sampling } : {}),
    }
  }
  return channels
}

/** The channels the FILE points at, by the path it spells — empty for a picture nothing answers. */
function relinkedChannels(payload: MtlxDocument, assetIdOf: (file: string) => string): ChannelSet {
  const channels: ChannelSet = {}
  for (const image of payload.images) {
    const channel = CHANNEL_BY_INPUT.get(image.input)
    if (!channel) continue
    const assetId = assetIdOf(image.file)
    // Sizes are not in the file: `readChannels` already answers 0 for a channel whose size
    // nothing stated, and the picture itself is what the strip measures.
    if (assetId) channels[channel] = { assetId, origin: 'imported', width: 0, height: 0 }
  }
  return channels
}

/**
 * A material rebuilt from the standard part alone. What MaterialX cannot say is simply absent —
 * the two uncarried channels, the ranges, the green-channel flip and every preview dial keep
 * their defaults rather than a value derived from nothing.
 */
function foreignMaterial(payload: MtlxDocument, channels: ChannelSet): MaterialState {
  const valueOf = (input: string): MtlxValue | undefined =>
    payload.values.find(value => value.input === input)
  const imageOf = (input: string): MtlxImage | undefined =>
    payload.images.find(image => image.input === input)
  const base = imageOf(MTLX_BASE_COLOR)
  const normal = imageOf(MTLX_NORMAL)
  const height = imageOf(MTLX_DISPLACEMENT)
  const fallback = DEFAULT_TEXTURE_MATERIAL
  const tiling = base?.tiling ?? normal?.tiling ?? height?.tiling
  const offset = base?.offset ?? normal?.offset ?? height?.offset
  return {
    ...newMaterial(),
    channels,
    material: {
      ...fallback,
      // A tint the file spells as a `<multiply>` over the base map, and the uniform value when
      // there is no map at all — the two are the same dial read from two legal spellings.
      color: base?.multiply
        ? colourFromLinearRgb(base.multiply)
        : colourAt(valueOf(MTLX_BASE_COLOR), fallback.color),
      roughness: numberAt(valueOf(MTLX_ROUGHNESS), fallback.roughness),
      metalness: numberAt(valueOf(MTLX_METALNESS), fallback.metalness),
      normalScale: normal?.wrap?.scale ?? fallback.normalScale,
      heightScale: height?.wrap?.scale ?? fallback.heightScale,
      emissive: colourAt(valueOf(MTLX_EMISSION_COLOR), fallback.emissive),
      emissiveIntensity: numberAt(valueOf(MTLX_EMISSION), fallback.emissiveIntensity),
      ...(tiling ? { tiling: { x: tiling[0], y: tiling[1] } } : {}),
      ...(offset ? { offset: { x: offset[0], y: offset[1] } } : {}),
    },
  }
}
