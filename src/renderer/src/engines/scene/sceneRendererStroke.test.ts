// @vitest-environment jsdom
import { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { emptyGroundWeights } from '@shared/domain/groundPaint'
import type { PackedReliefChunk, ReliefSculpt } from '@shared/domain/relief'
import { DEFAULT_WORLD, reliefLayer, scatterLayer, terrainEditLayer } from '@shared/domain/scene'
import type { ReliefSurface } from './reliefSurface'
import type { ReliefDiskStroke, ReliefSculptor } from './reliefSculptor'
import { SceneRenderer } from './SceneRenderer'
import { SCULPT_AMOUNT } from './reliefStroke'

const SCULPT: ReliefSculpt = { chunks: [{ column: 0, row: 0, payload: 'AAAAAA==' }] }
const CHANGED: PackedReliefChunk[] = [{ column: 0, row: 0, payload: 'AQAAAA==' }]

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

function worldWithTerrain() {
  return {
    ...DEFAULT_WORLD,
    layers: [
      reliefLayer(
        { assetId: 'h' },
        { id: 'terrain', edits: [terrainEditLayer({ id: 'hills', name: 'Hills' })] },
      ),
    ],
  }
}

function worldWithWeights(assetId: string) {
  return {
    ...DEFAULT_WORLD,
    layers: [
      reliefLayer(
        { assetId: 'h' },
        {
          id: 'terrain',
          groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
          groundWeights: { assetId },
        },
      ),
    ],
  }
}

describe('a sculpt drag through the scene renderer', () => {
  it('paints interpolated dabs and wraps them in one history gesture', async () => {
    const strokes: ReliefDiskStroke[] = []
    const started = vi.fn()
    const ended = vi.fn()
    const published = vi.fn()
    const sculptor: ReliefSculptor = {
      raiseDisk: async stroke => {
        strokes.push(stroke)
        return CHANGED
      },
      note: vi.fn(),
      dispose: vi.fn(),
    }
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onReliefSculpt: published,
      onReliefStrokeStart: started,
      onReliefStrokeEnd: ended,
      relief: reliefStub(),
      createReliefSculptor: () => sculptor,
    })
    renderer['applyWorld'](worldWithTerrain())
    renderer.setArmedRelief({ terrainId: 'terrain', editId: 'hills' })
    renderer.setSculptBrush(1, 0.5)

    await renderer.startReliefStroke(0, 0)
    await renderer.moveReliefStroke(1, 0)
    renderer.endReliefStroke()

    expect(started).toHaveBeenCalledOnce()
    expect(ended).toHaveBeenCalledOnce()
    expect(started.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      published.mock.invocationCallOrder[0] ?? 0,
    )
    expect(strokes.length).toBeGreaterThan(1)
    expect(strokes[0]?.disk).toEqual({ x: 0, z: 0, radius: 1 })
    expect(strokes.at(-1)?.disk).toEqual({ x: 1, z: 0, radius: 1 })
    expect(strokes.every(stroke => stroke.amount === SCULPT_AMOUNT && stroke.falloff === 0.5)).toBe(
      true,
    )
    expect(published).toHaveBeenCalledTimes(strokes.length)
    renderer.dispose()
  })

  it('forwards a session amount other than the historical constant', async () => {
    const strokes: ReliefDiskStroke[] = []
    const sculptor: ReliefSculptor = {
      raiseDisk: async stroke => {
        strokes.push(stroke)
        return CHANGED
      },
      note: vi.fn(),
      dispose: vi.fn(),
    }
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      relief: reliefStub(),
      createReliefSculptor: () => sculptor,
    })
    renderer['applyWorld'](worldWithTerrain())
    renderer.setArmedRelief({ terrainId: 'terrain', editId: 'hills' })
    renderer.setSculptBrush(1, 0, 0.3)

    await renderer.startReliefStroke(0, 0)
    renderer.endReliefStroke()

    expect(strokes[0]?.amount).toBe(0.3)
    expect(strokes[0]?.amount).not.toBe(SCULPT_AMOUNT)
    renderer.dispose()
  })

  it('paints the armed ground-weight channel through the scene brush', async () => {
    const painted = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onGroundPaint: painted,
      relief: reliefStub(),
    })
    renderer['applyWorld'](worldWithTerrain())
    renderer.setSculptBrush(1, 0, 1)

    await expect(renderer.paintGroundDisk('terrain', 10, 10)).resolves.toBe(true)

    const paint = painted.mock.calls[0]?.[1]
    expect(paint?.pixels.some((value: number) => value !== 0)).toBe(true)
    expect(paint?.pixels.slice((128 * 256 + 128) * 4, (128 * 256 + 128) * 4 + 4)).toEqual(
      Uint8ClampedArray.from([255, 0, 0, 0]),
    )
    renderer.dispose()
  })

  it('finishes a quick ground click only after its asynchronous paint lands', async () => {
    let release: ((paint: null) => void) | undefined
    const loading = new Promise<null>(resolve => {
      release = resolve
    })
    const painted = vi.fn()
    const ended = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onGroundPaint: painted,
      onReliefStrokeEnd: ended,
      loadGroundPaint: async () => await loading,
      relief: reliefStub(),
    })
    renderer['applyWorld'](worldWithTerrain())
    renderer.setSculptTool('paintGround')

    const started = renderer['startGroundStroke']('terrain', 10, 10)
    renderer.endReliefStroke()
    expect(ended).not.toHaveBeenCalled()
    release?.(null)
    await started
    await vi.waitFor(() => expect(ended).toHaveBeenCalledOnce())

    expect(painted).toHaveBeenCalledOnce()
    renderer.dispose()
  })

  it('keeps an in-flight ground paint when the persisted weights land', async () => {
    const load = vi.fn(async () => emptyGroundWeights(4, 4))
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onGroundPaint: vi.fn(),
      loadGroundPaint: load,
      relief: reliefStub(),
    })
    renderer['applyWorld'](worldWithWeights('weights-1'))
    renderer.setSculptTool('paintGround')

    await renderer['startGroundStroke']('terrain', 1, 0)
    renderer['applyWorld'](worldWithWeights('weights-2'))
    await renderer.paintGroundDisk('terrain', 1, 0)

    expect(load).toHaveBeenCalledOnce()
    renderer.dispose()
  })

  it('publishes painted chunks for an armed scatter mask', async () => {
    const published = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onScatterMask: published,
      relief: reliefStub(),
      createReliefSculptor: () => ({
        raiseDisk: async () => CHANGED,
        note: vi.fn(),
        dispose: vi.fn(),
      }),
    })
    renderer['applyWorld']({
      ...worldWithTerrain(),
      layers: [...worldWithTerrain().layers, scatterLayer({ id: 'trees' })],
    })

    await expect(renderer.paintScatterMaskDisk('trees', 10, 10)).resolves.toBe(true)

    expect(published).toHaveBeenCalledWith('trees', CHANGED)
    renderer.dispose()
  })

  it('forwards a flatten stroke with the combined height at pointerdown as the target', async () => {
    const strokes: ReliefDiskStroke[] = []
    const values = Float32Array.from([0.4, 0.8, 0.1, 0.9])
    const sculptor: ReliefSculptor = {
      raiseDisk: async stroke => {
        strokes.push(stroke)
        return CHANGED
      },
      note: vi.fn(),
      dispose: vi.fn(),
    }
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      relief: {
        ...reliefStub(),
        sculptSource: vi.fn(() => ({
          samples: { width: 2, height: 2, values },
          extent: { origin: { x: 0, z: 0 }, size: { x: 1, z: 1 }, elevation: { min: 0, max: 1 } },
          grain: 1,
          sculpt: undefined,
          maskWeights: undefined,
          overlayAlpha: 1,
          overlays: [],
        })),
      },
      createReliefSculptor: () => sculptor,
    })
    renderer['applyWorld'](worldWithTerrain())
    renderer.setArmedRelief({ terrainId: 'terrain', editId: 'hills' })
    renderer.setSculptTool('flatten')
    renderer.setSculptBrush(1, 0, 1)

    await renderer.startReliefStroke(0, 0)
    await renderer.moveReliefStroke(1, 0)
    renderer.endReliefStroke()

    expect(strokes.length).toBeGreaterThan(0)
    expect(strokes.every(stroke => stroke.kind === 'flatten')).toBe(true)
    expect(strokes[0]?.target).toBeCloseTo(0.4)
    expect(strokes.every(stroke => stroke.target === strokes[0]?.target)).toBe(true)
    renderer.dispose()
  })

  it('releases the relief worker when leaving a combined-height tool', () => {
    const dispose = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      relief: reliefStub(),
    })
    renderer['reliefSculptor'] = {
      terrainId: 'terrain',
      editId: 'hills',
      paint: false,
      sculptor: { raiseDisk: vi.fn(), note: vi.fn(), dispose },
    }
    renderer.setSculptTool('smooth')

    renderer.setSculptTool('raise')

    expect(dispose).toHaveBeenCalledOnce()
    expect(renderer['reliefSculptor']).toBeNull()
    renderer.dispose()
  })
})
