import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three'
import { describe, expect, it } from 'vitest'
import {
  RELIEF_CHUNK_CANDIDATES,
  RELIEF_CHUNK_TEXELS,
  chunkCountAlong,
  chunkMemoryBytes,
  chunkVerticesPerSide,
  regionUploadBytes,
} from '@shared/domain/relief'
import { heightmapFromExr } from './heightmap'
import { openExrFloatY } from './openExr-fixtures'

const MAP = 512
const BRUSH_TEXELS = 32

function mapBytes(): ArrayBuffer {
  const values = new Float32Array(MAP * MAP)
  for (let at = 0; at < values.length; at++) values[at] = (at % MAP) * 0.01
  const held = openExrFloatY(MAP, MAP, values)
  const out = new ArrayBuffer(held.byteLength)
  new Uint8Array(out).set(held)
  return out
}

function chunkGeometry(grain: number): BufferGeometry {
  const side = chunkVerticesPerSide(grain)
  const vertices = side * side
  const position = new BufferAttribute(new Float32Array(vertices * 3), 3)
  position.setUsage(DynamicDrawUsage)
  const normal = new BufferAttribute(new Float32Array(vertices * 3), 3)
  normal.setUsage(DynamicDrawUsage)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', normal)
  return geometry
}

/** One range per dirty row, matching instance-matrix `addUpdateRange` (start in components). */
function markRegion(attribute: BufferAttribute, side: number, texels: number): number {
  const verts = texels + 1
  let components = 0
  for (let row = 0; row < verts; row++) {
    const start = row * side * 3
    const count = verts * 3
    attribute.addUpdateRange(start, count)
    components += count
  }
  return components
}

describe('relief chunk cost', () => {
  it('decodes a 512² OpenEXR and keeps 64 as the cheaper full-chunk fallback', async () => {
    const samples = await heightmapFromExr(mapBytes())
    expect(samples.width).toBe(MAP)
    expect(samples.height).toBe(MAP)

    const at64 = chunkMemoryBytes(64)
    const at128 = chunkMemoryBytes(128)
    const chunks64 = chunkCountAlong(MAP, 64) ** 2
    const chunks128 = chunkCountAlong(MAP, 128) ** 2

    expect(RELIEF_CHUNK_CANDIDATES).toEqual([64, 128])
    expect(chunks64).toBe(64)
    expect(chunks128).toBe(16)
    // Same map, same vertices to a few duplicated borders: totals sit within 2 %.
    expect((chunks64 * at64.total) / (chunks128 * at128.total)).toBeCloseTo(1, 1)
    // A whole-chunk re-upload is what a missed updateRange would pay: 128 is four times 64.
    expect(at128.total / at64.total).toBeCloseTo(4, 0)
    expect(RELIEF_CHUNK_TEXELS).toBe(64)
  })

  it('marks only the brush rectangle on a BufferAttribute, the way instance matrices do', () => {
    const geometry = chunkGeometry(RELIEF_CHUNK_TEXELS)
    const position = geometry.getAttribute('position')
    if (!(position instanceof BufferAttribute)) throw new Error('position is not a buffer')
    position.clearUpdateRanges()

    const components = markRegion(position, chunkVerticesPerSide(RELIEF_CHUNK_TEXELS), BRUSH_TEXELS)
    const brush = regionUploadBytes(BRUSH_TEXELS, BRUSH_TEXELS)

    expect(position.updateRanges).toHaveLength(BRUSH_TEXELS + 1)
    expect(position.updateRanges[0]).toEqual({ start: 0, count: (BRUSH_TEXELS + 1) * 3 })
    expect(components * 4).toBe(brush.position)
    expect(brush.total).toBeLessThan(chunkMemoryBytes(64).position)
  })

  it('cannot take computeVertexNormals as the partial path: it leaves updateRanges empty', () => {
    const geometry = chunkGeometry(64)
    const position = geometry.getAttribute('position')
    if (!(position instanceof BufferAttribute)) throw new Error('position is not a buffer')
    for (let at = 1; at < position.array.length; at += 3) position.array[at] = 0.5
    geometry.computeVertexNormals()
    const normal = geometry.getAttribute('normal')
    if (!(normal instanceof BufferAttribute)) throw new Error('normal is not a buffer')

    expect(normal.updateRanges).toEqual([])
    expect(normal.array.length).toBe(position.array.length)
  })
})
