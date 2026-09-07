import { Bone, Object3D, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { createBoneJoints } from './boneJoints'

/** What the studio draws at runtime; a runner has no 2D context, so the mark is handed in here. */
const disc = () => new Texture()

/** A runner resolves no custom property, so both tokens come back the same: they are handed in. */
const colours = () => ({ rest: '#808080', picked: '#346ef2' })

/** Two bones, one under the other, so a world position is not the local one. */
function chain(): Bone[] {
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

/** Rounded, because the buffer is Float32 and 1.4 comes back as 1.399999976158142. */
const pointsOf = (attribute: { array: ArrayLike<number> }): number[] =>
  Array.from(attribute.array, value => Math.round(value * 1e5) / 1e5)

describe('marking where two bones meet', () => {
  // The helper draws the bones as segments; a joint is what a click and a gizmo are aimed at,
  // and until now nothing drew one.
  it('lays one point per bone, at the bone itself', () => {
    const bones = chain()
    const joints = createBoneJoints(bones)

    const position = joints.points.geometry.getAttribute('position')
    expect(position.count).toBe(2)
    expect(pointsOf(position)).toEqual([0, 1, 0, 0, 1.4, 0])
    joints.dispose()
  })

  it('reads them in WORLD space, since it hangs beside the scene rather than in the model', () => {
    const bones = chain()
    const hips = bones[0]
    if (!hips) throw new Error('the fixture builds two bones')
    const joints = createBoneJoints(bones)

    hips.position.set(3, 1, 0)
    hips.parent?.updateWorldMatrix(false, true)
    joints.refresh()

    expect(pointsOf(joints.points.geometry.getAttribute('position'))).toEqual([3, 1, 0, 3, 1.4, 0])
    joints.dispose()
  })

  // A joint inside a shoulder is exactly the one someone is hunting for; hidden by the mesh it
  // cannot be aimed at at all.
  it('draws through whatever stands in front of it', () => {
    const joints = createBoneJoints(chain())
    const material = joints.points.material

    expect(Array.isArray(material) ? material[0] : material).toMatchObject({
      depthTest: false,
      sizeAttenuation: false,
    })
    joints.dispose()
  })

  // « Point » reads as round, and a material left to itself draws a square.
  it('cuts the mark to a round one when a disc can be drawn', () => {
    const joints = createBoneJoints(chain(), disc)
    const material = joints.points.material

    expect(Array.isArray(material) ? material[0] : material).toMatchObject({
      alphaMap: expect.any(Texture),
      alphaTest: 0.5,
    })
    joints.dispose()
  })

  // A canvas hands back no 2D context under a runner, and every one of these points would then
  // be cut away by an alpha that is not there.
  it('leaves the mark uncut where no disc could be drawn', () => {
    const joints = createBoneJoints(chain(), () => null)
    const material = joints.points.material

    expect(Array.isArray(material) ? material[0] : material).toMatchObject({
      alphaMap: null,
      alphaTest: 0,
    })
    joints.dispose()
  })

  // The accent says what is CHOSEN. Painted all one colour, a skeleton gave no sign at all of
  // which bone the panel beside it was editing — measured on screen, on a fitted character.
  it('paints the chosen joint apart from the rest, and only that one', () => {
    const joints = createBoneJoints(chain(), disc, colours)
    const colour = joints.points.geometry.getAttribute('color')

    const atRest = pointsOf(colour)
    joints.pick('Spine')
    const picked = pointsOf(colour)

    expect(picked.slice(0, 3)).toEqual(atRest.slice(0, 3))
    expect(picked.slice(3)).not.toEqual(atRest.slice(3))
    joints.dispose()
  })

  it('takes the mark back off when nothing is chosen', () => {
    const joints = createBoneJoints(chain(), disc, colours)
    const colour = joints.points.geometry.getAttribute('color')

    const atRest = pointsOf(colour)
    joints.pick('Spine')
    joints.pick(null)

    expect(pointsOf(colour)).toEqual(atRest)
    joints.dispose()
  })

  it('is never what a click lands on — the model is', () => {
    const joints = createBoneJoints(chain())
    const hits: unknown[] = []

    joints.points.raycast({} as never, hits as never)

    expect(hits).toEqual([])
    joints.dispose()
  })
})
