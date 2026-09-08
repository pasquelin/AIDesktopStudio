/**
 * Where a texture goes when it leaves the studio.
 *
 * Every engine wants the same eight channels arranged differently — its own file names, its own
 * packing, its own idea of which way a normal's green points. All of that is data here rather
 * than code in the renderer: the recipes are what a test can read, and the main process, which
 * writes the files, has to type what it writes.
 *
 * In `shared/` for the second reason. It holds no three.js and no `fs`.
 */
import { PBR_CHANNELS, type PbrChannel, type ValueRange } from './material'

/** The engines a texture can be handed to, plus the one that hands over nothing but pixels. */
export type MaterialExportTarget = 'gltf' | 'unity' | 'unreal' | 'roblox' | 'raw'

export const MATERIAL_EXPORT_TARGETS: readonly MaterialExportTarget[] = [
  'gltf',
  'unity',
  'unreal',
  'roblox',
  'raw',
]

/** Which of a channel's own components is read. A grey map holds its value on all three. */
type PackComponent = 'r' | 'g' | 'b'

/**
 * One component of an exported picture, read off one channel.
 *
 * `missing` is what lands in the file when the texture has no such channel — expressed as what
 * is **written**, not as what would be read before inverting. An export of a texture with no
 * occlusion has to hold "not occluded" in the slot an engine will read as occlusion, and a
 * recipe that had to reason backwards through its own `invert` would get that wrong once.
 */
type PackSource = {
  channel: PbrChannel
  from: PackComponent
  /** Written as `1 - v`: a roughness an engine wants as smoothness, and back. */
  invert?: true
  missing: number
}

/**
 * One picture an export writes: four components, each read off a channel or held at a constant.
 *
 * Four rather than a list, because a picture is exactly RGBA and a list would allow five.
 */
type ExportPicture = {
  /** Appended to the texture's name — `<name>_BaseColor.png`. */
  suffix: string
  red: PackSource | number
  green: PackSource | number
  blue: PackSource | number
  alpha: PackSource | number
  /**
   * The slot of the material this picture fills, where the target builds one. Only `gltf` does:
   * the four that write a folder hand the file names over and let the engine's importer decide.
   *
   * Named rather than matched on the suffix, so the builder and the recipe cannot drift apart
   * over a rename nothing else would notice.
   */
  role?: MaterialRole
}

/** A slot of a glTF material. `orm` fills the occlusion and metallic-roughness slots at once. */
export type MaterialRole = 'baseColor' | 'normal' | 'orm' | 'emissive'

/** A channel copied as it stands: three components off its own, opaque. */
function copy(channel: PbrChannel, suffix: string): ExportPicture {
  return {
    suffix,
    red: { channel, from: 'r', missing: 0 },
    green: { channel, from: 'g', missing: 0 },
    blue: { channel, from: 'b', missing: 0 },
    alpha: 1,
  }
}

/**
 * A grey channel copied onto all three components. Written on three rather than on red alone
 * because a viewer opening the file reads a grey picture, and an engine sampling `.g` — Unity's
 * occlusion slot does — reads the value rather than nothing.
 */
function grey(channel: PbrChannel, suffix: string, missing: number): ExportPicture {
  const source: PackSource = { channel, from: 'r', missing }
  return { suffix, red: source, green: source, blue: source, alpha: 1 }
}

/**
 * The normal with its green channel flipped — the DirectX convention, which is what Unreal
 * expects on import. Everything the studio derives is OpenGL: `derive-shaders` writes `+y` for
 * green, and `invertNormalGreen` is what answers a map that arrived the other way round.
 */
function flippedNormal(suffix: string): ExportPicture {
  return {
    suffix,
    red: { channel: 'normal', from: 'r', missing: 0.5 },
    green: { channel: 'normal', from: 'g', invert: true, missing: 0.5 },
    blue: { channel: 'normal', from: 'b', missing: 1 },
    alpha: 1,
  }
}

/**
 * Unity, URP Lit. One packed picture rather than three: URP reads metallic on red, occlusion on
 * green and smoothness on alpha, so the same file is assigned to both the metallic and the
 * occlusion slot. Blue is left at zero — URP reads nothing there.
 *
 * Smoothness, not roughness: Unity's slot is the inverse of the studio's channel.
 */
const UNITY: readonly ExportPicture[] = [
  copy('baseColor', '_BaseMap'),
  copy('normal', '_BumpMap'),
  {
    suffix: '_MaskMap',
    red: { channel: 'metalness', from: 'r', missing: 0 },
    green: { channel: 'ao', from: 'r', missing: 1 },
    blue: 0,
    // Absent, a texture is fully rough, which is a smoothness of zero.
    alpha: { channel: 'roughness', from: 'r', invert: true, missing: 0 },
  },
  copy('emissive', '_EmissionMap'),
  grey('height', '_ParallaxMap', 0),
]

/**
 * Occlusion on red, roughness on green, metallic on blue. Unreal's own starter content packs it
 * this way and glTF reads it this way, so the two targets share the object rather than each
 * holding a copy of the one ordering nothing downstream would flag as wrong.
 */
const ORM: ExportPicture = {
  suffix: '_ORM',
  red: { channel: 'ao', from: 'r', missing: 1 },
  green: { channel: 'roughness', from: 'r', missing: 1 },
  blue: { channel: 'metalness', from: 'r', missing: 0 },
  alpha: 1,
}

/** Unreal, whose normal is DirectX. */
const UNREAL: readonly ExportPicture[] = [
  copy('baseColor', '_BaseColor'),
  flippedNormal('_Normal'),
  ORM,
  copy('emissive', '_Emissive'),
  grey('height', '_Height', 0),
]

/**
 * Roblox `SurfaceAppearance`, which takes exactly four maps and no packing. Its normal is read
 * as x, y, z on r, g, b — the OpenGL convention the studio already writes.
 */
const ROBLOX: readonly ExportPicture[] = [
  copy('baseColor', '_ColorMap'),
  copy('normal', '_NormalMap'),
  grey('roughness', '_RoughnessMap', 1),
  grey('metalness', '_MetalnessMap', 0),
]

/** The suffix each channel goes out under when nothing is packed. */
const RAW_SUFFIXES: Record<PbrChannel, string> = {
  baseColor: '_BaseColor',
  normal: '_Normal',
  roughness: '_Roughness',
  metalness: '_Metalness',
  ao: '_AO',
  height: '_Height',
  emissive: '_Emissive',
  edge: '_Edge',
}

/**
 * The channels as they stand, one file each — including the cavity mask, which no engine has a
 * slot for and which is the reason this target exists beside the four that do.
 *
 * "As they stand" is not "as stored": a roughness held as smoothness goes out as roughness,
 * because the file is named for what it holds. `resolvePicture` is where the two meet.
 */
const RAW: readonly ExportPicture[] = PBR_CHANNELS.map(channel =>
  channel === 'baseColor' || channel === 'normal' || channel === 'emissive'
    ? copy(channel, RAW_SUFFIXES[channel])
    : grey(channel, RAW_SUFFIXES[channel], 0),
)

/**
 * glTF, whose metallic-roughness texture holds roughness on green and metallic on blue, and
 * whose occlusion texture is read on red. The same three components as Unreal's ORM, which is
 * where that packing comes from — so one picture fills both slots, and the recipe is shared
 * rather than written twice.
 *
 * No height: glTF has no displacement slot outside an extension, and a map an importer ignores
 * is weight in a file nobody asked to carry. The normal stays OpenGL, which the format states.
 */
const GLTF: readonly ExportPicture[] = [
  { ...copy('baseColor', '_BaseColor'), role: 'baseColor' },
  { ...copy('normal', '_Normal'), role: 'normal' },
  { ...ORM, role: 'orm' },
  { ...copy('emissive', '_Emissive'), role: 'emissive' },
]

/**
 * Everything one target decides, in one place.
 *
 * One record rather than three tables keyed by the same union: two of the three used to be
 * partial or defaulted, so a sixth engine would have compiled while silently inheriting a
 * ceiling and a layout nobody chose for it. Here it fails to compile until all four are stated.
 */
type Target = {
  pictures: readonly ExportPicture[]
  /** A `.glb` embeds its pictures, so it is one file where the others are a folder of them. */
  writesOneFile: boolean
  /**
   * The longest side the target accepts. Roblox refuses a map above 1024, so an export at full
   * resolution would be an export it rejects — the one place where "full resolution" is not the
   * studio's call to make.
   */
  maxSize: number | null
  /**
   * Whether the remap of the material panel is written into the pixels.
   *
   * True for the engines: none of the four formats has a slot for a double handle, so a
   * roughness narrowed to [0.3, 0.7] on screen has to leave narrowed or the file is not the
   * material that was judged. False for `raw`, which means the channels **as stored** — the one
   * target somebody reaches for precisely to get their pixels back untouched.
   */
  bakesRemap: boolean
}

const TARGETS: Record<MaterialExportTarget, Target> = {
  gltf: { pictures: GLTF, writesOneFile: true, maxSize: null, bakesRemap: true },
  unity: { pictures: UNITY, writesOneFile: false, maxSize: null, bakesRemap: true },
  unreal: { pictures: UNREAL, writesOneFile: false, maxSize: null, bakesRemap: true },
  roblox: { pictures: ROBLOX, writesOneFile: false, maxSize: 1024, bakesRemap: true },
  raw: { pictures: RAW, writesOneFile: false, maxSize: null, bakesRemap: false },
}

export function maxSizeOf(target: MaterialExportTarget): number | null {
  return TARGETS[target].maxSize
}

/** Whether the export lands in one file rather than in a folder of pictures. */
export function writesOneFile(target: MaterialExportTarget): boolean {
  return TARGETS[target].writesOneFile
}

/**
 * Which channels a target reads at all — derived from its own recipes rather than listed beside
 * them, so the registry that reports what an export loses cannot drift from what it writes.
 *
 * A channel a recipe only ever falls back to a constant for is NOT in it: `missing` is what lands
 * in the file when the texture has none, which is the opposite of carrying one.
 */
export function channelsWrittenBy(target: MaterialExportTarget): PbrChannel[] {
  const written: PbrChannel[] = []

  for (const picture of TARGETS[target].pictures) {
    for (const component of [picture.red, picture.green, picture.blue, picture.alpha]) {
      if (typeof component !== 'number' && !written.includes(component.channel)) {
        written.push(component.channel)
      }
    }
  }

  return written
}

/** Whether the material panel's remap is written into the pixels rather than lost. */
export function bakesRemap(target: MaterialExportTarget): boolean {
  return TARGETS[target].bakesRemap
}

/**
 * Held under the target's ceiling, keeping the aspect ratio. Not squared, even where the target
 * asks for square: a texture stretched on the way out is a texture that no longer matches the
 * uv it was authored against.
 */
export function boundedSize(
  size: { width: number; height: number },
  max: number | null,
): { width: number; height: number } {
  const longest = Math.max(size.width, size.height)
  if (max === null || longest <= max) return { ...size }

  const scale = max / longest
  // Floored then held at one: a 4096×1 channel would otherwise round its short side to zero,
  // and a frame of no height draws nothing at all.
  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  }
}

/**
 * What a component ends up being, once the texture's own channels have answered.
 *
 * `low` and `high` are the ends the stored value is mixed between: `0 → 1` leaves it alone,
 * `1 → 0` reads it the other way round, and `0.3 → 0.7` is the double handle of the material
 * panel written into the pixels. One expression covers the three, which is the same trick
 * `remapOf` plays for the preview — `mix(1, 0, v)` IS `1 - v`.
 *
 * Not that function itself: it lives in the texture engine, and `shared/` cannot import the
 * renderer. The rule is the one thing the two have to keep saying identically.
 */
export type ResolvedComponent =
  { assetId: string; from: PackComponent; low: number; high: number } | { constant: number }

/** One picture, ready to draw: its file name, and where each of its four components reads. */
export type ResolvedPicture = {
  /** Without extension — the writer decides that, as it does for a scene. */
  name: string
  red: ResolvedComponent
  green: ResolvedComponent
  blue: ResolvedComponent
  alpha: ResolvedComponent
  role?: MaterialRole
}

/** What `resolvePictures` needs to know about a channel, and nothing more. */
type ExportChannel = {
  assetId: string
  /** The pixels read the other way round — a smoothness map stored as roughness. */
  inverted?: true
  /**
   * The normal arrived in the DirectX convention, which is what `invertNormalGreen` says of it.
   *
   * It belongs here rather than staying a render setting: a target asks for a convention, the
   * channel already has one, and the export is the one place the two have to be reconciled.
   * Read on green alone — the other two components mean the same thing either way round.
   *
   * That it lives on the material at all is debt this branch documents rather than moves: the
   * fact is a property of the map, like `inverted` beside it, and `.mtlx` files already written
   * hold it under the material.
   */
  greenFlipped?: true
  /**
   * The window the material panel remaps this channel through — the double handle. Only the two
   * channels that have one carry it, and only a target that bakes the material reads it.
   */
  range?: ValueRange
}

export type ExportChannels = { [C in PbrChannel]?: ExportChannel }

function resolveComponent(
  component: PackSource | number,
  channels: ExportChannels,
  bakesRemap: boolean,
): ResolvedComponent {
  if (typeof component === 'number') return { constant: component }

  const channel = channels[component.channel]
  if (!channel) return { constant: component.missing }

  // Counted rather than chained: three negations can meet on one component — the recipe's, the
  // channel's own, and a normal that arrived flipped — and an odd number of them is one flip.
  // Two that both fired would have written a smoothness map into a slot named roughness, or
  // handed Unreal the OpenGL green it already had, with nothing downstream to say so.
  const flips =
    (component.invert === true ? 1 : 0) +
    (channel.inverted === true ? 1 : 0) +
    (channel.greenFlipped === true && component.from === 'g' ? 1 : 0)

  const range = bakesRemap && channel.range ? channel.range : IDENTITY
  const flipped = flips % 2 === 1

  return {
    assetId: channel.assetId,
    from: component.from,
    low: flipped ? range.max : range.min,
    high: flipped ? range.min : range.max,
  }
}

/** The window that changes nothing, which is what a channel with no remap is read through. */
const IDENTITY: ValueRange = { min: 0, max: 1 }

function readsSomething(picture: ResolvedPicture): boolean {
  return [picture.red, picture.green, picture.blue, picture.alpha].some(
    component => !('constant' in component),
  )
}

/**
 * The files an export writes, in order.
 *
 * A picture whose every component fell back to a constant is dropped: a texture with no
 * occlusion and no metalness would otherwise ship a flat grey `_ORM` that says nothing, and the
 * whole point of the ORM slot is that what is in it was measured.
 */
export function resolvePictures(
  target: MaterialExportTarget,
  channels: ExportChannels,
  name: string,
): ResolvedPicture[] {
  const { pictures, bakesRemap } = TARGETS[target]

  return pictures
    .map(picture => ({
      name: `${name}${picture.suffix}`,
      red: resolveComponent(picture.red, channels, bakesRemap),
      green: resolveComponent(picture.green, channels, bakesRemap),
      blue: resolveComponent(picture.blue, channels, bakesRemap),
      alpha: resolveComponent(picture.alpha, channels, bakesRemap),
      role: picture.role,
    }))
    .filter(readsSomething)
}

/** The assets one picture reads, each once. What the port has to decode before it can draw. */
export function assetsOf(picture: ResolvedPicture): string[] {
  const seen: string[] = []
  for (const component of [picture.red, picture.green, picture.blue, picture.alpha]) {
    if (!('constant' in component) && !seen.includes(component.assetId)) {
      seen.push(component.assetId)
    }
  }
  return seen
}
