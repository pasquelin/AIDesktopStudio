import { describe, expect, it } from 'vitest'
import { SCENE_SUBJECT_ID, type TrackTarget } from '@shared/domain/animation'
import { SECOND, type Us } from '@shared/domain/time'
import { fovAt, poseAt } from './animationEval'
import {
  addAnimationTrack,
  addCameraShot,
  editCameraShot,
  lensToCommand,
  removeCameraShot,
  keyNode,
  movesToCommand,
  reorderCameraShots,
  railOnNewShot,
  updateAnimationTrack,
} from './animationCommands'
import { cameraShot } from './animation-fixtures'
import { cameraNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneNode, type SceneState } from './sceneState'

const target = (nodeId: string, property: TrackTarget['property'] = 'position'): TrackTarget => ({
  nodeId,
  property,
})

const vec = (x: number) => ({ x, y: 0, z: 0 })

describe('keying an object that was moved by hand', () => {
  const REST = { position: vec(0), rotation: vec(0), scale: { x: 1, y: 1, z: 1 } }
  const cube = (x: number): SceneNode => ({
    id: 'cube',
    parentId: null,
    name: 'cube',
    visible: true,
    transform: { ...REST, position: vec(x) },
    castShadow: false,
    receiveShadow: false,
    type: 'group',
  })

  /** The gesture that showed nothing: key, move the object, key again, press Play. */
  const cubeAt = (x: number): SceneState => ({ ...EMPTY_SCENE, nodes: [cube(x)] })

  const keyAt = (state: SceneState, time: number): SceneState => {
    const command = keyNode(state, { nodeId: 'cube' }, time, NAMES, property => `t-${property}`)
    if (!command) throw new Error('a node is always keyable')
    return command.apply(state)
  }

  const NAMES = {
    position: 'Cube · Position',
    rotation: 'Cube · Rotation',
    scale: 'Cube · Scale',
    fov: 'Cube · Lens',
    post: 'Cube · Post',
  }

  it('holds the movement made since the channel opened, not zero', () => {
    const first = keyAt(cubeAt(0), 0)
    // The object is dragged with nothing recording, which writes its POSITION.
    const dragged = {
      ...first,
      nodes: [{ ...first.nodes[0]!, transform: { ...REST, position: vec(4) } }],
    }

    const second = keyAt(dragged, 2 * SECOND)
    const position = second.animation.tracks.find(track => track.target.property === 'position')

    expect(position?.keys.map(key => key.value.x)).toEqual([0, 4])
  })

  it('puts the object back on its rest pose, so the move is counted ONCE', () => {
    const first = keyAt(cubeAt(0), 0)
    const dragged = {
      ...first,
      nodes: [{ ...first.nodes[0]!, transform: { ...REST, position: vec(4) } }],
    }

    const second = keyAt(dragged, 2 * SECOND)

    // Left at four, the viewport would show four PLUS the key's four at the second key.
    expect(second.nodes[0]?.transform.position.x).toBe(0)
  })

  it('makes the two keys describe an actual movement, which is what Play shows', () => {
    const first = keyAt(cubeAt(0), 0)
    const dragged = {
      ...first,
      nodes: [{ ...first.nodes[0]!, transform: { ...REST, position: vec(4) } }],
    }
    const second = keyAt(dragged, 2 * SECOND)

    const at = (time: number) =>
      poseAt(second.nodes[0]!.transform, second.animation, 'cube', time).position.x

    expect(at(0)).toBe(0)
    expect(at(1 * SECOND)).toBeCloseTo(2, 5)
    expect(at(2 * SECOND)).toBe(4)
  })

  it('reverts the whole thing — keys, channels and the pose — in one go', () => {
    const state = cubeAt(0)
    const command = keyNode(state, { nodeId: 'cube' }, 0, NAMES, property => `t-${property}`)
    if (!command) throw new Error('a node is always keyable')

    expect(command.revert(command.apply(state))).toEqual(state)
  })
})

describe('dragging an object that is already keyed', () => {
  const REST = { position: vec(0), rotation: vec(0), scale: { x: 1, y: 1, z: 1 } }
  const cube = (x: number): SceneNode => ({
    id: 'cube',
    parentId: null,
    name: 'cube',
    visible: true,
    transform: { ...REST, position: vec(x) },
    castShadow: false,
    receiveShadow: false,
    type: 'group',
  })

  const NAMES = {
    position: 'Cube · Position',
    rotation: 'Cube · Rotation',
    scale: 'Cube · Scale',
    fov: 'Cube · Lens',
    post: 'Cube · Post',
  }

  /** A cube keyed at zero and again at two seconds, four units along. */
  function animated(): SceneState {
    const start = { ...EMPTY_SCENE, nodes: [cube(0)] }
    const first = keyNode(start, { nodeId: 'cube' }, 0, NAMES, p => `t-${p}`)?.apply(start)
    if (!first) throw new Error('a node is always keyable')

    const dragged = { ...first, nodes: [cube(4)] }
    return keyNode(dragged, { nodeId: 'cube' }, 2 * SECOND, NAMES, p => `t-${p}`)!.apply(dragged)
  }

  const poseOf = (state: SceneState, time: number) =>
    poseAt(state.nodes[0]!.transform, state.animation, 'cube', time).position.x

  // Measured 2026-09-06 (Codex by MCP): keyed at zero, placed two units along at the playhead,
  // keyed again at three seconds — and read ZERO at three seconds. The key measured the stored
  // rest against itself instead of the pose on screen.
  it('holds the pose shown at the playhead when the key lands elsewhere on the band', () => {
    const start = { ...EMPTY_SCENE, nodes: [cube(0)] }
    const first = keyNode(start, { nodeId: 'cube' }, 0, NAMES, p => `t-${p}`)!.apply(start)
    const placed = movesToCommand(
      first,
      [{ id: 'cube', transform: { ...REST, position: vec(2) } }],
      0,
      false,
    )!.apply(first)

    const keyed = keyNode(
      placed,
      { nodeId: 'cube' },
      3 * SECOND,
      NAMES,
      p => `t-${p}`,
      undefined,
      0,
    )

    expect(poseOf(keyed!.apply(placed), 3 * SECOND)).toBe(2)
    expect(poseOf(keyed!.apply(placed), 0)).toBe(2)
  })

  it('records the drag even with the switch OFF, since the object is already animated', () => {
    const state = animated()
    // Dropped at nine, at the instant the second key stands on.
    const command = movesToCommand(
      state,
      [{ id: 'cube', transform: { ...REST, position: vec(9) } }],
      2 * SECOND,
      false,
    )
    if (!command) throw new Error('one node moved')

    // Where it was dropped, not nine plus the four the key already added.
    expect(poseOf(command.apply(state), 2 * SECOND)).toBe(9)
  })

  it('leaves the earlier key where it was, so one drag edits one instant', () => {
    const state = animated()
    const command = movesToCommand(
      state,
      [{ id: 'cube', transform: { ...REST, position: vec(9) } }],
      2 * SECOND,
      false,
    )

    expect(poseOf(command!.apply(state), 0)).toBe(0)
  })

  it('still moves an UNKEYED object rather than keying it behind your back', () => {
    const plain = { ...EMPTY_SCENE, nodes: [cube(0)] }
    const command = movesToCommand(
      plain,
      [{ id: 'cube', transform: { ...REST, position: vec(5) } }],
      0,
      false,
    )

    const after = command!.apply(plain)
    expect(after.nodes[0]?.transform.position.x).toBe(5)
    expect(after.animation.tracks).toEqual([])
  })

  it('records an object whose channels exist but hold no key only when asked', () => {
    const start = { ...EMPTY_SCENE, nodes: [cube(0)] }
    const opened = addAnimationTrack(target('cube'), 'Cube position', 'track-1').apply(start)
    const move = [{ id: 'cube', transform: { ...REST, position: vec(5) } }]

    // Empty channels are not an animation yet: the switch still decides.
    expect(
      movesToCommand(opened, move, 0, false)!.apply(opened).nodes[0]?.transform.position.x,
    ).toBe(5)
    expect(
      movesToCommand(opened, move, 0, true)!.apply(opened).nodes[0]?.transform.position.x,
    ).toBe(0)
  })
})

describe('the lens of a camera, typed into the inspector', () => {
  const camera = cameraNodeFixture('cam', { fov: 50 })
  const plain: SceneState = { ...EMPTY_SCENE, nodes: [camera] }
  const lensed = addAnimationTrack(target('cam', 'fov'), 'Camera lens', 'lens').apply(plain)

  const descriptorFov = (state: SceneState): number | null => {
    const node = state.nodes[0]
    return node?.type === 'camera' ? node.camera.fov : null
  }
  const keysOf = (state: SceneState) => state.animation.tracks[0]?.keys ?? []
  /** The gesture the inspector makes: a field named, a number typed, at an instant. */
  const typed = (state: SceneState, fov: number, at: Us, recording: boolean): SceneState =>
    lensToCommand(state.animation, [camera], 'fov', fov, at, recording).apply(state)

  it('writes the descriptor for a camera no lens channel drives', () => {
    expect(descriptorFov(typed(plain, 80, 0, true))).toBe(80)
  })

  it('leaves a field no channel can carry to the descriptor, whatever records', () => {
    const applied = lensToCommand(lensed.animation, [camera], 'near', 2, 0, true).apply(lensed)
    const node = applied.nodes[0]

    expect(node?.type === 'camera' && node.camera.near).toBe(2)
    expect(keysOf(applied)).toEqual([])
  })

  it('writes what the channel must ADD, leaving the descriptor where it stands', () => {
    const applied = typed(lensed, 80, 0, true)

    expect(keysOf(applied)).toEqual([{ time: 0, value: { x: 30, y: 0, z: 0 } }])
    expect(descriptorFov(applied)).toBe(50)
  })

  it('leaves an empty channel alone while nothing records', () => {
    const applied = typed(lensed, 80, 0, false)

    expect(keysOf(applied)).toEqual([])
    expect(descriptorFov(applied)).toBe(80)
  })

  // The rule `movesToCommand` holds for a drag: once a camera is animated, the switch stops
  // deciding — writing the descriptor would move the lens by whatever the key already adds.
  it('keeps keying a channel that already holds one, whatever the switch says', () => {
    const first = typed(lensed, 60, 0, true)
    const second = typed(first, 80, 2 * SECOND, false)

    expect(keysOf(second).map(key => key.value.x)).toEqual([10, 30])
    expect(descriptorFov(second)).toBe(50)
  })

  /**
   * The field shows what the channels PLAY, so what is written has to be picked by the same
   * filter. Keyed on a muted channel, the number typed would vanish the moment it was written.
   */
  it('writes the lens itself rather than keying a channel that is muted', () => {
    const muted = updateAnimationTrack(typed(lensed, 60, 0, true), 'lens', track => ({
      ...track,
      muted: true,
    }))
    const applied = typed(muted, 80, 0, true)

    expect(keysOf(applied).map(key => key.value.x)).toEqual([10])
    expect(descriptorFov(applied)).toBe(80)
  })

  // A locked channel goes on adding what it adds: writing the typed number into the descriptor
  // under it would leave the lens reading that number PLUS the channel's own share.
  it('writes under a locked channel what makes the lens read the number typed', () => {
    const locked = updateAnimationTrack(typed(lensed, 70, 0, true), 'lens', track => ({
      ...track,
      locked: true,
    }))
    const applied = typed(locked, 80, 0, true)

    expect(keysOf(applied).map(key => key.value.x)).toEqual([20])
    expect(descriptorFov(applied)).toBe(60)
    expect(60 + (fovAt(applied.animation, 'cam', 0) ?? 0)).toBe(80)
  })

  it('has the lens read between two keys, which is what a field of view animates for', () => {
    const first = typed(lensed, 50, 0, true)
    const second = typed(first, 80, 2 * SECOND, true)

    expect(50 + (fovAt(second.animation, 'cam', 1 * SECOND) ?? 0)).toBe(65)
  })
})

describe('the shots of a sequence', () => {
  const shot = cameraShot('s1', { start: 1 * SECOND, duration: 2 * SECOND })
  const other = cameraShot('s2', { cameraId: 'cam-b', start: 4 * SECOND })
  const start: SceneState = {
    ...EMPTY_SCENE,
    animation: { ...EMPTY_SCENE.animation, shots: [shot, other] },
  }

  // The shot joins the end of its camera's own run, so the line the user dragged keeps its rank.
  it('puts a camera on air, and takes it back off on undo', () => {
    const command = addCameraShot(cameraShot('s3'))
    const applied = command.apply(start)

    expect(applied.animation.shots.map(held => held.id)).toEqual(['s1', 's3', 's2'])
    expect(command.revert(applied)).toEqual(start)
  })

  // A shot laid down only to be hidden by what was already there reads as a button doing nothing.
  it('opens the stack with a camera the band did not show yet', () => {
    const applied = addCameraShot(cameraShot('s3', { cameraId: 'cam-c' })).apply(start)

    expect(applied.animation.shots.map(held => held.id)).toEqual(['s3', 's1', 's2'])
  })

  // Two shots of one line starting together are settled by their order, so a shot restored at
  // the end would come back on top of what it was under.
  it('puts a removed shot back where it stood', () => {
    const command = removeCameraShot('s1')
    const applied = command.apply(start)

    expect(applied.animation.shots.map(held => held.id)).toEqual(['s2'])
    expect(command.revert(applied).animation.shots.map(held => held.id)).toEqual(['s1', 's2'])
  })

  it('moves and trims through one command, and reverts the whole shot', () => {
    const edit = editCameraShot('s1', { start: 5 * SECOND, duration: 1 * SECOND })
    const moved = edit.apply(start)

    expect(moved.animation.shots[0]).toMatchObject({ start: 5 * SECOND, duration: 1 * SECOND })
    expect(edit.revert(moved)).toEqual(start)
  })

  it('leaves the state alone when the shot named is gone', () => {
    expect(editCameraShot('nowhere', { start: 9 * SECOND }).apply(start)).toBe(start)
    expect(removeCameraShot('nowhere').apply(start)).toBe(start)
  })

  /**
   * The order of the lines is the montage's law, so dragging one is an edit of the document —
   * unlike the sheet's own arrangement, which no history holds.
   */
  it('writes the order it is given, and gives back the one that stood before', () => {
    const command = reorderCameraShots('cam-a', [other, shot])
    const applied = command.apply(start)

    expect(applied.animation.shots.map(held => held.id)).toEqual(['s2', 's1'])
    expect(command.revert(applied)).toEqual(start)
  })

  it('replays a whole drag rather than its last notch, once the steps have coalesced', () => {
    const third = cameraShot('s3', { cameraId: 'cam-c' })
    const from: SceneState = {
      ...start,
      animation: { ...start.animation, shots: [shot, other, third] },
    }

    const first = reorderCameraShots('cam-a', [other, shot, third])
    const last = reorderCameraShots('cam-a', [other, third, shot])

    // `coalesce` keeps the FIRST revert and the LAST apply, so the last apply has to describe the
    // drag from where it STARTED — a command holding a step would redo one notch of the two.
    first.apply(from)
    const replayed = last.apply(from)

    expect(replayed.animation.shots.map(held => held.id)).toEqual(['s2', 's3', 's1'])
    expect(first.revert(replayed)).toEqual(from)
  })

  /**
   * A rail drives nothing without a shot to run it, so asking for one asks for both — and the
   * button was unreachable until a shot had been posed from another panel, with nothing saying so.
   */
  it('opens a shot and lays its rail in one gesture, and takes back both', () => {
    const camera = cameraNodeFixture('cam-c')
    const fresh = cameraShot('s3', { cameraId: 'cam-c' })
    const command = railOnNewShot(camera, fresh)
    const applied = command.apply({ ...start, nodes: [camera] })

    const laid = applied.animation.shots.find(held => held.id === 's3')
    expect(applied.nodes.filter(node => node.type === 'path')).toHaveLength(1)
    expect(laid?.motion?.pathId).toBe(applied.nodes.find(node => node.type === 'path')?.id)

    expect(command.revert(applied)).toEqual({ ...start, nodes: [camera] })
  })

  // Where the camera stands, so the rail starts under it rather than at the world's origin.
  it('lays the rail on the camera it belongs to', () => {
    const camera = {
      ...cameraNodeFixture('cam-c'),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 3, y: 1, z: -2 } },
    }
    const applied = railOnNewShot(camera, cameraShot('s3', { cameraId: 'cam-c' })).apply({
      ...start,
      nodes: [camera],
    })

    expect(applied.nodes.find(node => node.type === 'path')?.transform.position).toEqual({
      x: 3,
      y: 1,
      z: -2,
    })
  })
})

/**
 * The scene's composition stands on the sheet like any other subject, so the band's diamond
 * points at it — and it has neither a pose nor a lens. Opening the three pose channels there
 * would key a subject nothing can move, and nothing in the type system says otherwise.
 */
describe('keying the scene composition line', () => {
  const NAMES = {
    position: 'Scene · Position',
    rotation: 'Scene · Rotation',
    scale: 'Scene · Scale',
    fov: 'Scene · Lens',
    post: 'Scene · Composition',
  }

  const keyed = (state: SceneState) =>
    keyNode(state, { nodeId: SCENE_SUBJECT_ID }, SECOND, NAMES, property => `t-${property}`)

  it('opens no channel of its own where the composition holds none', () => {
    expect(keyed(EMPTY_SCENE)).toBeNull()
  })

  it('keys the composition channels that stand, and opens no pose beside them', () => {
    const state = addAnimationTrack(
      { nodeId: SCENE_SUBJECT_ID, property: 'post', post: { effectId: 'fx', param: 'strength' } },
      'Bloom · Strength',
      'post-1',
    ).apply(EMPTY_SCENE)

    const after = keyed(state)?.apply(state)

    expect(after?.animation.tracks.map(track => track.id)).toEqual(['post-1'])
    expect(after?.animation.tracks[0]?.keys.map(key => key.time)).toEqual([SECOND])
  })
})
