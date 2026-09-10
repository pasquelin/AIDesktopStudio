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
 * - `firstReadbackMs` — the FIRST still drawn and read back. It forces the queue empty, so it
 *   also absorbs whatever the engine had left to compile: on a node chain that is every pipeline
 *   of the graph, and reading it as a readback cost would be reading a compile as a copy.
 * - `readbackMs` — the second one, once nothing is left to compile. What an export actually pays
 *   per frame. Apart from the submit on purpose: WebGL reads synchronously and a node renderer
 *   maps a buffer, so folded together they would hide which half moved.
 *
 * `failed` where an engine could not be built or drawn at all — a machine with no WebGPU adapter
 * answers that for the Advanced column, and that is a result rather than a crash.
 */
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import type { RenderEngine } from '@shared/domain/renderEngine'
import type { PostStack } from '@shared/domain/postProcessing'
import { postEffect } from '@shared/domain/postProcessing'
import { SceneRenderer } from '../scene/SceneRenderer'
import type { SceneState } from '../scene/sceneState'
import { createDefaultScene } from '../scene/defaultScene'
import { meshNode } from '../scene/nodeFactory'
import { worldBenchmarkScenes } from '../scene/worldBenchmarkScenes.fixture'
import { loadGpuModule } from './gpuModule'

type EngineMeasure = {
  engine: RenderEngine
  /** What the viewport ACTUALLY mounted: `gl` here under `gpu` is the silent fallback. */
  drawnWith: RenderEngine
  submitMs: number | null
  firstReadbackMs: number | null
  readbackMs: number | null
  /** Why this column is empty, when it is. Never swallowed: an empty column has to explain itself. */
  failed?: string
}

type ProfileMeasure = {
  profile: 'model' | 'openWorld'
  nodes: number
  measures: readonly EngineMeasure[]
}

/** How many frames each figure is the mean of, after the ones that only compile shaders. */
const MEASURED_FRAMES = 60
const WARMUP_FRAMES = 10

const OFFSCREEN_HOST_OFFSET_PX = -100_000
const SURFACE = { width: 1280, height: 720 }

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
  const host = offscreenHost()
  const renderer = new SceneRenderer({ onSelect: () => {}, onTransform: () => {}, chrome: false })
  try {
    // Before the mount, never after: the engine is read once, when the renderer is built.
    renderer.configure({ ...DEFAULT_SETTINGS.three, engine, quality: 'high' })
    renderer.mount(host)
    // The node backend comes up a beat after the mount: measured before it does, every draw
    // would throw and the column would report a race rather than an engine.
    await renderer.settled()
    renderer.apply({ ...state, world: { ...state.world, post: STACK } })
    await settled()

    const drawnWith = renderer.renderEngine
    for (let frame = 0; frame < WARMUP_FRAMES; frame += 1) renderer.drawFrom(null, 0)

    const started = performance.now()
    for (let frame = 0; frame < MEASURED_FRAMES; frame += 1) renderer.drawFrom(null, frame)
    const submitMs = (performance.now() - started) / MEASURED_FRAMES

    const cold = performance.now()
    await renderer.captureStill('view')
    const firstReadbackMs = performance.now() - cold

    const warm = performance.now()
    await renderer.captureStill('view')
    const readbackMs = performance.now() - warm

    return { engine, drawnWith, submitMs, firstReadbackMs, readbackMs }
  } catch (error) {
    // A machine with no adapter, or a chain that would not build: that IS the measurement for
    // this column, and the profile beside it still has to be reported — with the reason.
    return {
      engine,
      drawnWith: engine,
      submitMs: null,
      firstReadbackMs: null,
      readbackMs: null,
      failed: error instanceof Error ? error.message : String(error),
    }
  } finally {
    renderer.dispose()
    host.remove()
  }
}

/** Off screen and sized like a viewport: what is measured is a frame, not a thumbnail. */
function offscreenHost(): HTMLElement {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = `${OFFSCREEN_HOST_OFFSET_PX}px`
  host.style.top = '0'
  host.style.width = `${SURFACE.width}px`
  host.style.height = `${SURFACE.height}px`
  document.body.appendChild(host)
  return host
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

/**
 * Two frames of quiet — a texture, a worker and a shader all land between them — or a fixed
 * wait, whichever comes first.
 *
 * 🛑 The race is not belt and braces: a window that is not on screen is handed no animation
 * frame at all, and a bench that waited for one hung for as long as the harness allowed rather
 * than reporting anything.
 */
async function settled(): Promise<void> {
  await Promise.race([
    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    new Promise(resolve => setTimeout(resolve, SETTLE_MS)),
  ])
}

/** How long the quiet above is given when nothing paints — a hidden window paints nothing. */
const SETTLE_MS = 250

Reflect.set(window, '__iaBenchmarkRenderEngines', benchmarkEngines)
