import { describe, expect, it } from 'vitest'
import type { TrackTarget } from '@shared/domain/animation'
import { SECOND } from '@shared/domain/time'
import {
  addAnimationTrack,
  recordingTracksFor,
  keySubject,
  moveAnimationKey,
  movesToCommand,
  recordMove,
  removeAnimationKey,
  removeAnimationTrack,
  setAnimationKey,
  setTimelineSettings,
  updateAnimationTrack,
} from './animationCommands'
import { EMPTY_SCENE, type SceneNode, type SceneState } from './sceneState'

const target = (nodeId: string, property: TrackTarget['property'] = 'position'): TrackTarget => ({
  nodeId,
  property,
})

const vec = (x: number) => ({ x, y: 0, z: 0 })

/** Two tracks, added the way the panel adds them. */
function withTwoTracks(): SceneState {
  const first = addAnimationTrack(target('cube'), 'Cube position', 'track-1').apply(EMPTY_SCENE)
  return addAnimationTrack(target('cube', 'scale'), 'Cube scale', 'track-2').apply(first)
}

const tracksOf = (state: SceneState) => state.animation.tracks

describe('adding and removing tracks', () => {
  it('adds a track at the foot of the stack', () => {
    const state = withTwoTracks()
    expect(tracksOf(state).map(track => track.id)).toEqual(['track-1', 'track-2'])
  })

  it('opens a track with no key, which adds nothing to the pose', () => {
    expect(tracksOf(withTwoTracks())[0]?.keys).toEqual([])
  })

  it('reads row order back from position', () => {
    expect(tracksOf(withTwoTracks()).map(track => track.index)).toEqual([0, 1])
  })

  it('reverts an add by taking the track back out', () => {
    const command = addAnimationTrack(target('cube'), 'Cube', 'track-1')
    expect(command.revert(command.apply(EMPTY_SCENE))).toEqual(EMPTY_SCENE)
  })

  it('keeps the same id across a redo, so nothing that referred to the track loses it', () => {
    const command = addAnimationTrack(target('cube'), 'Cube', 'track-1')
    const once = command.apply(EMPTY_SCENE)
    const again = command.apply(command.revert(once))

    expect(tracksOf(again)[0]?.id).toBe('track-1')
  })

  it('removes a track with the keys it carried, and puts them back on undo', () => {
    const seeded = setAnimationKey('track-1', 1, vec(4)).apply(withTwoTracks())
    const command = removeAnimationTrack('track-1')
    const after = command.apply(seeded)

    expect(tracksOf(after).map(track => track.id)).toEqual(['track-2'])
    expect(tracksOf(command.revert(after))[0]?.keys).toHaveLength(1)
  })

  it('puts a removed track back on the row it was on', () => {
    const command = removeAnimationTrack('track-1')
    const state = withTwoTracks()

    expect(tracksOf(command.revert(command.apply(state))).map(track => track.id)).toEqual([
      'track-1',
      'track-2',
    ])
  })

  it('leaves a locked track alone', () => {
    const state = withTwoTracks()
    const locked: SceneState = {
      ...state,
      animation: {
        ...state.animation,
        tracks: state.animation.tracks.map(track => ({ ...track, locked: true })),
      },
    }

    expect(removeAnimationTrack('track-1').apply(locked)).toEqual(locked)
  })
})

describe('writing keys', () => {
  it('writes a key at an instant and keeps the list sorted', () => {
    const state = setAnimationKey('track-1', 2, vec(9)).apply(
      setAnimationKey('track-1', 1, vec(4)).apply(withTwoTracks()),
    )

    expect(tracksOf(state)[0]?.keys.map(key => key.time)).toEqual([1, 2])
  })

  it('replaces the key standing on that instant rather than adding a second', () => {
    const once = setAnimationKey('track-1', 1, vec(4)).apply(withTwoTracks())
    const twice = setAnimationKey('track-1', 1, vec(7)).apply(once)

    expect(tracksOf(twice)[0]?.keys).toHaveLength(1)
    expect(tracksOf(twice)[0]?.keys[0]?.value.x).toBe(7)
  })

  it('gives the whole list back on undo, not just the key it wrote', () => {
    const seeded = setAnimationKey('track-1', 1, vec(4)).apply(withTwoTracks())
    const command = setAnimationKey('track-1', 1, vec(7))

    expect(command.revert(command.apply(seeded))).toEqual(seeded)
  })

  it('takes a key back out by its instant', () => {
    const seeded = setAnimationKey('track-1', 1, vec(4)).apply(withTwoTracks())
    const after = removeAnimationKey('track-1', 1).apply(seeded)

    expect(tracksOf(after)[0]?.keys).toEqual([])
  })

  it('writes nothing into a locked track', () => {
    const state = withTwoTracks()
    const locked: SceneState = {
      ...state,
      animation: {
        ...state.animation,
        tracks: state.animation.tracks.map(track => ({ ...track, locked: true })),
      },
    }

    expect(setAnimationKey('track-1', 1, vec(4)).apply(locked)).toEqual(locked)
  })

  it('writes nothing into a track that does not exist', () => {
    const state = withTwoTracks()
    expect(setAnimationKey('nobody', 1, vec(4)).apply(state)).toEqual(state)
  })
})

describe('the timeline settings', () => {
  it('changes how long it runs, and undo puts the old length back', () => {
    const command = setTimelineSettings({ duration: 12 })
    const after = command.apply(EMPTY_SCENE)

    expect(after.animation.duration).toBe(12)
    expect(command.revert(after).animation.duration).toBe(EMPTY_SCENE.animation.duration)
  })

  it('changes the frame rate without touching the length', () => {
    const after = setTimelineSettings({ fps: 60 }).apply(EMPTY_SCENE)

    expect(after.animation.fps).toBe(60)
    expect(after.animation.duration).toBe(EMPTY_SCENE.animation.duration)
  })
})

describe('what an armed track catches', () => {
  const rest = { position: vec(1), rotation: vec(0), scale: { x: 2, y: 2, z: 2 } }

  const armed = (state: SceneState, trackId: string): SceneState => ({
    ...state,
    animation: {
      ...state.animation,
      tracks: state.animation.tracks.map(track =>
        track.id === trackId ? { ...track, locked: true } : track,
      ),
    },
  })

  const channelIds = (state: SceneState, nodeId: string, bone?: string): string[] =>
    recordingTracksFor(state.animation, nodeId, bone).map(track => track.id)

  it('names every channel of that node, and no other node', () => {
    const state = withTwoTracks()
    expect(channelIds(state, 'cube')).toEqual(['track-1', 'track-2'])
    expect(channelIds(state, 'sphere')).toEqual([])
  })

  it('leaves a locked channel out, so a padlock still refuses a drag', () => {
    expect(channelIds(armed(withTwoTracks(), 'track-1'), 'cube')).toEqual(['track-2'])
  })

  it('keeps a bone apart from the node that carries it', () => {
    const boned = addAnimationTrack(
      { nodeId: 'cube', bone: 'Hips', property: 'position' },
      'Cube Hips',
      'track-bone',
    ).apply(withTwoTracks())

    expect(channelIds(boned, 'cube')).toEqual(['track-1', 'track-2'])
    // And a bone IS reachable now, which is what the pose mode needed.
    expect(channelIds(boned, 'cube', 'Hips')).toEqual(['track-bone'])
  })

  it('writes the DIFFERENCE to the rest pose, never the pose itself', () => {
    const state = withTwoTracks()
    const pose = { ...rest, position: vec(4) }
    const channels = recordingTracksFor(state.animation, 'cube')
    const [command] = recordMove(rest, pose, 1, channels.slice(0, 1))
    if (!command) throw new Error('one channel is recording')

    const after = command.apply(state)
    expect(after.animation.tracks[0]?.keys[0]).toMatchObject({ time: 1, value: vec(3) })
  })

  it('divides a scale back out rather than subtracting it', () => {
    const state = withTwoTracks()
    const pose = { ...rest, scale: { x: 6, y: 6, z: 6 } }
    const channels = recordingTracksFor(state.animation, 'cube')
    const [command] = recordMove(rest, pose, 0, channels.slice(1))
    if (!command) throw new Error('one channel is recording')

    expect(command.apply(state).animation.tracks[1]?.keys[0]?.value.x).toBe(3)
  })
})

describe('a command asked to revert what it never applied', () => {
  it('leaves the state exactly as it found it', () => {
    const state = withTwoTracks()

    expect(removeAnimationTrack('track-1').revert(state)).toEqual(state)
    expect(setAnimationKey('track-1', 1, vec(1)).revert(state)).toEqual(state)
    expect(removeAnimationKey('track-1', 1).revert(state)).toEqual(state)
    expect(setTimelineSettings({ fps: 60 }).revert(state)).toEqual(state)
  })

  it('does nothing for a track no timeline holds', () => {
    const state = withTwoTracks()

    expect(removeAnimationTrack('nobody').apply(state)).toEqual(state)
    expect(removeAnimationKey('nobody', 1).apply(state)).toEqual(state)
  })
})

describe('what one drag becomes over a whole selection', () => {
  const rest = { position: vec(0), rotation: vec(0), scale: { x: 1, y: 1, z: 1 } }
  const node = (id: string): SceneNode => ({
    id,
    parentId: null,
    name: id,
    visible: true,
    transform: rest,
    castShadow: false,
    receiveShadow: false,
    type: 'group',
  })

  const sceneWith = (): SceneState =>
    addAnimationTrack(target('cube'), 'Cube position', 'track-1').apply({
      ...EMPTY_SCENE,
      nodes: [node('cube'), node('sphere')],
    })

  const moved = (id: string, x: number) => ({ id, transform: { ...rest, position: vec(x) } })

  it('moves the nodes themselves while auto-key is off', () => {
    const state = sceneWith()
    const command = movesToCommand(state, [moved('cube', 5)], 0, false)
    if (!command) throw new Error('one node moved')

    const after = command.apply(state)
    expect(after.nodes[0]?.transform.position.x).toBe(5)
    expect(after.animation.tracks[0]?.keys).toEqual([])
  })

  it('writes a key instead once auto-key is recording', () => {
    const state = sceneWith()
    const command = movesToCommand(state, [moved('cube', 5)], 1, true)
    if (!command) throw new Error('one node moved')

    const after = command.apply(state)
    expect(after.animation.tracks[0]?.keys[0]).toMatchObject({ time: 1, value: vec(5) })
    // The node itself never moved: that is the whole point of recording.
    expect(after.nodes[0]?.transform.position.x).toBe(0)
  })

  it('is ONE command over a mixed selection, so one drag is one undo', () => {
    const state = sceneWith()
    const command = movesToCommand(state, [moved('cube', 5), moved('sphere', 9)], 0, true)
    if (!command) throw new Error('two nodes moved')

    const after = command.apply(state)
    expect(after.animation.tracks[0]?.keys).toHaveLength(1)
    expect(after.nodes[1]?.transform.position.x).toBe(9)
    // And it reverts as one, which a pair of commands could not promise.
    expect(command.revert(after)).toEqual(state)
  })

  it('answers nothing when there is nothing to write', () => {
    expect(movesToCommand(sceneWith(), [], 0, false)).toBeNull()
  })
})

describe('keying a whole subject at once', () => {
  it('writes on every channel, so one press keys move, turn and size together', () => {
    const state = withTwoTracks()
    const command = keySubject(state, ['track-1', 'track-2'], 2 * SECOND)
    if (!command) throw new Error('two tracks were given')

    const after = command.apply(state)
    expect(tracksOf(after)[0]?.keys).toHaveLength(1)
    expect(tracksOf(after)[1]?.keys).toHaveLength(1)
  })

  it('holds each channel at the value it ALREADY stands at, never at a neutral', () => {
    // A scale track keyed with nothing on it must hold one, not zero — zero would flatten it.
    const state = withTwoTracks()
    const command = keySubject(state, ['track-2'], 0)
    if (!command) throw new Error('one track was given')

    expect(command.apply(state).animation.tracks[1]?.keys[0]?.value).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('pins the interpolated pose when it lands between two keys', () => {
    const keyed = setAnimationKey('track-1', 0, vec(0)).apply(withTwoTracks())
    const spanned = setAnimationKey('track-1', 4 * SECOND, vec(8)).apply(keyed)

    const command = keySubject(spanned, ['track-1'], 2 * SECOND)
    if (!command) throw new Error('one track was given')

    const written = command.apply(spanned).animation.tracks[0]?.keys
    expect(written?.find(key => key.time === 2 * SECOND)?.value.x).toBeCloseTo(4, 5)
  })

  it('reverts as ONE entry, so a key costs one undo and not three', () => {
    const state = withTwoTracks()
    const command = keySubject(state, ['track-1', 'track-2'], SECOND)
    if (!command) throw new Error('two tracks were given')

    expect(command.revert(command.apply(state))).toEqual(state)
  })

  it('skips a locked channel rather than refusing the whole press', () => {
    const state = updateAnimationTrack(withTwoTracks(), 'track-1', track => ({
      ...track,
      locked: true,
    }))
    const command = keySubject(state, ['track-1', 'track-2'], 0)
    if (!command) throw new Error('one channel is still writable')

    const after = command.apply(state)
    expect(tracksOf(after)[0]?.keys).toHaveLength(0)
    expect(tracksOf(after)[1]?.keys).toHaveLength(1)
  })

  it('answers nothing when no channel can take a key', () => {
    expect(keySubject(withTwoTracks(), [], 0)).toBeNull()
    expect(keySubject(withTwoTracks(), ['nowhere'], 0)).toBeNull()
  })
})

describe('sliding a key along its track', () => {
  it('carries the value to the new instant', () => {
    const state = setAnimationKey('track-1', SECOND, vec(7)).apply(withTwoTracks())
    const after = moveAnimationKey('track-1', SECOND, 3 * SECOND).apply(state)

    expect(tracksOf(after)[0]?.keys).toEqual([{ time: 3 * SECOND, value: vec(7) }])
  })

  it('replaces a key already standing where it lands', () => {
    const one = setAnimationKey('track-1', 0, vec(1)).apply(withTwoTracks())
    const two = setAnimationKey('track-1', 2 * SECOND, vec(9)).apply(one)

    const after = moveAnimationKey('track-1', 0, 2 * SECOND).apply(two)
    expect(tracksOf(after)[0]?.keys).toEqual([{ time: 2 * SECOND, value: vec(1) }])
  })

  it('leaves the track alone when nothing stands at the instant given', () => {
    const state = setAnimationKey('track-1', SECOND, vec(7)).apply(withTwoTracks())
    expect(moveAnimationKey('track-1', 9 * SECOND, 0).apply(state)).toBe(state)
  })

  it('refuses to move a key of a locked track', () => {
    const keyed = setAnimationKey('track-1', SECOND, vec(7)).apply(withTwoTracks())
    const locked = updateAnimationTrack(keyed, 'track-1', track => ({ ...track, locked: true }))

    expect(moveAnimationKey('track-1', SECOND, 0).apply(locked)).toBe(locked)
  })

  it('puts the key back where it was', () => {
    const state = setAnimationKey('track-1', SECOND, vec(7)).apply(withTwoTracks())
    const command = moveAnimationKey('track-1', SECOND, 3 * SECOND)

    expect(command.revert(command.apply(state))).toEqual(state)
  })
})
