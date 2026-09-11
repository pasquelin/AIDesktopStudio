/**
 * What a frame COSTS on each engine, on the two profiles the render chantier is judged on.
 *
 * 🛑 A browser harness and not a `.bench.ts`: neither engine draws under node or jsdom, and a
 * figure measured without a device would be a figure about module loading. It is driven the way
 * `world:validate` is — `pnpm start`, then the script beside it.
 *
 * Two numbers per profile per engine, and each says exactly what it measures — no more:
 *
 * - `submitMs` — what the UI THREAD spends assembling and queueing one frame. 🛑 NOT the frame's
 *   cost on the card: both `render()` calls return once the commands are queued, and a figure
 *   calling itself a frame time would be off by whatever the GPU then does unwatched.
 * - `firstStillMs` — the FIRST still: `captureStill`, whole. It draws the scene into a target,
 *   reads the pixels back and encodes a PNG off the thread, so it forces the queue empty — and
 *   therefore also absorbs whatever the engine had left to compile. On a node chain that is
 *   every pipeline of the graph, so reading this as a copy cost would be reading a compile.
 * - `stillMs` — the MEAN of the stills after it, once nothing is left to compile. What an export
 *   pays per still. 🛑 Two cautions on this one: the PNG encode is inside it and is the same on
 *   both engines, so it understates the difference rather than showing it; and a single sample
 *   swung by a factor of two between runs, which is why it is a mean and not one reading.
 *
 * `failed` where an engine could not be built or drawn at all — a machine with no WebGPU adapter
 * answers that for the Advanced column, and that is a result rather than a crash.
 */
import { messageOf } from '@shared/guards'
import type { RenderEngine } from '@shared/domain/renderEngine'
import type { PostStack } from '@shared/domain/postProcessing'
import { postEffect } from '@shared/domain/postProcessing'
import type { SceneState } from '../scene/sceneState'
import { createDefaultScene } from '../scene/defaultScene'
import { meshNode } from '../scene/nodeFactory'
import { worldBenchmarkScenes } from '../scene/worldBenchmarkScenes.fixture'
import { loadGpuModule } from './gpuModule'
import { mountedScene, type MountedScene, type StageShape } from './engineParityStage'

type EngineMeasure = {
  engine: RenderEngine
  /** What the viewport ACTUALLY mounted: `gl` here under `gpu` is the silent fallback. */
  drawnWith: RenderEngine
  submitMs: number | null
  firstStillMs: number | null
  stillMs: number | null
  /** Why this column is empty, when it is. Never swallowed: an empty column has to explain itself. */
  failed?: string
}

type ProfileMeasure = {
  profile: 'model' | 'openWorld'
  nodes: number
  measures: readonly EngineMeasure[]
}

/** How many frames `submitMs` is the mean of, after the ones that only compile shaders. */
const MEASURED_FRAMES = 60

/** How many stills `stillMs` is the mean of. One alone swung by a factor of two between runs. */
const MEASURED_STILLS = 10
/** A viewport-sized surface, warmed enough that nothing is left to compile — see `mountedScene`. */
const SURFACE: StageShape = { width: 1280, height: 720, warmup: 10 }

/**
 * The occlusion, on both engines: the one effect the Advanced chain builds, so a profile
 * carrying it compares two chains rather than two plain renders.
 */
const STACK: PostStack = { enabled: true, effects: [postEffect('bench-ao', 'gtao')] }

async function benchmarkEngines(): Promise<readonly ProfileMeasure[]> {
  // Asked for up front: the Advanced engine is only chosen once its bundle is in, and a mount
  // that raced the import would measure the Compatible one twice.
  await loadGpuModule()

  const profiles: readonly { profile: ProfileMeasure['profile']; state: SceneState }[] = [
    { profile: 'model', state: oneModelScene() },
    { profile: 'openWorld', state: openWorldScene() },
  ]

  const results: ProfileMeasure[] = []
  for (const { profile, state } of profiles) {
    const measures: EngineMeasure[] = []
    for (const engine of ['gl', 'gpu'] as readonly RenderEngine[]) {
      measures.push(await measureEngine(engine, state))
    }
    results.push({ profile, nodes: state.nodes.length, measures })
  }
  return results
}

async function measureEngine(engine: RenderEngine, state: SceneState): Promise<EngineMeasure> {
  let mounted: MountedScene | null = null
  try {
    mounted = await mountedScene(engine, state, STACK, SURFACE)
    const renderer = mounted.renderer
    const drawnWith = renderer.renderEngine

    const started = performance.now()
    for (let frame = 0; frame < MEASURED_FRAMES; frame += 1) renderer.drawFrom(null, frame)
    const submitMs = (performance.now() - started) / MEASURED_FRAMES

    const cold = performance.now()
    await renderer.captureStill('view')
    const firstStillMs = performance.now() - cold

    const warm = performance.now()
    for (let still = 0; still < MEASURED_STILLS; still += 1) await renderer.captureStill('view')
    const stillMs = (performance.now() - warm) / MEASURED_STILLS

    return { engine, drawnWith, submitMs, firstStillMs, stillMs }
  } catch (error) {
    // A machine with no adapter, or a chain that would not build: that IS the measurement for
    // this column, and the profile beside it still has to be reported — with the reason.
    return {
      engine,
      drawnWith: engine,
      submitMs: null,
      firstStillMs: null,
      stillMs: null,
      failed: messageOf(error),
    }
  } finally {
    mounted?.release()
  }
}

/** One model, lit, on the quality the spec judges this profile at. */
function oneModelScene(): SceneState {
  const base = createDefaultScene()
  return {
    ...base,
    nodes: [
      ...base.nodes,
      meshNode({ kind: 'sphere', radius: 1, widthSegments: 64, heightSegments: 32 }),
    ],
  }
}

/** The open world of C5, through the very partition `pnpm world:validate` walks. */
function openWorldScene(): SceneState {
  const scenes = worldBenchmarkScenes()
  const widest = scenes.reduce((held, one) =>
    one.state.nodes.length > held.state.nodes.length ? one : held,
  )
  return widest.state
}

Reflect.set(window, '__iaBenchmarkRenderEngines', benchmarkEngines)
