import { describe, expect, it } from 'vitest'
import { BUNDLED_ANIMATION_POSTERS } from './animationLibrary'

/**
 * 🛑 These replace three cases about what a NAME reads like — `/sad|happy/i`, `/idle/i`,
 * `/jump/i` — on a name that, for an imported clip, is the stem of whatever file a person
 * dropped. What decides is data now, and only what the renderer actually READS is described:
 * a first pass kept a scoring vocabulary here that a settled `at` made unreachable, with two
 * cases asserting it. Green, and about nothing.
 */
describe('the stills the app knows how to take of the clips it ships with', () => {
  it('settles where to stop in every one of them, so none is ever sampled', () => {
    const unsettled = Object.entries(BUNDLED_ANIMATION_POSTERS)
      .filter(([, poster]) => poster.at === undefined)
      .map(([name]) => name)

    expect(unsettled).toEqual([])
  })

  // A side turn is drawn SQUARE and from in front: turned away, the body reads as a back.
  it('turns a side turn back to the camera, and puts the eye in front of it', () => {
    expect(BUNDLED_ANIMATION_POSTERS.TurnLeft?.square).toBe(true)
    expect(BUNDLED_ANIMATION_POSTERS.TurnRight?.camera).toEqual([0, 7, 24])
    expect(BUNDLED_ANIMATION_POSTERS.TurnAround?.square).toBeUndefined()
  })
})
