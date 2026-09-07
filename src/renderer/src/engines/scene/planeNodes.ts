// SPDX-License-Identifier: MIT

/**
 * The aeroplane the aircraft template opens on: a fuselage the physics feels, and the surfaces it
 * flies by, drawn as children so the airframe reads in the outliner.
 */
import type { Vector3 } from '@shared/domain/scene'
import { newComponent } from '@shared/domain/componentRegistry'
import { surface } from './levelParts'
import { meshNode, transformAt } from './nodeFactory'
import type { SceneNode } from './sceneState'

/** Metres. A light single: nine long, twelve across, twenty square metres of wing. */
const FUSELAGE = { width: 1.3, height: 1.3, depth: 9 }
const WING = { width: 12, height: 0.24, depth: 1.7 }
const TAILPLANE = { width: 4.2, height: 0.2, depth: 1.1 }
const FIN = { width: 0.2, height: 1.7, depth: 1.2 }

/** Where the tail surfaces stand, measured from the fuselage's own centre. +Z is behind. */
const TAIL_Z = 3.8

/**
 * 🛑 The fuselage is the ROOT and a MESH, not a group: what a body is felt as comes from what its
 * own node draws, and a group would fly through the ground unfelt. The wings carry no collider —
 * they are what the aerodynamics reads, never what the solver does.
 */
export function planeNodes(at: Vector3, name = 'Aeroplane'): SceneNode[] {
  const fuselage = {
    ...meshNode(
      { kind: 'box', ...FUSELAGE },
      { transform: transformAt(at), material: surface('#e2e6ec'), name },
    ),
    components: [
      newComponent('Collider'),
      { ...newComponent('RigidBody'), mass: 900 },
      {
        ...newComponent('Aircraft'),
        maxThrust: 16_000,
        wingArea: 20,
        stallAngle: 16,
        agility: 1.2,
      },
    ],
  }

  const part = (
    geometry: { width: number; height: number; depth: number },
    position: Vector3,
    partName: string,
    color: string,
  ): SceneNode =>
    meshNode(
      { kind: 'box', ...geometry },
      {
        transform: transformAt(position),
        material: surface(color),
        parentId: fuselage.id,
        name: partName,
      },
    )

  return [
    fuselage,
    part(WING, { x: 0, y: -0.2, z: -0.3 }, 'Wing', '#c8ced8'),
    part(TAILPLANE, { x: 0, y: 0.3, z: TAIL_Z }, 'Tailplane', '#c8ced8'),
    part(FIN, { x: 0, y: 1.1, z: TAIL_Z }, 'Fin', '#c9453d'),
    part(
      { width: 0.3, height: 1.9, depth: 0.12 },
      { x: 0, y: 0, z: -FUSELAGE.depth / 2 - 0.1 },
      'Propeller',
      '#26282e',
    ),
  ]
}
