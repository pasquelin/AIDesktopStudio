import { describe, expect, it } from 'vitest'
import { gameMessageOf } from './gameChannel'

/**
 * A `BroadcastChannel` is reachable by anything running on this origin, so what arrives on it is
 * checked rather than trusted: the game window hands what it reads straight to a runtime that
 * builds a world out of it, and the studio runs what comes back as a command.
 */
describe('what the two windows accept off the wire', () => {
  const scene = { nodes: [], animation: { duration: 5 } }
  const inputMaps = [{ version: 1, id: 'character', priority: 0, defaultActive: true, actions: [] }]
  const patch = {
    changedNodes: [],
    removedIds: [],
    order: null,
    world: null,
    animation: null,
  }

  it('takes the messages the studio publishes', () => {
    expect(
      gameMessageOf({
        kind: 'play',
        documentId: 'd',
        scene,
        modules: [],
        troubles: [],
        inputMaps,
        animationGraphs: [],
      }),
    ).toEqual({
      kind: 'play',
      documentId: 'd',
      scene,
      modules: [],
      troubles: [],
      inputMaps,
      animationGraphs: [],
    })
    expect(gameMessageOf({ kind: 'edit', documentId: 'd', patch })).toEqual({
      kind: 'edit',
      documentId: 'd',
      patch,
    })
    expect(gameMessageOf({ kind: 'scene', scene: 'World01', found: 'unknown' })).toEqual({
      kind: 'scene',
      scene: 'World01',
      found: 'unknown',
    })
    expect(gameMessageOf({ kind: 'command', id: 3, command: { name: 'step', steps: 10 } })).toEqual(
      { kind: 'command', id: 3, command: { name: 'step', steps: 10 } },
    )
    expect(gameMessageOf({ kind: 'gone' })).toEqual({ kind: 'gone' })
    expect(gameMessageOf({ kind: 'clearOptimization', documentId: 'd' })).toEqual({
      kind: 'clearOptimization',
      documentId: 'd',
    })
  })

  it('takes the messages the game window answers with', () => {
    const report = {
      state: 'playing',
      tick: 1,
      fps: 60,
      frameMs: 16,
      entities: 1,
      logs: [],
      errors: [],
      veil: 0,
    }
    expect(gameMessageOf({ kind: 'ask' })).toEqual({ kind: 'ask' })
    expect(gameMessageOf({ kind: 'report', documentId: 'd', report })).toEqual({
      kind: 'report',
      documentId: 'd',
      report,
    })
    expect(gameMessageOf({ kind: 'want', scene: 'World01' })).toEqual({
      kind: 'want',
      scene: 'World01',
    })
    expect(gameMessageOf({ kind: 'done', id: 3, ok: true, ran: 10 })).toEqual({
      kind: 'done',
      id: 3,
      ok: true,
      ran: 10,
    })
  })

  it('refuses anything else, whatever it calls itself', () => {
    expect(gameMessageOf(null)).toBeNull()
    expect(gameMessageOf('play')).toBeNull()
    expect(gameMessageOf({ kind: 'play', documentId: 'd' })).toBeNull()
    // The shape is read at the depth the runtime reads it at, so a scene-shaped hole is caught.
    expect(gameMessageOf({ kind: 'play', documentId: 'd', scene: { nodes: [] } })).toBeNull()
    expect(
      gameMessageOf({ kind: 'edit', documentId: 'd', patch: { ...patch, changedNodes: [null] } }),
    ).toBeNull()
    expect(
      gameMessageOf({ kind: 'edit', documentId: 'd', patch: { ...patch, removedIds: [1] } }),
    ).toBeNull()
    expect(
      gameMessageOf({ kind: 'edit', documentId: 'd', patch: { ...patch, order: [{}] } }),
    ).toBeNull()
    expect(gameMessageOf({ kind: 'command', id: 1, command: { name: 'explode' } })).toBeNull()
    expect(gameMessageOf({ kind: 'clearOptimization', documentId: 1 })).toBeNull()
    // A step with no count would run whatever `undefined` steps means to a loop.
    expect(gameMessageOf({ kind: 'command', id: 1, command: { name: 'step' } })).toBeNull()
    expect(
      gameMessageOf({ kind: 'report', documentId: 'd', report: { state: 'flying' } }),
    ).toBeNull()
  })

  /**
   * An array IS an object, so a bare record test takes one. `worldWithRuntimePatch` writes
   * `patch.world` over `state.world` whole, and the first frame reads `background.kind` off it.
   */
  it('refuses a patch whose world or animation arrived as an array', () => {
    expect(
      gameMessageOf({ kind: 'edit', documentId: 'd', patch: { ...patch, world: [] } }),
    ).toBeNull()
    expect(
      gameMessageOf({ kind: 'edit', documentId: 'd', patch: { ...patch, animation: [] } }),
    ).toBeNull()
    expect(gameMessageOf({ kind: 'edit', documentId: 'd', patch: [] })).toBeNull()
  })

  /** A scene the studio HOLDS travels whole; the other two answers are words. */
  it('reads the three answers a scene lookup has', () => {
    expect(gameMessageOf({ kind: 'scene', scene: 'a', found: 'reading' })?.kind).toBe('scene')
    expect(
      gameMessageOf({ kind: 'scene', scene: 'a', found: { state: scene, document: 'doc' } }),
    ).toEqual({ kind: 'scene', scene: 'a', found: { state: scene, document: 'doc' } })
    expect(gameMessageOf({ kind: 'scene', scene: 'a', found: { state: scene } })).toBeNull()
  })
})
