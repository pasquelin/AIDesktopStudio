import { describe, expect, it } from 'vitest'
import { BUNDLED_ANIMATION_POSTERS } from './animationLibrary'

/**
 * 🛑 These were three cases about what a NAME reads like — `/sad|happy/i`, `/idle/i`, `/jump/i`
 * — on a name that, for an imported clip, is the stem of whatever file a person dropped. They
 * are the same intent said about DATA: the clips the app ships with are described one by one,
 * and a clip nobody has described is scored by nothing at all.
 */
describe('the stills the app knows how to take of the clips it ships with', () => {
  // A mood is read in the upper body and a step in the legs: scoring a walk on its head picks
  // the frame where it looks around rather than the one where it strides.
  it('reads a mood in the arms and leaves a step to the legs by default', () => {
    expect(BUNDLED_ANIMATION_POSTERS.IdleSad?.joints).toContain('LeftUpperArm')
    expect(BUNDLED_ANIMATION_POSTERS.IdleHappy?.joints).toContain('RightUpperArm')
    expect(BUNDLED_ANIMATION_POSTERS.Walk?.joints).toBeUndefined()
  })

  it('scores a jump on how high the hips travel, and a turn on how far it turned', () => {
    expect(BUNDLED_ANIMATION_POSTERS.Jump?.score).toBe('hipHeight')
    expect(BUNDLED_ANIMATION_POSTERS.RunningJump?.score).toBe('hipHeight')
    expect(BUNDLED_ANIMATION_POSTERS.TurnAround?.score).toBe('turn')
  })

  // A side turn is drawn SQUARE, from in front: turned away, the body reads as a back.
  it('turns a side turn back to the camera, and puts the eye in front of it', () => {
    expect(BUNDLED_ANIMATION_POSTERS.TurnLeft?.square).toBe(true)
    expect(BUNDLED_ANIMATION_POSTERS.TurnRight?.camera).toEqual([0, 7, 24])
    expect(BUNDLED_ANIMATION_POSTERS.TurnAround?.square).toBeUndefined()
  })

  it('settles where to stop in every one of them, so none is sampled for nothing', () => {
    const unsettled = Object.entries(BUNDLED_ANIMATION_POSTERS)
      .filter(([, poster]) => poster.at === undefined)
      .map(([name]) => name)

    expect(unsettled).toEqual([])
  })
})
