import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three'

export type ReliefBrushPose = {
  x: number
  y: number
  z: number
  radius: number
  falloff: number
  visible: boolean
  color?: string
}

/**
 * Ring on the terrain, in the same family as the transform gizmo helper — not a DOM overlay.
 * Inner radius recedes with falloff: 0 is a thin hard edge, 1 is a filled disk.
 */
export type ReliefBrushCursor = {
  object: Mesh
  set: (pose: ReliefBrushPose) => void
  dispose: () => void
}

const RING_SEGMENTS = 48

export function createReliefBrushCursor(): ReliefBrushCursor {
  let radius = 2
  let falloff = 0
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: DoubleSide,
  })
  const object = new Mesh(ringOf(radius, falloff), material)
  object.rotation.x = -Math.PI / 2
  object.visible = false
  object.raycast = () => {}

  return {
    object,
    set(pose) {
      object.visible = pose.visible
      if (!pose.visible) return
      object.position.set(pose.x, pose.y, pose.z)
      if (pose.color !== undefined) material.color.set(pose.color)
      if (pose.radius === radius && pose.falloff === falloff) return
      radius = pose.radius
      falloff = pose.falloff
      object.geometry.dispose()
      object.geometry = ringOf(radius, falloff)
    },
    dispose() {
      object.geometry.dispose()
      material.dispose()
      object.removeFromParent()
    },
  }
}

export function ringOf(radius: number, falloff: number): RingGeometry {
  const outer = Math.max(radius, 0.01)
  const taper = Math.min(Math.max(falloff, 0), 1)
  const thickness = Math.max(outer * 0.04, 0.02)
  const inner = taper <= 0 ? Math.max(outer - thickness, 0) : outer * (1 - taper)
  return new RingGeometry(inner, outer, RING_SEGMENTS)
}
