import { SRGBColorSpace, type Texture } from 'three'
import type { SphericalAngles } from '@shared/domain/angles'
import { DEFAULT_FIELD_OF_VIEW, type SkyboxContent, type SkyboxView } from '@shared/domain/skybox'
import { bundledTextureUrl, type CheckerTextureId } from '@shared/domain/checkerTexture'
import { createRefCache, type RefCache } from '../core/refCache'
import { createGpuPipeline, type GpuPipeline } from '../gpu/gpuPipeline'
import { reportFailure } from '@/services/diagnostics'
import { createTextureBinding, type TextureBinding } from '../scene/textureBinding'
import { createTextureCache, type TextureCache, type TextureSource } from '../scene/textureCache'
import { createEnvironment, type ViewportEnvironment } from '../viewport/environment'
import { createTestObjects, type TestObjects } from '../viewport/testObjects'
import { aimAlong } from '../viewport/lookAround'
import { ViewportEngine } from '../viewport/ViewportEngine'
import { createSkySun, type SkySun } from '../scene/skySun'
import { createProjectionPass, type ProjectionPass } from './projectionShader'
import { createSkyboxPointer } from './skyboxPointer'

export type SkyboxRendererOptions = {
  /** A sun dragged in the viewport. The document holds the angles; this only reports them. */
  onSunChange: (angles: SphericalAngles) => void
  loadTexture: TextureSource
  /**
   * When each asset was last written, read off the catalogue by whoever mounts the engine — the
   * same port `SceneRenderer` takes, and for the same reason: a picture edited and saved keeps
   * its id, so nothing here would ever ask for it again. See `refreshSource`.
   */
  assetVersion?: (assetId: string) => string | undefined
  /** What an open editor is drawing of an asset, ahead of its file — see `livePreviews`. */
  livePreview?: (assetId: string) => ImageBitmap | null
}

/** Eye height, so the ground plane reads as a floor rather than as a wall through the camera. */
const EYE_HEIGHT = 1.6

/** How far in front the probes float — clear of the camera, close enough to read. */
const PROBE_DISTANCE = 5

/**
 * The floor's grid. Named here rather than taken from `DEFAULT_CHECKER_TEXTURE`, which a scene
 * may move: only this one holds ONE square, and the floor's tiling counts on it.
 */
const GROUND_TEXTURE: CheckerTextureId = 'gridLarge'

/**
 * A skybox, seen from the inside. The environment is the subject here, not the decor: the
 * camera stands at the centre and the spheres are probes for judging what the sky lights.
 *
 * Nothing it shows is ever written to a file. The source texture goes through one grading pass
 * into a render target, the target feeds both the background and the prefiltered map, and the
 * adjustments stay uniforms all the way to export.
 */
export class SkyboxRenderer {
  private readonly viewport = new ViewportEngine({
    toneMapping: true,
    controls: 'none',
    fieldOfView: DEFAULT_FIELD_OF_VIEW,
    // Drawn over the scene rather than instead of it: `onOverlay` is the one hook that runs with
    // `autoClear` off, and a flat projection is a quad that covers everything behind it anyway.
    onOverlay: () => this.drawProjection(),
  })

  private readonly projection: ProjectionPass = createProjectionPass()
  private readonly probes: TestObjects = createTestObjects({ probeDistance: PROBE_DISTANCE })
  /**
   * The floor's grid, on a cache of its own: `this.cache` keys on an asset id and builds its URL
   * from it, so it cannot ask for a host no project answers on.
   */
  private readonly grid: RefCache<Texture> = createRefCache({
    load: async url => {
      const texture = await this.options.loadTexture(url)
      texture.colorSpace = SRGBColorSpace
      return texture
    },
    free: texture => texture.dispose(),
    onFailure: (url, error) => reportFailure('skybox.probes', url, error),
  })
  /** The same light a SCENE hangs for the sky it names — one description of a sun, not two. */
  private readonly sunLight: SkySun = createSkySun(this.viewport.scene)
  private readonly cache: TextureCache

  /** For the FLAT views alone: they draw a quad to the screen, which grades nothing. */
  private pipeline: GpuPipeline | null = null
  private environment: ViewportEnvironment | null = null

  private look: SphericalAngles = { elevation: 0, azimuth: 0 }
  private sun: SphericalAngles = { elevation: Math.PI / 6, azimuth: 0 }
  private readonly pointer = createSkyboxPointer({
    viewport: this.viewport,
    sun: () => this.sun,
    look: () => this.look,
    onSunChange: sun => this.options.onSunChange(sun),
    onLookChange: look => {
      this.look = look
      this.aimCamera()
    },
  })

  /** What the setting asks for; what is shown is this AND a sky to judge — see `syncProbes`. */
  private probesWanted = true
  private view: SkyboxView = 'immersive'
  /** What the document asks of the backdrop. A flat view turns it off without forgetting it. */
  private backgroundWanted = true
  private sourceAssetId: string | null = null
  /** The one reference this engine holds on a picture, and what settles its races. */
  private readonly source: TextureBinding

  /**
   * What the last `apply` was given. Held by reference rather than copied: an edit replaces the
   * section it touches instead of writing into it (`skybox/commands.ts:31`), so a section that
   * did not move is still the same object — asserted where it is produced, in `commands.test.ts`.
   *
   * Cleared by `mount`, so a renderer that received a document before it had a renderer applies
   * it whole rather than recognising it and doing nothing.
   */
  private applied: SkyboxContent | null = null

  constructor(private readonly options: SkyboxRendererOptions) {
    this.cache = createTextureCache(
      options.loadTexture,
      (assetId, error) => reportFailure('skybox.source', assetId, error),
      options.assetVersion,
      options.livePreview,
    )
    // The reference, the race and the version are all the binding's: written here too, the sky
    // would be the third copy of a rule the studio already keeps in one place.
    this.source = createTextureBinding(this.cache, SRGBColorSpace, texture => {
      // Raw: the grading lives in `ViewportEnvironment` now, which the scene reads too.
      this.environment?.setTexture(texture)
      // On a picture LANDING only — the binding empties the slot first, and prefiltering nothing
      // would throw the map away for the frame between the two.
      if (texture) this.environment?.refresh()
    })
    this.viewport.camera.position.set(0, EYE_HEIGHT, 0)
    this.viewport.scene.add(this.probes.group)
    // Hidden until a sky arrives, and before the first frame rather than after it: `apply` is
    // what reveals them, and a viewport mounted before it would flash the ground for a frame.
    this.probes.setVisible(false)
    void this.dressGround()
  }

  /**
   * The floor's grid, read from beside the app rather than out of the project: nothing a probe
   * wears is ever written to a file, and a sky can be judged with no project open at all.
   */
  private async dressGround(): Promise<void> {
    // `null` covers both the failed read, which the cache has already reported, and the engine
    // disposed while this was in flight — the cache frees what arrives for a holder gone.
    const map = await this.grid.acquire(bundledTextureUrl(GROUND_TEXTURE))
    if (!map) return

    this.probes.setGroundMap(map)
    this.viewport.requestRender()
  }

  mount(host: HTMLElement): void {
    this.viewport.mount(host)

    const renderer = this.viewport.gl
    const canvas = this.viewport.canvas
    if (!renderer || !canvas) return

    this.pipeline = createGpuPipeline(renderer)
    this.environment = createEnvironment(renderer, this.viewport.scene, this.viewport.requestRender)

    this.pointer.mount()

    this.aimCamera()

    // A document applied before the viewport had a renderer reached none of the above. Forgetting
    // what was applied is what makes it land now — `CanvasEngine.mount` carries the same story,
    // and it is the difference between a sky that opens lit and one that opens on its defaults.
    const held = this.applied
    if (held) {
      this.applied = null
      this.apply(held)
    }
  }

  /**
   * The engine holds no truth: everything it shows comes back through here.
   *
   * Each section is skipped when it is the object already applied, as `SceneRenderer.syncNode`
   * skips a node and `CanvasEngine.apply` skips a tree: an edit replaces the one section it
   * touches (`skybox/commands.ts:31`), so the other three come back identical. Unguarded, one
   * frame of the sun's colour re-graded the picture into the 2048×1024 float target.
   */
  apply(content: SkyboxContent): void {
    const previous = this.applied
    this.applied = content

    if (previous?.sun !== content.sun) {
      this.sun = { elevation: content.sun.elevation, azimuth: content.sun.azimuth }
      this.applySun(content)
    }

    const environmentMoved = previous?.environment !== content.environment
    if (environmentMoved) {
      this.environment?.setIntensity(content.environment.intensity)
      this.backgroundWanted = content.environment.showBackground
    }

    const graded = previous?.adjustments !== content.adjustments

    // Before `syncView`, which reads the sky through `syncProbes`, and before `regrade`, which
    // would otherwise grade the picture this call is about to release.
    const skyMoved = this.loadSource(content.source?.assetId ?? null)

    if (environmentMoved || skyMoved) this.syncView()

    // Instant on the picture, prefiltered once the hand settles — see `setAdjustments`.
    if (graded) this.environment?.setAdjustments(content.adjustments)
  }

  setFieldOfView(degrees: number): void {
    this.viewport.setFieldOfView(degrees)
  }

  /**
   * Which of the four ways of looking at the sky is on screen. The three flat ones are one shader
   * over the frame — see `projection-shader` — so nothing about the scene changes but what is
   * worth drawing behind them.
   */
  setView(view: SkyboxView): void {
    if (view === this.view) return
    this.view = view
    this.syncView()
  }

  setProbesVisible(visible: boolean): void {
    this.probesWanted = visible
    this.syncProbes()
    // Hiding them changes nothing a frame is drawn for, and this viewport only draws when asked:
    // without this the spheres stayed on screen until something else moved.
    this.viewport.requestRender()
  }

  /**
   * Shown when the setting asks for them AND there is a sky to judge.
   *
   * Nothing to judge is only half the reason. The other half is that the empty state is the one
   * sentence telling anyone what to do in this space, and it sits over the viewport: a
   * `text-muted` over a lit ground and three spheres does not read at all.
   */
  private syncProbes(): void {
    // Nothing to judge behind a flat projection either: the quad covers them whole.
    const immersive = this.view === 'immersive'
    this.probes.setVisible(immersive && this.probesWanted && this.sourceAssetId !== null)
  }

  /**
   * What the scene is worth drawing under the current view, and what the projection draws over it.
   *
   * The backdrop goes with the flat views on purpose: the quad letterboxes its picture, and the
   * immersive sky showing through the bars would read as part of what is being judged.
   */
  private syncView(): void {
    const immersive = this.view === 'immersive'
    this.syncProbes()
    this.environment?.setBackgroundVisible(immersive && this.backgroundWanted)
    // `immersive` is not a layout: the guard above is what makes the narrowing safe here.
    if (this.view !== 'immersive') this.projection.setLayout(this.view)
    this.viewport.requestRender()
  }

  /** The flat views, drawn after the scene. The immersive one is the scene. */
  private drawProjection(): void {
    const shown = this.environment?.shownTexture() ?? null
    if (this.view === 'immersive' || !this.pipeline || !shown) return

    const canvas = this.viewport.canvas
    this.projection.setFrame(canvas?.clientWidth ?? 0, canvas?.clientHeight ?? 0)
    this.projection.setSource(shown)
    this.pipeline.renderToScreen(this.projection.material)
  }

  dispose(): void {
    this.pointer.dispose()

    this.releaseSource()
    this.cache.dispose()
    this.environment?.dispose()
    this.pipeline?.dispose()
    this.sunLight.dispose()
    this.projection.dispose()
    this.probes.dispose()
    this.grid.dispose()
    this.viewport.dispose()
  }

  /** Whether the sky moved. The fact is decided here, so `apply` reads it rather than guessing. */
  private loadSource(assetId: string | null): boolean {
    if (assetId === this.sourceAssetId) return false

    this.sourceAssetId = assetId
    // Before the binding, not after: it installs `null` on the spot, and the environment has to
    // let go of a texture that is about to be freed.
    if (!assetId) this.environment?.setTexture(null)
    this.source(assetId)

    return true
  }

  /**
   * The picture behind the sky, asked for again when the catalogue says it was rewritten.
   *
   * Costs nothing when nothing moved — the binding compares what it holds before letting go — so
   * this may be called on every read of the shelf, which is what the document does with it.
   */
  refreshSource(): void {
    this.source(this.sourceAssetId)
  }

  private releaseSource(): void {
    this.source(null)
    this.sourceAssetId = null
  }

  private applySun(content: SkyboxContent): void {
    this.sunLight.apply(content.sun)
    this.viewport.requestRender()
  }

  private aimCamera(): void {
    aimAlong(this.viewport.camera, this.look)
    this.viewport.requestRender()
  }
}
