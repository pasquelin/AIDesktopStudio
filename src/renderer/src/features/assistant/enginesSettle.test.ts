import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { installDocuments } from '@/stores/document-fixtures'
import { clearScenes } from '@/stores/scene-fixtures'
import { forgetSceneEngine, noteSceneApplied, registerSceneEngine } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAction } from './executor'

const DOCUMENT = 'doc-scene'

/** The scene each still was drawn from, so a case can say WHICH one the engine held. */
const drawn: SceneState[] = []

/**
 * A viewport, as React mounts one: it hands the engine every state — on the TASK after the store
 * takes it, which is what a render is and what the seam under test is made of.
 */
function mountViewport(): () => void {
  let held: SceneState = sceneOf(useScenes.getState(), DOCUMENT)
  const engine = {
    apply: (state: SceneState) => {
      held = state
    },
    captureStill: () => {
      drawn.push(held)
      return Promise.resolve(new Uint8Array([137, 80, 78, 71]))
    },
  } as unknown as SceneRenderer

  const hand = (): void => {
    const state = sceneOf(useScenes.getState(), DOCUMENT)
    engine.apply(state)
    noteSceneApplied(DOCUMENT, state)
  }
  hand()
  registerSceneEngine(DOCUMENT, engine)
  const stop = useScenes.subscribe(() => setTimeout(hand))
  return () => {
    stop()
    forgetSceneEngine(DOCUMENT)
  }
}

let unmount = (): void => {}

afterEach(() => {
  unmount()
  unmount = () => {}
})

beforeEach(() => {
  drawn.length = 0
  clearScenes()
  installFakeBridge({
    assets: {
      savePicture: () =>
        Promise.resolve({
          id: 'asset-still',
          name: 'Still',
          type: 'image',
          location: 'local',
          tags: [],
          createdAt: '2026-09-09T10:00:00.000Z',
        }),
    },
  })
  installDocuments({ [DOCUMENT]: '3d' }, DOCUMENT)
})

/**
 * 🛑 An edit answers the moment the STORE holds it, and the engine is handed that state one
 * render later. Two calls of one lot are a microtask apart and a render is a task, so everything
 * read off the engine — a still, an optimisation plan, an export — saw the scene as it stood
 * BEFORE the edit that had just been announced as done.
 */
describe('reading the engine right after an edit', () => {
  it('draws the still from the scene the edit left, not the one before it', async () => {
    unmount = mountViewport()

    expect(await runAction('node.add', { kind: 'box', name: 'Pilot Cube' })).toMatchObject({
      ok: true,
    })
    expect(await runAction('scene.capture', {})).toEqual({ ok: true })

    expect(drawn).toHaveLength(1)
    expect(drawn[0]?.nodes.map(node => node.name)).toContain('Pilot Cube')
  })
})
