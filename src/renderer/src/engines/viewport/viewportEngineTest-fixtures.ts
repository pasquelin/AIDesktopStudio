import type * as ThreeModule from 'three'
import { NoToneMapping } from 'three'
import { vi } from 'vitest'
import type { DrawRequest } from './ViewportEngine'

/**
 * A renderer jsdom can hold: the real one asks the canvas for a WebGL context and gets null.
 * Only what the engine reads back is kept — the element it draws into, the two flags it sets at
 * mount, `autoClear`, which the overlay pass turns off and back on, and `info`.
 *
 * `info` follows three.js 0.185.1 to the letter, because the counting depends on it: `render`
 * clears the counters first when `autoReset` is on, then adds one draw call. A viewport with an
 * overlay calls `render` twice, so a stand-in that skipped the clearing would report a passing
 * count for a viewport that measures only its trihedron.
 */
const disposed = vi.fn()
const contextLost = vi.fn()
const sized = vi.fn()
const pixelRatio = vi.fn()
const rendered = vi.fn()
const viewported = vi.fn()
const scissored = vi.fn()
const scissorTest = vi.fn()
const clearColor = vi.fn()
const cleared = vi.fn()
const renderTarget = vi.fn()
const queryBegun = vi.fn()
const queryEnded = vi.fn()
/** Whether the shadow maps were drawn again, one entry per `render` — three.js reads it once. */
let shadowDraws: boolean[] = []
/** What the display is worth. Two is a laptop retina screen, which is where the fault showed. */
let displayRatio = 1

vi.mock('three', async importOriginal => ({
  ...(await importOriginal<typeof ThreeModule>()),
  WebGLRenderer: class {
    readonly domElement: HTMLCanvasElement
    readonly shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false }
    /** What the preview target is sized against: the drawing buffer's own sample count. */
    readonly capabilities = { maxSamples: 4 }
    toneMapping = NoToneMapping
    autoClear = true
    readonly info = {
      autoReset: true,
      render: { calls: 0, triangles: 0, points: 0, lines: 0 },
      memory: { geometries: 0, textures: 0 },
      reset: (): void => {
        this.info.render.calls = 0
        this.info.render.triangles = 0
        this.info.render.points = 0
        this.info.render.lines = 0
      },
    }

    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas
    }

    setPixelRatio = pixelRatio
    setSize = sized
    forceContextLoss = contextLost
    dispose = disposed
    setViewport = viewported
    setScissor = scissored
    setScissorTest = scissorTest
    // The preview clears its own rectangle before drawing, so it reads the clear colour back to
    // put it where it found it. A double that answered nothing here failed inside the frame loop.
    getClearColor = (target: { set: (hex: number) => unknown }): unknown => target.set(0x000000)
    getClearAlpha = (): number => 1
    setClearColor = clearColor
    clear = cleared
    getPixelRatio = (): number => displayRatio
    /** What the preview draws into, and what `GpuPipeline` puts back after compositing. */
    private bound: unknown = null
    setRenderTarget = (target: unknown): void => {
      this.bound = target
      renderTarget(target)
    }
    getRenderTarget = (): unknown => this.bound
    // The timer query API is here so a frame can be timed at all. `4` answers `SAMPLES`, and
    // reads as false for `GPU_DISJOINT_EXT`, which is what a sound frame reports.
    getContext = (): Record<string, unknown> => ({
      SAMPLES: 0x80a9,
      getParameter: () => 4,
      QUERY_RESULT_AVAILABLE: 3,
      QUERY_RESULT: 4,
      getExtension: () => ({ TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }),
      createQuery: () => ({}),
      beginQuery: queryBegun,
      endQuery: queryEnded,
      getQueryParameter: (_query: unknown, field: number) => (field === 3 ? true : 2_500_000),
      deleteQuery: () => {},
    })
    render = (...args: unknown[]): void => {
      if (this.info.autoReset) this.info.reset()
      this.info.render.calls += 1
      // To the letter of `WebGLShadowMap.render`: it draws when told to, then says so no more.
      const drawing =
        this.shadowMap.enabled && (this.shadowMap.autoUpdate || this.shadowMap.needsUpdate)
      shadowDraws.push(drawing)
      if (drawing) this.shadowMap.needsUpdate = false
      rendered(...args)
    }
  },
}))

/** What `testSetup` pins `clientWidth`/`clientHeight` to, since jsdom runs no layout. */
const HOST_WIDTH = 640
const HOST_HEIGHT = 800
const { INSET_CADENCE_MS, ViewportEngine: BaseViewportEngine } = await import('./ViewportEngine')

class ViewportEngine extends BaseViewportEngine {}

function resetShadowDraws(): void {
  shadowDraws = []
}

function setDisplayRatio(value: number): void {
  displayRatio = value
}

export {
  clearColor,
  cleared,
  contextLost,
  displayRatio,
  disposed,
  HOST_HEIGHT,
  HOST_WIDTH,
  INSET_CADENCE_MS,
  pixelRatio,
  queryBegun,
  queryEnded,
  rendered,
  renderTarget,
  resetShadowDraws,
  scissored,
  scissorTest,
  setDisplayRatio,
  shadowDraws,
  sized,
  viewported,
  ViewportEngine,
}
export type { DrawRequest }
