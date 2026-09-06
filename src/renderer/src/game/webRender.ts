import type { ClipSource } from '@shared/domain/scene'
import type { AnimationPort } from '@game/ports/animationPort'
import {
  Box3,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { clamp } from '@shared/numeric'
import type { AssetPort } from '@game/ports/assetPort'
import type { CameraView, EntityPlacement, RenderPort } from '@game/ports/renderPort'
import { sameVector3 } from '@shared/domain/transform'
import { applyToneMapping } from '@/engines/scene/worldBinding'
import { applyShadowPolicy, throwsOf, tuneShadowMaps } from '@/engines/scene/shadows'
import type { ShadowThrow } from '@/engines/scene/grouping'
import { frameOwesDraw, frameOwesShadows } from './gameSceneFrame'
import { pixelRatioFor, shadowMapSizeFor } from '@/engines/scene/viewportQuality'
import {
  DEFAULT_RENDER_POLICY,
  VIEW_DISTANCE,
  type RenderPolicy,
} from '@shared/domain/renderPolicy'
import type { SceneState } from '@/engines/scene/sceneState'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import type { CompiledModelMesh, CompiledSceneOptimization } from '@shared/domain/gameExport'
import { buildGameScene, type GameScene } from './gameScene'
import { createGltfSource } from '@/engines/scene/gltfSource'
import { SECOND, type Us } from '@shared/domain/time'
import { stackDraws } from '@shared/domain/postProcessing'
import { loadLutFrom } from '@/engines/postfx/lutSource'
import type { PostComposer } from '@/engines/postfx/PostComposer'

export type WebRender = RenderPort & {
  /** Puts another scene on. What a `game.scene.load` lands as, outside the studio. */
  show: (
    state: SceneState,
    optimization?: CompiledSceneOptimization,
    modelAssets?: Readonly<Record<string, readonly CompiledModelMesh[]>>,
    heightmaps?: ReadonlyMap<string, HeightmapSamples>,
    clipsForNode?: (nodeId: string) => readonly ClipSource[],
  ) => Promise<void>
  resize: (width: number, height: number) => void
  draw: () => void
  seek: (time: Us) => void
  /** The mixers a state machine writes through — the scene on screen holds them. */
  animation: AnimationPort
  dispose: () => void
}

const NEAR = 0.1

/**
 * What draws a game in a browser page — the whole of the studio's viewport that a game needs.
 *
 * 🛑 One `apply`-free port: outside the studio nothing edits, so the scene is built once per
 * load and only the entity poses move. That is what makes an exported frame cheap.
 */
export function createWebRender(
  canvas: HTMLCanvasElement,
  assets: AssetPort,
  /** What the author saw. An older export carries less, or nothing: the defaults fill the rest. */
  carried: Partial<RenderPolicy> = {},
): WebRender {
  const policy: RenderPolicy = { ...DEFAULT_RENDER_POLICY, ...carried }
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  const gltf = createGltfSource(() => renderer)
  applyShadowPolicy(renderer, policy)
  const camera = new PerspectiveCamera(policy.fieldOfView, 1, NEAR, VIEW_DISTANCE)
  const veil = veilPass()
  const sized = { width: 0, height: 0 }
  let aimed = false
  let held: GameScene | null = null
  /** The canvas differs from the next frame for a reason the scene cannot see: size, lens, veil. */
  let pictureStale = true
  let cast: ShadowThrow | null = null
  const aim = new Vector3()
  /** 🛑 Dynamic: its three.js passes are weight every game without effects would carry for nothing. */
  const chain = composerHold(renderer, assets)
  /** Seconds, off the game's own clock: grain and tape jitter advance on it, never on a wall. */
  let played = 0
  let sought: Us | null = null
  // 🛑 Which build the picture belongs to: a scene arriving while another is still being cut would
  // otherwise have the slower one land on top of it, and the faster one disposed under the draw.
  let building = 0
  const posed = new Set<string>()

  return {
    show: async (state, optimization, modelAssets, heightmaps, clipsForNode) => {
      const mine = (building += 1)
      const built = await buildGameScene(
        state,
        assets,
        optimization,
        modelAssets,
        gltf.load,
        heightmaps,
        clipsForNode,
      )
      if (mine !== building) {
        built.dispose()
        return
      }

      held?.dispose()
      held = built
      pictureStale = true
      // A head the scene that left had already seen: the one that arrived has not.
      sought = null
      applyToneMapping(renderer, built.world.toneMapping, built.world.exposure)
      // 🛑 A framing to fall back on: `view(null)` means « flown by hand », which in the studio
      // leaves the viewport's own camera and here would leave one at the origin looking at itself.
      if (!aimed) frameAll(camera, built.scene)
      // Last, and never fatal: a chain that fails to arrive leaves a scene drawn ungraded, where
      // a throw here would leave a page showing nothing at all.
      if (stackDraws(built.world.post)) {
        await chain.load()
        pictureStale = true
      }
      if (mine !== building) return

      // 🛑 What the scene that just left was drawn through: kept, a chain holds two full-screen
      // targets, and a game moving between N shapes of stack would hold N of them until the page
      // closed — the editor sweeps for the same reason on every view it drops.
      chain.current()?.sweep([built.world.post])
    },

    // What each pose moved is settled by `flush`, on the frame: a game hands over every entity
    // of the world on every frame, moving or not, and the scene alone knows which ones stood still.
    place: (placements: readonly EntityPlacement[]) => {
      if (!held) return
      for (const placement of placements) held.place(placement.entity, placement.transform)
    },

    view: (view: CameraView | null) => {
      // Dropped when it has not MOVED, as the studio drops it; `aim` is what it last looked at.
      if (!view) return
      const moved = aimCamera(camera, aim, view, view.fieldOfView ?? policy.fieldOfView)
      if (!moved && aimed) return
      aimed = true
      pictureStale = true
    },

    veil: amount => {
      const wanted = clamp(amount, 0, 1)
      if (wanted === veil.material.opacity) return
      veil.material.opacity = wanted
      pictureStale = true
    },

    animation: {
      pose: (entity, clips) => {
        posed.add(entity)
        held?.pose(entity, clips)
      },
      release: entity => {
        posed.delete(entity)
        held?.releasePose(entity)
      },
      // 🛑 Cleared with the scene it belonged to: a swap builds another one, and a body posed on
      // the scene just thrown away is nobody's to give back.
      releaseAll: () => {
        for (const entity of posed) held?.releasePose(entity)
        posed.clear()
      },
      lengths: entity => held?.clipLengthsOf(entity) ?? {},
    },

    seek: time => {
      // 🛑 On a head that MOVED, and only then: an exported frame seeks on every tick of its
      // clock, so a paused game would have posed and owed a depth pass sixty times a second.
      if (time === sought) return

      sought = time
      played = time / SECOND
      held?.seek(time)
    },

    // 🛑 Only when it CHANGED: `setSize` reassigns `canvas.width`, which reallocates and clears
    // the framebuffer — sixty times a second at a size nobody touched.
    resize: (width, height) => {
      if (width === sized.width && height === sized.height) return

      sized.width = width
      sized.height = height
      // What the quality level pays for, held to the screen's own — the editor's very rule. The
      // whole device ratio was four times the pixels of a `performance` viewport, unasked.
      renderer.setPixelRatio(
        Math.min(pixelRatioFor(policy.quality), globalThis.devicePixelRatio ?? 1),
      )
      renderer.setSize(width, height, false)
      camera.aspect = height === 0 ? 1 : width / height
      camera.updateProjectionMatrix()
      pictureStale = true
    },

    draw: () => {
      if (!held) return

      let settled = held.flush(camera, cast)
      // On the frame the scene lands, and again whenever a caster or a light left its frustum.
      if (settled.reframed && policy.shadows) {
        cast = tuneSceneShadows(held, policy)
        if (held.flush(camera, cast).zoned) settled = { ...settled, zoned: true }
      }
      // 🛑 Nothing changed, nothing drawn — the canvas keeps the frame it shows, as the viewport at
      // rest. A composed frame is drawn regardless: its grain and jitter run on the clock.
      const composer = chain.current()
      const composed = composer !== null && stackDraws(held.world.post)
      if (!composed && !frameOwesDraw(settled, pictureStale)) return
      // Which maps the pass draws was settled per light by `flush`; this is whether it runs.
      renderer.shadowMap.needsUpdate = frameOwesShadows(settled)
      pictureStale = false
      paintHeld(renderer, held, camera, composer, policy, sized, played, veil)
    },

    dispose: () => {
      // The build in flight with it: what it lands on has just been thrown away.
      building += 1
      held?.dispose()
      held = null
      veil.dispose()
      chain.dispose()
      gltf.dispose()
      renderer.dispose()
    },
  }
}

/**
 * The one composer a page ever builds, held as its PROMISE: two scenes landing together read a
 * null `current` before either had awaited one, and built two.
 *
 * 🛑 A failure is nothing, never a throw: `show` is awaited by the page's startup, so a chunk that
 * never arrives showed no game at all. The rejected promise is dropped, so a later scene retries.
 * A composer that lands after `dispose` is dropped too, rather than kept on a renderer that went.
 */
function composerHold(renderer: WebGLRenderer, assets: AssetPort) {
  let held: PostComposer | null = null
  let loading: Promise<PostComposer> | null = null

  return {
    current: () => held,
    load: async (): Promise<void> => {
      const mine = (loading ??= composerFor(renderer, assets))
      try {
        const built = await mine
        // Still the load in flight, or `dispose` ran meanwhile and the renderer it was built on went.
        if (loading === mine) held = built
        else built.dispose()
      } catch {
        loading = null
      }
    },
    dispose: () => {
      held?.dispose()
      held = null
      loading = null
    },
  }
}

/** The editor's own composer, on a game's assets: an effect cannot differ between the two. */
async function composerFor(renderer: WebGLRenderer, assets: AssetPort): Promise<PostComposer> {
  const { PostComposer: Composer } = await import('@/engines/postfx/PostComposer')
  return new Composer(renderer, {
    loadLut: async assetId => {
      const url = assets.urlOf({ kind: 'asset', id: assetId })
      return url === null ? null : await loadLutFrom(url)
    },
  })
}

function paintHeld(
  renderer: WebGLRenderer,
  held: GameScene,
  camera: PerspectiveCamera,
  composer: PostComposer | null,
  policy: RenderPolicy,
  sized: { width: number; height: number },
  played: number,
  veil: ReturnType<typeof veilPass>,
): void {
  if (composer && stackDraws(held.world.post)) {
    composer.draw({
      surface: 'game',
      scene: held.scene,
      camera,
      stack: held.world.post,
      target: null,
      width: Math.round(sized.width * renderer.getPixelRatio()),
      height: Math.round(sized.height * renderer.getPixelRatio()),
      quality: policy.quality,
      toneMapped: held.world.toneMapping !== 'none',
      time: played,
    })
  } else renderer.render(held.scene, camera)
  if (veil.material.opacity > 0) {
    renderer.autoClear = false
    renderer.render(veil.scene, veil.camera)
    renderer.autoClear = true
  }
}

/**
 * Sizes the maps and fits the frustums of the scene's own lights — as the editor's `tuneShadows`,
 * floored on the author's grid — and answers how they throw, what `follow` needs to keep casters.
 */
function tuneSceneShadows(built: GameScene, policy: RenderPolicy): ShadowThrow | null {
  const tuned = tuneShadowMaps(
    built.lights,
    shadowMapSizeFor(policy.quality, policy.shadowMapSize),
    () => ({ bounds: built.shadowBounds, floor: policy.gridSize }),
  )
  return tuned ? throwsOf(tuned.framed, built.shadowBounds, tuned.reach) : null
}

/** Points the camera and swaps its lens, and says whether any of it moved. */
function aimCamera(camera: PerspectiveCamera, aim: Vector3, view: CameraView, lens: number) {
  const still =
    camera.fov === lens &&
    sameVector3(camera.position, view.position) &&
    sameVector3(aim, view.target)
  if (still) return false
  aim.set(view.target.x, view.target.y, view.target.z)
  camera.position.set(view.position.x, view.position.y, view.position.z)
  camera.lookAt(view.target.x, view.target.y, view.target.z)
  if (camera.fov !== lens) {
    camera.fov = lens
    camera.updateProjectionMatrix()
  }
  return true
}

/** A black sheet across the frame, drawn over the scene at the veil's own opacity. */
function veilPass() {
  const material = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 })
  const geometry = new PlaneGeometry(2, 2)
  const scene = new Scene()
  scene.add(new Mesh(geometry, material))
  return {
    scene,
    camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    material,
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}

/** Everything in frame, for a scene nobody walks: what the studio's own « frame all » does. */
function frameAll(camera: PerspectiveCamera, scene: Scene): void {
  const bounds = new Box3().setFromObject(scene)
  if (bounds.isEmpty()) return

  const middle = bounds.getCenter(new Vector3())
  const across = bounds.getSize(new Vector3()).length()
  camera.position.set(middle.x, middle.y + across * 0.3, middle.z + across)
  camera.lookAt(middle)
}
