import { Bone, BoxGeometry, Group, Mesh, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { boundsOf } from './sceneRendererSupport2'
import { framingDistance, framingPlacement } from './sceneView'

it('frames a meshless skeleton through its world-space joint extent', () => {
  const model = new Group()
  const armature = new Group()
  armature.rotation.x = Math.PI / 2
  armature.scale.setScalar(0.01)
  const hips = new Bone()
  hips.position.z = -100
  const head = new Bone()
  head.position.z = -80
  const foot = new Bone()
  foot.position.z = 100
  model.add(armature)
  armature.add(hips)
  hips.add(head, foot)
  const bounds = boundsOf([model])
  expect(bounds.isEmpty()).toBe(false)
  expect(bounds.getSize(new Vector3()).y).toBeCloseTo(1.8)
  const framing = framingPlacement([model], 60)
  expect(framing.target.y).toBeCloseTo(0.9)
  expect(framing.position.distanceTo(framing.target)).toBeCloseTo(framingDistance(0.9, 60))
})

it('keeps mesh bounds when distant control bones are present and empty models empty', () => {
  const model = new Group()
  model.add(new Mesh(new BoxGeometry(2, 2, 2)))
  const control = new Bone()
  control.position.y = 100
  model.add(control)
  expect(boundsOf([model]).getSize(new Vector3()).y).toBe(2)
  expect(boundsOf([new Group()]).isEmpty()).toBe(true)
})
