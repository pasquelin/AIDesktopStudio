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
import { createEnvironment, ROOM_SIGMA, type EnvironmentPort } from '../viewport/environment'
import { createGpuComposer } from './gpuComposer'
import { loadedGpuModule, type GpuModule } from './gpuModule'
import { applyMaterialNodes } from './materialNodes'
import { asNodeTarget, type RenderDriver, type StudioRenderer } from './renderDriver'
import type { WebGPURenderer } from 'three/webgpu'

export const gpuDriver: RenderDriver = {
  engine: 'gpu',

  createRenderer: ({ canvas, alpha }) =>
    new (loaded().webgpu.WebGPURenderer)({ canvas, antialias: true, alpha }),

  // The backend, asked for once per renderer. `render()` throws until it answers.
  ready: async renderer => {
    await asNodeRenderer(renderer).init()
  },

  readPixels: async (renderer, target, width, height) => {
    const read = await asNodeRenderer(renderer).readRenderTargetPixelsAsync(
      asNodeTarget(target),
      0,
      0,
      width,
      height,
    )
    return sameShapeAsGl(
      new Uint8Array(read.buffer, read.byteOffset, read.byteLength),
      width,
      height,
    )
  },

  createComposer: renderer => createGpuComposer(loaded(), asNodeRenderer(renderer)),

  createEnvironment: (renderer, scene, requestRender) =>
    createEnvironment(gpuEnvironmentPort(loaded(), asNodeRenderer(renderer)), scene, requestRender),

  patchMaterial: (material, uniforms) => applyMaterialNodes(loaded(), material, uniforms),

  // No overlay on this engine yet, and `ViewHelper` is a `WebGLRenderer` of three's own.
  drawOverlay: () => {},

  // A node renderer sizes the attachments of a render target itself, and keeps the card's
  // sampling ceiling on the renderer rather than under a `capabilities`.
  maxSamples: () => 0,
  drawingBufferSamples: () => 0,
  maxAnisotropy: renderer => Math.max(1, asNodeRenderer(renderer).getMaxAnisotropy()),
  frameTimer: () => null,
  // Nothing to give back: the device is the browser's, and it reclaims it with the page.
  releaseContext: () => {},
}

/**
 * The mip chain, and no grading pass.
 *
 * `createSkyGrading` is a chain of hand-written GLSL passes on a `WebGLRenderer`; there is no
 * node equivalent yet. A graded sky therefore lights and hangs behind an Advanced scene as its
 * FILE holds it. Reported once, under the scope a sky already speaks through — a picture that
 * quietly ignores the dials of the panel beside it is worse than one that says it did.
 */
function gpuEnvironmentPort(gpu: GpuModule, renderer: WebGPURenderer): EnvironmentPort {
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
function asNodeRenderer(renderer: StudioRenderer): WebGPURenderer {
  return renderer as WebGPURenderer
}

/**
 * The buffer a node renderer hands back, laid out the way the Compatible one lays its own out.
 * The callers encode a PNG from it and assume ONE shape; two would be two readers to keep in
 * step, and the one that drifted would shear or mirror a whole export.
 *
 * 🛑 Two differences, both silent if left alone:
 *
 * - **Rows are padded.** WebGPU copies a texture to a buffer at 256-byte row alignment, so a
 *   width that is not a multiple of 64 pixels comes back with slack at the end of every row.
 *   Kept, the picture shears a little further to the side on each row down.
 * - **Rows come top-down**, where `readRenderTargetPixels` answers bottom-up. The film encoder
 *   flips unconditionally, so left alone every Advanced frame comes out upside down.
 */
function sameShapeAsGl(read: Uint8Array, width: number, height: number): Uint8Array {
  const row = width * 4
  const padded = Math.ceil(row / BYTES_PER_ROW_ALIGNMENT) * BYTES_PER_ROW_ALIGNMENT
  const pixels = new Uint8Array(row * height)
  for (let line = 0; line < height; line += 1) {
    const from = line * padded
    // Written bottom-up: the last line read is the first line of what a GL read would give.
    pixels.set(read.subarray(from, from + row), (height - 1 - line) * row)
  }
  return pixels
}

/** What WebGPU aligns a texture-to-buffer copy to, per row. */
const BYTES_PER_ROW_ALIGNMENT = 256
