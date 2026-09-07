import { describe, expect, it } from 'vitest'
import type { IkChain } from '@shared/domain/rig'
import { ikLinksOf, ikSpecsOf } from './ik'

/** An arm hanging off a spine, plus the handle a hand reaches for. */
const BONES = ['Hips', 'Spine', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'LeftHand.target']

const chain = (extra: Partial<IkChain> = {}): IkChain => ({
  id: 'ik-1',
  effector: 'LeftHand',
  target: 'LeftHand.target',
  links: ['LeftLowerArm', 'LeftUpperArm'],
  ...extra,
})

describe('handing a chain to the solver', () => {
  // The solver addresses `Skeleton.bones` by index and the document holds names: a rename would
  // otherwise turn whichever joint happened to sit at that number.
  it('reads every name as its place in the skeleton', () => {
    expect(ikSpecsOf(BONES, [chain()])[0]).toMatchObject({
      effector: 4,
      target: 5,
      links: [{ index: 3 }, { index: 2 }],
    })
  })

  it('makes ten passes unless the chain asks for another number', () => {
    expect(ikSpecsOf(BONES, [chain()])[0]?.iteration).toBe(10)
    expect(ikSpecsOf(BONES, [chain({ iterations: 3 })])[0]?.iteration).toBe(3)
  })

  // The hierarchy is edited by hand: a bone can leave while a chain still names it, and a chain
  // half resolved would turn the wrong joint without saying so.
  it('drops a chain whose effector is no longer a bone', () => {
    expect(ikSpecsOf(BONES, [chain({ effector: 'Gone' })])).toEqual([])
  })

  it('drops a chain whose target is no longer a bone', () => {
    expect(ikSpecsOf(BONES, [chain({ target: 'Gone' })])).toEqual([])
  })

  it('keeps a chain that lost one link of several, since the rest still reaches', () => {
    expect(ikSpecsOf(BONES, [chain({ links: ['LeftLowerArm', 'Gone'] })])[0]?.links).toEqual([
      { index: 3 },
    ])
  })

  it('drops a chain with nothing left to turn', () => {
    expect(ikSpecsOf(BONES, [chain({ links: ['Gone'] })])).toEqual([])
  })

  // Reaching for itself is a zero-length vector, which the solver divides by.
  it('drops a chain reaching for its own effector', () => {
    expect(ikSpecsOf(BONES, [chain({ target: 'LeftHand' })])).toEqual([])
  })
})

describe('choosing what a chain may turn', () => {
  const TREE = [
    { name: 'Hips', parent: null },
    { name: 'Spine', parent: 'Hips' },
    { name: 'LeftUpperArm', parent: 'Spine' },
    { name: 'LeftLowerArm', parent: 'LeftUpperArm' },
    { name: 'LeftHand', parent: 'LeftLowerArm' },
  ]

  it('walks up from the joint, nearest first', () => {
    expect(ikLinksOf(TREE, 'LeftHand')).toEqual(['LeftLowerArm', 'LeftUpperArm'])
  })

  // Unbounded, reaching a handle would bend the hips and walk the character across the room.
  it('stops at the depth asked for rather than climbing to the root', () => {
    expect(ikLinksOf(TREE, 'LeftHand', 4)).toHaveLength(4)
    expect(ikLinksOf(TREE, 'LeftHand', 9)).toEqual([
      'LeftLowerArm',
      'LeftUpperArm',
      'Spine',
      'Hips',
    ])
  })

  it('answers nothing above a root, which has no bone to turn', () => {
    expect(ikLinksOf(TREE, 'Hips')).toEqual([])
  })
})
