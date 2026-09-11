/**
 * Whether the Advanced engine DRAWS what the Compatible one draws — the same reference content,
 * rendered by both, compared pixel to pixel.
 *
 * 🛑 The one claim the render chantier could not make until this existed. `pnpm engines:bench`
 * says what a frame COSTS on each engine and nothing about what it looks like; `world:validate`
 * compares two REPRESENTATIONS of a scene on one engine. This is the missing third: one content,
 * two engines, and `compareVisualFrames` — the very comparator those two already answer to.
 *
 * A browser harness for the same reason the bench is one: neither engine draws under node or
 * jsdom, and a figure measured without a device would be a figure about module loading. It is
 * driven the way `world:validate` is — `pnpm start:debug`, then the script beside it.
 *
 * Six cases, each through the seam the studio itself uses:
 *
 * - `scene` — the plain scene, no composition. What separates « the engines disagree about this
 *   effect » from « the engines disagree about everything ».
 * - `occlusion` — the same scene under GTAO, the one effect both engines build.
 * - `material` — a standard material carrying the studio's three additions (the roughness and
 *   metalness remaps and the cavity mask, with TILED maps), patched through `driver.patchMaterial`
 *   and drawn by `driver.createRenderer`. The material window's own path, minus its window.
 * - `still` and `film` — the two EXPORT paths, `captureStill` and `renderFilm` on both engines:
 *   a picture that shears, flips or comes back at the canvas's size instead of the target's shows
 *   here and nowhere else.
 * - `temporal` — that an effect which resolves against the frames before it is LEFT OUT of a
 *   picture drawn once, rather than drawing the flat colour an empty history gives.
 *
 * 🛑 A known, EXPECTED difference, written rather than hidden: the node patch lands the cavity on
 * the diffuse COLOUR, where the GLSL one lands it on `reflectedLight` — a node material opens no
 * seam on the latter. Identical for a dielectric; on a metal, whose specular tint three derives
 * from that same colour, the Advanced engine darkens a little of what the Compatible one leaves
 * alone. So the material case is reported as a MEASUREMENT and never as a pass or a fail: the
 * number is what a reader compares against the next run.
 */
import { WebGLRenderTarget } from 'three'
import { messageOf } from '@shared/guards'
import type { RenderEngine } from '@shared/domain/renderEngine'
import { EMPTY_STACK, postEffect, type PostStack } from '@shared/domain/postProcessing'
import { compareVisualFrames, hasPixelVariation, type VisualFrame } from '../scene/visualRegression'
import { createUniforms, declareEdgeMap, syncEdgeTransform } from '../material/materialShader'
import type { SceneState } from '../scene/sceneState'
import { drawInto } from './renderDriver'
import { loadGpuModule } from './gpuModule'
import {
  ANIMATED_WAIT_MS,
  animationFramesArrive,
  decodePng,
  driverOf,
  FRAME,
  keepForTheEye,
  materialStage,
  mountedScene,
  referenceCamera,
  referenceScene,
  tiledMask,
} from './engineParityStage'

type ParityCase = 'scene' | 'occlusion' | 'material' | 'still' | 'film' | 'temporal'

type ParityResult = {
  case: ParityCase
  /** What each side actually mounted. `gl` twice means the Advanced engine never ran. */
  drawnWith?: Readonly<Record<RenderEngine, RenderEngine>>
  width?: number
  height?: number
  /** Share of pixels differing by more than `CHANNEL_TOLERANCE` on any channel. */
  changedPixelRatio?: number
  maximumChannelDifference?: number
  /**
   * Whether each side drew more than one colour. Per SIDE and not as one flag: a blank frame is
   * the failure a comparison hides best, and knowing WHICH side blanked is the whole diagnosis.
   */
  drew?: Readonly<Record<RenderEngine, boolean>>
  /** Why this row is empty, when it is. An empty row has to explain itself. */
  failed?: string
}

/** Eight levels of encoding noise are not a difference of engines. */
const CHANNEL_TOLERANCE = 8

/** The occlusion, the one effect both chains build. */
const OCCLUSION: PostStack = {
  enabled: true,
  effects: [postEffect('parity-ao', 'gtao')],
}

/** The temporal anti-aliaser, which only the Advanced engine builds. */
const ANTIALIAS: PostStack = { enabled: true, effects: [postEffect('parity-aa', 'traa')] }

async function compareRenderEngines(): Promise<readonly ParityResult[]> {
  // 🛑 WAITED FOR rather than measured badly. A window behind another is handed no animation
  // frame, and both engines draw differently without them: three advances the node frame its
  // `FRAME` updates are gated on from an animation loop of its own, and the Compatible engine
  // only redraws a shadow map on a frame it judges stale. Measured 2026-09-11 — occluded, the
  // very same revision reported 58 % of pixels differing on a scene it draws identically in
  // front. Waited for and not merely asserted: the operator is at a terminal, and bringing the
  // window forward is the gesture this pause exists to leave room for.
  if (!(await animationFramesArrive())) {
    throw new Error(
      `no animation frame in ${ANIMATED_WAIT_MS / 1000}s: bring the studio window to the front`,
    )
  }

  // Asked for up front: the Advanced engine is only chosen once its bundle is in, and a mount
  // that raced the import would compare the Compatible one with itself.
  await loadGpuModule()

  const state = referenceScene()

  return [
    await sceneCase('scene', state, EMPTY_STACK),
    await sceneCase('occlusion', state, OCCLUSION),
    await temporalCase(state),
    await stillCase(state),
    await filmCase(state),
    await materialCase(),
  ]
}

/** One scene, drawn off screen by both engines through the viewport's own validation pass. */
async function sceneCase(
  which: ParityCase,
  state: SceneState,
  post: PostStack,
): Promise<ParityResult> {
  const view = referenceCamera()
  return await bothEngines(which, async engine => {
    const mounted = await mountedScene(engine, state, post)
    try {
      return {
        drawnWith: mounted.renderer.renderEngine,
        frame: await mounted.renderer.captureRuntimeValidationFrame(view),
      }
    } finally {
      mounted.release()
    }
  })
}

/**
 * The export path rather than the viewport's: `captureStill` draws into a target of its own,
 * reads the pixels back and encodes a PNG. Decoded here so the two engines' PNGs are compared as
 * PICTURES — the bytes differ whatever happens, an encoder being free to pack them how it likes.
 */
async function stillCase(state: SceneState): Promise<ParityResult> {
  return await stillsOf('still', state, engine => ({ engine, post: EMPTY_STACK }))
}

/**
 * That a TEMPORAL effect is left out of a picture drawn once: a still of the scene carrying
 * `traa` against a still of the same scene carrying nothing, both on the Advanced engine, and
 * the two have to be the SAME picture.
 *
 * 🛑 What this keeps is a measured failure. A temporal node resolves the frame against the ones
 * before it; a still builds its chain, draws and frees it, so that history is empty and the node
 * answers one flat colour — measured 2026-09-11, a grey square where the scene should be. The
 * chain therefore leaves such an effect out off screen (`survivesOneShot`), and this row is what
 * says it still does.
 *
 * 🛑 It says NOTHING about what TRAA draws on screen, where the chain lives across frames and
 * resolves properly — that was measured by hand, and the report carries the figure.
 *
 * The Compatible column of this row is the Advanced engine drawing without the effect. The shape
 * of the result cannot say so; this note does.
 */
async function temporalCase(state: SceneState): Promise<ParityResult> {
  return await stillsOf('temporal', state, engine => ({
    engine: 'gpu',
    post: engine === 'gpu' ? ANTIALIAS : EMPTY_STACK,
  }))
}

/**
 * Two stills of one scene, compared as PICTURES: the PNGs are decoded, the bytes of two encodes
 * differing whatever happens. What each side MOUNTS and what stack it carries is the caller's,
 * which is the only thing the two rows above disagree about.
 */
async function stillsOf(
  which: ParityCase,
  state: SceneState,
  sideOf: (side: RenderEngine) => { engine: RenderEngine; post: PostStack },
): Promise<ParityResult> {
  return await bothEngines(which, async side => {
    const { engine, post } = sideOf(side)
    const mounted = await mountedScene(engine, state, post)
    try {
      const png = await mounted.renderer.captureStill('view')
      return { drawnWith: mounted.renderer.renderEngine, frame: await decodePng(png) }
    } finally {
      mounted.release()
    }
  })
}

/**
 * The other export path: one frame of a film, drawn through a CAMERA OF THE DOCUMENT rather than
 * the view in hand, and at the film's own size rather than the canvas's.
 *
 * One frame and not a sequence: what is being compared is the picture, and a second frame of a
 * scene nothing animates is the same picture again.
 */
async function filmCase(state: SceneState): Promise<ParityResult> {
  const camera = state.nodes.find(node => node.type === 'camera')
  if (!camera) throw new Error('the reference scene carries no camera to film through')

  return await bothEngines('film', async engine => {
    const mounted = await mountedScene(engine, state, EMPTY_STACK)
    let png: Uint8Array | null = null
    try {
      await mounted.renderer.renderFilm(
        () => camera.id,
        { width: FILM.width, height: FILM.height, fps: 1, duration: ONE_FRAME_US },
        async (_index, frame) => {
          png = frame
        },
      )
      if (png === null) throw new Error('the film drew no frame')
      return { drawnWith: mounted.renderer.renderEngine, frame: await decodePng(png) }
    } finally {
      mounted.release()
    }
  })
}

/**
 * A film's own size — deliberately not the canvas's, and deliberately a width whose ROW is not a
 * multiple of 256 bytes: WebGPU pads a texture-to-buffer copy to that alignment, and a reader
 * that keeps the slack shears the picture a little further sideways on every row down. 642 × 4
 * is 2 568 bytes, so this case pays the padding; 640 and 1 024 both divide cleanly and prove
 * nothing about it.
 */
const FILM = { width: 642, height: 362 }

/** One frame at one image a second — `frameTimes` yields a single instant for this. */
const ONE_FRAME_US = 1

/**
 * The material patch, through the driver seam and nothing else: a sphere wearing a standard
 * material with tiled roughness and metalness maps, a remap on each and a cavity mask over both.
 *
 * Built here rather than driven through `MaterialRenderer`, which mounts a window, an orbit and a
 * texture cache: what differs between the engines is `patchMaterial`, and everything around it is
 * three.js objects both engines share.
 */
async function materialCase(): Promise<ParityResult> {
  return await bothEngines('material', async engine => {
    const driver = driverOf(engine)
    const canvas = document.createElement('canvas')
    canvas.width = FRAME
    canvas.height = FRAME
    const renderer = driver.createRenderer({ canvas, alpha: false })
    const target = new WebGLRenderTarget(FRAME, FRAME)
    try {
      await driver.ready(renderer)
      renderer.setPixelRatio(1)
      renderer.setSize(FRAME, FRAME, false)

      const { scene, camera, material } = materialStage()
      const uniforms = createUniforms()
      uniforms.roughnessRemap.value.set(0.2, 0.9)
      uniforms.metalnessRemap.value.set(0.1, 0.7)
      uniforms.edgeMap.value = tiledMask()
      uniforms.edgeIntensity.value = 0.8
      syncEdgeTransform(uniforms)
      // Both engines, as `MaterialRenderer.setEdgeMap` calls it: the node one reads no define
      // and the GLSL one draws no cavity without this pair.
      declareEdgeMap(material, true)
      driver.patchMaterial(material, uniforms, () => {})

      // Neutral light with no picture behind it, the same room the material window opens on:
      // a metal with no environment reflects nothing and the remaps would judge a black sphere.
      const environment = driver.createEnvironment(renderer, scene, () => {})
      environment.setStudio()
      try {
        const restore = drawInto(renderer, target)
        try {
          renderer.render(scene, camera)
        } finally {
          restore()
        }
        const pixels = await driver.readPixels(renderer, target, FRAME, FRAME)
        return { drawnWith: driver.engine, frame: { width: FRAME, height: FRAME, pixels } }
      } finally {
        environment.dispose()
      }
    } finally {
      target.dispose()
      driver.releaseContext(renderer)
      renderer.dispose()
      canvas.remove()
    }
  })
}

type DrawnFrame = { drawnWith: RenderEngine; frame: VisualFrame }

/**
 * Runs one case on both engines and compares what came back.
 *
 * The two runs are SEQUENTIAL and each frees its renderer: a machine holding two devices and two
 * G-buffers at once measures its own memory pressure rather than two engines.
 */
async function bothEngines(
  which: ParityCase,
  draw: (engine: RenderEngine) => Promise<DrawnFrame>,
): Promise<ParityResult> {
  try {
    const compatible = await draw('gl')
    const advanced = await draw('gpu')
    await keepForTheEye(which, compatible.frame, advanced.frame)
    const result = compareVisualFrames(compatible.frame, advanced.frame, {
      channelTolerance: CHANNEL_TOLERANCE,
      maximumChangedPixelRatio: 1,
    })
    return {
      case: which,
      drawnWith: { gl: compatible.drawnWith, gpu: advanced.drawnWith },
      width: compatible.frame.width,
      height: compatible.frame.height,
      changedPixelRatio: result.changedPixelRatio,
      maximumChannelDifference: result.maximumChannelDifference,
      drew: {
        gl: hasPixelVariation(compatible.frame.pixels),
        gpu: hasPixelVariation(advanced.frame.pixels),
      },
    }
  } catch (error) {
    // A machine with no adapter, or a chain that would not build: that IS the result for this
    // row, and the rows beside it still have to be reported — with the reason and NO numbers.
    // A ratio invented here reads as a measurement in the JSON the runner prints.
    return { case: which, failed: messageOf(error) }
  }
}

Reflect.set(window, '__iaCompareRenderEngines', compareRenderEngines)
