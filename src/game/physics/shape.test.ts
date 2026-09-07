// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { ColliderShape } from './shape'

const HEIGHTFIELD: ColliderShape = {
  kind: 'heightfield',
  heights: new Float32Array([0, 0, 0, 1]),
  width: 2,
  height: 2,
  offset: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
}

function kindOf(shape: ColliderShape): ColliderShape['kind'] {
  switch (shape.kind) {
    case 'heightfield':
      return 'heightfield'
    case 'cuboid':
      return 'cuboid'
    case 'ball':
      return 'ball'
    case 'capsule':
      return 'capsule'
    case 'cylinder':
      return 'cylinder'
    case 'cone':
      return 'cone'
    case 'hull':
      return 'hull'
    case 'convexes':
      return 'convexes'
    case 'trimesh':
      return 'trimesh'
  }
}

describe('what a body is felt as', () => {
  it('names a heightfield apart from a cuboid or a mesh', () => {
    expect(kindOf(HEIGHTFIELD)).toBe('heightfield')
    expect(kindOf({ kind: 'cuboid', hx: 1, hy: 1, hz: 1 })).toBe('cuboid')
    expect(
      kindOf({
        kind: 'trimesh',
        vertices: new Float32Array(9),
        indices: new Uint32Array(3),
      }),
    ).toBe('trimesh')
  })
})
