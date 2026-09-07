import { describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, emptyHistory, run, undo } from '../core/history'
import {
  RELIEF_CHUNK_TEXELS,
  changedChunks,
  combinedAt,
  withChunkDelta,
  type ReliefMask,
  type ReliefSculpt,
} from '@shared/domain/relief'
import { DEFAULT_WORLD, reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import { readWorld } from './sceneWorld'
import {
  addTerrain,
  addTerrainEdit,
  removeTerrain,
  removeTerrainEdit,
  renameTerrain,
  renameTerrainEdit,
  reorderTerrainEdits,
  reorderTerrains,
  paintTerrainEditMask,
  sculptRelief,
  setTerrainEditAlpha,
  setTerrainEditMask,
  setTerrainEditEnabled,
  setTerrainEditLocked,
  setTerrainEnabled,
  setTerrainLocked,
} from './reliefCommands'
import { EMPTY_SCENE, type SceneState } from './sceneState'

const samples = {
  width: 66,
  height: 8,
  values: new Float32Array(66 * 8),
}

function sceneOf(sculpt?: ReliefSculpt): SceneState {
  return {
    ...EMPTY_SCENE,
    world: {
      ...DEFAULT_WORLD,
      layers: [
        reliefLayer(
          { assetId: 'asset_height' },
          { id: 'terrain', edits: [terrainEditLayer({ id: 'sculpt', sculpt })] },
        ),
      ],
    },
  }
}

function maskOf(state: SceneState): ReliefMask | undefined {
  const layer = state.world.layers[0]
  return layer?.kind === 'relief' ? layer.edits[0]?.mask : undefined
}

function payload(state: SceneState, column: number, row: number): string {
  const layer = state.world.layers[0]
  if (!layer || layer.kind !== 'relief') return ''
  return (
    layer.edits[0]?.sculpt?.chunks.find(chunk => chunk.column === column && chunk.row === row)
      ?.payload ?? ''
  )
}

describe('sculptRelief', () => {
  it('undoes only the second chunk, leaving the first stroke applied', () => {
    const first = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 2,
    })
    const second = withChunkDelta(samples, first, {
      column: 1,
      row: 0,
      localX: 0,
      localZ: 0,
      delta: 5,
    })

    const [afterFirst, history] = run(
      sceneOf(),
      emptyHistory(),
      sculptRelief('terrain', 'sculpt', changedChunks(undefined, first)),
    )
    const [afterSecond, stacked] = run(
      afterFirst,
      history,
      sculptRelief('terrain', 'sculpt', changedChunks(first, second)),
    )
    const [undone] = undo(afterSecond, stacked)

    expect(payload(afterSecond, 0, 0)).toBe(payload(afterFirst, 0, 0))
    expect(payload(afterSecond, 1, 0)).not.toBe('')
    expect(payload(undone, 0, 0)).toBe(payload(afterFirst, 0, 0))
    expect(payload(undone, 1, 0)).toBe('')
  })

  it('shares the scene stack: a hundred sculpt strokes drop the oldest scene edit', () => {
    let state = sceneOf()
    let history = emptyHistory<SceneState>()
    let sculpt: ReliefSculpt | undefined
    for (let at = 0; at < HISTORY_LIMIT + 1; at++) {
      const next = withChunkDelta(samples, sculpt, {
        column: 0,
        row: 0,
        localX: at % 8,
        localZ: 0,
        delta: 0.01,
      })
      ;[state, history] = run(
        state,
        history,
        sculptRelief('terrain', 'sculpt', changedChunks(sculpt, next)),
      )
      sculpt = next
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.dropped).not.toBeNull()
  })

  it('refuses a stroke on a sculpt-locked terrain, and on a locked edit', () => {
    const stroke = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 0,
      localZ: 0,
      delta: 1,
    })
    const chunks = changedChunks(undefined, stroke)
    const lockedTerrain = {
      ...sceneOf(),
      world: {
        ...DEFAULT_WORLD,
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            {
              id: 'terrain',
              locked: { sculpt: true, placement: false },
              edits: [terrainEditLayer({ id: 'sculpt' })],
            },
          ),
        ],
      },
    }
    const lockedEdit = {
      ...sceneOf(),
      world: {
        ...DEFAULT_WORLD,
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            { id: 'terrain', edits: [terrainEditLayer({ id: 'sculpt', locked: true })] },
          ),
        ],
      },
    }

    expect(sculptRelief('terrain', 'sculpt', chunks).apply(lockedTerrain)).toBe(lockedTerrain)
    expect(sculptRelief('terrain', 'sculpt', chunks).apply(lockedEdit)).toBe(lockedEdit)
  })
})

describe('terrain and edit-layer commands', () => {
  const empty = { ...EMPTY_SCENE, world: { ...DEFAULT_WORLD, layers: [] } }

  it('adds a terrain that names the heightmap, and takes it back', () => {
    const after = addTerrain({ assetId: 'asset_height' }, 'island').apply(empty)
    expect(after.world.layers).toEqual([
      reliefLayer(
        { assetId: 'asset_height' },
        { id: 'island', edits: [terrainEditLayer({ id: 'sculpt' })] },
      ),
    ])
    expect(removeTerrain('island').apply(after).world.layers).toEqual([])
  })

  it('renames, reorders, enables and padlocks a terrain', () => {
    const two = {
      ...empty,
      world: {
        ...DEFAULT_WORLD,
        layers: [
          reliefLayer({ assetId: 'a' }, { id: 'a', name: 'A' }),
          reliefLayer({ assetId: 'b' }, { id: 'b', name: 'B' }),
        ],
      },
    }
    expect(renameTerrain('a', 'Isle').apply(two).world.layers[0]?.name).toBe('Isle')
    expect(
      reorderTerrains(['b', 'a'])
        .apply(two)
        .world.layers.map(one => one.id),
    ).toEqual(['b', 'a'])
    expect(setTerrainEnabled('a', false).apply(two).world.layers[0]?.enabled).toBe(false)
    expect(
      setTerrainLocked('a', { sculpt: true, placement: false }).apply(two).world.layers[0],
    ).toMatchObject({ locked: { sculpt: true, placement: false } })
  })

  it('adds an empty edit, then names, reorders, enables, padlocks and weights it', () => {
    const start = sceneOf()
    const added = addTerrainEdit('terrain', 'hills').apply(start)
    const layer = added.world.layers[0]
    if (!layer || layer.kind !== 'relief') throw new Error('expected a relief')
    expect(layer.edits.map(one => one.id)).toEqual(['sculpt', 'hills'])
    expect(layer.edits[1]).toEqual(terrainEditLayer({ id: 'hills' }))

    const renamed = renameTerrainEdit('terrain', 'hills', 'Hills').apply(added)
    expect(reliefEdits(renamed)[1]?.name).toBe('Hills')
    expect(
      reorderTerrainEdits('terrain', ['hills', 'sculpt']).apply(added).world.layers[0],
    ).toMatchObject({ edits: [{ id: 'hills' }, { id: 'sculpt' }] })
    expect(setTerrainEditEnabled('terrain', 'hills', false).apply(added)).toMatchObject({
      world: { layers: [{ edits: [{ id: 'sculpt' }, { id: 'hills', enabled: false }] }] },
    })
    expect(setTerrainEditLocked('terrain', 'hills', true).apply(added)).toMatchObject({
      world: { layers: [{ edits: [{ id: 'sculpt' }, { id: 'hills', locked: true }] }] },
    })
    expect(setTerrainEditAlpha('terrain', 'hills', -0.5).apply(added)).toMatchObject({
      world: { layers: [{ edits: [{ id: 'sculpt' }, { id: 'hills', alpha: -0.5 }] }] },
    })
    expect(removeTerrainEdit('terrain', 'hills').apply(added).world.layers[0]).toMatchObject({
      edits: [{ id: 'sculpt' }],
    })
  })

  it('refuses to edit or remove a locked edit', () => {
    const locked = {
      ...sceneOf(),
      world: {
        ...DEFAULT_WORLD,
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            {
              id: 'terrain',
              edits: [terrainEditLayer({ id: 'a', locked: true }), terrainEditLayer({ id: 'b' })],
            },
          ),
        ],
      },
    }
    expect(removeTerrainEdit('terrain', 'a').apply(locked)).toBe(locked)
    expect(renameTerrainEdit('terrain', 'a', 'Hills').apply(locked)).toBe(locked)
    expect(setTerrainEditAlpha('terrain', 'a', 0.5).apply(locked)).toBe(locked)
    expect(reorderTerrainEdits('terrain', ['b', 'a']).apply(locked)).toBe(locked)
  })

  it('still switches a locked edit off, and still writes the padlock itself', () => {
    const locked = {
      ...sceneOf(),
      world: {
        ...DEFAULT_WORLD,
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            { id: 'terrain', edits: [terrainEditLayer({ id: 'sculpt', locked: true })] },
          ),
        ],
      },
    }
    expect(setTerrainEditEnabled('terrain', 'sculpt', false).apply(locked)).toMatchObject({
      world: { layers: [{ edits: [{ locked: true, enabled: false }] }] },
    })
    expect(
      setTerrainEditLocked('terrain', 'sculpt', false).apply(locked).world.layers[0],
    ).toMatchObject({ edits: [{ locked: false }] })
  })
})

function reliefEdits(state: SceneState) {
  const layer = state.world.layers[0]
  return layer?.kind === 'relief' ? layer.edits : []
}

describe('a sculpt-only document opened into edit layers', () => {
  it('keeps the migrated overlay intact when a second edit is sculpted', () => {
    const samples = {
      width: 8,
      height: 8,
      values: new Float32Array(64),
    }
    const original = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 2,
    })
    const opened = {
      ...EMPTY_SCENE,
      world: readWorld(
        { layers: [{ kind: 'relief', heightmap: { assetId: 'asset_height' }, sculpt: original }] },
        undefined,
      ),
    }
    const layer = opened.world.layers[0]
    if (!layer || layer.kind !== 'relief') throw new Error('expected a migrated relief')
    const firstId = layer.edits[0]?.id
    if (!firstId) throw new Error('expected the implicit Sculpt edit')

    const added = addTerrainEdit(layer.id, 'hills').apply(opened)
    const extra = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 3,
    })
    const sculpted = sculptRelief(layer.id, 'hills', changedChunks(undefined, extra)).apply(added)
    const next = sculpted.world.layers[0]
    if (!next || next.kind !== 'relief') throw new Error('expected a relief after sculpt')

    expect(next.edits.find(edit => edit.id === firstId)?.sculpt).toEqual(original)
    expect(combinedAt(samples, next.grain, next.edits, 1, 1)).toBeCloseTo(5)
    expect(next.grain).toBe(RELIEF_CHUNK_TEXELS)
  })
})

describe('terrain edit masks', () => {
  it('stores a height mask on the edit and drops it again', () => {
    const [masked] = run(
      sceneOf(),
      emptyHistory(),
      setTerrainEditMask('terrain', 'sculpt', { kind: 'height', min: 100, max: 800 }),
    )
    expect(maskOf(masked)).toEqual({ kind: 'height', min: 100, max: 800 })

    const [cleared] = run(
      masked,
      emptyHistory(),
      setTerrainEditMask('terrain', 'sculpt', undefined),
    )
    expect(maskOf(cleared)).toBeUndefined()
  })

  it('paints packed weights onto a painted mask', () => {
    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 1,
    })
    const [painted] = run(
      sceneOf(),
      emptyHistory(),
      paintTerrainEditMask('terrain', 'sculpt', weights.chunks),
    )
    expect(maskOf(painted)).toEqual({ kind: 'painted', weights })
  })

  it('refuses to paint over a height mask, whose bounds a painted mask cannot hold', () => {
    const [masked] = run(
      sceneOf(),
      emptyHistory(),
      setTerrainEditMask('terrain', 'sculpt', { kind: 'height', min: 2, max: 7 }),
    )
    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 1,
    })

    const [after, history] = run(
      masked,
      emptyHistory(),
      paintTerrainEditMask('terrain', 'sculpt', weights.chunks),
    )

    expect(maskOf(after)).toEqual({ kind: 'height', min: 2, max: 7 })
    expect(history.past).toHaveLength(0)
  })

  it('gives back the mask a paint stroke found, never an empty painted one', () => {
    const first = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 1,
    })
    const second = withChunkDelta(samples, first, {
      column: 0,
      row: 0,
      localX: 2,
      localZ: 1,
      delta: 1,
    })
    const [painted, once] = run(
      sceneOf(),
      emptyHistory(),
      paintTerrainEditMask('terrain', 'sculpt', first.chunks),
    )
    const [twice, both] = run(
      painted,
      once,
      paintTerrainEditMask('terrain', 'sculpt', second.chunks),
    )

    const [back, rest] = undo(twice, both)
    expect(maskOf(back)).toEqual({ kind: 'painted', weights: first })

    expect(maskOf(undo(back, rest)[0])).toBeUndefined()
  })
})
