// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAY, type PlayCamera, type ScenePlay } from '@shared/domain/scene'
import { restingAxes } from '../physics/quaternion'
import { armView, playView } from './playView'

const FEET = { x: 0, y: 0, z: 0 }
const AHEAD = { yaw: 0, pitch: 0 }

const watching = (camera: PlayCamera, eyeHeight = 1.7) =>
  playView({ ...DEFAULT_PLAY, camera, eyeHeight }, FEET, AHEAD)

describe('where a scene is watched from while it is played', () => {
  /** A scene flown by hand: a runtime writing the camera would fight whoever drags it. */
  it('leaves the camera alone for a set that is flown', () => {
    expect(watching('orbit')).toBeNull()
  })

  it('puts the eye at eye height and looks along the heading in first person', () => {
    const view = watching('firstPerson')

    expect(view?.position).toEqual({ x: 0, y: 1.7, z: 0 })
    expect(view?.target.z).toBeLessThan(0)
  })

  it('hangs the camera behind the head in third person, watching it', () => {
    const view = watching('thirdPerson')

    expect(view?.position.z).toBeGreaterThan(0)
    expect(view?.target).toEqual({ x: 0, y: 1.7, z: 0 })
  })

  it('stands the camera above and behind for a plan view', () => {
    const view = watching('topDown')

    expect(view?.position.y).toBeGreaterThan(10)
    expect(view?.target).toEqual({ x: 0, y: 1.7, z: 0 })
  })

  /** Turning the head turns what first person looks AT, and nothing else. */
  it('follows the heading a drag turned', () => {
    const turned = playView({ ...DEFAULT_PLAY, camera: 'firstPerson' }, FEET, {
      yaw: Math.PI / 2,
      pitch: 0,
    })

    expect(turned?.target.x).toBeCloseTo(-1, 6)
    expect(turned?.target.z).toBeCloseTo(0, 6)
  })

  /** Eye height is metres above the FLOOR, which is the only reading an author can hold. */
  it('measures the eye up from the feet it is given', () => {
    const view = playView(
      { ...DEFAULT_PLAY, camera: 'firstPerson', eyeHeight: 1 },
      { x: 2, y: 5, z: -3 },
      AHEAD,
    )

    expect(view?.position).toEqual({ x: 2, y: 6, z: -3 })
  })
})

describe('the shot a camera node makes', () => {
  /** A shot from a pair of feet never carries a lens — not even the one an arm just used. */
  it('leaves no lens on the shot a pair of feet makes after it', () => {
    const play: ScenePlay = { ...DEFAULT_PLAY, camera: 'thirdPerson' }
    armView(play, { x: 2, y: 3, z: 4 }, { x: 0, y: 0, z: 0 }, restingAxes(), 35)

    expect(playView(play, FEET, AHEAD)?.fieldOfView).toBeUndefined()
  })
})
