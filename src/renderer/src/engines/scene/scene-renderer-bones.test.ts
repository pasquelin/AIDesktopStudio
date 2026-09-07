import { Bone, Group, Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { Rig } from '@shared/domain/rig'
import { SceneRenderer } from './SceneRenderer'
import type { BvhBuilder } from './bvhBuilder'
import type * as ModelCache from './modelCache'
import { modelNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE } from './sceneState'

/** The stage mounts a clone; handing the source back is what makes its bones reachable here. */
vi.mock('./modelCache', async importOriginal => ({
  ...(await importOriginal<typeof ModelCache>()),
  instanceOf: (source: Object3D) => source,
}))

const bvh: BvhBuilder = { accelerate: () => Promise.resolve(), dispose: () => {} }

/** An upper arm at the shoulder and a hand two units down it — one bone of known length. */
function armModel(): Group {
  const root = new Group()
  const arm = new Bone()
  arm.name = 'arm'
  arm.position.set(0, 1, 0)
  const hand = new Bone()
  hand.name = 'hand'
  hand.position.set(0, 0, 2)
  arm.add(hand)
  root.add(arm)
  return root
}

const armRig: Rig = {
  origin: 'local',
  bones: [
    { name: 'arm', parent: null, rest: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 1, z: 0 } } },
    {
      name: 'hand',
      parent: 'arm',
      rest: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 0, z: 2 } },
    },
  ],
}

/** The engine, with the arm on stage and its rig on. */
async function armOnStage(): Promise<{ engine: SceneRenderer; model: Group }> {
  const model = armModel()
  const engine = new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    loadModel: () => Promise.resolve(model),
    bvh,
  })

  engine.apply({ ...EMPTY_SCENE, nodes: [modelNodeFixture('a')] })
  await vi.waitFor(() => expect(model.parent).not.toBeNull())
  await engine.skinModel('a', armRig)

  engine.setPoseMode(true)
  engine.setPickedBone({ nodeId: 'a', bone: 'hand' })
  return { engine, model }
}

/** What a drag writes, then the frame the gizmo reports — the whole of a moved joint. */
function dragTo(engine: SceneRenderer, bone: Object3D, x: number, y: number, z: number): void {
  bone.position.set(x, y, z)
  const held: () => void = Reflect.get(engine, 'holdDraggedBone')
  held.call(engine)
}

const handOf = (model: Group): Object3D => {
  const hand = model.getObjectByName('hand')
  if (!hand) throw new Error('the fixture builds one hand')
  return hand
}

const armOf = (model: Group): Object3D => {
  const arm = model.getObjectByName('arm')
  if (!arm) throw new Error('the fixture builds one arm')
  return arm
}

describe('a joint the gizmo carries', () => {
  it('stays on the axes a padlock holds while it is dragged', async () => {
    const { engine, model } = await armOnStage()
    engine.setRestEditing(true)
    engine.setHeldBoneAxes(['x'])

    dragTo(engine, handOf(model), 5, 1, 2)

    expect(handOf(model).position.x).toBe(0)
    expect(handOf(model).position.y).toBe(1)
    engine.dispose()
  })

  // 🛑 Translating the joint alone left every bone at zero rotation: the limb never turned, so
  // its skin only half followed and stretched after the hand. Seen on screen the 2026-09-02.
  it('turns the bone arriving at it, and lands the joint on the end of that bone', async () => {
    const { engine, model } = await armOnStage()
    // The handle stands OUT of the chain, square to the arm and one hand's length from the elbow.
    const pivot: Object3D = Reflect.get(engine, 'pivot')
    pivot.position.set(2, 1, 0)
    Reflect.set(engine, 'boneHandle', true)
    const held: () => void = Reflect.get(engine, 'holdDraggedBone')
    held.call(engine)

    const hand = handOf(model)
    const arm = armOf(model)
    expect(hand.position.length()).toBeCloseTo(2, 5)
    expect(arm.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0.1)
    const landed = hand.getWorldPosition(new Vector3())
    expect([landed.x, landed.y, landed.z].map(one => Math.round(one * 1000) / 1000)).toEqual([
      2, 1, 0,
    ])
    engine.dispose()
  })

  // Editing a skeleton is where one shortens a bone that came out too long, so nothing holds a
  // length here — see `restWithin`.
  it('follows the pointer where no hold is asked for', async () => {
    const { engine, model } = await armOnStage()
    engine.setRestEditing(true)

    dragTo(engine, handOf(model), 0, 8, 0)

    expect(handOf(model).position.y).toBe(8)
    engine.dispose()
  })
})
