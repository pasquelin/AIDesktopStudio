/**
 * Which driver draws, and what happens when the one asked for cannot.
 *
 * Apart from `renderDriver.ts`, which holds the interface alone: the implementations import that
 * interface, so a chooser living beside it would close the graph into a cycle — see
 * `main/import-cycles.test.ts`.
 */
import type { RenderEngine } from '@shared/domain/renderEngine'
import { localizedError } from '@shared/localizedError'
import { glDriver } from './glDriver'
import { gpuDriver } from './gpuDriver'
import type { RenderDriver, RendererRequest, StudioRenderer } from './renderDriver'

/** The two implementations, named together so a caller — or a test — can swap either. */
export type RenderDrivers = { gl: RenderDriver; gpu: RenderDriver }

/**
 * Not exported: a caller choosing its own pair could read pixels with an engine that did not
 * draw them. A test passes its own, which is the only reason the parameter exists.
 */
const RENDER_DRIVERS: RenderDrivers = { gl: glDriver, gpu: gpuDriver }

/**
 * The driver a policy asks for — the Compatible one whenever the Advanced engine has nothing to
 * draw with. `gpuReady` is whether `loadGpuModule` has both an adapter and the node bundle in
 * hand: a mount cannot wait for either, so the first viewport of a session opens Compatible and
 * the answer is there for the next.
 */
function driverFor(
  engine: RenderEngine,
  gpuReady: boolean | null,
  drivers: RenderDrivers = RENDER_DRIVERS,
): RenderDriver {
  return engine === 'gpu' && gpuReady === true ? drivers.gpu : drivers.gl
}

/** What was mounted, which is not always what was asked for. */
export type MountedRenderer = { renderer: StudioRenderer; driver: RenderDriver }

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
  // Said even when nothing throws: choosing Advanced and being handed Compatible is the one
  // case a reader has to be able to explain, and a machine with no adapter raises nothing.
  if (engine === 'gpu' && wanted === drivers.gl) {
    onFallback(localizedError('renderEngineUnavailable'))
  }

  try {
    return { renderer: wanted.createRenderer(request), driver: wanted }
  } catch (error) {
    onFallback(error)
    return { renderer: drivers.gl.createRenderer(request), driver: drivers.gl }
  }
}
