/**
 * The Advanced engine: WebGPU, and nothing of it is built yet.
 *
 * A stub that refuses, deliberately: the seam is what this step delivers, and a half-built
 * renderer behind it would show a black canvas where the fallback shows a picture. Every call
 * raises the same sentence, and `ViewportSurface` answers it by mounting the Compatible engine.
 */
import { localizedError } from '@shared/localizedError'
import type { RenderDriver } from './renderDriver'

/** Said once, so the four refusals cannot drift into four different sentences. */
function notBuiltYet(): Error {
  return localizedError('renderEngineUnavailable')
}

export const gpuDriver: RenderDriver = {
  engine: 'gpu',
  createRenderer: () => {
    throw notBuiltYet()
  },
  readPixels: () => {
    throw notBuiltYet()
  },
  createEnvironment: () => {
    throw notBuiltYet()
  },
  patchMaterial: () => {
    throw notBuiltYet()
  },
}
