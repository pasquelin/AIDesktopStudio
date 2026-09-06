import { EMPTY_TIMELINE, SCENE_SUBJECT_ID } from '@shared/domain/animation'
import {
  EMPTY_STACK,
  postEffect,
  type CameraPost,
  type PostStack,
} from '@shared/domain/postProcessing'
import { stackFromPreset } from '@shared/domain/postPresets'
import { describe, expect, it } from 'vitest'
import { assetClip, clipLane, DEFAULT_CAMERA, DEFAULT_WORLD } from '@shared/domain/scene'
import { modelNodeFixture, meshNode as mesh } from './scene-fixtures'
import { carvedNode } from './nodeFactory'
import { scenePayload, sceneFromPayload } from './sceneDocument'
import {
  DEFAULT_MATERIAL,
  EMPTY_SCENE,
  IDENTITY_TRANSFORM,
  type SceneNode,
  type SceneState,
} from './sceneState'

/** A payload as it comes back from disk: through JSON, so nothing keeps a live reference. */
function reread(state: SceneState): SceneState {
  return sceneFromPayload(JSON.parse(JSON.stringify(scenePayload(state))))
}

const trackPayload = {
  id: 'track-1',
  name: 'Cube position',
  index: 0,
  muted: false,
  solo: false,
  locked: false,
  target: { nodeId: 'cube', property: 'position' },
  keys: [{ time: 1, value: { x: 1, y: 0, z: 0 } }],
}

const read = (animation: unknown) =>
  sceneFromPayload({ nodes: [], environment: { kind: 'studio' }, animation }).animation

describe('the timeline a file holds', () => {
  it('opens on an empty one where the file says nothing — every document written so far', () => {
    expect(read(undefined)).toEqual(EMPTY_TIMELINE)
  })

  /*
   * Who is on the band travels with the DOCUMENT: it is a choice somebody made, so reopening the
   * file — here or in another window — has to give the same band back. A field that reads back
   * empty leaves a scene looking unanimated while its keys are still there.
   */
  /*
   * Deleting an object leaves its id on the sheet in MEMORY, so an undo gives the object its line
   * back. Writing it would be another matter: a file would gather one ghost per object ever
   * deleted, and nothing anywhere would ever clear them.
   */
  it('leaves the objects the scene has lost out of the file', () => {
    const state: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a')],
      animation: { ...EMPTY_TIMELINE, sheet: ['a', 'gone'] },
    }

    expect(scenePayload(state).animation.sheet).toEqual(['a'])
    expect(state.animation.sheet).toEqual(['a', 'gone'])
  })

  // The composition line has no node behind it, so the filter above would take it out of every
  // file written — and the scene's own effects would come back with nowhere to be keyed.
  it('keeps the scene composition line on the sheet it writes', () => {
    const state: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a')],
      animation: { ...EMPTY_TIMELINE, sheet: [SCENE_SUBJECT_ID, 'a'] },
    }

    expect(reread(state).animation.sheet).toEqual([SCENE_SUBJECT_ID, 'a'])
  })

  it('carries the sheet through a save and a read, in order', () => {
    const state: SceneState = {
      ...EMPTY_SCENE,
      nodes: [mesh('a'), mesh('b')],
      animation: { ...EMPTY_TIMELINE, sheet: ['b', 'a'] },
    }

    expect(reread(state).animation.sheet).toEqual(['b', 'a'])
  })

  // A file that HAS a sheet is taken as it stands: rebuilding it from the tracks would put back
  // an object somebody took off on purpose, and it would come back at every open.
  it('leaves an empty sheet empty, even where tracks say who is animated', () => {
    expect(read({ tracks: [trackPayload], sheet: [] }).sheet).toEqual([])
  })

  // The recovery, and it runs ONCE: a file written before the sheet existed has none, and its
  // animated objects would otherwise come back with nowhere to be seen.
  it('recovers the sheet from what is animated where the file has none', () => {
    expect(read({ tracks: [trackPayload] }).sheet).toEqual(['cube'])
  })

  it('keeps only the ids of a sheet a hand has edited into something else', () => {
    expect(read({ tracks: [], sheet: ['cube', 7, null, 'lamp'] }).sheet).toEqual(['cube', 'lamp'])
  })

  it('reads a track back whole, keys included', () => {
    const timeline = read({ duration: 8, fps: 30, tracks: [trackPayload] })

    expect(timeline).toMatchObject({ duration: 8, fps: 30 })
    expect(timeline.tracks[0]?.keys).toEqual(trackPayload.keys)
  })

  it('drops one malformed track rather than the animation around it', () => {
    const timeline = read({
      tracks: [trackPayload, { id: 'broken', name: 'Broken' }, { ...trackPayload, id: 'track-2' }],
    })

    expect(timeline.tracks.map(track => track.id)).toEqual(['track-1', 'track-2'])
  })

  it('refuses a track whose property is not one this version drives', () => {
    const timeline = read({
      tracks: [{ ...trackPayload, target: { nodeId: 'cube', property: 'colour' } }],
    })

    expect(timeline.tracks).toEqual([])
  })

  it('refuses a key that is not a point in time and space', () => {
    const timeline = read({ tracks: [{ ...trackPayload, keys: [{ time: 'soon' }] }] })
    expect(timeline.tracks).toEqual([])
  })

  it('falls back on the defaults for a length or a rate that says nothing usable', () => {
    const timeline = read({ duration: -3, fps: 0, tracks: [] })
    expect(timeline).toMatchObject({
      duration: EMPTY_TIMELINE.duration,
      fps: EMPTY_TIMELINE.fps,
    })
  })

  it('takes a bone track, which names a bone inside a file rather than a node', () => {
    const timeline = read({
      tracks: [
        { ...trackPayload, target: { nodeId: 'perso', bone: 'spine', property: 'rotation' } },
      ],
    })

    expect(timeline.tracks[0]?.target).toMatchObject({ bone: 'spine' })
  })

  it('reads the shots back whole, and gives none to a file written before they existed', () => {
    const shot = { id: 'shot-1', cameraId: 'cam-a', start: 0, duration: 5 }

    expect(read({ tracks: [], shots: [shot] }).shots).toEqual([shot])
    expect(read({ tracks: [trackPayload] }).shots).toEqual([])
  })

  /**
   * `layer` is gone from the shot: the list's own order is what settles an overlap now. A file
   * written while the number existed is sorted by it ONCE, here — highest first, equal layers by
   * start, which is exactly the law those numbers used to spell — and comes back without it.
   */
  it('sorts a file written with layers by them, once, and drops the number', () => {
    const held = (id: string, layer: number, start: number) => ({
      id,
      cameraId: `cam-${id}`,
      layer,
      start,
      duration: 5,
    })

    const shots = read({
      tracks: [],
      shots: [held('low', 0, 0), held('high', 4, 0), held('mid', 2, 0)],
    }).shots

    expect(shots.map(shot => shot.id)).toEqual(['high', 'mid', 'low'])
    expect(shots[0]).not.toHaveProperty('layer')
  })

  // The stack a user arranged IS the order of this list now, so a read that re-sorted it would
  // undo that arrangement every time the document was opened.
  it('leaves the order of a file written without layers exactly as it stands', () => {
    const held = (id: string, start: number) => ({
      id,
      cameraId: `cam-${id}`,
      start,
      duration: 5,
    })

    const shots = read({ tracks: [], shots: [held('late', 9), held('early', 0)] }).shots
    expect(shots.map(shot => shot.id)).toEqual(['late', 'early'])
  })

  // A shot of no length covers no instant, so it can only ever be a hole in the band.
  it('drops a shot of no length, and one naming no camera, rather than the band around it', () => {
    const shot = { id: 'shot-1', cameraId: 'cam-a', layer: 0, start: 0, duration: 5 }
    const timeline = read({
      tracks: [],
      shots: [
        { ...shot, id: 'empty', duration: 0 },
        { ...shot, id: 'nameless', cameraId: '' },
        shot,
      ],
    })

    expect(timeline.shots.map(kept => kept.id)).toEqual(['shot-1'])
  })

  it('refuses a bone that is not a name', () => {
    const timeline = read({
      tracks: [{ ...trackPayload, target: { nodeId: 'perso', bone: 7, property: 'rotation' } }],
    })

    expect(timeline.tracks).toEqual([])
  })
})

describe('a carved solid across a save', () => {
  const window = () =>
    carvedNode(
      {
        base: {
          name: 'Wall',
          geometry: { kind: 'box', width: 4, height: 3, depth: 0.2 },
          transform: IDENTITY_TRANSFORM,
          material: DEFAULT_MATERIAL,
        },
        steps: [
          {
            operation: 'subtract',
            part: {
              name: 'Hole',
              geometry: { kind: 'box', width: 1, height: 1, depth: 1 },
              transform: { ...IDENTITY_TRANSFORM, position: { x: 1, y: 0, z: 0 } },
              material: DEFAULT_MATERIAL,
            },
          },
        ],
        collision: 'trimesh',
      },
      { name: 'Wall' },
    )

  // Through `reread`, so it is the JSON round trip that answers, not a live reference.
  const reopened = (node: SceneNode) => reread({ ...EMPTY_SCENE, nodes: [node] }).nodes

  // The one that was measured missing: written, and gone on reopening — the whole recipe with it.
  it('comes back at all', () => {
    expect(reopened(window())).toHaveLength(1)
  })

  it('comes back with the brushes it was cut from, and their placement', () => {
    const back = reopened(window())[0]
    if (back?.type !== 'carved') throw new Error('the solid did not survive the save')

    expect(back.carved.base.geometry).toEqual({ kind: 'box', width: 4, height: 3, depth: 0.2 })
    expect(back.carved.steps).toHaveLength(1)
    expect(back.carved.steps[0]?.operation).toBe('subtract')
    expect(back.carved.steps[0]?.part.transform.position.x).toBe(1)
  })

  it('refuses a solid whose recipe does not read, rather than drawing half of it', () => {
    const broken = { ...window(), carved: { base: { name: 'Wall' }, steps: [], collision: 'box' } }
    expect(reopened(broken as SceneNode)).toEqual([])
  })

  // The same half of the rule a mesh gets: a file written before a material field existed comes
  // back with that field filled in, rather than holding `undefined`.
  it('lays the material defaults under a solid, as it does under a mesh', () => {
    const bare = { ...window(), material: { kind: 'standard', color: null } }
    const back = reopened(bare as SceneNode)[0]

    expect(back?.type === 'carved' && back.material).toEqual(DEFAULT_MATERIAL)
  })
})

describe('the composition, written and read back', () => {
  const camera = (post?: CameraPost): SceneNode => ({
    id: 'cam',
    parentId: null,
    name: 'Camera 01',
    visible: true,
    transform: IDENTITY_TRANSFORM,
    castShadow: false,
    receiveShadow: false,
    type: 'camera',
    camera: post ? { ...DEFAULT_CAMERA, post } : DEFAULT_CAMERA,
  })

  const written = (state: SceneState): SceneState =>
    sceneFromPayload(JSON.parse(JSON.stringify(scenePayload(state))))

  it('gives back the scene composition, effect by effect and value by value', () => {
    const held: SceneState = {
      ...EMPTY_SCENE,
      world: { ...DEFAULT_WORLD, post: stackFromPreset('cinematic', () => 'fixed') },
    }

    expect(written(held).world.post).toEqual(held.world.post)
  })

  it('gives back what a camera overrides with, under the same instance ids', () => {
    const own: PostStack = { enabled: true, effects: [postEffect('own-1', 'vignette')] }
    const held: SceneState = { ...EMPTY_SCENE, nodes: [camera({ mode: 'override', stack: own })] }

    const back = written(held).nodes[0]
    expect(back?.type === 'camera' && back.camera.post).toEqual({ mode: 'override', stack: own })
  })

  it('gives back a camera that films through nothing', () => {
    const held: SceneState = { ...EMPTY_SCENE, nodes: [camera({ mode: 'disabled' })] }

    const back = written(held).nodes[0]
    expect(back?.type === 'camera' && back.camera.post).toEqual({ mode: 'disabled' })
  })

  /**
   * 🛑 The migration, and it is the whole of it: every document ever written says nothing about a
   * composition, and a reader that required one would open them all on an empty scene.
   */
  it('opens a document written before compositions existed exactly as it was', () => {
    const old = { nodes: [{ ...camera(), camera: { fov: 50, near: 0.1, far: 1000 } }], world: {} }
    const back = sceneFromPayload(old)

    expect(back.world.post).toEqual(EMPTY_STACK)
    expect(back.nodes[0]?.type === 'camera' && back.nodes[0].camera.post).toBeUndefined()
  })

  it('drops an effect this build has no code for rather than refusing the file', () => {
    const payload = {
      nodes: [],
      world: { post: { enabled: true, effects: [{ effect: 'bloom' }, { effect: 'raytracing' }] } },
    }

    expect(sceneFromPayload(payload).world.post.effects.map(one => one.effect)).toEqual(['bloom'])
  })

  it('keeps a channel that drives a composition parameter', () => {
    const held: SceneState = {
      ...EMPTY_SCENE,
      animation: {
        ...EMPTY_TIMELINE,
        tracks: [
          {
            id: 't',
            name: 'Bloom',
            index: 0,
            muted: false,
            solo: false,
            locked: false,
            target: {
              nodeId: SCENE_SUBJECT_ID,
              property: 'post',
              post: { effectId: 'a', param: 'strength' },
            },
            keys: [{ time: 0, value: { x: 1, y: 0, z: 0 } }],
          },
        ],
      },
    }

    expect(written(held).animation.tracks[0]?.target.post).toEqual({
      effectId: 'a',
      param: 'strength',
    })
  })

  /** A channel naming no effect drives nothing: kept, it would sit on the band reaching nowhere. */
  it('drops a composition channel that names no effect', () => {
    const payload = {
      nodes: [],
      animation: {
        tracks: [
          { id: 't', name: 'x', index: 0, target: { nodeId: 'a', property: 'post' }, keys: [] },
        ],
      },
    }

    expect(sceneFromPayload(payload).animation.tracks).toEqual([])
  })
})

/**
 * 🛑 R4 of the plan, and the one that would break everything quietly: a save recomposes the
 * timeline WHOLE from the state, so a row this build does not read back is a row the next `⌘S`
 * drops without a word. What a game puts on a timeline has to survive a round trip.
 */
describe('what a timeline carries beyond moving something', () => {
  const timed = (over: Partial<SceneState['animation']>): SceneState => ({
    ...EMPTY_SCENE,
    animation: { ...EMPTY_TIMELINE, ...over },
  })

  it('gives back every row a game put on it', () => {
    const state = timed({
      events: [
        { id: 'e1', at: 1_000, name: 'DoorOpened', entity: 'n1', payload: { side: 'north' } },
      ],
      audio: [{ id: 'a1', assetId: 'asset-1', start: 0, duration: 5_000, gain: 0.5, fadeIn: 200 }],
      video: [{ id: 'v1', assetId: 'asset-2', start: 0, duration: 3_000 }],
      transitions: [{ id: 't1', at: 3_000, kind: 'fade', duration: 500, scene: 'doc-2' }],
      template: 'intro',
    })

    expect(reread(state).animation).toEqual(state.animation)
  })

  /** A scene that carries none must come back exactly as it was written — absent, not empty. */
  it('leaves a timeline that never had one alone', () => {
    const held = reread(timed({})).animation

    expect(held).toEqual(EMPTY_TIMELINE)
    expect('events' in held).toBe(false)
    expect('template' in held).toBe(false)
  })

  it('drops a row it cannot read rather than carrying half of one', () => {
    const state = timed({
      events: [{ id: 'e1', at: 1_000, name: 'Fine' }],
      transitions: [{ id: 't1', at: 0, kind: 'fade', duration: 100 }],
    })
    const written = JSON.parse(JSON.stringify(scenePayload(state))) as {
      animation: { events: unknown[]; transitions: unknown[] }
    }
    written.animation.events.push({ id: 'e2', at: 'soon' })
    written.animation.transitions.push({ id: 't2', at: 0, kind: 'wipe', duration: 1 })

    const held = sceneFromPayload(written).animation

    expect(held.events).toEqual(state.animation.events)
    expect(held.transitions).toEqual(state.animation.transitions)
  })

  it('refuses a template nothing declares rather than carrying it through', () => {
    const written = JSON.parse(JSON.stringify(scenePayload(timed({})))) as {
      animation: Record<string, unknown>
    }
    written.animation.template = 'whatever'

    expect('template' in sceneFromPayload(written).animation).toBe(false)
  })
})

it('preserves a selected animation through save and rejects an invalid index', () => {
  const selected = assetClip('clip', 'motion', 'Multi')
  const node = {
    ...modelNodeFixture('a'),
    model: {
      assetId: 'character',
      lanes: [
        clipLane('lane', [
          {
            ...selected,
            source: { kind: 'asset', assetId: 'motion', name: 'Multi', clipIndex: 2 },
          },
        ]),
      ],
    },
  }
  expect(reread({ ...EMPTY_SCENE, nodes: [node] }).nodes).toHaveLength(1)
  const payload = scenePayload({ ...EMPTY_SCENE, nodes: [node] })
  node.model.lanes[0]!.clips[0]!.source = {
    kind: 'asset',
    assetId: 'motion',
    name: 'Multi',
    clipIndex: -1,
  }
  expect(sceneFromPayload({ ...payload, nodes: [node] }).nodes).toHaveLength(0)
})
