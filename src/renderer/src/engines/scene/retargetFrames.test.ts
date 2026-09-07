import { Bone, Group, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { sameSkeleton, skinnedFromWire, wireBonesOf } from './retarget'

it('preserves structural parent frames across repeated wire conversion, excluding scene placement', () => {
  const holder = new Group()
  holder.position.set(8, 9, 10)
  holder.rotation.y = 0.9
  holder.scale.setScalar(7)
  const armature = new Group()
  armature.rotation.x = Math.PI / 2
  armature.scale.setScalar(0.01)
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.z = -99.7919
  holder.add(armature)
  armature.add(hips)
  const wire = wireBonesOf(holder)
  const rebuilt = skinnedFromWire(wire)
  const position = rebuilt.getObjectByName('Hips')?.getWorldPosition(new Vector3())
  expect(position?.y).toBeCloseTo(0.997919)
  expect(position?.z).toBeCloseTo(0)
  expect(wireBonesOf(rebuilt)).toEqual(wire)
  expect(wire.map(bone => bone.name)).toEqual(['Hips'])
  armature.rotation.x = 0
  expect(sameSkeleton(wire, wireBonesOf(holder))).toBe(false)
})

it('restores a non-joint frame between joints without treating its name as a parent identity', () => {
  const root = new Group()
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.y = 1
  const frame = new Group()
  frame.name = 'Hips'
  frame.position.y = 0.2
  frame.rotation.z = 0.4
  frame.scale.setScalar(2)
  const head = new Bone()
  head.name = 'Head'
  head.position.y = 0.3
  root.add(hips)
  hips.add(frame)
  frame.add(head)
  const expected = head.getWorldPosition(new Vector3())
  const wire = wireBonesOf(root)
  expect(wire[1]?.parent).toBe(0)
  const rebuilt = skinnedFromWire(wire)
  rebuilt.skeleton.pose()
  const actual = rebuilt.getObjectByName('Head')?.getWorldPosition(new Vector3())
  expect(actual?.distanceTo(expected)).toBeLessThan(1e-6)
  expect(wireBonesOf(rebuilt).map(bone => bone.name)).toEqual(['Hips', 'Head'])
})

// 🛑 A merged rig carries two bones of one name — a hair chain added to a Mixamo body. The rig
// panel has always skipped the second; refusing it here made every foreign clip of that model
// fail to load, and its transfer window refuse to open.
it('skips a second bone of the same name rather than refusing the model', () => {
  const root = new Group()
  const hips = new Bone()
  hips.name = 'Hips'
  const spine = new Bone()
  spine.name = 'Spine'
  const twin = new Bone()
  twin.name = 'Spine'
  const tip = new Bone()
  tip.name = 'Tip'
  twin.add(tip)
  spine.add(twin)
  hips.add(spine)
  root.add(hips)

  const wire = wireBonesOf(root)

  expect(wire.map(bone => bone.name)).toEqual(['Hips', 'Spine', 'Tip'])
  expect(wire[2]?.parent).toBe(1)
})
