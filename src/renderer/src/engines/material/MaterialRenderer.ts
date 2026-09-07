import {
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferGeometry,
  type ColorSpace,
  type Texture,
} from 'three'
import { PBR_CHANNELS, type PbrChannel } from '@shared/domain/material'
import { reportFailure } from '@/services/diagnostics'
import { createTextureBinding, type TextureBinding } from '../scene/textureBinding'
import { createTextureCache, type TextureCache, type TextureSource } from '../scene/textureCache'
import { createSkyBinding, type SkyBinding } from '../viewport/skyBinding'
import { createEnvironment, type ViewportEnvironment } from '../viewport/environment'
import { SCHEME_OF, type NavigationScheme } from '@shared/domain/navigationPreset'
import { ViewportEngine } from '../viewport/ViewportEngine'
import {
  bindUniforms,
  createUniforms,
  EDGE_DEFINE,
  materialFrameOf,
  patchFragment,
  syncEdgeTransform,
} from './materialShader'
import { previewGeometry } from './previewGeometry'
import { DEFAULT_TEXTURE_MATERIAL } from '@shared/domain/material'
import type { EnvironmentRef } from '@shared/domain/scene'
import type { EnvironmentDress } from '@shared/domain/skybox'
import {
  contentOf,
  DEFAULT_PREVIEW,
  slotFor,
  type PreviewShape,
  type MaterialState,
} from './materialState'

export type MaterialRendererOptions = {
  /** Injected: jsdom decodes no image, and the engine is built the same way in both. */
  loadTexture: TextureSource
  /**
   * When each asset was last written, read off the catalogue by whoever mounts the engine — the
   * same port the two other 3D engines take. Without it a channel edited in Images and saved
   * stayed on screen as it was: its id does not move when ⌘S rewrites the file. See `refreshMaps`.
   */
  assetVersion?: (assetId: string) => string | undefined
  /** What an open editor is drawing of an asset, ahead of its file — see `livePreviews`. */
  livePreview?: (assetId: string) => ImageBitmap | null
  /**
   * What the ENVIRONMENT a preview names is worth to it. Synchronous, like `assetVersion`: the
   * window answers from the open tab or the copy read off disk. Absent, the studio lights it.
   */
  environmentDress?: (environment: EnvironmentRef) => EnvironmentDress | null
}

/** Radians per second of auto spin — slow enough to read a normal map, fast enough to see. */
const SPIN_RATE = 0.35

/** Where the camera opens, and where framing puts it back. Slightly above, so the top reads. */
const CAMERA_HOME = { x: 0, y: 0.6, z: 3.2 }

/**
 * A texture on a shape, under light. The subject is the material, so the viewport orbits it and
 * the environment is what makes it legible: a roughness judged under a flat lamp is not judged.
 *
 * It holds no truth of its own. Everything it shows comes back through `apply`, which is what
 * lets a document be reopened six months later and look the same.
 */
export class MaterialRenderer {
  private readonly viewport = new ViewportEngine({
    toneMapping: true,
    onFrame: delta => this.spin(delta),
    scheme: () => this.scheme,
  })

  /**
   * Which application the preview is turned like. It shows ONE object centred, so it never wants
   * a pivot of its own — but a person who orbits the scene on the middle button expects the same
   * here, and two rules in one window is what the setting's help promises it is not.
   */
  private scheme: NavigationScheme = SCHEME_OF.studio

  setNavigationScheme(scheme: NavigationScheme): void {
    this.scheme = scheme
  }

  private readonly material = new MeshStandardMaterial()
  private readonly mesh = new Mesh(previewGeometry('sphere', false), this.material)
  private readonly cache: TextureCache

  private environment: ViewportEnvironment | null = null

  /**
   * Per channel, the asset the document last pointed it at — what a refresh asks for again. The
   * REFERENCE is the binding's, not this map's.
   *
   * Keyed by channel rather than by slot because the cavity mask has no slot at all, and the
   * colour space is a function of the channel — held as a second field it was free to disagree
   * with `spaceOf` and leave a texture alive for the rest of the session.
   */
  private readonly wanted = new Map<PbrChannel, string | null>()
  /** One reference per channel, and what settles their races — see `texture-binding`. */
  private readonly bindings = new Map<PbrChannel, TextureBinding>()
  private readonly uniforms = createUniforms()
  /** What the maps are currently placed on, so a map arriving late is placed on the same thing. */
  private transform: MapTransform = DEFAULT_TRANSFORM
  /** Anchors already reported, so a rebuilt program does not say the same thing again. */
  private readonly reported = new Set<string>()
  private shape: PreviewShape = 'sphere'
  private displaced = false
  private spinning = false
  private readonly sky: SkyBinding

  /** What the environment a preview names is worth to it — resolved by the window, never here. */
  private readonly environmentDress: MaterialRendererOptions['environmentDress']
  /** What the preview was last lit ON. `undefined` until a first apply, so `null` is an answer. */
  private lit: EnvironmentDress | null | undefined
  /** What the document NAMES, so a sky edited elsewhere can be resolved again — see `lightAgain`. */
  private named: EnvironmentRef | null = null
  /** The preview's own dial, which the sky's strength rides under — see `applyEnvironment`. */
  private envIntensity = 1

  constructor(options: MaterialRendererOptions) {
    this.environmentDress = options.environmentDress
    this.cache = createTextureCache(
      options.loadTexture,
      (assetId, error) => reportFailure('material.map', assetId, error),
      options.assetVersion,
      options.livePreview,
    )
    this.sky = createSkyBinding(this.cache, () => this.paintBackground())
    // One per channel, built with the cache and never after: the reference, the race and the
    // version they carry are the binding's business, not this engine's.
    for (const channel of PBR_CHANNELS) {
      this.bindings.set(
        channel,
        createTextureBinding(this.cache, spaceOf(channel), map => this.install(channel, map)),
      )
    }
    this.viewport.camera.position.set(CAMERA_HOME.x, CAMERA_HOME.y, CAMERA_HOME.z)
    this.viewport.scene.add(this.mesh)

    // Bound once on the material, not per compile: three hands the hook a fresh uniform object
    // each time the program is rebuilt, and the engine's values have to survive that.
    this.material.onBeforeCompile = shader => {
      const { source, missing } = patchFragment(shader.fragmentShader)
      shader.fragmentShader = source
      bindUniforms(shader.uniforms, this.uniforms)

      // Once per anchor per engine, and the `Set` is what makes that true: a program is rebuilt
      // whenever a channel is filled, and a repeated report would bury the journal. A remap that
      // quietly stopped applying is a slider that looks alive and does nothing.
      for (const anchor of missing) {
        if (this.reported.has(anchor)) continue
        this.reported.add(anchor)
        reportFailure('material.shader', anchor, new Error(`three no longer ships ${anchor}`))
      }
    }
  }

  mount(host: HTMLElement): void {
    this.viewport.mount(host)

    const renderer = this.viewport.gl
    if (!renderer) return

    this.environment = createEnvironment(renderer, this.viewport.scene, this.viewport.requestRender)
    this.environment.setStudio()
    // The studio preset has no picture behind it, so the backdrop is the viewport's own colour.
    this.paintBackground()
  }

  /** The engine holds no truth: everything it shows comes back through here. */
  apply(texture: MaterialState): void {
    this.applyGeometry(texture)
    this.transform = applyMaterial(texture, this.material, this.uniforms, this.transform)
    this.applyChannels(texture)
    void this.applyEnvironment(texture)
    this.viewport.requestRender()
  }

  dispose(): void {
    // Emptied rather than only given back: a material left pointing at a freed texture is one the
    // next frame would still try to draw with.
    for (const bind of this.bindings.values()) bind(null)
    this.wanted.clear()
    this.sky.release()
    this.cache.dispose()

    this.mesh.geometry.dispose()
    this.material.dispose()
    this.environment?.dispose()
    this.viewport.dispose()
  }

  private spin(delta: number): boolean {
    if (!this.spinning) return false
    this.mesh.rotation.y += SPIN_RATE * delta
    return true
  }

  private applyGeometry({ preview, material }: MaterialState): void {
    const displaced = material.heightScale > 0
    if (preview.shape === this.shape && displaced === this.displaced) return

    this.shape = preview.shape
    this.displaced = displaced

    const geometry: BufferGeometry = previewGeometry(preview.shape, displaced)
    // Replaced rather than mutated, and the old one freed here: a geometry left behind holds its
    // buffers on the GPU until the context goes.
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }

  private applyChannels(texture: MaterialState): void {
    for (const [channel, bind] of this.bindings) {
      const asked = texture.channels[channel]?.assetId ?? null
      this.wanted.set(channel, asked)
      bind(asked)
    }
  }

  /**
   * Every channel asks again for the picture it holds, and reloads the ones the catalogue says
   * were rewritten since — a channel edited in Images and saved, which is the whole reason the
   * "Edit the picture" row exists.
   *
   * Costs nothing when nothing moved: a binding compares what it holds before letting go.
   */
  refreshMaps(): void {
    for (const [channel, asked] of this.wanted) this.bindings.get(channel)?.(asked)
    void this.sky.refresh()
  }

  /**
   * The camera back where it opened. The TARGET as well as the position: an orbit panned with
   * the middle button aims elsewhere, and putting only the camera back shows the same void.
   */
  resetView(): void {
    this.viewport.camera.position.set(CAMERA_HOME.x, CAMERA_HOME.y, CAMERA_HOME.z)
    const orbit = this.viewport.orbit
    if (orbit) {
      orbit.target.set(0, 0, 0)
      orbit.update()
    }
    this.viewport.requestRender()
  }

  /**
   * Takes no state: decoding a 4K picture runs for hundreds of milliseconds, and the state that
   * started the load is stale by the time it resolves — reapplying it snapped every other map back
   * to the tiling the user had already left.
   */
  private install(channel: PbrChannel, map: Texture | null): void {
    if (!map) return this.clear(channel)

    // Upload-time state, set before the first render rather than on every frame: changing either
    // of these later would cost a full re-upload of the pixels.
    map.wrapS = RepeatWrapping
    map.wrapT = RepeatWrapping
    map.center.set(0.5, 0.5)
    placeMap(map, this.transform)

    const slot = slotFor(channel)
    if (slot) this.material[slot] = map
    else this.setEdgeMap(map)

    // A channel going from empty to filled changes the shader program itself.
    this.material.needsUpdate = true
    syncEdgeTransform(this.uniforms)
    this.viewport.requestRender()
  }

  /** A channel emptied: its slot cleared, or the cavity mask unbound where it has no slot. */
  private clear(channel: PbrChannel): void {
    const slot = slotFor(channel)
    if (!slot) {
      this.setEdgeMap(null)
      return
    }

    if (this.material[slot] === null) return
    this.material[slot] = null
    this.material.needsUpdate = true
  }

  /**
   * The define, not just the uniform: an unbound sampler is undefined behaviour on some drivers,
   * so the cavity code has to be absent from the program rather than merely inert.
   */
  private setEdgeMap(map: Texture | null): void {
    if (this.uniforms.edgeMap.value === map) return
    this.uniforms.edgeMap.value = map

    const defines = this.material.defines ?? {}
    if (map) {
      defines[EDGE_DEFINE] = ''
      // `vUv` exists only where something asks for it, and no slot asks on this mask's behalf.
      defines.USE_UV = ''
    } else {
      delete defines[EDGE_DEFINE]
      delete defines.USE_UV
    }

    this.material.defines = defines
    this.material.needsUpdate = true
  }

  private async applyEnvironment({ preview }: MaterialState): Promise<void> {
    const environment = this.environment
    this.named = preview.environment
    this.envIntensity = preview.envIntensity
    if (!environment) return

    // Held by IDENTITY, which `environmentDressOf` makes stable: this runs on every value a drag
    // emits, and `sky.apply` allocates a promise before it can decide there is nothing to do.
    const dress = this.environmentDress?.(preview.environment) ?? null
    // The sky's own strength rides UNDER the preview's, exactly as it does under a scene's.
    environment.setIntensity(preview.envIntensity * (dress?.intensity ?? 1))
    environment.setRotation(preview.envRotation)
    environment.setBackgroundVisible(preview.showBackground)
    // On the edge only: `apply` runs on every value a drag emits, and restarting the clock there
    // leaves the spin the time since the last slider value instead of since the last frame.
    if (preview.autoSpin && !this.spinning) this.viewport.resetClock()
    this.spinning = preview.autoSpin

    if (dress === this.lit) return
    this.lit = dress

    await this.sky.apply(environment, dress)
  }

  /**
   * The sky it names says the preview is lit again — its picture, its sun or its strength moved,
   * and what the document names did not.
   */
  lightAgain(): void {
    const environment = this.environment
    const dress = this.named ? (this.environmentDress?.(this.named) ?? null) : null
    if (!environment || dress === this.lit) return

    this.lit = dress
    environment.setIntensity(this.envIntensity * (dress?.intensity ?? 1))
    void this.sky.apply(environment, dress)
  }

  /** The backdrop, unless a sky is hanging behind the subject — in which case the sky is it. */
  private paintBackground(): void {
    if (this.sky.showsSky()) return
    this.viewport.setBackgroundColor(this.viewport.paletteToken('--color-viewport'))
  }
}

type MaterialUniforms = ReturnType<typeof createUniforms>

function applyMaterial(
  state: MaterialState,
  rendered: MeshStandardMaterial,
  uniforms: MaterialUniforms,
  transform: MapTransform,
): MapTransform {
  const { material } = state
  rendered.color.set(material.color)
  rendered.roughness = material.roughness
  rendered.metalness = material.metalness
  const frame = materialFrameOf(state)
  uniforms.roughnessRemap.value.set(frame.roughnessRemap.x, frame.roughnessRemap.y)
  uniforms.metalnessRemap.value.set(frame.metalnessRemap.x, frame.metalnessRemap.y)
  uniforms.edgeIntensity.value = frame.edgeIntensity
  rendered.normalScale.set(
    material.normalScale,
    material.invertNormalGreen ? -material.normalScale : material.normalScale,
  )
  rendered.displacementScale = material.heightScale
  rendered.aoMapIntensity = material.aoIntensity
  rendered.emissive.set(material.emissive)
  rendered.emissiveIntensity = material.emissiveIntensity
  return applyTransform(transform, state, rendered, uniforms)
}

function applyTransform(
  current: MapTransform,
  { material, preview }: MaterialState,
  rendered: MeshStandardMaterial,
  uniforms: MaterialUniforms,
): MapTransform {
  const seamShift = seamShiftOf(preview)
  if (samePlacement(current, material, preview.tilingPreview, seamShift)) return current
  const { tiling, offset, rotation } = material
  const next = { tiling, offset, rotation, tilingPreview: preview.tilingPreview, seamShift }
  for (const map of mapsOf(rendered, uniforms)) placeMap(map, next)
  syncEdgeTransform(uniforms)
  return next
}

/** Every texture this material shows, the cavity mask included — it is not in a slot. */
function* mapsOf(material: MeshStandardMaterial, uniforms: MaterialUniforms): Generator<Texture> {
  for (const channel of PBR_CHANNELS) {
    const slot = slotFor(channel)
    const map = slot ? material[slot] : uniforms.edgeMap.value
    if (map) yield map
  }
}

/** Places the material transform and preview frame onto one texture. */
function placeMap(map: Texture, transform: MapTransform): void {
  const { tiling, offset, rotation, tilingPreview, seamShift } = transform
  map.repeat.set(tiling.x * tilingPreview, tiling.y * tilingPreview)
  map.offset.set(offset.x + seamShift, offset.y + seamShift)
  map.rotation = rotation
}

/**
 * A colour channel is authored in sRGB and has to be decoded; a data channel must not be, or the
 * normals wash out and the roughness lightens.
 *
 * Which is which comes from the domain rather than from a test on the id here: it was
 * `channel === 'baseColor'`, and `emissive` — a colour map, read as one by three — fell on the
 * wrong side and came out dark and desaturated.
 */
function spaceOf(channel: PbrChannel): ColorSpace {
  return contentOf(channel) === 'color' ? SRGBColorSpace : NoColorSpace
}

/**
 * How every map is laid on the shape: what the material decided, and what the view adds on top.
 * The two are kept apart right up to `placeMap` — a preview that wrote into the material would
 * send a texture out into a scene tiled four times over, and offset by half.
 */
type MapTransform = Pick<MaterialState['material'], 'tiling' | 'offset' | 'rotation'> & PreviewFrame

/** What the view adds, on top of what the material decided. */
type PreviewFrame = { tilingPreview: number; seamShift: number }

const SEAM_SHIFT = 0.5

/** Half a width and half a height is exactly what brings a wrap edge to the middle. */
function seamShiftOf({ showSeam }: MaterialState['preview']): number {
  return showSeam ? SEAM_SHIFT : 0
}

/** Where every map starts, so one arriving before the first `apply` is still placed on something. */
const DEFAULT_TRANSFORM: MapTransform = {
  ...DEFAULT_TEXTURE_MATERIAL,
  tilingPreview: DEFAULT_PREVIEW.tilingPreview,
  seamShift: seamShiftOf(DEFAULT_PREVIEW),
}

function samePlacement(
  current: MapTransform,
  material: MaterialState['material'],
  tilingPreview: number,
  seamShift: number,
): boolean {
  return (
    current.rotation === material.rotation &&
    current.tiling.x === material.tiling.x &&
    current.tiling.y === material.tiling.y &&
    current.offset.x === material.offset.x &&
    current.offset.y === material.offset.y &&
    current.tilingPreview === tilingPreview &&
    current.seamShift === seamShift
  )
}
