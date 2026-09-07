// SPDX-License-Identifier: MIT

import { Box3, Vector3, type BufferAttribute } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { CHECKER_TEXTURE_IDS } from '@shared/domain/checkerTexture'
import { TILES_PER_METRE } from '@shared/domain/scene'
import type { CsgPart } from '@shared/domain/csg'
import { airfieldNodes } from './airfieldLevel'
import { rememberCheckerTextures } from './checkerTextures'
import { circuitNodes } from './circuitLevel'
import { LEAST_TILES, WIDE_SURFACE, WIDE_SURFACE_TILE } from './levelParts'
import { mountainNodes } from './mountainLevel'
import { geometryFor } from './threeFactory'
import type { SceneNode } from './sceneState'

/** What a surface draws, and at what density — the two halves of « wearing a grid ». */
type Drawn = { name: string; map: boolean; span: number; tilesPerMetre: number }

const OPEN_PROJECT = CHECKER_TEXTURE_IDS.map(id => ({ id, assetId: `asset-${id}` }))

/**
 * How far a shape reaches, in metres, on its longest axis — measured on the shape three.js
 * BUILDS, so a kind added to the union is measured without this being touched.
 */
function spanOfShape(shape: CsgPart['geometry']): number {
  if (!('kind' in shape)) {
    return Math.max(
      ...[shape.base, ...shape.steps.map(step => step.part)].map(part =>
        spanOfShape(part.geometry),
      ),
    )
  }

  const size = new Box3()
    .setFromBufferAttribute(geometryFor(shape).getAttribute('position') as BufferAttribute)
    .getSize(new Vector3())
  return Math.max(size.x, size.y, size.z)
}

function drawnOf(nodes: readonly SceneNode[]): Drawn[] {
  return nodes.flatMap(node => {
    if (node.type === 'mesh') {
      return [
        {
          name: node.name,
          map: node.material.map !== null,
          span: spanOfShape(node.geometry),
          tilesPerMetre: node.material.tilesPerMetre,
        },
      ]
    }
    if (node.type !== 'carved') return []
    // 🛑 One row per BRUSH: a solid's grid is written into its UVs from each brush's own density,
    // and the node's material settles the colour and the maps alone — see `brushOf`.
    return [node.carved.base, ...node.carved.steps.map(step => step.part)].map(part => ({
      name: `${node.name} · ${part.name}`,
      map: node.material.map !== null,
      span: spanOfShape(part.geometry),
      tilesPerMetre: part.material.tilesPerMetre,
    }))
  })
}

const LEVELS: [string, () => readonly SceneNode[]][] = [
  ['circuit', circuitNodes],
  ['mountain', mountainNodes],
  ['airfield', airfieldNodes],
]

describe('every surface a built level lays', () => {
  beforeAll(() => rememberCheckerTextures(OPEN_PROJECT))

  /*
   * 🛑 The world's own ground lies at y = 0, and a face laid IN that plane fights it for every
   * pixel: the runway was flush, and came out with a sawtooth edge and speckle down its length.
   */
  it.each(LEVELS)('lays no face in the plane of the ground, on the %s', (_level, build) => {
    const flush = build().filter(node => {
      if (node.type !== 'mesh') return false
      const shape = node.geometry
      // The face one SEES: a plane lies where it stands, a box shows its lid.
      if (shape.kind === 'plane') return Math.abs(node.transform.position.y) < 0.01
      if (shape.kind !== 'box') return false
      return Math.abs(node.transform.position.y + shape.height / 2) < 0.01
    })

    expect(flush.map(node => node.name)).toEqual([])
  })

  // 🛑 Reading a document CLAMPS the density (`revivedMaterial`), so a level written outside the
  // bounds looks one way when created and another once saved and reopened, with nothing said.
  it.each(LEVELS)('states a density a reopened document keeps, on the %s', (_level, build) => {
    const clamped = drawnOf(build()).filter(
      one => one.tilesPerMetre < TILES_PER_METRE.min || one.tilesPerMetre > TILES_PER_METRE.max,
    )

    expect(clamped.map(one => `${one.name} @ ${one.tilesPerMetre}/m`)).toEqual([])
  })

  // 🛑 What this refuses is a descriptor written by hand — `map: null`. `surface` itself cannot
  // produce one, so nothing else in the suite would catch it.
  it.each(LEVELS)('wears a working texture, all through the %s', (_level, build) => {
    const bare = drawnOf(build()).filter(one => !one.map)

    expect(bare.map(one => one.name)).toEqual([])
  })

  // 🛑 Measured both ways on this lot: one square stretched over a 32 m kerb reads as a flat
  // colour, and 340 squares over a 340 m field as a shimmer.
  it.each(LEVELS)('shows squares one can count, all through the %s', (_level, build) => {
    const unreadable = drawnOf(build()).filter(
      one =>
        one.span * one.tilesPerMetre < LEAST_TILES ||
        (one.span > WIDE_SURFACE && one.tilesPerMetre > 1 / WIDE_SURFACE_TILE),
    )

    expect(
      unreadable.map(one => `${one.name} @ ${one.tilesPerMetre}/m over ${one.span} m`),
    ).toEqual([])
  })
})
