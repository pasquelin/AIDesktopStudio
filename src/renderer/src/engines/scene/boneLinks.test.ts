import { Bone, type Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { boneLinksOf } from './boneLinks'

function named(name: string, parent?: Object3D): Bone {
  const bone = new Bone()
  bone.name = name
  parent?.add(bone)
  return bone
}

describe('the stretches a skeleton is made of', () => {
  // The hips carry the spine AND both legs: drawn towards a first child alone, the legs hung off
  // the pelvis by a bare line while every other bone was a solid — measured on screen.
  it('runs one stretch from a bone to EACH of its children', () => {
    const hips = named('Hips')
    const spine = named('Spine', hips)
    const left = named('LeftUpperLeg', hips)
    const right = named('RightUpperLeg', hips)

    const links = boneLinksOf([hips, spine, left, right])

    expect(links.filter(link => link.bone === hips).map(link => link.child)).toEqual([
      spine,
      left,
      right,
    ])
  })

  it('keeps one stretch, towards nothing, for a bone with no child', () => {
    const hips = named('Hips')
    const spine = named('Spine', hips)

    expect(boneLinksOf([hips, spine]).filter(link => link.bone === spine)).toEqual([
      { bone: spine, child: null },
    ])
  })

  // A child outside the skeleton — a mesh parented under a hand — is not a bone to draw towards.
  it('ignores what hangs under a bone without being one of the bones', () => {
    const hand = named('Hand')
    named('Sword', hand)

    expect(boneLinksOf([hand])).toEqual([{ bone: hand, child: null }])
  })
})
