// SPDX-License-Identifier: MIT

/**
 * The car the vehicle template opens on: a body the physics feels, and four wheels the engine
 * hangs, steers and drives. Everything is a primitive of the studio, so every part stays editable.
 */
import type { Vector3 } from '@shared/domain/scene'
import { COMPONENTS, newComponent } from '@shared/domain/componentRegistry'
import { surface } from './levelParts'
import { meshNode, transformAt } from './nodeFactory'
import type { SceneNode } from './sceneState'

/** Metres. A hatchback: 1,8 across, four long, on the wheels the `Vehicle` component simulates. */
const HALF_WIDTH = 0.9
const HALF_HEIGHT = 0.3
const HALF_LENGTH = 2

/** The component's own defaults, read rather than copied: a wheel is DRAWN with what is SIMULATED. */
const WHEEL_RADIUS = Number(COMPONENTS.Vehicle.defaults.wheelRadius)
const WHEEL_WIDTH = Number(COMPONENTS.Vehicle.defaults.wheelWidth)

/** Where the axles stand, measured from the body's own centre. */
const AXLE_Z = 1.35
const AXLE_Y = -0.35

/** Where the body stands when its wheels touch: the axle's own depth plus a wheel's radius. */
const RIDE_HEIGHT = WHEEL_RADIUS - AXLE_Y

/**
 * Front is −Z, which is where a node's own forward points: the front pair is what steers.
 *
 * 🛑 Named AFTER the car, never `Wheel Front Left` bare: `vehicleOf` resolves a wheel by the
 * first entity wearing that name, so two cars in one scene both bound to the first one's wheels
 * and the second drew none of its own.
 */
const WHEELS = [
  { corner: 'Wheel Front Left', x: -HALF_WIDTH, z: -AXLE_Z },
  { corner: 'Wheel Front Right', x: HALF_WIDTH, z: -AXLE_Z },
  { corner: 'Wheel Rear Left', x: -HALF_WIDTH, z: AXLE_Z },
  { corner: 'Wheel Rear Right', x: HALF_WIDTH, z: AXLE_Z },
]

const wheelName = (car: string, corner: string): string => `${car} ${corner}`

/**
 * `heading` is where the car is meant to GO. 🛑 Its nose is at −Z — `WHEELS` puts the front axle
 * there — so the half turn is what makes a heading of zero drive down +Z rather than back up it.
 * The wheels are drawn where one RESTS; the engine anchors each spring above that.
 */
export function carNodes(at: Vector3, name = 'Car', heading = 0): [SceneNode, ...SceneNode[]] {
  const body = {
    ...meshNode(
      { kind: 'box', width: HALF_WIDTH * 2, height: HALF_HEIGHT * 2, depth: HALF_LENGTH * 2 },
      {
        // The wheels and the cabin hang off the body, so turning it turns the whole machine.
        transform: transformAt(
          { ...at, y: at.y + RIDE_HEIGHT },
          { x: 0, y: heading + Math.PI, z: 0 },
        ),
        material: surface('#c9453d'),
        name,
      },
    ),
    components: [
      newComponent('Collider'),
      { ...newComponent('RigidBody'), mass: 1500 },
      { ...newComponent('Vehicle'), wheels: WHEELS.map(w => wheelName(name, w.corner)).join(', ') },
    ],
  }

  const cabin = meshNode(
    { kind: 'box', width: 1.5, height: 0.6, depth: 2 },
    {
      transform: transformAt({ x: 0, y: HALF_HEIGHT + 0.3, z: 0.2 }),
      material: surface('#2d3038'),
      parentId: body.id,
      name: 'Cabin',
    },
  )

  return [body, cabin, ...WHEELS.map(wheel => wheelNode(wheel, name, body.id))]
}

/**
 * A wheel as the physics turns it: a cylinder about its own +Y, which is the axle Jolt is handed.
 * No component of its own — what moves it is the vehicle its body carries.
 *
 * 🛑 Laid on its side at REST, and only at rest: Play overwrites the pose every step, so without
 * this the thumbnail and everything before the first step showed four flat discs.
 */
function wheelNode(wheel: (typeof WHEELS)[number], car: string, parentId: string): SceneNode {
  return meshNode(
    {
      kind: 'cylinder',
      radiusTop: WHEEL_RADIUS,
      radiusBottom: WHEEL_RADIUS,
      height: WHEEL_WIDTH,
      segments: 24,
    },
    {
      transform: transformAt({ x: wheel.x, y: AXLE_Y, z: wheel.z }, { x: 0, y: 0, z: Math.PI / 2 }),
      material: surface('#26282e'),
      parentId,
      name: wheelName(car, wheel.corner),
    },
  )
}
