// @vitest-environment jsdom
import { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import type { ReliefSculptor } from './reliefSculptor'
import type { ReliefSurface } from './reliefSurface'
import { SceneRenderer } from './SceneRenderer'

const TERRAIN = reliefLayer(
  { assetId: 'asset_height' },
  { id: 'terrain', edits: [terrainEditLayer({ id: 'hills' })] },
)

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
      sculpt: undefined,
      maskWeights: undefined,
      overlayAlpha: 1,
      overlays: [],
    })),
    dispose: vi.fn(),
  }
}

function armedRenderer(onReliefStrokeEnd = vi.fn()): SceneRenderer {
  const renderer = new SceneRenderer({
    onSelect: vi.fn(),
    onTransform: vi.fn(),
    relief: reliefStub(),
    createReliefSculptor: (): ReliefSculptor => ({
      raiseDisk: async () => null,
      note: vi.fn(),
      dispose: vi.fn(),
    }),
    onReliefStrokeEnd,
  })
  renderer['applyWorld']({ ...DEFAULT_WORLD, layers: [TERRAIN] })
  renderer.setArmedRelief({ terrainId: 'terrain', editId: 'hills' })
  return renderer
}

describe('leaving sculpt mode', () => {
  it('takes the brush ring off the terrain', () => {
    const renderer = armedRenderer()
    renderer.setSculptMode(true)
    renderer['brushCursor'].set({ x: 1, y: 2, z: 3, radius: 2, falloff: 0, visible: true })

    renderer.setSculptMode(false)

    expect(renderer['brushCursor'].object.visible).toBe(false)
    renderer.dispose()
  })
})

describe('a renderer disposed while a sculpt stroke is still down', () => {
  it('closes the history gesture the first dab opened', async () => {
    const ended = vi.fn()
    const renderer = armedRenderer(ended)
    await renderer.startReliefStroke(0, 0)
    expect(ended).not.toHaveBeenCalled()

    renderer.dispose()

    expect(ended).toHaveBeenCalledOnce()
  })
})
