/**
 * The Advanced engine: WebGPU, drawn through TSL nodes.
 *
 * 🛑 Every method here needs the bundle `gpuModule` loads, and a driver is only ever CHOSEN once
 * that bundle is in — see `driverFor`, which reads the same answer. A call that arrives without
 * it is a defect of the chooser, and says so rather than drawing nothing.
 *
 * What differs from the Compatible engine, said here rather than found later:
 *
 * - The renderer asks the browser for a device, so it cannot draw on the frame it was built on.
 *   `ready` is what the viewport holds its frames on.
 * - Reading pixels back is asynchronous by nature: a GPU buffer is mapped, and the map resolves
 *   a frame later. The interface promises a promise on both sides for exactly this.
 * - A sky the document GRADES is shown ungraded: the grading is a hand-written GLSL pass, and
 *   porting it is a chantier of its own. Said once in the journal rather than silently.
 */
import { localizedError } from '@shared/localizedError'
import { reportFailure } from '@/services/diagnostics'
import { createEnvironment, type EnvironmentPort } from '../viewport/environment'
import { createGpuComposer } from './gpuComposer'
import { loadedGpuModule, type GpuModule } from './gpuModule'
import { applyMaterialNodes } from './materialNodes'
import type { RenderDriver, StudioRenderer } from './renderDriver'
import type { Renderer } from 'three/webgpu'

export const gpuDriver: RenderDriver = {
  engine: 'gpu',

  createRenderer: ({ canvas, alpha }) =>
    new (loaded().webgpu.WebGPURenderer)({ canvas, antialias: true, alpha }),

  // The backend, asked for once per renderer. `render()` throws until it answers.
  ready: renderer => asNodeRenderer(renderer).init().then(NOTHING),

  readPixels: async (renderer, target, width, height) => {
    // `as`: a node renderer takes the `RenderTarget` a `WebGLRenderTarget` extends — three
    // declares the pair apart and the studio allocates only the latter.
    const pixels = await asNodeRenderer(renderer).readRenderTargetPixelsAsync(
      target as unknown as Parameters<Renderer['readRenderTargetPixelsAsync']>[0],
      0,
      0,
      width,
      height,
    )
    return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  },

  createComposer: renderer => createGpuComposer(loaded(), asNodeRenderer(renderer)),

  createEnvironment: (renderer, scene, requestRender) =>
    createEnvironment(gpuEnvironmentPort(loaded(), asNodeRenderer(renderer)), scene, requestRender),

  patchMaterial: (material, uniforms) => applyMaterialNodes(loaded(), material, uniforms),
}

/**
 * The mip chain, and no grading pass.
 *
 * `createSkyGrading` is a chain of hand-written GLSL passes on a `WebGLRenderer`; there is no
 * node equivalent yet. A graded sky therefore lights and hangs behind an Advanced scene as its
 * FILE holds it. Reported once, under the scope a sky already speaks through — a picture that
 * quietly ignores the dials of the panel beside it is worse than one that says it did.
 */
function gpuEnvironmentPort(gpu: GpuModule, renderer: Renderer): EnvironmentPort {
  const generator = new gpu.webgpu.PMREMGenerator(renderer)
  let said = false

  return {
    fromEquirectangular: texture => generator.fromEquirectangular(texture),
    fromScene: scene => generator.fromScene(scene, ROOM_SIGMA),
    grade: given => {
      if (!said) {
        said = true
        reportFailure('skybox.source', 'grading', localizedError('renderEngineGradingMissing'))
      }
      return given
    },
    dispose: () => generator.dispose(),
  }
}

/** How far the neutral room is blurred as it is prefiltered — three's own value for one. */
const ROOM_SIGMA = 0.04

/** Read once per call rather than held: a driver outlives the session that loaded its bundle. */
function loaded(): GpuModule {
  const held = loadedGpuModule()
  if (!held) throw localizedError('renderEngineUnavailable')
  return held
}

/**
 * `as`: this driver is only ever handed the renderer it built itself, which is a node renderer —
 * the interface is widened for the Compatible engine, and narrowing it back is what says so.
 */
function asNodeRenderer(renderer: StudioRenderer): Renderer {
  return renderer as Renderer
}

/** `init` resolves with the renderer; what the caller awaits is that it is up, and nothing more. */
const NOTHING = (): void => {}
