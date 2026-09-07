// SPDX-License-Identifier: MIT

/** The palette, the ground and the components every built level lays — one source for the three. */
import type { CheckerTextureId } from '@shared/domain/checkerTexture'
import type { Component } from '@shared/domain/component'
import type { CollisionFidelity } from '@shared/domain/csg'
import { newComponent } from '@shared/domain/componentRegistry'
import type { MaterialDescriptor, Vector3 } from '@shared/domain/scene'
import { defaultMeshMaterial } from './checkerTextures'
import { meshNode, transformAt } from './nodeFactory'
import type { SceneNode } from './sceneState'

/** A plane is born standing up; ground lies down. */
export const LYING_FLAT: Vector3 = { x: -Math.PI / 2, y: 0, z: 0 }

/** A fresh descriptor per call: two nodes holding one object would be edited together by accident. */
export function surface(color: string, texture?: CheckerTextureId): MaterialDescriptor {
  return { ...defaultMeshMaterial(texture), color }
}

/** 🛑 A role is a COLOUR AND A GRID together, and the colours are the playground's to the digit. */
export const groundSurface = (): MaterialDescriptor => surface('#9aa4b0', 'gridLarge')
export const climbSurface = (): MaterialDescriptor => surface('#d08c3a', 'checkerLarge')
export const obstacleSurface = (): MaterialDescriptor => surface('#4e5661', 'gridSmall')
export const markSurface = (): MaterialDescriptor => surface('#3d7ab8', 'checkerSmall')

/** The one colour the playground has no use for: what grows between the built parts. */
export const grassSurface = (): MaterialDescriptor => surface('#6f8257', 'gridLarge')

/** The same material, its squares set a given number of metres apart — how a level says a scale. */
export const dense = (material: MaterialDescriptor, tileMetres: number): MaterialDescriptor => ({
  ...material,
  tilesPerMetre: 1 / tileMetres,
})

/** How many squares a surface must show across its longest side, or it reads as a flat colour. */
export const LEAST_TILES = 2

/** Past this reach, squares stand `WIDE_SURFACE_TILE` apart: one a metre shimmered on 340 m. */
export const WIDE_SURFACE = 40
export const WIDE_SURFACE_TILE = 2

/** 🛑 Neither throws a shadow nor catches one: on a large level a texel covers metres, and a flat
 * field wearing that reads as a moiré. */
export function fieldNode(patch: {
  at: Vector3
  width: number
  depth: number
  material: MaterialDescriptor
  tilesPerMetre: number
  parentId: string
  name: string
}): SceneNode {
  return {
    ...meshNode(
      { kind: 'plane', width: patch.width, height: patch.depth },
      {
        transform: { ...transformAt(patch.at), rotation: LYING_FLAT },
        material: { ...patch.material, tilesPerMetre: patch.tilesPerMetre },
        castShadow: false,
        parentId: patch.parentId,
        name: patch.name,
      },
    ),
    receiveShadow: false,
  }
}

/** 🛑 Named apart from `playgroundLevel`'s `solid`, which hands back a Collider ALONE: two
 * `solid` in one folder is the bare word the auto import picks at random. */
export function fixedBody(fidelity: CollisionFidelity | 'auto' = 'auto'): Component[] {
  return [
    { ...newComponent('Collider'), fidelity },
    { ...newComponent('RigidBody'), kind: 'fixed' },
  ]
}
