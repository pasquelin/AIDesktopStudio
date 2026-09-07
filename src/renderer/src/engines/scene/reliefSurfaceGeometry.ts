import { BufferAttribute, type BufferGeometry } from 'three'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import { clamp } from '@shared/numeric'
import {
  reliefReader,
  worldY,
  type ReliefChunkLayout,
  type ReliefExtent,
  type ReliefRead,
} from '@shared/domain/relief'
import type { TerrainEditLayer } from '@shared/domain/scene'
import type { ReliefGeometryData } from './reliefBuildMessage'

type SampleRect = { minX: number; maxX: number; minZ: number; maxZ: number }

export function reliefGeometryData(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  layout: ReliefChunkLayout,
  grain: number,
  edits: readonly TerrainEditLayer[],
): ReliefGeometryData {
  const vertices = layout.width * layout.height
  const position = new Float32Array(vertices * 3)
  const normal = new Float32Array(vertices * 3)
  const uv = new Float32Array(vertices * 2)
  const read = reliefReader(samples, grain, edits, extent)
  writePositions(position, samples, extent, layout, read)
  writeNormals(normal, samples, extent, layout, read)
  writeUv(uv, layout, samples)
  return { column: layout.column, row: layout.row, position, normal, uv, index: chunkIndex(layout) }
}

export function writeChunkRegion(
  geometry: BufferGeometry,
  samples: HeightmapSamples,
  extent: ReliefExtent,
  layout: ReliefChunkLayout,
  read: ReliefRead,
  rect: SampleRect,
): void {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  if (!(position instanceof BufferAttribute) || !(normal instanceof BufferAttribute)) return
  if (!(position.array instanceof Float32Array) || !(normal.array instanceof Float32Array)) return
  writeHeights(position.array, extent, layout, read, rect)
  const normalRect = expandRect(rect, layout, 1)
  writeNormalRegion(normal.array, samples, extent, layout, read, normalRect)
  markRegion(position, layout.width, rect)
  markRegion(normal, layout.width, normalRect)
  position.needsUpdate = true
  normal.needsUpdate = true
}

function expandRect(rect: SampleRect, layout: ReliefChunkLayout, amount: number): SampleRect {
  return {
    minX: Math.max(0, rect.minX - amount),
    maxX: Math.min(layout.width - 1, rect.maxX + amount),
    minZ: Math.max(0, rect.minZ - amount),
    maxZ: Math.min(layout.height - 1, rect.maxZ + amount),
  }
}

function markRegion(attribute: BufferAttribute, width: number, rect: SampleRect): void {
  const count = (rect.maxX - rect.minX + 1) * 3
  for (let z = rect.minZ; z <= rect.maxZ; z++) {
    attribute.addUpdateRange((z * width + rect.minX) * 3, count)
  }
}

function writeHeights(
  into: Float32Array,
  extent: ReliefExtent,
  layout: ReliefChunkLayout,
  read: ReliefRead,
  rect: SampleRect,
): void {
  for (let z = rect.minZ; z <= rect.maxZ; z++) {
    for (let x = rect.minX; x <= rect.maxX; x++) {
      const at = (z * layout.width + x) * 3 + 1
      into[at] = worldY(read(layout.sampleX + x, layout.sampleZ + z), extent.elevation)
    }
  }
}

function writeNormalRegion(
  into: Float32Array,
  samples: HeightmapSamples,
  extent: ReliefExtent,
  layout: ReliefChunkLayout,
  read: ReliefRead,
  rect: SampleRect,
): void {
  const stepX = extent.size.x / Math.max(1, samples.width - 1)
  const stepZ = extent.size.z / Math.max(1, samples.height - 1)
  for (let z = rect.minZ; z <= rect.maxZ; z++) {
    for (let x = rect.minX; x <= rect.maxX; x++) {
      const sampleX = layout.sampleX + x
      const sampleZ = layout.sampleZ + z
      const nx =
        (heightAt(samples, read, extent, sampleX - 1, sampleZ) -
          heightAt(samples, read, extent, sampleX + 1, sampleZ)) /
        (2 * stepX)
      const nz =
        (heightAt(samples, read, extent, sampleX, sampleZ - 1) -
          heightAt(samples, read, extent, sampleX, sampleZ + 1)) /
        (2 * stepZ)
      const length = Math.hypot(nx, 1, nz) || 1
      const at = (z * layout.width + x) * 3
      into[at] = nx / length
      into[at + 1] = 1 / length
      into[at + 2] = nz / length
    }
  }
}

/** Rewrites a neighbour's lighting, never its shape. */
export function writeChunkNormals(
  geometry: BufferGeometry,
  samples: HeightmapSamples,
  extent: ReliefExtent,
  layout: ReliefChunkLayout,
  grain: number,
  edits: readonly TerrainEditLayer[],
): void {
  const normal = geometry.getAttribute('normal')
  if (!(normal instanceof BufferAttribute) || !(normal.array instanceof Float32Array)) return

  writeNormals(normal.array, samples, extent, layout, reliefReader(samples, grain, edits, extent))
  markChunk(normal)
  normal.needsUpdate = true
}

function markChunk(attribute: BufferAttribute): void {
  attribute.addUpdateRange(0, attribute.count * attribute.itemSize)
}

function writePositions(
  into: Float32Array,
  samples: HeightmapSamples,
  extent: ReliefExtent,
  layout: ReliefChunkLayout,
  read: ReliefRead,
): void {
  const stepX = extent.size.x / Math.max(1, samples.width - 1)
  const stepZ = extent.size.z / Math.max(1, samples.height - 1)
  let cursor = 0
  for (let lz = 0; lz < layout.height; lz++) {
    for (let lx = 0; lx < layout.width; lx++) {
      const sx = layout.sampleX + lx
      const sz = layout.sampleZ + lz
      into[cursor] = extent.origin.x + sx * stepX
      into[cursor + 1] = worldY(read(sx, sz), extent.elevation)
      into[cursor + 2] = extent.origin.z + sz * stepZ
      cursor += 3
    }
  }
}

function writeNormals(
  into: Float32Array,
  samples: HeightmapSamples,
  extent: ReliefExtent,
  layout: ReliefChunkLayout,
  read: ReliefRead,
): void {
  writeNormalRegion(into, samples, extent, layout, read, {
    minX: 0,
    maxX: layout.width - 1,
    minZ: 0,
    maxZ: layout.height - 1,
  })
}

function heightAt(
  samples: HeightmapSamples,
  read: ReliefRead,
  extent: ReliefExtent,
  sx: number,
  sz: number,
): number {
  const x = clamp(sx, 0, samples.width - 1)
  const z = clamp(sz, 0, samples.height - 1)
  return worldY(read(x, z), extent.elevation)
}

function writeUv(into: Float32Array, layout: ReliefChunkLayout, samples: HeightmapSamples): void {
  const spanX = Math.max(1, samples.width - 1)
  const spanZ = Math.max(1, samples.height - 1)
  let cursor = 0
  for (let lz = 0; lz < layout.height; lz++) {
    for (let lx = 0; lx < layout.width; lx++) {
      into[cursor] = (layout.sampleX + lx) / spanX
      into[cursor + 1] = (layout.sampleZ + lz) / spanZ
      cursor += 2
    }
  }
}

function chunkIndex(layout: ReliefChunkLayout): Uint16Array {
  const quadsX = Math.max(0, layout.width - 1)
  const quadsZ = Math.max(0, layout.height - 1)
  const indices = new Uint16Array(quadsX * quadsZ * 6)
  let cursor = 0
  for (let z = 0; z < quadsZ; z++) {
    for (let x = 0; x < quadsX; x++) {
      const i = z * layout.width + x
      indices[cursor] = i
      indices[cursor + 1] = i + 1
      indices[cursor + 2] = i + layout.width
      indices[cursor + 3] = i + 1
      indices[cursor + 4] = i + layout.width + 1
      indices[cursor + 5] = i + layout.width
      cursor += 6
    }
  }
  return indices
}
