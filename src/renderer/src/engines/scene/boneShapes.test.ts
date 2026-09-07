import { Bone, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { createBoneShapes } from './boneShapes'

/** A runner resolves no custom property, so both tokens come back the same: they are handed in. */
const colours = () => ({ rest: '#808080', picked: '#346ef2' })

/** Two bones, one under the other, so a world placement is not the local one. */
function chain(): [Bone, Bone] {
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.set(0, 1, 0)

  const spine = new Bone()
  spine.name = 'Spine'
  spine.position.set(0, 0.4, 0)
  hips.add(spine)

  const root = new Object3D()
  root.add(hips)
  root.updateWorldMatrix(false, true)
  return [hips, spine]
}

/** How far a solid reaches off the Y axis its chain runs along. */
const width = (corners: number[][]): number =>
  Math.max(...corners.map(([x, , z]) => Math.hypot(x ?? 0, z ?? 0)))

/** The corners of one bone's solid, as triples. */
function cornersOf(shapes: ReturnType<typeof createBoneShapes>, bone: number): number[][] {
  const position = shapes.mesh.geometry.getAttribute('position')
  const corners: number[][] = []
  for (let corner = bone * 24; corner < (bone + 1) * 24; corner += 1) {
    corners.push([position.getX(corner), position.getY(corner), position.getZ(corner)])
  }
  return corners
}

describe('drawing a bone as a solid', () => {
  // A segment says where a bone runs and nothing about which way it faces, so a rotation moved
  // the gizmo and left the skeleton looking identical — measured on screen.
  it('lays eight faces per bone, spanning it from head to tail', () => {
    const shapes = createBoneShapes(chain(), colours)

    expect(shapes.mesh.geometry.getAttribute('position').count).toBe(2 * 8 * 3)

    const ys = cornersOf(shapes, 0).map(([, y]) => y ?? 0)
    expect(Math.min(...ys)).toBeCloseTo(1, 5)
    expect(Math.max(...ys)).toBeCloseTo(1.4, 5)
    shapes.dispose()
  })

  // The waist ring is what a turn about the bone's own axis actually moves; a shape that were
  // round about its axis would look identical at every angle.
  it('widens the bone away from its own axis, which is what makes a turn visible', () => {
    const shapes = createBoneShapes(chain(), colours)
    const off = cornersOf(shapes, 0).filter(([x, , z]) => Math.hypot(x ?? 0, z ?? 0) > 1e-6)

    expect(off.length).toBeGreaterThan(0)
    shapes.dispose()
  })

  // The hips carry the spine and both legs: a solid up the spine and a bare line out to each leg
  // read as a skeleton half wireframe — measured on screen.
  it('lays one solid from a bone to EACH of its children', () => {
    const [hips, spine] = chain()
    const legs = ['LeftUpperLeg', 'RightUpperLeg'].map(name => {
      const leg = new Bone()
      leg.name = name
      hips.add(leg)
      return leg
    })
    const shapes = createBoneShapes([hips, spine, ...legs], colours)

    // Three links off the hips, and a stub for each of the three leaves.
    expect(shapes.mesh.geometry.getAttribute('position').count).toBe(6 * 8 * 3)
    shapes.dispose()
  })

  // Sized to its own twelfth of a length, a hand's stub was 2 cm long and 2 mm wide: a hair.
  it('ends a chain with a stub as wide as the bone before it', () => {
    const shapes = createBoneShapes(chain(), colours)

    expect(width(cornersOf(shapes, 1))).toBeCloseTo(width(cornersOf(shapes, 0)), 5)
    shapes.dispose()
  })

  // Sized to itself alone, a 2 cm collar bone was a 2 mm hair between two solids.
  it("never draws a short bone thinner than the skeleton's typical one allows", () => {
    const [, spine] = chain()
    const collar = new Bone()
    collar.name = 'Collar'
    collar.position.set(0, 0.02, 0)
    spine.add(collar)
    const shapes = createBoneShapes([...chain(), collar], colours)

    // Link 1 runs spine → collar: 2 cm long, so 2 mm wide on its own.
    expect(width(cornersOf(shapes, 1))).toBeGreaterThan(0.02 * 0.1)
    shapes.dispose()
  })

  it('paints the chosen bone apart from the rest, and only that one', () => {
    const shapes = createBoneShapes(chain(), colours)
    const colour = shapes.mesh.geometry.getAttribute('color')

    shapes.pick('Spine')

    expect(colour.getX(0)).not.toBeCloseTo(colour.getX(24), 5)
    shapes.dispose()
  })

  it('is never what a click lands on — the model is', () => {
    const shapes = createBoneShapes(chain(), colours)
    const hits: unknown[] = []

    shapes.mesh.raycast({} as never, hits as never)

    expect(hits).toEqual([])
    shapes.dispose()
  })
})
