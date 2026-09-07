import { describe, expect, it } from 'vitest'
import { InstancedMesh, PerspectiveCamera } from 'three'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { GeometryDescriptor } from '@shared/domain/scene'
import type { AssetPort } from '@game/ports/assetPort'
import { meshNode } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE, type SceneNode } from '@/engines/scene/sceneState'
import { isDrawn, WORTH_INSTANCING } from '@/engines/scene/grouping'
import { CELL_SIZE } from '@/engines/scene/worldPartition'
import { buildGameScene } from './gameScene'
import { frameOwesDraw, frameOwesShadows, type GameFlush } from './gameSceneFrame'

const NOTHING: AssetPort = { urlOf: () => null }
const BOX: GeometryDescriptor = { kind: 'box', width: 1, height: 1, depth: 1 }
const sceneOf = (nodes: readonly SceneNode[]) => ({ ...EMPTY_SCENE, nodes: [...nodes] })
const still: GameFlush = { zoned: false, reframed: false, shadowed: false, changed: false }

describe('what an exported frame owes', () => {
  it('owes nothing when the picture, the shadows and the zone all stayed put', () => {
    expect(frameOwesDraw(still, false)).toBe(false)
    expect(frameOwesShadows(still)).toBe(false)
  })

  it('owes a colour pass when the lens moved and nothing else did', () => {
    expect(frameOwesDraw(still, true)).toBe(true)
    expect(frameOwesShadows(still)).toBe(false)
  })

  it('owes a picture and no map for a texture that landed', () => {
    expect(frameOwesDraw({ ...still, changed: true }, false)).toBe(true)
    expect(frameOwesShadows({ ...still, changed: true })).toBe(false)
  })

  it('owes a depth pass when a caster moved, even if the lens did not', () => {
    expect(frameOwesShadows({ ...still, shadowed: true })).toBe(true)
  })

  it('owes both when a cell of instances came into view', () => {
    expect(frameOwesDraw({ ...still, zoned: true }, false)).toBe(true)
    expect(frameOwesShadows({ ...still, zoned: true })).toBe(true)
  })
})

describe('what a game scene settles of a frame', () => {
  it('drops instanced cells the camera cannot reach, as the editor viewport does', async () => {
    const near = Array.from({ length: WORTH_INSTANCING }, (_unused, index) => ({
      ...meshNode(BOX, { name: `Near ${index}` }),
      transform: { ...IDENTITY_TRANSFORM, position: { x: index, y: 0, z: 0 } },
    }))
    const far = Array.from({ length: WORTH_INSTANCING }, (_unused, index) => ({
      ...meshNode(BOX, { name: `Far ${index}` }),
      transform: {
        ...IDENTITY_TRANSFORM,
        position: { x: CELL_SIZE * 20 + index, y: 0, z: 0 },
      },
    }))
    const built = await buildGameScene(sceneOf([...near, ...far]), NOTHING)
    const camera = new PerspectiveCamera(50, 1, 0.1, 400)
    camera.position.set(0, 8, 0)
    camera.lookAt(8, 8, 0)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()

    expect(built.flush(camera).zoned).toBe(true)

    const drawn = (): InstancedMesh[] => {
      const meshes: InstancedMesh[] = []
      built.scene.traverse(object => {
        if (object instanceof InstancedMesh && isDrawn(object, built.scene)) meshes.push(object)
      })
      return meshes
    }
    const close = drawn()
    expect(close.length).toBeGreaterThan(0)

    camera.position.set(CELL_SIZE * 20, 8, 0)
    camera.lookAt(CELL_SIZE * 20 + 8, 8, 0)
    camera.updateMatrixWorld(true)
    built.flush(camera)
    const distant = drawn()
    expect(distant.length).toBeGreaterThan(0)
    expect(close.some(mesh => distant.includes(mesh))).toBe(false)
    built.dispose()
  })
})
