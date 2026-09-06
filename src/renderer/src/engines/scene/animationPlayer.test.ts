import { AnimationClip, Object3D, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'
import { clipLane, embeddedClip } from '@shared/domain/scene'
import { SECOND } from '@shared/domain/time'
import type { PosedClip } from '@game/ports/animationPort'
import { SceneAnimations } from './animation'

function walkClip(name: string): AnimationClip {
  const track = new VectorKeyframeTrack('cube.position', [0, 1], [0, 0, 0, 1, 0, 0])
  return new AnimationClip(name, 1, [track])
}

function model(...names: string[]): Object3D {
  const root = new Object3D()
  const cube = new Object3D()
  cube.name = 'cube'
  root.add(cube)
  root.animations = names.map(walkClip)
  return root
}

const posed = (key: string, weight: number, time = 0): PosedClip => ({
  key,
  time,
  weight,
  part: 'all',
  rootMotion: 'inPlace',
})

/** What the mixer is actually driving: the clips whose action carries any weight at all. */
function driving(animations: SceneAnimations, nodeId: string): { name: string; weight: number }[] {
  const held = animations as unknown as {
    players: Map<string, { mixer: { _actions: { _clip: AnimationClip; weight: number }[] } }>
  }
  const actions = held.players.get(nodeId)?.mixer._actions ?? []
  return actions
    .filter(action => action.weight > 0)
    .map(action => ({ name: action._clip.name, weight: action.weight }))
}

describe('a model a state machine drives', () => {
  it('plays what it is posed, at the weights it is given', () => {
    const animations = new SceneAnimations()
    animations.add('node-1', model('walk', 'idle'), model('walk', 'idle').animations)

    animations.pose('node-1', [posed('walk', 0.25), posed('idle', 0.75)])

    expect(driving(animations, 'node-1')).toEqual([
      { name: 'walk', weight: 0.25 },
      { name: 'idle', weight: 0.75 },
    ])
  })

  it('takes the model off its band, and gives it back on release', () => {
    const animations = new SceneAnimations()
    const source = model('walk', 'idle')
    animations.add('node-1', source, source.animations)
    const band = [clipLane('main', [embeddedClip('block-1', 'idle')])]
    animations.apply('node-1', band)
    expect(driving(animations, 'node-1').map(one => one.name)).toEqual(['idle'])

    animations.pose('node-1', [posed('walk', 1)])
    expect(driving(animations, 'node-1').map(one => one.name)).toEqual(['walk'])

    // 🛑 The band writes nothing while a machine drives: two clocks on one mixer fight bone by
    // bone, and an edit under a running game must not repose what the game is playing.
    animations.apply('node-1', band)
    expect(driving(animations, 'node-1').map(one => one.name)).toEqual(['walk'])

    animations.release('node-1')
    expect(driving(animations, 'node-1').map(one => one.name)).toEqual(['idle'])
  })

  it('leaves a posed model where the machine put it when the head moves', () => {
    const animations = new SceneAnimations()
    const source = model('walk', 'idle')
    const cube = source.children[0]
    if (!cube) throw new Error('the fixture builds one child')
    animations.add('node-1', source, source.animations)
    animations.apply('node-1', [clipLane('main', [embeddedClip('block-1', 'idle')])])
    animations.pose('node-1', [posed('walk', 1, 0)])

    animations.seek(0.5 * SECOND)

    expect(cube.position.x).toBeCloseTo(0)
    expect(driving(animations, 'node-1').map(one => one.name)).toEqual(['walk'])
  })

  it('drops a clip it is no longer posed', () => {
    const animations = new SceneAnimations()
    const source = model('walk', 'idle')
    animations.add('node-1', source, source.animations)

    animations.pose('node-1', [posed('walk', 0.5), posed('idle', 0.5)])
    animations.pose('node-1', [posed('idle', 1)])

    expect(driving(animations, 'node-1')).toEqual([{ name: 'idle', weight: 1 }])
  })

  it('poses nothing at all for a clip the model never brought', () => {
    const animations = new SceneAnimations()
    const source = model('walk')
    animations.add('node-1', source, source.animations)

    animations.pose('node-1', [posed('bundled:Sprint', 1)])

    expect(driving(animations, 'node-1')).toEqual([])
  })

  /**
   * 🛑 Two states of one graph on the same file are ONE pose at their two weights. Keeping the
   * last would drop the total under one for the whole fade, and the body would sag towards its
   * rest pose in the middle of a move.
   */
  it('adds up two clips that share a file rather than keeping the last', () => {
    const animations = new SceneAnimations()
    const source = model('walk')
    animations.add('node-1', source, source.animations)

    animations.pose('node-1', [posed('walk', 0.4), posed('walk', 0.6)])

    expect(driving(animations, 'node-1')).toEqual([{ name: 'walk', weight: 1 }])
  })

  it('says nothing and does nothing for a node it holds no player for', () => {
    const animations = new SceneAnimations()

    expect(() => animations.pose('nobody', [posed('walk', 1)])).not.toThrow()
    expect(() => animations.release('nobody')).not.toThrow()
  })
})
