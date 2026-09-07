import { beforeEach, describe, expect, it } from 'vitest'
import { canRedo, canUndo, HISTORY_LIMIT } from '@/engines/core/history'
import { addNode, setTransform } from '@/engines/scene/commands'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { meshNode, modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, IDENTITY_TRANSFORM } from '@/engines/scene/sceneState'
import type { Asset, AssetType } from '@shared/domain/asset'
import { clearScenes } from './scene-fixtures'
import { assetClip } from '@shared/domain/scene'
import { animationViewOf, useAnimationViews } from './animationView'
import {
  addAnimationTo,
  laySceneClip,
  sceneHistoryOf,
  isSceneDirty,
  sceneOf,
  sceneStore,
  seedSceneTemplate,
  useScenes,
} from './scenes'

const box = meshNode('box-1')

describe('scenes store', () => {
  beforeEach(() => {
    clearScenes()
  })

  it('gives an empty scene for a document never opened', () => {
    expect(sceneOf(useScenes.getState(), 'unknown')).toEqual(EMPTY_SCENE)
  })

  it('runs a command against the right document', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toHaveLength(1)
    expect(sceneOf(useScenes.getState(), 'doc-2').nodes).toHaveLength(0)
  })

  it('keeps one history per document', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    expect(canUndo(sceneHistoryOf(useScenes.getState(), 'doc-1'))).toBe(true)
    expect(canUndo(sceneHistoryOf(useScenes.getState(), 'doc-2'))).toBe(false)
  })

  it('undoes and redoes within one document', () => {
    const { runCommand, undo, redo } = useScenes.getState()
    runCommand('doc-1', addNode(box))

    undo('doc-1')
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toHaveLength(0)
    expect(canRedo(sceneHistoryOf(useScenes.getState(), 'doc-1'))).toBe(true)

    redo('doc-1')
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toHaveLength(1)
  })

  it('forgets a scene and its history when the document closes', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    useScenes.getState().drop('doc-1')
    expect(useScenes.getState().states['doc-1']).toBeUndefined()
    expect(useScenes.getState().histories['doc-1']).toBeUndefined()
  })
})

describe('isSceneDirty', () => {
  const dirty = (documentId: string): boolean => isSceneDirty(useScenes.getState(), documentId)

  beforeEach(() => {
    clearScenes()
  })

  it('calls a document that has never been written modified', () => {
    useScenes.getState().ensure('doc-1', createDefaultScene)
    expect(dirty('doc-1')).toBe(true)
  })

  it('calls a document clean the moment it is written', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    useScenes.getState().markSaved('doc-1', sceneStore.markOf(useScenes.getState(), 'doc-1'))
    expect(dirty('doc-1')).toBe(false)
  })

  it('calls it modified again on the next command', () => {
    useScenes.getState().markSaved('doc-1', sceneStore.markOf(useScenes.getState(), 'doc-1'))
    useScenes.getState().runCommand('doc-1', addNode(box))
    expect(dirty('doc-1')).toBe(true)
  })

  // A counter of edits would keep calling this modified; what is on screen is what is on disk.
  it('calls it clean again when an undo lands back on the saved state', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    useScenes.getState().markSaved('doc-1', sceneStore.markOf(useScenes.getState(), 'doc-1'))
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-2')))

    useScenes.getState().undo('doc-1')
    expect(dirty('doc-1')).toBe(false)
  })

  it('calls it modified again once that undo is redone', () => {
    useScenes.getState().markSaved('doc-1', sceneStore.markOf(useScenes.getState(), 'doc-1'))
    useScenes.getState().runCommand('doc-1', addNode(box))
    useScenes.getState().undo('doc-1')
    useScenes.getState().redo('doc-1')

    expect(dirty('doc-1')).toBe(true)
  })

  it('reads each document on its own', () => {
    useScenes.getState().markSaved('doc-1', sceneStore.markOf(useScenes.getState(), 'doc-1'))
    expect(dirty('doc-1')).toBe(false)
    expect(dirty('doc-2')).toBe(true)
  })

  // What `history.ts` calls `dropped`, seen from the store: the bullet used to vanish from the
  // tab while the commands the stack dropped were still applied.
  it('stays modified after an undo that only reached the end of a truncated stack', () => {
    useScenes.getState().markSaved('doc-1', sceneStore.markOf(useScenes.getState(), 'doc-1'))
    expect(dirty('doc-1')).toBe(false)

    for (let index = 0; index < HISTORY_LIMIT + 1; index += 1) {
      useScenes.getState().runCommand('doc-1', addNode(meshNode(`box-${index}`)))
    }
    while (canUndo(sceneHistoryOf(useScenes.getState(), 'doc-1')))
      useScenes.getState().undo('doc-1')

    expect(sceneHistoryOf(useScenes.getState(), 'doc-1').past).toHaveLength(0)
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).not.toHaveLength(0)
    expect(dirty('doc-1')).toBe(true)
  })

  it('forgets the mark when the document closes', () => {
    useScenes.getState().markSaved('doc-1', sceneStore.markOf(useScenes.getState(), 'doc-1'))
    useScenes.getState().drop('doc-1')
    expect(dirty('doc-1')).toBe(true)
  })
})

describe('ensure', () => {
  beforeEach(() => {
    clearScenes()
  })

  it('installs the default scene the first time a document is opened', () => {
    useScenes.getState().ensure('doc-1', createDefaultScene)
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toHaveLength(3)
  })

  it('leaves an existing scene alone, so reopening a tab does not reset it', () => {
    useScenes.getState().ensure('doc-1', createDefaultScene)
    const before = sceneOf(useScenes.getState(), 'doc-1')

    useScenes.getState().ensure('doc-1', createDefaultScene)
    expect(sceneOf(useScenes.getState(), 'doc-1')).toBe(before)
  })

  it('gives two documents their own nodes rather than a shared default', () => {
    useScenes.getState().ensure('doc-1', createDefaultScene)
    useScenes.getState().ensure('doc-2', createDefaultScene)

    const first = sceneOf(useScenes.getState(), 'doc-1').nodes[0]?.id
    const second = sceneOf(useScenes.getState(), 'doc-2').nodes[0]?.id
    expect(first).not.toBe(second)
  })
})

describe('seedSceneTemplate', () => {
  beforeEach(() => {
    clearScenes()
  })

  it('fills a new document with what its template opens on', () => {
    seedSceneTemplate('doc-1', 'topDown')
    const scene = sceneOf(useScenes.getState(), 'doc-1')

    expect(scene.nodes.some(node => node.type === 'camera')).toBe(true)
    expect(scene.world.play.camera).toBe('topDown')
  })

  // The tab may already have been restored from disk by the time this runs on a slow machine,
  // and a template written over a saved scene would be the work lost.
  it('never writes over a scene that is already there', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    seedSceneTemplate('doc-1', 'basic')

    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toEqual([box])
  })
})

describe('gestures', () => {
  const moved = (x: number) => ({ ...IDENTITY_TRANSFORM, position: { x, y: 0, z: 0 } })
  const positionOf = (documentId: string) =>
    sceneOf(useScenes.getState(), documentId).nodes[0]?.transform.position.x

  const drag = (documentId: string, values: number[]) => {
    const store = useScenes.getState()
    store.beginGesture(documentId)
    for (const value of values) store.runCommand(documentId, setTransform('box-1', moved(value)))
    store.endGesture(documentId)
  }

  beforeEach(() => {
    useScenes.setState({
      states: { 'doc-1': { ...EMPTY_SCENE, nodes: [box], selectedIds: [] } },
      histories: {},
    })
  })

  it('leaves one history entry for a drag that emitted a value per frame', () => {
    drag('doc-1', [1, 2, 3, 4, 5])

    expect(positionOf('doc-1')).toBe(5)
    expect(sceneHistoryOf(useScenes.getState(), 'doc-1').past).toHaveLength(1)
  })

  it('undoes the whole drag rather than one frame of it', () => {
    drag('doc-1', [1, 2, 3])
    useScenes.getState().undo('doc-1')

    expect(positionOf('doc-1')).toBe(0)
    expect(canUndo(sceneHistoryOf(useScenes.getState(), 'doc-1'))).toBe(false)
  })

  // Two drags of the same field are two things the user did, and ⌘Z must give them back one
  // at a time — which is what the gesture, rather than the command id alone, decides.
  it('keeps two successive drags of the same field apart', () => {
    drag('doc-1', [1, 2])
    drag('doc-1', [8, 9])

    expect(sceneHistoryOf(useScenes.getState(), 'doc-1').past).toHaveLength(2)

    useScenes.getState().undo('doc-1')
    expect(positionOf('doc-1')).toBe(2)
  })

  it('merges nothing outside a gesture', () => {
    const store = useScenes.getState()
    store.runCommand('doc-1', setTransform('box-1', moved(1)))
    store.runCommand('doc-1', setTransform('box-1', moved(2)))

    expect(sceneHistoryOf(useScenes.getState(), 'doc-1').past).toHaveLength(2)
  })

  // ⌘Z mid-drag: the entry the next value would merge into is no longer the one it started from.
  it('closes the gesture an undo interrupts', () => {
    const store = useScenes.getState()
    store.beginGesture('doc-1')
    store.runCommand('doc-1', setTransform('box-1', moved(1)))
    store.undo('doc-1')
    store.runCommand('doc-1', setTransform('box-1', moved(2)))

    expect(positionOf('doc-1')).toBe(2)
    expect(sceneHistoryOf(useScenes.getState(), 'doc-1').past).toHaveLength(1)
  })

  it('keeps a gesture to the document that opened it', () => {
    const store = useScenes.getState()
    useScenes.setState({
      states: {
        'doc-1': { ...EMPTY_SCENE, nodes: [box], selectedIds: [] },
        'doc-2': { ...EMPTY_SCENE, nodes: [box], selectedIds: [] },
      },
      histories: {},
    })

    store.beginGesture('doc-1')
    store.runCommand('doc-2', setTransform('box-1', moved(1)))
    store.runCommand('doc-2', setTransform('box-1', moved(2)))

    expect(sceneHistoryOf(useScenes.getState(), 'doc-2').past).toHaveLength(2)
  })
})

describe('laying a motion on a character', () => {
  const asset = (type: AssetType): Asset => ({
    id: 'asset-9',
    name: 'jig',
    type,
    location: 'local',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  const installed = (selectedIds: readonly string[]) => {
    useScenes.setState({
      states: { 'doc-1': { ...EMPTY_SCENE, nodes: [modelNodeFixture('m')], selectedIds } },
      histories: {},
    })
  }

  it('lays a block on the character that is selected', () => {
    installed(['m'])

    expect(addAnimationTo('doc-1', asset('animation'))).toBe(true)
    const node = sceneOf(useScenes.getState(), 'doc-1').nodes[0]
    expect(node?.type === 'model' && node.model.lanes?.[0]?.clips[0]?.source).toEqual({
      kind: 'asset',
      assetId: 'asset-9',
      name: 'jig',
    })
  })

  // Every panel describes the block the band shows as chosen, so a block laid and left unpicked
  // leaves them all empty while the motion plays in the viewport.
  it('chooses the block it lays, so the panels describe it', () => {
    installed(['m'])
    addAnimationTo('doc-1', asset('animation'))

    const node = sceneOf(useScenes.getState(), 'doc-1').nodes[0]
    const laid = node?.type === 'model' ? node.model.lanes?.[0]?.clips[0]?.id : null
    expect(animationViewOf(useAnimationViews.getState(), 'doc-1').pickedBlock).toBe(laid)
  })

  // A block nothing carries would clear the keys one had selected, for an edit that never was.
  it('chooses nothing when there was no model to lay it on', () => {
    installed(['m'])
    useAnimationViews.getState().setPickedBlock('doc-1', 'kept')

    laySceneClip('doc-1', 'no-such-node', assetClip('c9', 'asset-9', 'jig'))

    expect(animationViewOf(useAnimationViews.getState(), 'doc-1').pickedBlock).toBe('kept')
  })

  // With nobody selected there is nobody to make it move, and landing a node of its own would
  // put an invisible skeleton in the scene.
  it('refuses when no character is selected, rather than adding a node', () => {
    installed([])

    expect(addAnimationTo('doc-1', asset('animation'))).toBe(false)
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toHaveLength(1)
  })

  it('refuses an asset of any other kind', () => {
    installed(['m'])

    expect(addAnimationTo('doc-1', asset('mesh'))).toBe(false)
  })
})
