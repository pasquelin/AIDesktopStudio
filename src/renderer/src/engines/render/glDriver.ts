/**
 * The Compatible engine: WebGL, and what the studio has always drawn with.
 *
 * A wrapper and nothing else — every call here forwards to the module that already held that
 * work, so a project on `gl` draws exactly what it drew before the driver existed.
 */
import { PMREMGenerator, WebGLRenderer } from 'three'
import { PostComposer } from '../postfx/PostComposer'
import { createEnvironment, ROOM_SIGMA, type EnvironmentPort } from '../viewport/environment'
import { readRenderPixels } from '../scene/readRenderPixels'
import { bindUniforms, patchFragment } from '../material/materialShader'
import { createSkyGrading, type SkyGrading } from '../gpu/skyGrading'
import { createGpuTimer, isGpuTimerContext } from '../viewport/gpuTimer'
import type { RenderDriver, StudioRenderer } from './renderDriver'

export const glDriver: RenderDriver = {
  engine: 'gl',

  createRenderer: ({ canvas, alpha }) => new WebGLRenderer({ canvas, antialias: true, alpha }),

  // Nothing to wait for: a WebGL context is up on the line after `new`.
  ready: () => null,

  readPixels: async (renderer, target, width, height) =>
    readRenderPixels(asWebGL(renderer), target, width, height),

  createComposer: (renderer, options) => new PostComposer(asWebGL(renderer), options),

  createEnvironment: (renderer, scene, requestRender) =>
    createEnvironment(glEnvironmentPort(asWebGL(renderer)), scene, requestRender),

  // The ceiling comes from three rather than from `gl.MAX_SAMPLES`, which the WebGL1 typing has
  // no name for.
  maxSamples: renderer => {
    const gl = asWebGL(renderer).getContext()
    return Math.max(
      0,
      Math.min(Number(gl.getParameter(gl.SAMPLES) ?? 0), capsOf(renderer).maxSamples),
    )
  },

  // Never under one: three answers 0 — not 1 — on a context without
  // `EXT_texture_filter_anisotropic`, and 0 is not a number of samples.
  maxAnisotropy: renderer => Math.max(1, capsOf(renderer).getMaxAnisotropy()),

  frameTimer: renderer => {
    const context = asWebGL(renderer).getContext()
    return isGpuTimerContext(context) ? createGpuTimer(context) : null
  },

  releaseContext: renderer => asWebGL(renderer).forceContextLoss(),

  patchMaterial: (material, uniforms, onMissingAnchor) => {
    // Bound once on the material, not per compile: three hands the hook a fresh uniform object
    // each time the program is rebuilt, and the engine's values have to survive that.
    material.onBeforeCompile = shader => {
      const { source, missing } = patchFragment(shader.fragmentShader)
      shader.fragmentShader = source
      bindUniforms(shader.uniforms, uniforms)
      for (const anchor of missing) onMissingAnchor(anchor)
    }
  },
}

/**
 * The mip chain and the grading pass, together: both are the ENGINE's, and both are freed with
 * it. The grading is built on the first sky nobody left neutral — most are, and a pass built for
 * them would be a program compiled for a picture it never touches.
 */
function glEnvironmentPort(renderer: WebGLRenderer): EnvironmentPort {
  const generator = new PMREMGenerator(renderer)
  // Compiled up front: the first `fromEquirectangular` would otherwise stall the frame that
  // asked for it, which is the frame where the user has just chosen a sky.
  generator.compileEquirectangularShader()
  let grading: SkyGrading | null = null

  return {
    fromEquirectangular: texture => generator.fromEquirectangular(texture),
    fromScene: scene => generator.fromScene(scene, ROOM_SIGMA),
    grade: (given, stack) => (grading ??= createSkyGrading(renderer)).of(given, stack) ?? given,
    dispose: () => {
      grading?.dispose()
      grading = null
      generator.dispose()
    },
  }
}

/**
 * `as`: this driver is only ever handed the renderer it built itself, which is a `WebGLRenderer`
 * — the interface is widened for the Advanced engine, and narrowing it back is what says so.
 */
function asWebGL(renderer: StudioRenderer): WebGLRenderer {
  return renderer as WebGLRenderer
}

const capsOf = (renderer: StudioRenderer): WebGLRenderer['capabilities'] =>
  asWebGL(renderer).capabilities
