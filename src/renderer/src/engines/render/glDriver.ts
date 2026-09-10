/**
 * The Compatible engine: WebGL, and what the studio has always drawn with.
 *
 * A wrapper and nothing else — every call here forwards to the module that already held that
 * work, so a project on `gl` draws exactly what it drew before the driver existed.
 */
import { WebGLRenderer } from 'three'
import { createEnvironment } from '../viewport/environment'
import { readRenderPixels } from '../scene/readRenderPixels'
import { bindUniforms, patchFragment } from '../material/materialShader'
import type { RenderDriver } from './renderDriver'

export const glDriver: RenderDriver = {
  engine: 'gl',

  createRenderer: ({ canvas, alpha }) => new WebGLRenderer({ canvas, antialias: true, alpha }),

  readPixels: async (renderer, target, width, height) =>
    readRenderPixels(renderer, target, width, height),

  createEnvironment,

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
