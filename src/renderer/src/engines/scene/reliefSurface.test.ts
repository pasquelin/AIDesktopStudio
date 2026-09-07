import { BufferAttribute, Group, Object3D, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  RELIEF_CHUNK_TEXELS,
  chunkLayout,
  combinedAt,
  raiseReliefDisk,
  withChunkDelta,
  type ReliefMask,
  type ReliefSculpt,
} from '@shared/domain/relief'
import {
  DEFAULT_WORLD,
  reliefLayer,
  terrainEditLayer,
  type ReliefLayer,
} from '@shared/domain/scene'
import { createReliefSurface, reliefGeometryData, terrainIdOfObject } from './reliefSurface'

const WIDTH = 66
const HEIGHT = 8
const TERRAIN = 'terrain'

function samplesOf() {
  return {
    width: WIDTH,
    height: HEIGHT,
    values: Float32Array.from({ length: WIDTH * HEIGHT }, (_, at) => (at % WIDTH) * 0.01),
  }
}

function layerOf(sculpt?: ReliefSculpt, mask?: ReliefMask): ReliefLayer {
  return reliefLayer(
    { assetId: 'asset_height' },
    { id: 'terrain', edits: sculpt ? [terrainEditLayer({ id: 'sculpt', sculpt, mask })] : [] },
  )
}

function worldOf(sculpt?: ReliefSculpt, mask?: ReliefMask) {
  return { ...DEFAULT_WORLD, layers: [layerOf(sculpt, mask)] }
}

function positionOf(
  surface: ReturnType<typeof createReliefSurface>,
  column: number,
  row: number,
  terrainId = TERRAIN,
) {
  const mesh = surface.meshOf(terrainId, column, row)
  const position = mesh?.geometry.getAttribute('position')
  if (!(position instanceof BufferAttribute)) throw new Error('chunk has no position buffer')
  return position
}

describe('relief surface chunks', () => {
  it('names a chunk mesh by walking up to its terrain group', () => {
    const terrain = new Group()
    terrain.name = 'relief-island'
    const chunk = new Object3D()
    chunk.name = 'relief-chunk-0-0'
    terrain.add(chunk)
    expect(terrainIdOfObject(chunk)).toBe('island')
    expect(terrainIdOfObject(new Object3D())).toBeNull()
  })

  it('exposes the loaded source of one sculpt edit', () => {
    const surface = createReliefSurface(new Scene())
    const samples = samplesOf()
    const layer = reliefLayer(
      { assetId: 'asset_height' },
      { id: TERRAIN, edits: [terrainEditLayer({ id: 'hills' })] },
    )

    surface.sync({ ...DEFAULT_WORLD, layers: [layer] }, samples)

    expect(surface.sculptSource(layer.id, 'hills')).toEqual({
      samples,
      extent: { origin: layer.origin, size: layer.size, elevation: layer.elevation },
      grain: layer.grain,
      sculpt: undefined,
      maskWeights: undefined,
      overlayAlpha: 1,
      overlays: [],
    })
    expect(surface.sculptSource(layer.id, 'missing')).toBeNull()
    expect(surface.heightmaps()).toEqual(new Map([['asset_height', samples]]))
  })

  it('leaves a full build to its builder and installs the answer when it is ready', async () => {
    const ready = vi.fn()
    const surface = createReliefSurface(new Scene(), {
      builder: {
        build: async (samples, extent, grain, edits) => [
          reliefGeometryData(
            samples,
            extent,
            chunkLayout(0, 0, WIDTH, HEIGHT, grain),
            grain,
            edits,
          ),
          reliefGeometryData(
            samples,
            extent,
            chunkLayout(1, 0, WIDTH, HEIGHT, grain),
            grain,
            edits,
          ),
        ],
        dispose: vi.fn(),
      },
      onReady: ready,
    })

    surface.sync(worldOf(), samplesOf())
    expect(surface.object.children).toHaveLength(0)

    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce())
    expect(surface.meshOf(TERRAIN, 0, 0)).toBeDefined()
    expect(surface.meshOf(TERRAIN, 1, 0)).toBeDefined()
  })

  it('builds one mesh per chunk and lifts a vertex by the combined height', () => {
    const scene = new Scene()
    const surface = createReliefSurface(scene)
    const samples = samplesOf()
    surface.sync(worldOf(), samples)

    expect(surface.meshOf(TERRAIN, 0, 0)).toBeDefined()
    expect(surface.meshOf(TERRAIN, 1, 0)).toBeDefined()
    expect(surface.object.children).toHaveLength(1)
    expect(surface.object.children[0]?.children).toHaveLength(2)

    const y = positionOf(surface, 0, 0).array[1]
    expect(y).toBeCloseTo(0)
  })

  it('re-uploads only the dirtied chunk, leaving the other updateRanges empty', () => {
    const scene = new Scene()
    const surface = createReliefSurface(scene)
    const samples = samplesOf()
    surface.sync(worldOf(), samples)
    positionOf(surface, 0, 0).clearUpdateRanges()
    positionOf(surface, 1, 0).clearUpdateRanges()

    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 4,
    })
    surface.sync(worldOf(sculpt), samples)

    expect(positionOf(surface, 0, 0).updateRanges).toEqual([{ start: 3, count: 3 }])
    expect(positionOf(surface, 1, 0).updateRanges).toEqual([])
    expect(positionOf(surface, 0, 0).array[4]).toBeCloseTo(4.01)
  })

  it('matches a fresh build after applying a local patch', () => {
    const samples = samplesOf()
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 12,
      localZ: 3,
      delta: 4,
    })
    const patched = createReliefSurface(new Scene())
    patched.sync(worldOf(), samples)
    patched.sync(worldOf(sculpt), samples)
    const rebuilt = createReliefSurface(new Scene())
    rebuilt.sync(worldOf(sculpt), samples)

    for (const column of [0, 1]) {
      for (const attribute of ['position', 'normal']) {
        expect(patched.meshOf(TERRAIN, column, 0)?.geometry.getAttribute(attribute).array).toEqual(
          rebuilt.meshOf(TERRAIN, column, 0)?.geometry.getAttribute(attribute).array,
        )
      }
    }
  })

  it('keeps the shared edge continuous when a disk covers two chunks', () => {
    const scene = new Scene()
    const surface = createReliefSurface(scene)
    const samples = samplesOf()
    const layer = layerOf()
    const stepX = layer.size.x / (WIDTH - 1)
    const seamX = layer.origin.x + 64 * stepX
    const sculpt = raiseReliefDisk(
      samples,
      layer,
      undefined,
      { x: seamX, z: layer.origin.z, radius: stepX * 2 },
      1.5,
    )
    surface.sync(worldOf(sculpt), samples)

    const left = surface.meshOf(TERRAIN, 0, 0)
    const right = surface.meshOf(TERRAIN, 1, 0)
    const leftPos = left?.geometry.getAttribute('position')
    const rightPos = right?.geometry.getAttribute('position')
    if (!(leftPos instanceof BufferAttribute) || !(rightPos instanceof BufferAttribute)) {
      throw new Error('seam chunks missing')
    }
    const height = combinedAt(
      samples,
      RELIEF_CHUNK_TEXELS,
      [{ enabled: true, alpha: 1, sculpt }],
      64,
      0,
    )
    const leftY = leftPos.array[64 * 3 + 1]
    const rightY = rightPos.array[1]
    if (leftY === undefined || rightY === undefined) throw new Error('seam vertex missing')
    expect(height).toBeCloseTo(0.64 + 1.5)
    expect(leftY).toBeCloseTo(rightY)
    expect(leftY).toBeCloseTo(height)
  })

  /**
   * 🛑 A normal reads the 1-ring around its vertex, which CROSSES the border: the seam vertex is
   * drawn by both chunks, and the left one's stroke moves a height the right one reads. Only the
   * left chunk's payload changes, so a patch that rewrote the changed chunks alone left the right
   * side lit as it was before — a crease that never healed.
   */
  it('relights the neighbour whose 1-ring reaches into a stroke', () => {
    const scene = new Scene()
    const surface = createReliefSurface(scene)
    const samples = samplesOf()
    surface.sync(worldOf(), samples)

    // One sample IN from the seam: it belongs to the left chunk alone, and the seam vertex the
    // right chunk draws reads it for its normal.
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 63,
      localZ: 0,
      delta: 4,
    })
    surface.sync(worldOf(sculpt), samples)

    const left = surface.meshOf(TERRAIN, 0, 0)?.geometry.getAttribute('normal')
    const right = surface.meshOf(TERRAIN, 1, 0)?.geometry.getAttribute('normal')
    if (!(left instanceof BufferAttribute) || !(right instanceof BufferAttribute)) {
      throw new Error('seam chunks missing')
    }

    // The seam vertex: index 64 on the left, index 0 on the right. One vertex, one normal.
    expect(right.array[0]).toBeCloseTo(left.array[64 * 3] ?? 0)
    expect(right.array[2]).toBeCloseTo(left.array[64 * 3 + 2] ?? 0)
    // And it MOVED: a flat map lights straight up, which is what the stroke tilted it away from.
    expect(Math.abs(right.array[0] ?? 0)).toBeGreaterThan(0.01)
    // The neighbour's shape is untouched, so only its lighting is sent again.
    expect(positionOf(surface, 1, 0).updateRanges).toEqual([])
    expect(right.updateRanges.length).toBeGreaterThan(0)
  })

  /**
   * 🛑 The patch path never touched `generation`, so a build started for an alpha the reader has
   * since moved back landed with a token still current and painted its older surface on top.
   */
  it('drops a build in flight when a later sync draws the terrain itself', async () => {
    const pending: (() => void)[] = []
    const surface = createReliefSurface(new Scene(), {
      builder: {
        build: (samples, extent, grain, edits) =>
          new Promise(resolve => {
            pending.push(() =>
              resolve([
                reliefGeometryData(
                  samples,
                  extent,
                  chunkLayout(0, 0, WIDTH, HEIGHT, grain),
                  grain,
                  edits,
                ),
              ]),
            )
          }),
        dispose: vi.fn(),
      },
    })
    const samples = samplesOf()
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 4,
    })
    const blended = (alpha: number) => ({
      ...DEFAULT_WORLD,
      layers: [
        reliefLayer(
          { assetId: 'asset_height' },
          { id: 'terrain', edits: [terrainEditLayer({ id: 'sculpt', sculpt, alpha })] },
        ),
      ],
    })

    surface.sync(blended(1), samples)
    pending.shift()?.()
    await vi.waitFor(() => expect(surface.meshOf(TERRAIN, 0, 0)).toBeDefined())
    const held = surface.meshOf(TERRAIN, 0, 0)

    // A build for alpha 0.5 starts; the reader undoes back to 1, which the patch path draws.
    surface.sync(blended(0.5), samples)
    surface.sync(blended(1), samples)
    pending.shift()?.()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(surface.meshOf(TERRAIN, 0, 0)).toBe(held)
  })

  /**
   * 🛑 Applying a layer starts the worker build, which bumps `generation` before the load's own
   * `finally` reads it. Marked there, the terrain was never read again and stayed blank.
   */
  it('reads the heightmap again once a build has failed, rather than staying blank', async () => {
    let reads = 0
    const surface = createReliefSurface(new Scene(), {
      load: async () => {
        reads += 1
        return samplesOf()
      },
      builder: { build: async () => null, dispose: vi.fn() },
    })

    surface.sync(worldOf())
    await vi.waitFor(() => expect(reads).toBe(1))
    surface.sync(worldOf())

    await vi.waitFor(() => expect(reads).toBe(2))
  })

  it('applies the layer asked for LAST when a load that started before it lands', async () => {
    const settle: ((samples: ReturnType<typeof samplesOf>) => void)[] = []
    const surface = createReliefSurface(new Scene(), {
      load: () =>
        new Promise(resolve => {
          settle.push(resolve)
        }),
    })
    const samples = samplesOf()
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 4,
    })
    const blended = (alpha: number) => ({
      ...DEFAULT_WORLD,
      layers: [
        reliefLayer(
          { assetId: 'asset_height' },
          { id: TERRAIN, edits: [terrainEditLayer({ id: 'sculpt', sculpt, alpha })] },
        ),
      ],
    })

    surface.sync(blended(1))
    surface.sync(blended(0.5))
    settle.shift()?.(samples)
    await vi.waitFor(() => expect(surface.meshOf(TERRAIN, 0, 0)).toBeDefined())

    expect(positionOf(surface, 0, 0).array[4]).toBeCloseTo(2.01)
  })

  it('lets a load in flight finish rather than reading the heightmap again', async () => {
    let reads = 0
    const surface = createReliefSurface(new Scene(), {
      load: async () => {
        reads += 1
        return samplesOf()
      },
    })

    surface.sync(worldOf())
    surface.sync(worldOf())
    await vi.waitFor(() => expect(surface.meshOf(TERRAIN, 0, 0)).toBeDefined())

    expect(reads).toBe(1)
  })

  it('leaves the root empty when a heightmap will not load, so the ground stays drawn', async () => {
    const scene = new Scene()
    let failed = false
    const surface = createReliefSurface(scene, {
      load: async () => {
        throw new Error('dead EXR')
      },
      onFailure: () => {
        failed = true
      },
    })
    surface.sync(worldOf())
    await vi.waitFor(() => expect(failed).toBe(true))

    expect(surface.object.children).toHaveLength(0)
    expect(surface.meshOf(TERRAIN, 0, 0)).toBeUndefined()
  })

  it('clears the meshes when the world holds no relief', () => {
    const scene = new Scene()
    const surface = createReliefSurface(scene)
    surface.sync(worldOf(), samplesOf())
    surface.sync(DEFAULT_WORLD)

    expect(surface.object.children).toHaveLength(0)
    expect(surface.meshOf(TERRAIN, 0, 0)).toBeUndefined()
  })

  it('draws two disjoint terrains as two independent meshes, never summed', () => {
    const scene = new Scene()
    const surface = createReliefSurface(scene)
    const samples = samplesOf()
    const left = reliefLayer(
      { assetId: 'asset_height' },
      { id: 'isle', origin: { x: 0, z: 0 }, size: { x: 20, z: 20 } },
    )
    const right = reliefLayer(
      { assetId: 'asset_height' },
      { id: 'range', origin: { x: 200, z: 0 }, size: { x: 20, z: 20 } },
    )
    surface.sync({ ...DEFAULT_WORLD, layers: [left, right] }, samples)

    expect(surface.object.children).toHaveLength(2)
    expect(surface.meshOf('isle', 0, 0)).toBeDefined()
    expect(surface.meshOf('range', 0, 0)).toBeDefined()
    expect(positionOf(surface, 0, 0, 'isle').array[0]).toBeCloseTo(0)
    expect(positionOf(surface, 0, 0, 'range').array[0]).toBeCloseTo(200)
  })
})

describe('a mask change on a drawn terrain', () => {
  const samples = samplesOf()
  const sculpt = withChunkDelta(samples, undefined, {
    column: 0,
    row: 0,
    localX: 1,
    localZ: 0,
    delta: 5,
  })

  it('lowers the surface when a height mask newly excludes what the edit sculpted', () => {
    const surface = createReliefSurface(new Scene())
    surface.sync(worldOf(sculpt), samples)
    expect(positionOf(surface, 0, 0).array[4]).toBeCloseTo(5.01)

    surface.sync(worldOf(sculpt, { kind: 'height', min: 100, max: 200 }), samples)

    expect(positionOf(surface, 0, 0).array[4]).toBeCloseTo(0.01)
  })

  it('raises it again when a bound moves back over the terrain, as a slider does', () => {
    const surface = createReliefSurface(new Scene())
    surface.sync(worldOf(sculpt, { kind: 'height', min: 100, max: 200 }), samples)

    surface.sync(worldOf(sculpt, { kind: 'height', min: 0, max: 200 }), samples)

    expect(positionOf(surface, 0, 0).array[4]).toBeCloseTo(5.01)
  })

  it('patches the chunk a painted mask now covers rather than building the terrain again', () => {
    const surface = createReliefSurface(new Scene())
    surface.sync(worldOf(sculpt, { kind: 'painted', weights: { chunks: [] } }), samples)
    const held = surface.meshOf(TERRAIN, 0, 0)
    expect(positionOf(surface, 0, 0).array[4]).toBeCloseTo(0.01)

    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 1,
    })
    surface.sync(worldOf(sculpt, { kind: 'painted', weights }), samples)

    expect(positionOf(surface, 0, 0).array[4]).toBeCloseTo(5.01)
    expect(surface.meshOf(TERRAIN, 0, 0)).toBe(held)
  })
})
