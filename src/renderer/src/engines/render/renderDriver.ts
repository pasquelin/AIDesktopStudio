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
import { localizedError } from '@shared/localizedError'
import { glDriver } from './glDriver'
import { gpuDriver } from './gpuDriver'
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

/** The two implementations, named together so a caller — or a test — can swap either. */
export type RenderDrivers = { gl: RenderDriver; gpu: RenderDriver }

export const RENDER_DRIVERS: RenderDrivers = { gl: glDriver, gpu: gpuDriver }

/**
 * The driver a policy asks for — the Compatible one whenever the Advanced engine has nothing to
 * draw with. `gpuReady` is what `probeGpuAdapter` found, `null` meaning nobody has asked yet:
 * a mount cannot wait for an adapter, so the first one of a session opens Compatible and the
 * answer is there for the next.
 */
export function driverFor(
  engine: RenderEngine,
  gpuReady: boolean | null,
  drivers: RenderDrivers = RENDER_DRIVERS,
): RenderDriver {
  return engine === 'gpu' && gpuReady === true ? drivers.gpu : drivers.gl
}

/** What was mounted, which is not always what was asked for. */
export type MountedRenderer = { renderer: WebGLRenderer; driver: RenderDriver }

/**
 * Builds the renderer, and falls back rather than failing: a driver that throws leaves the
 * Compatible one to draw the very same scene. SILENT on screen and loud in the journal — a
 * person who chose Advanced on a machine that cannot run it gets a picture, not a black panel.
 */
export function mountRenderer(
  request: RendererRequest,
  engine: RenderEngine,
  gpuReady: boolean | null,
  onFallback: (error: unknown) => void,
  drivers: RenderDrivers = RENDER_DRIVERS,
): MountedRenderer {
  const wanted = driverFor(engine, gpuReady, drivers)
  if (wanted === drivers.gl) {
    // Said even with nothing thrown: choosing Advanced and being handed Compatible is the one
    // case a reader has to be able to explain, and no adapter throws to explain it.
    if (engine === 'gpu') onFallback(localizedError('renderEngineUnavailable'))
    return { renderer: drivers.gl.createRenderer(request), driver: drivers.gl }
  }

  try {
    return { renderer: wanted.createRenderer(request), driver: wanted }
  } catch (error) {
    onFallback(error)
    return { renderer: drivers.gl.createRenderer(request), driver: drivers.gl }
  }
}
