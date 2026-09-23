import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { stillWaiting } from '@/helpers/waiting-fixtures'
import { clearScenes } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetSceneEngine,
  noteSceneApplied,
  registerSceneEngine,
  sceneEngineSettled,
} from './sceneEngines'

/** The engine is never touched here: what is under test is who has been handed which state. */
const engine = {} as SceneRenderer

beforeEach(() => {
  clearScenes()
  forgetSceneEngine('doc-1')
})

/**
 * An edit answers the moment the STORE holds it, and the engine is handed that state one React
 * render later. Everything read off the engine — a still, an optimisation plan, an export — was
 * reading the scene as it stood before the edit whenever the two calls sat in one lot.
 */
describe('waiting for the engine to carry the scene', () => {
  // An engine that has never noted takes its content from somewhere this gate knows nothing
  // about — a bench port standing in for pixels — so it is not late, and waiting would not end.
  it('settles at once for an engine that has never been handed a state', async () => {
    registerSceneEngine('doc-1', engine)
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-1')))

    expect(await stillWaiting(sceneEngineSettled('doc-1'))).toBe(false)
  })

  it('settles at once for a document no viewport is mounted for', async () => {
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-1')))

    expect(await stillWaiting(sceneEngineSettled('doc-1'))).toBe(false)
  })

  it('holds while the mounted engine still carries the state before the edit', async () => {
    registerSceneEngine('doc-1', engine)
    noteSceneApplied('doc-1', sceneOf(useScenes.getState(), 'doc-1'))
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-1')))

    const waiting = sceneEngineSettled('doc-1')
    expect(await stillWaiting(waiting)).toBe(true)

    noteSceneApplied('doc-1', sceneOf(useScenes.getState(), 'doc-1'))
    await expect(waiting).resolves.toBeUndefined()
  })

  // Nothing will ever apply it now, and a caller left waiting on a torn-down viewport would hang
  // for the life of the window.
  it('lets go when the viewport it was waiting on goes', async () => {
    registerSceneEngine('doc-1', engine)
    noteSceneApplied('doc-1', sceneOf(useScenes.getState(), 'doc-1'))
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-1')))

    const waiting = sceneEngineSettled('doc-1')
    expect(await stillWaiting(waiting)).toBe(true)

    forgetSceneEngine('doc-1')
    await expect(waiting).resolves.toBeUndefined()
  })
})
