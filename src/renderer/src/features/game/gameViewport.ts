import type { Settings } from '@shared/domain/settings'

/**
 * A game wants the scene, not the workshop it was built in: the person's lens, quality and
 * shadows, with every aid they can turn on turned off — `chrome: false` holds the rest.
 */
export function gameViewport(three: Settings['three']): Settings['three'] {
  return {
    ...three,
    showGrid: false,
    lightHelpers: 'off',
    cameraHelpers: 'off',
    boundingBoxes: 'off',
    origins: false,
    normals: false,
  }
}
