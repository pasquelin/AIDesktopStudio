/**
 * What DRAWS, behind one interface — the seam between the studio's engines and the graphics API
 * underneath them.
 *
 * Everything that depends on which API is running is HERE, and nothing outside asks: building
 * the renderer, reading its pixels back, composing a stack, prefiltering an environment,
 * patching the standard material, and the four capabilities the two engines keep in different
 * places or not at all. Everything else in `engines/` speaks three.js objects, which both APIs
 * share — a scene, a camera, a light, a geometry and a render target are the same on both sides.
 *
 * 🛑 A feature-detect written at a call site is what this exists to prevent: `'capabilities' in
 * renderer` scattered over the tree is five copies of one question, each with its own comment,
 * and none of them findable from here.
 *
 * The same shape as `game/ports/`: the interface here, each implementation in a file of its own.
 */
import type { MeshStandardMaterial, Scene, WebGLRenderer, WebGLRenderTarget } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { RenderEngine } from '@shared/domain/renderEngine'
import type { ViewportEnvironment } from '../viewport/environment'
import type { MaterialUniforms } from '../material/materialShader'
import type { PostComposerOptions } from '../postfx/PostComposer'
import type { SceneComposer } from './sceneComposer'
import type { GpuTimer } from '../viewport/gpuTimer'

/**
 * What the studio draws with, whichever engine built it.
 *
 * 🛑 A UNION and not a common base: three declares `WebGLRenderer` and the node renderer apart,
 * sharing no ancestor. What the studio uses of them is nearly the same surface, and the handful
 * of places where it is not are exactly what this driver covers.
 */
export type StudioRenderer = WebGLRenderer | WebGPURenderer

/** What a canvas is given at construction. The rest a viewport writes onto the renderer itself. */
export type RendererRequest = {
  canvas: HTMLCanvasElement
  /** Whether the frame keeps an alpha channel — a scene drawn to be composited over something. */
  alpha: boolean
}

export type RenderDriver = {
  readonly engine: RenderEngine
  /** Throws when this engine cannot run here. The caller falls back — see `mountRenderer`. */
  createRenderer: (request: RendererRequest) => StudioRenderer
  /**
   * Resolves once the renderer may be drawn with, and `null` when it already can be.
   *
   * 🛑 A node renderer THROWS on `render()` before its backend is up — it asks the browser for a
   * device, which is asynchronous — where a WebGL one draws on the line after `new`. A mount
   * cannot wait, so the viewport holds its frames until this settles.
   */
  ready: (renderer: StudioRenderer) => Promise<void> | null
  /**
   * One disposable RGBA buffer, ready to be transferred without another UI-thread copy.
   *
   * A promise on both sides although WebGL answers at once: a GPU read maps a buffer and
   * resolves a frame later, and a signature that changed with the engine would put the choice
   * back in every caller. All three of them already sit in an async path.
   */
  readPixels: (
    renderer: StudioRenderer,
    target: WebGLRenderTarget,
    width: number,
    height: number,
  ) => Promise<Uint8Array>
  /** The chain a stack is drawn through: GLSL passes on one side, TSL nodes on the other. */
  createComposer: (renderer: StudioRenderer, options: PostComposerOptions) => SceneComposer
  createEnvironment: (
    renderer: StudioRenderer,
    scene: Scene,
    requestRender: () => void,
  ) => ViewportEnvironment
  /**
   * The three things the standard material does not offer: the roughness and metalness remaps
   * and the cavity mask. `onMissingAnchor` is told once per anchor the shipped shader no longer
   * carries — the node engine patches no source, so it never calls it.
   */
  patchMaterial: (
    material: MeshStandardMaterial,
    uniforms: MaterialUniforms,
    onMissingAnchor: (anchor: string) => void,
  ) => void
  /**
   * The CARD's ceiling: how many samples an off-screen target this engine allocates may ask for.
   * ZERO on a node renderer, which sizes the attachments of a render target itself.
   */
  maxSamples: (renderer: StudioRenderer) => number
  /**
   * What the DRAWING BUFFER is actually antialiased to, which is a different question and a
   * different answer — zero whenever a render target is bound.
   *
   * 🛑 The two were one call until 2026-09-11, and a still lost its antialiasing: it asks for a
   * ceiling and was handed the sample count of whatever framebuffer happened to be bound.
   */
  drawingBufferSamples: (renderer: StudioRenderer) => number
  /**
   * How many samples the card may take across a texel's footprint. The two engines keep the
   * same answer in two places — under `capabilities` on one, on the renderer on the other.
   */
  maxAnisotropy: (renderer: StudioRenderer) => number
  /**
   * The frame timer, or nothing. `EXT_disjoint_timer_query_webgl2` is the Compatible engine's,
   * and asking a node renderer for its context at all THROWS until its backend is up.
   */
  frameTimer: (renderer: StudioRenderer) => GpuTimer | null
  /** Gives the context back before it is collected. A node renderer holds a device instead. */
  releaseContext: (renderer: StudioRenderer) => void
}

/**
 * Points a renderer at a target and hands back the call that puts the previous one back.
 *
 * 🛑 Written once because the two engines declare the SAME object apart: `getRenderTarget`
 * answers a `WebGLRenderTarget` on one side and a `RenderTarget` on the other, so a save and
 * restore written against the union is refused although both accept what both returned.
 */
export function drawInto(renderer: StudioRenderer, target: WebGLRenderTarget | null): () => void {
  const previous: unknown = renderer.getRenderTarget()
  // `as`: what is put back is exactly what this renderer just handed over, and a renderer takes
  // back its own target whichever of the two shapes three declares it under.
  const restore = (): void => renderer.setRenderTarget(previous as WebGLRenderTarget | null)
  renderer.setRenderTarget(target)
  return restore
}
