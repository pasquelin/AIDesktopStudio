import { describe, expect, it } from 'vitest'
import { assetUrl, versionedUrl } from '@shared/domain/asset'
import { decoderFor } from '@shared/domain/pictureDecoder'
import { heightmapFromExr, loadHeightmap } from './heightmap'
import { openExrFloatY } from './openExr-fixtures'

const WIDTH = 4
const HEIGHT = 4

/** File order, row-major, y = 0 first. Unique so a flip cannot hide itself. */
const FILE_VALUES = Float32Array.from({ length: WIDTH * HEIGHT }, (_, at) => at + 0.25)

function fileBytes(): ArrayBuffer {
  const held = openExrFloatY(WIDTH, HEIGHT, FILE_VALUES)
  const out = new ArrayBuffer(held.byteLength)
  new Uint8Array(out).set(held)
  return out
}

/** `EXRLoader` writes scanline 0 at the bottom. Domain samples follow that orientation. */
function flipped(values: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(values.length)
  for (let y = 0; y < height; y++) {
    out.set(values.subarray(y * width, (y + 1) * width), (height - 1 - y) * width)
  }
  return out
}

describe('an OpenEXR heightmap', () => {
  it('is told from its bytes the same way a sky is', () => {
    expect(decoderFor(new Uint8Array(fileBytes()))).toBe('openexr')
  })

  it('hands the float samples to the document side', async () => {
    const held = await heightmapFromExr(fileBytes())

    expect(held.width).toBe(WIDTH)
    expect(held.height).toBe(HEIGHT)
    expect(held.values).toEqual(flipped(FILE_VALUES, WIDTH, HEIGHT))
  })

  it('resolves the asset the way a sky texture does', async () => {
    const asked: string[] = []
    const held = await loadHeightmap('asset_height', async url => {
      asked.push(url)
      return fileBytes()
    })

    expect(asked).toEqual([assetUrl('asset_height')])
    expect(held.values[0]).toBeCloseTo(FILE_VALUES[(HEIGHT - 1) * WIDTH] ?? NaN)

    asked.length = 0
    await loadHeightmap(
      'asset_height',
      async url => {
        asked.push(url)
        return fileBytes()
      },
      'after',
    )
    expect(asked).toEqual([versionedUrl(assetUrl('asset_height'), 'after')])
  })
})
