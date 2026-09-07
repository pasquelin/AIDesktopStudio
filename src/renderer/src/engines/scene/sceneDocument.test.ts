import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD, MESH_ENTRIES, reliefLayer } from '@shared/domain/scene'
import { MESH_PRIMITIVES } from './meshPrimitives'
import { LIGHT_TYPES } from './lightTypes'
import { lightNodeFixture as light, meshNode as mesh, modelNodeFixture } from './scene-fixtures'
import { scenePayload, sceneFromPayload } from './sceneDocument'
import { DEFAULT_MATERIAL, EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneState } from './sceneState'

/** A payload as it comes back from disk: through JSON, so nothing keeps a live reference. */
function reread(state: SceneState): SceneState {
  return sceneFromPayload(JSON.parse(JSON.stringify(scenePayload(state))))
}

const nodeWith = (fields: object): unknown => ({ ...mesh('a'), ...fields })

describe('scenePayload', () => {
  it('carries the nodes, what lights them and what moves them, and leaves the selection behind', () => {
    const state: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a')], selectedIds: ['a'] }
    expect(scenePayload(state)).toEqual({
      nodes: [mesh('a')],
      world: DEFAULT_WORLD,
      animation: EMPTY_TIMELINE,
    })
  })
})
describe('sceneFromPayload', () => {
  it('round-trips a scene through what is written to disk', () => {
    const state: SceneState = { ...EMPTY_SCENE, nodes: [mesh('a'), light('b')], selectedIds: ['a'] }
    expect(reread(state)).toEqual({
      ...EMPTY_SCENE,
      nodes: [mesh('a'), light('b')],
      selectedIds: [],
    })
  })

  it('round-trips every primitive the studio can build', () => {
    const nodes = MESH_PRIMITIVES.flatMap((primitive, index) =>
      primitive.create ? [{ ...mesh(`mesh-${index}`), geometry: primitive.create() }] : [],
    )

    expect(reread({ ...EMPTY_SCENE, nodes }).nodes).toHaveLength(
      MESH_ENTRIES.filter(entry => !entry.disabled).length,
    )
  })

  /** No spec describes a run of points, so nothing else would refuse a file that wrote rubbish. */
  it('drops a band whose run is not a run', () => {
    const nodes: unknown[] = [
      nodeWith({
        geometry: { kind: 'ribbon', points: 'a lot', width: 1, height: 0.2, closed: false },
      }),
      nodeWith({
        geometry: {
          kind: 'ribbon',
          points: [{ x: 0, y: 0, z: 0 }],
          width: 1,
          height: 0.2,
          closed: false,
        },
      }),
    ]

    expect(sceneFromPayload({ nodes }).nodes).toEqual([])
  })

  it('round-trips every kind of light', () => {
    const nodes = LIGHT_TYPES.map((type, index) => light(`light-${index}`, type.create()))
    expect(reread({ ...EMPTY_SCENE, nodes }).nodes).toHaveLength(nodes.length)
  })

  it('keeps a material dressed with textures', () => {
    const dressed = {
      ...mesh('a'),
      material: {
        ...DEFAULT_MATERIAL,
        color: '#ff0000',
        map: { assetId: 'asset_1' },
      },
    }

    expect(reread({ ...EMPTY_SCENE, nodes: [dressed], selectedIds: [] }).nodes).toEqual([dressed])
  })

  it('yields an empty scene for a payload that is not one', () => {
    expect(sceneFromPayload(null)).toEqual(EMPTY_SCENE)
    expect(sceneFromPayload({ nodes: 'nope' })).toEqual(EMPTY_SCENE)
    expect(sceneFromPayload('{}')).toEqual(EMPTY_SCENE)
  })

  it('opens with nothing selected, whatever the file says', () => {
    expect(sceneFromPayload({ ...EMPTY_SCENE, nodes: [], selectedIds: ['a'] }).selectedIds).toEqual(
      [],
    )
  })

  // A model is a reference and nothing else — what it points at is resolved when the scene is
  // built, so a project whose assets moved still opens.
  it('carries an imported model through a round trip', () => {
    const model = modelNodeFixture('m')
    expect(reread({ ...EMPTY_SCENE, nodes: [model], selectedIds: [] }).nodes).toEqual([model])
  })

  it('drops a model whose reference says nothing, and keeps the rest of the scene', () => {
    const nodes: unknown[] = [
      mesh('a'),
      { ...modelNodeFixture('m'), model: {} },
      { ...modelNodeFixture('n'), model: { assetId: 42 } },
      { ...modelNodeFixture('o'), model: null },
    ]

    expect(sceneFromPayload({ nodes }).nodes.map(node => node.id)).toEqual(['a'])
  })

  it('carries the material a model wears through a round trip', () => {
    const model = modelNodeFixture('m')
    model.model = { ...model.model, dress: { kind: 'materials', documentIds: ['mat-1'] } }

    expect(reread({ ...EMPTY_SCENE, nodes: [model], selectedIds: [] }).nodes).toEqual([model])
  })

  it('carries the picture a model is covered by through a round trip', () => {
    const model = modelNodeFixture('m')
    model.model = { ...model.model, dress: { kind: 'image', assetId: 'pic-1' } }

    expect(reread({ ...EMPTY_SCENE, nodes: [model], selectedIds: [] }).nodes).toEqual([model])
  })

  /**
   * Every scene saved before the two modes existed spells one material id at the root of the
   * node. Dropping it would undress every model already on disk, and a model back in its file's
   * own material looks exactly like one nobody ever dressed.
   */
  it('folds the single material id of an older document into a one-slot list', () => {
    const older = { ...modelNodeFixture('m'), model: { assetId: 'x', materialDocumentId: 'mat-1' } }
    const node = sceneFromPayload({ nodes: [older] }).nodes[0]

    expect(node?.type === 'model' && node.model.dress).toEqual({
      kind: 'materials',
      documentIds: ['mat-1'],
    })
    // Read once and never written again: left in place it would go on contradicting the dress.
    expect(node?.type === 'model' && node.model.materialDocumentId).toBeUndefined()
  })

  it('keeps an explicit textureless material on an imported model', () => {
    const plain = { ...modelNodeFixture('m'), model: { assetId: 'x', dress: { kind: 'plain' } } }

    const node = sceneFromPayload({ nodes: [plain] }).nodes[0]

    expect(node?.type === 'model' && node.model.dress).toEqual({ kind: 'plain' })
  })

  // The three modes exclude each other, and a file spelling none of their kinds means something this
  // reader cannot name: refusing the node says so, where undressing it in silence would not.
  it('drops a model whose dress names neither mode', () => {
    const nodes: unknown[] = [
      mesh('a'),
      { ...modelNodeFixture('m'), model: { assetId: 'x', dress: { kind: 'paint' } } },
    ]

    expect(sceneFromPayload({ nodes }).nodes.map(node => node.id)).toEqual(['a'])
  })

  // A material named by something that is not a string would come back as a model wearing nothing
  // with nothing said — the node is refused instead, like a malformed animation.
  it('drops a model whose material is not named by a string', () => {
    const nodes: unknown[] = [
      mesh('a'),
      { ...modelNodeFixture('m'), model: { assetId: 'x', materialDocumentId: 7 } },
    ]

    expect(sceneFromPayload({ nodes }).nodes.map(node => node.id)).toEqual(['a'])
  })

  it('keeps a model pointing at an asset nothing answers to, which is a project that moved', () => {
    const ghost = modelNodeFixture('m', 'gone')
    expect(reread({ ...EMPTY_SCENE, nodes: [ghost], selectedIds: [] }).nodes).toEqual([ghost])
  })
})

describe('sceneFromPayload legacy models', () => {
  /**
   * The costliest failure of the whole rig work, because it is invisible: a document saved before
   * clips were plural opening with nothing playing looks exactly like one that never played.
   */
  describe('a model saved before clips were plural', () => {
    const legacy = (animation: unknown): unknown => ({
      ...modelNodeFixture('m'),
      model: { assetId: 'a', animation },
    })

    const clipsOf = (animation: unknown) => {
      const node = sceneFromPayload({ nodes: [legacy(animation)] }).nodes[0]
      return node?.type === 'model' ? node.model.lanes?.[0]?.clips : undefined
    }

    it('opens with its clip turned into a block that plays the same', () => {
      const clips = clipsOf({
        clip: 'Walk',
        playing: true,
        time: 0.5,
        speed: 2,
        loop: false,
        start: 3,
      })

      expect(clips).toEqual([
        {
          id: 'legacy',
          source: { kind: 'embedded', name: 'Walk' },
          label: 'Walk',
          start: 3,
          duration: 0,
          offset: 0.5,
          speed: 2,
          loop: false,
          fadeIn: 0,
          fadeOut: 0,
          rootMotion: 'auto',
        },
      ])
    })

    // `start` came after the rest of `AnimationRef`, and the reader never required it.
    it('opens one written before a clip could be moved along the band', () => {
      const clips = clipsOf({ clip: 'Walk', playing: false, time: 0, speed: 1, loop: true })

      expect(clips?.[0]?.start).toBe(0)
    })

    it('never writes the singular form back', () => {
      const node = sceneFromPayload({
        nodes: [legacy({ clip: 'Walk', playing: false, time: 0, speed: 1, loop: true, start: 0 })],
      }).nodes[0]

      expect(node?.type === 'model' && 'animation' in node.model).toBe(false)
    })

    it('leaves a model that never animated without any clip at all', () => {
      expect(clipsOf(undefined)).toBeUndefined()
    })

    /** A block as a file spells one. */
    const clip = {
      id: 'c1',
      source: { kind: 'embedded', name: 'Run' },
      label: 'Run',
      start: 0,
      duration: 0,
      offset: 0,
      speed: 1,
      loop: true,
      fadeIn: 0,
      fadeOut: 0,
      rootMotion: 'auto',
    }

    // Written for two days, then moved to `sceneViews`. A file that still spells it must open —
    // the alternative is a model vanishing from a scene saved last week.
    it('opens a block that still carries the play flag it used to hold', () => {
      const nodes: unknown[] = [
        { ...modelNodeFixture('m'), model: { assetId: 'a', clips: [{ ...clip, playing: true }] } },
      ]
      const node = sceneFromPayload({ nodes }).nodes[0]

      expect(node?.type === 'model' && node.model.lanes?.[0]?.clips[0]?.source.name).toBe('Run')
    })

    // The form written between the plural and the lanes: its blocks belong to the lane a model
    // has by default, and a document that lost them would have lost its animation in silence.
    it('folds a flat list of blocks into the one lane a model starts with', () => {
      const nodes: unknown[] = [
        { ...modelNodeFixture('m'), model: { assetId: 'a', clips: [clip] } },
      ]
      const node = sceneFromPayload({ nodes }).nodes[0]

      expect(node?.type === 'model' && node.model.lanes).toEqual([{ id: 'main', clips: [clip] }])
      expect(node?.type === 'model' && 'clips' in node.model).toBe(false)
    })

    it('leaves the lanes a file already spells exactly as they stand', () => {
      const lanes = [
        { id: 'main', clips: [clip] },
        { id: 'second', clips: [] },
      ]
      const nodes: unknown[] = [{ ...modelNodeFixture('m'), model: { assetId: 'a', lanes } }]
      const node = sceneFromPayload({ nodes }).nodes[0]

      expect(node?.type === 'model' && node.model.lanes).toEqual(lanes)
    })

    it('keeps the list when a file holds both forms, and drops the leftover', () => {
      const nodes: unknown[] = [
        {
          ...modelNodeFixture('m'),
          model: {
            assetId: 'a',
            clips: [clip],
            animation: { clip: 'Walk', playing: false, time: 0, speed: 1, loop: true, start: 0 },
          },
        },
      ]
      const node = sceneFromPayload({ nodes }).nodes[0]

      expect(node?.type === 'model' && node.model.lanes?.[0]?.clips).toEqual([clip])
      expect(node?.type === 'model' && 'animation' in node.model).toBe(false)
    })

    it('drops a model whose clip list is malformed, like any other bad field', () => {
      const nodes: unknown[] = [
        mesh('a'),
        { ...modelNodeFixture('m'), model: { assetId: 'x', clips: [{ id: 'c1' }] } },
      ]

      expect(sceneFromPayload({ nodes }).nodes.map(node => node.id)).toEqual(['a'])
    })

    // The skeleton left the document: it lives in the model's own file now, so a scene written
    // when one did carry it opens with the dead key gone rather than with a rig nothing reads.
    it('leaves the skeleton an older document carried behind', () => {
      const nodes: unknown[] = [
        {
          ...modelNodeFixture('m'),
          model: {
            assetId: 'x',
            rig: {
              origin: 'local',
              bones: [{ name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM }],
            },
          },
        },
      ]
      const node = sceneFromPayload({ nodes }).nodes[0]

      expect(node?.id).toBe('m')
      expect(node?.type === 'model' && 'rig' in node.model).toBe(false)
    })
  })
})

describe('sceneFromPayload legacy world and sprites', () => {
  // A document names no environment until this step: every one written so far, and any file a
  // hand left half-edited, has to open lit rather than black.
  it('lights a scene the file says nothing about with the studio', () => {
    expect(sceneFromPayload({ nodes: [] }).world.environment).toEqual({ kind: 'studio' })
    expect(sceneFromPayload({ nodes: [], environment: null }).world.environment).toEqual({
      kind: 'studio',
    })
    expect(
      sceneFromPayload({ nodes: [], environment: { kind: 'skybox' } }).world.environment,
    ).toEqual({ kind: 'studio' })
  })

  // Every scene saved before the world existed spells its sky at the ROOT of the payload. Reading
  // it there is the whole of the migration, and losing it would relight every project silently.
  it('keeps the sky of a document written before the world existed', () => {
    const held = sceneFromPayload({ nodes: [], environment: { kind: 'skybox', assetId: 'sky-1' } })

    expect(held.world.environment).toEqual({ kind: 'skybox', assetId: 'sky-1' })
  })

  it('carries a chosen sky through a round trip', () => {
    const lit: SceneState = {
      ...EMPTY_SCENE,
      world: { ...EMPTY_SCENE.world, environment: { kind: 'skybox', assetId: 'sky-1' } },
    }
    expect(reread(lit).world.environment).toEqual({ kind: 'skybox', assetId: 'sky-1' })
  })

  it('carries the rest of the world through a round trip', () => {
    const dressed: SceneState = {
      ...EMPTY_SCENE,
      world: {
        ...EMPTY_SCENE.world,
        envIntensity: 1.5,
        background: { kind: 'color', color: '#123456' },
        fog: { kind: 'exp2', color: '#abcdef', density: 0.04 },
        toneMapping: 'aces',
        exposure: 1.2,
        ground: { visible: true, color: '#ffffff', size: 40, opacity: 0.5, receiveShadow: true },
        // Nothing reads these yet, and that is exactly why they are here: a template says how a
        // scene means to be walked, and a save that dropped it would lose the template's intent.
        play: { camera: 'thirdPerson', eyeHeight: 1.7, moveSpeed: 4, gravity: 9.81 },
      },
    }

    expect(reread(dressed).world).toEqual(dressed.world)
  })

  it('carries a relief through a round trip', () => {
    const held: SceneState = {
      ...EMPTY_SCENE,
      world: {
        ...EMPTY_SCENE.world,
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            {
              id: 'terrain',
              origin: { x: -16, z: 4 },
              size: { x: 256, z: 128 },
              elevation: { min: -8, max: 32 },
            },
          ),
        ],
      },
    }

    expect(reread(held).world.layers).toEqual(held.world.layers)
  })

  it('reads a relief written before the placement existed', () => {
    expect(
      sceneFromPayload({
        nodes: [],
        world: { layers: [{ kind: 'relief', heightmap: { assetId: 'asset_height' } }] },
      }).world.layers,
    ).toMatchObject([
      {
        kind: 'relief',
        heightmap: { assetId: 'asset_height' },
        name: 'Terrain',
        enabled: true,
      },
    ])
  })
})
