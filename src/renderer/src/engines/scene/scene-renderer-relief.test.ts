// @vitest-environment jsdom
import { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { PackedReliefChunk, ReliefSculpt } from '@shared/domain/relief'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import type * as ReliefSurfaceModule from './reliefSurface'
import type { ReliefSurface, ReliefSurfaceOptions } from './reliefSurface'
import type { ReliefDiskStroke, ReliefSculptor } from './reliefSculptor'
import { SceneRenderer } from './SceneRenderer'

/** What the engine handed the surface it built for itself — the wiring, not the surface. */
const handed: ReliefSurfaceOptions[] = []

vi.mock('./reliefSurface', async importOriginal => {
  const original = await importOriginal<typeof ReliefSurfaceModule>()
  return {
    ...original,
    createReliefSurface: (
      scene: Parameters<typeof original.createReliefSurface>[0],
      options = {},
    ) => {
      handed.push(options)
      return original.createReliefSurface(scene, options)
    },
  }
})

const SCULPT: ReliefSculpt = { chunks: [{ column: 0, row: 0, payload: 'AAAAAA==' }] }
const CHANGED: PackedReliefChunk[] = [{ column: 0, row: 0, payload: 'AQAAAA==' }]
const DISK = { x: 0.5, z: 0.25, radius: 0.2 }

function reliefStub(): ReliefSurface {
  return {
    object: new Object3D(),
    sync: vi.fn(),
    heightmaps: () => new Map(),
    meshOf: vi.fn(),
    sculptSource: vi.fn(() => ({
      samples: { width: 2, height: 2, values: new Float32Array(4) },
      extent: { origin: { x: 0, z: 0 }, size: { x: 1, z: 1 }, elevation: { min: 0, max: 1 } },
      grain: 1,
      sculpt: SCULPT,
      maskWeights: undefined,
      overlayAlpha: 1,
      overlays: [],
    })),
    dispose: vi.fn(),
  }
}

function sculptorSpy() {
  const noted: (ReliefSculpt | undefined)[] = []
  const dispose = vi.fn()
  const sculptor: ReliefSculptor = {
    raiseDisk: async () => CHANGED,
    note: sculpt => {
      noted.push(sculpt)
    },
    dispose,
  }
  return { noted, dispose, sculptor }
}

describe('relief sculpting through the scene renderer', () => {
  it('sends a loaded stroke to the sculpt worker and publishes its changed chunks', async () => {
    const source = {
      samples: { width: 2, height: 2, values: new Float32Array(4) },
      extent: {
        origin: { x: 0, z: 0 },
        size: { x: 1, z: 1 },
        elevation: { min: 0, max: 1 },
      },
      grain: 1,
      sculpt: undefined,
      maskWeights: undefined,
      overlayAlpha: 1,
      overlays: [],
    }
    const changed: PackedReliefChunk[] = [{ column: 0, row: 0, payload: 'AAAAAA==' }]
    const strokes: ReliefDiskStroke[] = []
    const relief: ReliefSurface = {
      object: new Object3D(),
      sync: vi.fn(),
      heightmaps: () => new Map(),
      meshOf: vi.fn(),
      sculptSource: vi.fn(() => source),
      dispose: vi.fn(),
    }
    const sculptor: ReliefSculptor = {
      raiseDisk: async stroke => {
        strokes.push(stroke)
        return changed
      },
      note: vi.fn(),
      dispose: vi.fn(),
    }
    const published = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onReliefSculpt: published,
      relief,
      createReliefSculptor: () => sculptor,
    })
    const disk = { x: 0.5, z: 0.25, radius: 0.2 }

    await expect(renderer.raiseReliefDisk('terrain', 'hills', disk, 0.1)).resolves.toBe(true)

    expect(strokes).toEqual([
      { ...source, disk, amount: 0.1, falloff: 0, kind: 'raiseDisk', target: undefined },
    ])
    expect(published).toHaveBeenCalledWith('terrain', 'hills', changed)
    renderer.dispose()
  })

  /**
   * 🛑 Read back on every stroke, the sculpt was one render BEHIND — the store lands only after
   * the command has been through React. The sculptor could not tell it from an undo, dropped its
   * chaining, and the next stroke rebased on the sculpt from before the last one.
   */
  it('tells the sculptor of an outside write when the world lands, never on a stroke', async () => {
    const spy = sculptorSpy()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      relief: reliefStub(),
      createReliefSculptor: () => spy.sculptor,
    })

    await renderer.raiseReliefDisk('terrain', 'hills', DISK, 0.1)
    await renderer.raiseReliefDisk('terrain', 'hills', DISK, 0.1)
    expect(spy.noted).toEqual([])

    renderer['applyWorld']({ ...DEFAULT_WORLD, layers: [] })

    expect(spy.noted).toEqual([SCULPT])
    renderer.dispose()
  })

  it('holds one sculptor at a time, so a second edit does not add a worker pool', async () => {
    const spies = [sculptorSpy(), sculptorSpy()]
    let next = 0
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      relief: reliefStub(),
      createReliefSculptor: () => {
        const spy = spies[next]
        next += 1
        if (!spy) throw new Error('No sculptor left')
        return spy.sculptor
      },
    })

    await renderer.raiseReliefDisk('terrain', 'hills', DISK, 0.1)
    await renderer.raiseReliefDisk('terrain', 'hills', DISK, 0.1)
    expect(next).toBe(1)

    await renderer.raiseReliefDisk('terrain', 'detail', DISK, 0.1)

    expect(next).toBe(2)
    expect(spies[0]?.dispose).toHaveBeenCalledOnce()
    expect(spies[1]?.dispose).not.toHaveBeenCalled()
    renderer.dispose()
  })
})

describe('where the relief geometry is built', () => {
  it('gives the surface a builder, so a rebuild leaves the thread that draws', () => {
    handed.length = 0

    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })

    // 🛑 Invariant 6. Without the builder `reliefSurface` falls back to `buildMeshes`, which cuts
    // the whole terrain inline — and the abort that lets one stroke cancel another goes with it.
    expect(handed.at(-1)?.builder).toBeDefined()
    renderer.dispose()
  })

  it('asks for the mask tint for the studio, and not for a window that plays the scene', () => {
    handed.length = 0

    const studio = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    const asked = handed.at(-1)?.maskTint
    const played = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn(), chrome: false })

    // 🛑 The played scene builds its relief through `gameSceneWorld`, which asks for no tint at
    // all: born tinted, the stencil somebody painted would be in the game itself.
    expect(asked).toBe(true)
    expect(handed.at(-1)?.maskTint).toBe(false)
    studio.dispose()
    played.dispose()
  })
})
