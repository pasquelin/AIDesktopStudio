import { beforeEach, describe, expect, it } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { sceneStore, selectIn, useScenes } from '@/stores/scenes'
import { documentStateOf } from './documentStateProviders'

const document: DocumentDescriptor = {
  id: 'scene-a',
  title: 'Scene A',
  kind: 'scene',
  workspace: '3d',
  path: 'Scenes/Scene A.gltf',
}

describe('assistant document state providers', () => {
  beforeEach(() => sceneStore.resetForTests())

  it('reads the requested store state with a stable incarnation and logical revision', () => {
    useScenes.getState().replace(document.id, createDefaultScene())
    const first = documentStateOf(document)
    useScenes.getState().runCommand(document.id, {
      id: 'rename',
      apply: state => ({
        ...state,
        world: { ...state.world, exposure: state.world.exposure + 1 },
      }),
      revert: state => state,
    })
    const second = documentStateOf(document)

    expect(second?.incarnation).toBe(first?.incarnation)
    expect(second?.revision).toBe((first?.revision ?? 0) + 1)
    expect(second?.state).toMatchObject({
      world: { exposure: createDefaultScene().world.exposure + 1 },
    })
  })

  it('keeps selection changes outside the structural revision', () => {
    const state = createDefaultScene()
    useScenes.getState().replace(document.id, state)
    const before = sceneStore.revisionOf(useScenes.getState(), document.id)

    selectIn(
      document.id,
      state.nodes.slice(0, 1).map(node => node.id),
    )

    expect(sceneStore.revisionOf(useScenes.getState(), document.id)).toBe(before)
  })

  it('answers null while the requested document has no engine state', () => {
    expect(documentStateOf(document)).toBeNull()
  })
})
