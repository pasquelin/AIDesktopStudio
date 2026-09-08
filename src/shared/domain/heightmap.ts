import { localizedError } from '@shared/localizedError'
/**
 * Elevations a heightmap holds after decode: one float per pixel, first channel, row-major.
 * The file is OpenEXR float32; this is the grid, never the bytes.
 */

export type HeightmapSamples = {
  width: number
  height: number
  /** Row-major, one elevation per pixel, taken from the first channel. */
  values: Float32Array
}

/**
 * The first channel of a packed float grid. A Y-only OpenEXR is expanded to RGBA on decode,
 * so a heightmap is not assumed single-channel.
 */
export function heightmapSamplesOf(image: {
  data: ArrayLike<number>
  width: number
  height: number
}): HeightmapSamples {
  const count = image.width * image.height
  if (count === 0) throw localizedError('heightmapSamplesMissing')

  const stride = image.data.length / count
  if (!Number.isInteger(stride) || stride < 1) {
    throw localizedError('heightmapGridInvalid')
  }

  const values = new Float32Array(count)
  for (let at = 0; at < count; at++) values[at] = image.data[at * stride] ?? 0
  return { width: image.width, height: image.height, values }
}
