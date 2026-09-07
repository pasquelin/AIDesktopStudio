import { describe, expect, it } from 'vitest'
import type { RigBone } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { worldPlaces } from './rigWorld'

const bone = (name: string, parent: string | null, y: number): RigBone => ({
  name,
  parent,
  rest: { ...IDENTITY_TRANSFORM, position: { x: 0, y, z: 0 } },
})

describe('where each bone stands in the mesh', () => {
  it('adds a child’s rest onto its parent’s world place', () => {
    const world = worldPlaces([bone('Hips', null, 0.9), bone('Spine', 'Hips', 0.2)])

    expect(world.get('Hips')).toEqual({ x: 0, y: 0.9, z: 0 })
    expect(world.get('Spine')).toEqual({ x: 0, y: 1.1, z: 0 })
  })

  it('treats a bone that names itself as parent as a root, rather than looping', () => {
    const world = worldPlaces([bone('Loop', 'Loop', 0.5)])

    expect(world.get('Loop')).toEqual({ x: 0, y: 0.5, z: 0 })
  })
})
