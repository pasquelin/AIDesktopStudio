import { describe, expect, it } from 'vitest'
import { emptyHistory, run, undo } from '../core/history'
import { changedChunks, withChunkDelta, type ReliefMask } from '@shared/domain/relief'
import { DEFAULT_WORLD, reliefLayer, scatterLayer, type ScatterLayer } from '@shared/domain/scene'
import {
  addScatter,
  paintScatterMask,
  removeScatter,
  renameScatter,
  reorderScatters,
  setScatterEnabled,
  setScatterLocked,
  setScatterMask,
  setScatterAssets,
  setScatterCategory,
  setScatterCollision,
  setScatterFollowRelief,
} from './scatterCommands'
import { EMPTY_SCENE, type SceneState } from './sceneState'

const samples = {
  width: 66,
  height: 8,
  values: new Float32Array(66 * 8),
}

function sceneOf(
  layers: SceneState['world']['layers'] = [scatterLayer({ id: 'trees' })],
): SceneState {
  return { ...EMPTY_SCENE, world: { ...DEFAULT_WORLD, layers } }
}

function scatterIn(state: SceneState, id = 'trees'): ScatterLayer | undefined {
  const layer = state.world.layers.find(one => one.id === id)
  return layer?.kind === 'scatter' ? layer : undefined
}

function maskOf(state: SceneState): ReliefMask | undefined {
  return scatterIn(state)?.mask
}

describe('scatter layer commands', () => {
  it('adds a scatter layer and undoes the add', () => {
    const [added, history] = run(sceneOf([]), emptyHistory(), addScatter('trees'))
    expect(scatterIn(added)?.kind).toBe('scatter')
    const [undone] = undo(added, history)
    expect(undone.world.layers).toEqual([])
  })

  it('refuses a second scatter with the same id', () => {
    const [after, history] = run(sceneOf(), emptyHistory(), addScatter('trees'))
    expect(after.world.layers).toHaveLength(1)
    expect(history.past).toEqual([])
  })

  it('removes a scatter layer and restores it on undo', () => {
    const [removed, history] = run(sceneOf(), emptyHistory(), removeScatter('trees'))
    expect(removed.world.layers).toEqual([])
    const [undone] = undo(removed, history)
    expect(scatterIn(undone)?.id).toBe('trees')
  })

  it('renames, hides and locks a scatter layer', () => {
    const [named] = run(sceneOf(), emptyHistory(), renameScatter('trees', 'Pines'))
    const [hidden] = run(named, emptyHistory(), setScatterEnabled('trees', false))
    const [locked] = run(hidden, emptyHistory(), setScatterLocked('trees', true))
    expect(scatterIn(locked)).toMatchObject({ name: 'Pines', enabled: false, locked: true })
  })

  it('names assets, collision and relief follow on a scatter layer', () => {
    const [named] = run(
      sceneOf(),
      emptyHistory(),
      setScatterAssets('trees', [{ assetId: 'pine', weight: 1 }]),
    )
    const [colliding] = run(named, emptyHistory(), setScatterCollision('trees', true))
    const [following] = run(colliding, emptyHistory(), setScatterFollowRelief('trees', 'none'))
    expect(scatterIn(following)).toMatchObject({
      assets: [{ assetId: 'pine', weight: 1 }],
      collision: true,
      followRelief: 'none',
    })
  })

  it('makes collision impossible when a scatter becomes grass', () => {
    const [colliding] = run(sceneOf(), emptyHistory(), setScatterCollision('trees', true))
    const [grass] = run(colliding, emptyHistory(), setScatterCategory('trees', 'grass'))
    const [stillGrass] = run(grass, emptyHistory(), setScatterCollision('trees', true))
    expect(scatterIn(stillGrass)).toMatchObject({ category: 'grass', collision: false })
  })

  it('keeps the category of a locked scatter', () => {
    const [locked] = run(sceneOf(), emptyHistory(), setScatterLocked('trees', true))
    const [unchanged, history] = run(locked, emptyHistory(), setScatterCategory('trees', 'grass'))

    expect(scatterIn(unchanged)?.category).toBe('props')
    expect(history.past).toEqual([])
  })

  it('reorders mixed relief and scatter layers by id', () => {
    const terrain = reliefLayer({ assetId: 'height' }, { id: 'ground' })
    const scatter = scatterLayer({ id: 'trees' })
    const [reordered] = run(
      sceneOf([terrain, scatter]),
      emptyHistory(),
      reorderScatters(['trees', 'ground']),
    )
    expect(reordered.world.layers.map(layer => layer.id)).toEqual(['trees', 'ground'])
  })
})

describe('scatter placement mask', () => {
  it('paints packed weights onto a painted mask', () => {
    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 1,
    })
    const [painted] = run(sceneOf(), emptyHistory(), paintScatterMask('trees', weights.chunks))
    expect(maskOf(painted)).toEqual({ kind: 'painted', weights })
  })

  it('stores a height mask and drops it again', () => {
    const [masked] = run(
      sceneOf(),
      emptyHistory(),
      setScatterMask('trees', { kind: 'height', min: 4, max: 40 }),
    )
    expect(maskOf(masked)).toEqual({ kind: 'height', min: 4, max: 40 })
    const [cleared] = run(masked, emptyHistory(), setScatterMask('trees', undefined))
    expect(maskOf(cleared)).toBeUndefined()
  })

  it('refuses to paint over a height mask, whose bounds a painted mask cannot hold', () => {
    const [masked] = run(
      sceneOf(),
      emptyHistory(),
      setScatterMask('trees', { kind: 'height', min: 2, max: 7 }),
    )
    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 1,
    })
    const [after, history] = run(masked, emptyHistory(), paintScatterMask('trees', weights.chunks))
    expect(maskOf(after)).toEqual({ kind: 'height', min: 2, max: 7 })
    expect(history.past).toEqual([])
  })

  it('refuses to paint a locked scatter layer', () => {
    const [locked] = run(sceneOf(), emptyHistory(), setScatterLocked('trees', true))
    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 0,
      localZ: 0,
      delta: 1,
    })
    const [after, history] = run(
      locked,
      emptyHistory(),
      paintScatterMask('trees', changedChunks(undefined, weights)),
    )
    expect(maskOf(after)).toBeUndefined()
    expect(history.past).toEqual([])
  })
})
