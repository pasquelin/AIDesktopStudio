import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import type { CsgGraph } from '@shared/domain/csg'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { meshNode, modelNodeFixture } from '@/engines/scene/scene-fixtures'
import {
  DEFAULT_MATERIAL as MATERIAL,
  type MeshNode,
  type SceneNode,
} from '@/engines/scene/sceneState'
import { colliderFromNode } from './colliderFromNode'

const fidelity = (said: string): Component =>
  withComponentField(newComponent('Collider'), 'fidelity', said)

const shaped = (geometry: GeometryDescriptor, over: Partial<MeshNode> = {}): MeshNode => ({
  ...meshNode('a'),
  geometry,
  ...over,
})

const scaled = (x: number, y: number, z: number) => ({
  ...IDENTITY_TRANSFORM,
  scale: { x, y, z },
})

/** A wall with a window cut clean through it — the example ADR-25 is written around. */
const pierced = (collision: CsgGraph['collision']): SceneNode => ({
  ...meshNode('wall'),
  type: 'carved',
  carved: {
    base: {
      name: 'wall',
      geometry: { kind: 'box', width: 4, height: 3, depth: 0.2 },
      transform: IDENTITY_TRANSFORM,
      material: MATERIAL,
    },
    steps: [
      {
        operation: 'subtract',
        part: {
          name: 'window',
          geometry: { kind: 'box', width: 1, height: 1, depth: 1 },
          transform: IDENTITY_TRANSFORM,
          material: MATERIAL,
        },
      },
    ],
    collision,
  },
  material: MATERIAL,
})

describe('what a node is felt as', () => {
  it('leaves a baked render container unfelt so its restored source bodies own collision', () => {
    const node = shaped(
      { kind: 'box', width: 1, height: 1, depth: 1 },
      { instances: [{ sourceId: 'source', name: 'Source', transform: IDENTITY_TRANSFORM }] },
    )

    expect(colliderFromNode(node)).toBeNull()
  })

  it('takes a box exactly, scale and all', () => {
    const node = shaped(
      { kind: 'box', width: 2, height: 4, depth: 6 },
      { transform: scaled(2, 1, 1) },
    )

    expect(colliderFromNode(node)?.shape).toEqual({ kind: 'cuboid', hx: 2, hy: 2, hz: 3 })
  })

  it('takes a sphere as a ball, and only while it is still round', () => {
    const round = shaped({ kind: 'sphere', radius: 2, widthSegments: 8, heightSegments: 6 })
    const squashed = { ...round, transform: scaled(1, 3, 1) }

    expect(colliderFromNode(round)?.shape).toEqual({ kind: 'ball', radius: 2 })
    expect(colliderFromNode(squashed)?.shape.kind).toBe('hull')
  })

  it('takes a cylinder with nothing on top as a cone', () => {
    const node = shaped({ kind: 'cylinder', radiusTop: 0, radiusBottom: 1, height: 2, segments: 8 })

    expect(colliderFromNode(node)?.shape).toEqual({ kind: 'cone', halfHeight: 1, radius: 1 })
  })

  /** A plane holds no matter, and a body with none falls through everything including itself. */
  it('gives a plane a thickness it can be felt by', () => {
    const node = shaped({ kind: 'plane', width: 4, height: 2 })
    const shape = colliderFromNode(node)?.shape

    expect(shape?.kind).toBe('cuboid')
    expect(shape?.kind === 'cuboid' ? shape.hz : 0).toBeGreaterThan(0)
  })

  it('reads the word the author wrote over what the shape would have given', () => {
    const node = shaped(
      { kind: 'box', width: 2, height: 2, depth: 2 },
      {
        components: [fidelity('trimesh')],
      },
    )

    expect(colliderFromNode(node)?.shape.kind).toBe('trimesh')
  })

  /**
   * 🛑 The measure the whole lot is for: a pierced wall felt as the pieces of ADR-25, so the
   * window is a way through rather than a wall like any other.
   */
  it('decomposes a carved solid into the pieces its graph asks for', () => {
    const collider = colliderFromNode(pierced('convexes'))

    expect(collider?.exact).toBe(true)
    expect(collider?.shape.kind).toBe('convexes')
    expect(collider?.shape.kind === 'convexes' ? collider.shape.parts.length : 0).toBe(4)
  })

  /** ADR-25 took the field on a document nothing simulated. `auto` is what finally reads it. */
  it('reads the fidelity the graph itself carries when nobody overruled it', () => {
    expect(colliderFromNode(pierced('hull'))?.shape.kind).toBe('hull')
    expect(colliderFromNode(pierced('convexes'))?.shape.kind).toBe('convexes')
  })

  /**
   * Said rather than swallowed: a wall whose window closed is exactly the kind of thing an
   * author stares at without a clue.
   */
  it('says so when it could not honour the fidelity it was asked for', () => {
    const collider = colliderFromNode(pierced('trimesh'))

    expect(collider?.shape.kind).toBe('hull')
    expect(collider?.exact).toBe(false)
  })

  /** A hole is not filled in by the hull, and the wall does not swell past what it was cut from. */
  it('keeps a hull to the brushes a solid is made of, never the tool', () => {
    const collider = colliderFromNode(pierced('hull'))
    const points = collider?.shape.kind === 'hull' ? collider.shape.points : new Float32Array()
    const widest = Math.max(...[...points].filter((_unused, at) => at % 3 === 0).map(Math.abs))

    expect(widest).toBeCloseTo(2, 6)
  })

  it('feels nothing of a shape it cannot measure before the game starts', () => {
    // A model is the one that feels like a hole rather than a decision — see the note there.
    expect(colliderFromNode(modelNodeFixture('m'))).toBeNull()
  })
})
