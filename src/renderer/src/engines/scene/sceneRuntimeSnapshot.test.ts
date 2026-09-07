import { describe, expect, it } from 'vitest'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { newComponent } from '@shared/domain/componentRegistry'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { cameraNodeFixture, meshNode } from './scene-fixtures'
import { sceneRuntimeSnapshot } from './sceneRuntimeSnapshot'
import type { SceneState } from './sceneState'

describe('sceneRuntimeSnapshot', () => {
  it('observes the runtime state needed by every SAFE functional check', () => {
    const mesh = {
      ...meshNode('mesh'),
      components: [newComponent('Script'), newComponent('RigidBody')],
      instances: [{ sourceId: 'source', name: 'Source', transform: meshNode('source').transform }],
    }
    const camera = cameraNodeFixture('camera')
    const state: SceneState = {
      nodes: [mesh, camera],
      selectedIds: [],
      world: DEFAULT_WORLD,
      animation: EMPTY_TIMELINE,
    }

    const snapshot = sceneRuntimeSnapshot(state)

    expect(snapshot.picking).toContainEqual({ sourceId: 'source', runtimeId: 'mesh' })
    expect(snapshot.scripts).toEqual([{ nodeId: 'mesh', component: mesh.components[0] }])
    expect(snapshot.physics).toEqual([{ nodeId: 'mesh', component: mesh.components[1] }])
    expect(snapshot.shadows).toContainEqual({
      id: 'mesh',
      cast: mesh.castShadow,
      receive: mesh.receiveShadow,
    })
    expect(snapshot.cameras).toEqual([{ id: 'camera', camera: camera.camera }])
    expect(snapshot.visibility).toHaveLength(2)
    expect(snapshot.postProcessing).toEqual({
      world: state.world.post,
      cameras: [{ id: 'camera', post: camera.camera.post ?? null }],
    })
    expect(snapshot.transforms).toContainEqual({
      id: 'mesh',
      transform: mesh.transform,
      instances: mesh.instances,
    })
    expect(snapshot.duplication).toEqual(['mesh', 'source', 'camera'])
    expect(snapshot.undoRedo).toEqual(state.nodes)
  })
})
