/**
 * What DRAWS, behind one interface — the seam between the studio's engines and the graphics API
 * underneath them.
 *
 * Four things depend on which API is running, and nothing else does: building the renderer,
 * reading its pixels back, prefiltering an environment, and patching the standard material.
 * Everything else in `engines/` speaks three.js objects, which both APIs share.
 *
 * The same shape as `game/ports/`: the interface here, each implementation in a file of its own.
 */
import type { Scene, WebGLRenderer, WebGLRenderTarget } from 'three'
import type { MeshStandardMaterial } from 'three'
import type { RenderEngine } from '@shared/domain/renderEngine'
import type { ViewportEnvironment } from '../viewport/environment'
import type { MaterialUniforms } from '../material/materialShader'

/** What a canvas is given at construction. The rest a viewport writes onto the renderer itself. */
export type RendererRequest = {
  canvas: HTMLCanvasElement
  /** Whether the frame keeps an alpha channel — a scene drawn to be composited over something. */
  alpha: boolean
}

export type RenderDriver = {
  readonly engine: RenderEngine
  /** Throws when this engine cannot run here. The caller falls back — see `ViewportSurface`. */
  createRenderer: (request: RendererRequest) => WebGLRenderer
  /**
   * One disposable RGBA buffer, ready to be transferred without another UI-thread copy.
   *
   * A promise on both sides although WebGL answers at once: a GPU read maps a buffer and
   * resolves a frame later, and a signature that changed with the engine would put the choice
   * back in every caller. All three of them already sit in an async path.
   */
  readPixels: (
    renderer: WebGLRenderer,
    target: WebGLRenderTarget,
    width: number,
    height: number,
  ) => Promise<Uint8Array>
  createEnvironment: (
    renderer: WebGLRenderer,
    scene: Scene,
    requestRender: () => void,
  ) => ViewportEnvironment
  /**
   * The three things the standard material does not offer: the roughness and metalness remaps
   * and the cavity mask. `onMissingAnchor` is told once per anchor the shipped shader no longer
   * carries — an engine that patches by nodes rather than by source never calls it.
   */
  patchMaterial: (
    material: MeshStandardMaterial,
    uniforms: MaterialUniforms,
    onMissingAnchor: (anchor: string) => void,
  ) => void
}
