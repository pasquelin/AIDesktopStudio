import { COMPONENTS } from '@shared/domain/componentRegistry'
import { enabledScatters, type SceneWorld } from '@shared/domain/scene'
import { SCATTER_COLLISION_CAP } from '@shared/domain/scatter'
import type { ScatterGround } from '@shared/domain/scatterGenerate'
import { scatterPosesOf } from '@shared/domain/scatterGenerate'
import { layerRegion } from '@shared/domain/scatterFollow'
import type { BodyDescriptor } from '@game/ports/physicsPort'

export type ScatterCollision = {
  bodies: readonly BodyDescriptor[]
  refused: readonly { layerId: string; count: number }[]
}

export function scatterCollisionOf(world: SceneWorld, ground: ScatterGround): ScatterCollision {
  const bodies: BodyDescriptor[] = []
  const refused: { layerId: string; count: number }[] = []
  for (const layer of enabledScatters(world.layers)) {
    if (!layer.collision) continue
    const poses = scatterPosesOf(layer, layerRegion(layer), ground)
    const room = SCATTER_COLLISION_CAP - bodies.length
    if (room <= 0) {
      refused.push({ layerId: layer.id, count: poses.length })
      continue
    }
    const taken = poses.slice(0, room)
    const overflow = poses.length - taken.length
    bodies.push(...taken.map((pose, index) => bodyOf(layer.id, index, pose)))
    if (overflow > 0) refused.push({ layerId: layer.id, count: overflow })
  }
  return { bodies, refused }
}

function bodyOf(
  layerId: string,
  index: number,
  pose: {
    x: number
    y: number
    z: number
    scale: number
    rotation: BodyDescriptor['transform']['rotation']
  },
): BodyDescriptor {
  return {
    body: `world.scatter.${layerId}.${index}`,
    kind: 'fixed',
    shape: { kind: 'capsule', halfHeight: 0.65 * pose.scale, radius: 0.35 * pose.scale },
    transform: {
      position: { x: pose.x, y: pose.y + pose.scale, z: pose.z },
      rotation: pose.rotation,
      scale: { x: 1, y: 1, z: 1 },
    },
    friction: Number(COMPONENTS.Collider.defaults.friction),
    restitution: Number(COMPONENTS.Collider.defaults.restitution),
    mass: 0,
    gravityScale: 1,
    lockRotation: false,
    sensor: false,
    character: null,
    vehicle: null,
  }
}
