import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  UnsignedByteType,
  type Material,
  type TextureDataType,
  type WebGLRenderer,
} from 'three'
import { WebGLRenderTarget } from 'three'

/**
 * A full-screen quad and somewhere to draw it. Every off-screen image the studio computes —
 * colour grading a sky, deriving a normal map from a height map, packing three channels into
 * one — is the same operation: one shader, one source, one destination.
 *
 * It takes the renderer it draws with rather than making one. Two WebGL contexts in one window
 * cannot exchange a texture, so anything whose result feeds the scene — a graded sky, a
 * prefiltered environment — has to be given the viewport's own, or every frame would come back
 * through the CPU, which is exactly what invariant 6 forbids.
 *
 * **One exception, and it is the shape of it that makes it one**: a pass whose result leaves as
 * a file exchanges nothing. `engines/material/derive` opens a context of its own for the length
 * of one derivation, because drawing into the viewport's would draw over the frame the user is
 * looking at. Anything that keeps its result on the GPU does not get to make that choice.
 */
export type GpuPipeline = {
  /**
   * Draws into a target the caller keeps. Kept rather than allocated per call because a
   * background reads its result every frame while the prefiltered map re-reads it after the
   * gesture settles: two readers, one image, no reallocation between them.
   */
  renderTo: (material: Material, target: WebGLRenderTarget) => void
  /** Draws straight to the canvas — the flat views, which are looked at rather than kept. */
  renderToScreen: (material: Material) => void
  /** `float` for anything feeding image-based lighting; `byte` for what only gets looked at. */
  createTarget: (width: number, height: number, precision?: TargetPrecision) => WebGLRenderTarget
  dispose: () => void
}

type TargetPrecision = 'byte' | 'float'

const PRECISION_TYPES: Record<TargetPrecision, TextureDataType> = {
  byte: UnsignedByteType,
  float: HalfFloatType,
}

export function createGpuPipeline(renderer: WebGLRenderer): GpuPipeline {
  // A 2×2 plane seen by a camera spanning -1..1 covers the frame exactly, so `vUv` runs 0..1
  // across the destination whatever its size.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geometry = new PlaneGeometry(2, 2)
  const quad = new Mesh(geometry)
  const scene = new Scene()
  scene.add(quad)

  const draw = (material: Material, target: WebGLRenderTarget | null): void => {
    quad.material = material

    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    try {
      renderer.render(scene, camera)
    } finally {
      // In a `finally`: a throw would otherwise leave the viewport drawing into this target
      // instead of the screen, and the window would freeze on its last frame.
      renderer.setRenderTarget(previous)
    }
  }

  return {
    renderTo: (material, target) => draw(material, target),
    renderToScreen: material => draw(material, null),

    createTarget: (width, height, precision = 'byte') =>
      new WebGLRenderTarget(width, height, {
        type: PRECISION_TYPES[precision],
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),

    dispose: () => {
      geometry.dispose()
      scene.clear()
    },
  }
}
