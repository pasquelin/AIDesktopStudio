// SPDX-License-Identifier: MIT

/** 🛑 DECOR: the plane meets the scene's own five-metre ground, a strip 0,4 m thick being what a
 * machine at sixty metres a second tunnels straight through. */
import type { MaterialDescriptor } from '@shared/domain/scene'
import { dense, groundSurface, obstacleSurface } from './levelParts'
import { groupNode, meshNode, transformAt } from './nodeFactory'
import { IDENTITY_TRANSFORM, type SceneNode } from './sceneState'

const RUNWAY = { width: 30, height: 0.4, depth: 600 }
const HANGAR = { width: 24, height: 8, depth: 40 }

/** How big a block is, in the three axes a box is written by. */
type Extent = { width: number; height: number; depth: number }

/** Where the hangars stand, off each side of the strip and along it. */
const HANGAR_X = 60
const HANGAR_Z = [-180, 0, 180]

/** How far the strip's top face stands over the world's ground — above the fields at 0,05 m. */
const STRIP_PROUD = 0.12

/** Metres between squares. One is what turns a 600 m strip into a shimmer from the air. */
const STRIP_TILE = 5
const HANGAR_TILE = 2

export function airfieldNodes(): SceneNode[] {
  const field = groupNode(IDENTITY_TRANSFORM, 'Airfield')
  // 🛑 The height travels with the size: written into the helper for the runway, it left the six
  // hangars as 0,4 m plates hovering with their undersides at 3,8.
  const block = (
    x: number,
    z: number,
    size: Extent,
    material: MaterialDescriptor,
    name: string,
  ): SceneNode =>
    meshNode(
      { kind: 'box', ...size },
      {
        // Standing ON the ground, and measured from its own middle.
        transform: transformAt({ x, y: size.height / 2, z }),
        material,
        parentId: field.id,
        name,
      },
    )

  return [
    field,
    // 🛑 Sunk, but its top face PROUD of the world's ground rather than flush with it: laid flush,
    // the two surfaces fought for the same pixel and the strip came out with a sawtooth edge.
    {
      ...block(0, 0, RUNWAY, dense(groundSurface(), STRIP_TILE), 'Runway'),
      transform: transformAt({ x: 0, y: STRIP_PROUD - RUNWAY.height / 2, z: 0 }),
      receiveShadow: false,
    },
    ...[-1, 1].flatMap(side =>
      HANGAR_Z.map(z =>
        block(
          side * HANGAR_X,
          z,
          HANGAR,
          dense(obstacleSurface(), HANGAR_TILE),
          `Hangar ${side < 0 ? 'West' : 'East'} ${z}`,
        ),
      ),
    ),
  ]
}
