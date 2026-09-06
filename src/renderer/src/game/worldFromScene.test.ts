import { describe, expect, it } from 'vitest'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import { DEFAULT_PLAY, reliefLayer } from '@shared/domain/scene'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { createExportHost } from '@game/host/exportHost'
import { loadJoltPhysics } from '@game/host/joltPhysics'
import { notedPhysics } from '@game/physics/physics-fixtures'
import type { PhysicsPort } from '@game/ports/physicsPort'
import type { CameraView, RenderPort } from '@game/ports/renderPort'
import type { GameApi } from '@game/api/gameApi'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import type { World } from '@game/runtime/world'
import type { InputMap } from '@shared/domain/inputMap'
import { playerModuleNodes } from '@/engines/scene/nodeFactory'
import { worldFromScene } from './worldFromScene'

const ports = (physics?: PhysicsPort, render?: RenderPort): GameApi => ({
  ...createExportHost({
    input: new EventTarget(),
    player: { id: 'p1', name: 'Alba', local: true },
    files: {},
    ...(render ? { render } : {}),
  }),
  ...(physics ? { physics } : {}),
})

const scene = (): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [
    { ...meshNode('a'), name: 'Plate-forme', components: [newComponent('Movement')] },
    meshNode('b'),
  ],
})

describe('the edit state, translated into something that runs', () => {
  it('starts the runtime with the default input contexts from the project', () => {
    const inputMaps: readonly InputMap[] = [
      {
        version: 1,
        id: 'character',
        priority: 0,
        defaultActive: true,
        actions: [],
      },
      { version: 1, id: 'vehicle', priority: 10, defaultActive: false, actions: [] },
    ]

    const world = worldFromScene('doc-1', scene(), ports(), {}, 1, undefined, inputMaps)

    // Its own two first, then the built-in contexts it left undefined — see `inputDefaults`.
    expect(world.inputControls.maps().map(map => map.id)).toEqual([
      'character',
      'vehicle',
      'flight',
    ])
    expect(world.inputContexts.active()).not.toContain('vehicle')
    expect(world.inputContexts.active()).toContain('character')
  })

  it('carries every object, with its name and what it does', () => {
    const world = worldFromScene('doc-1', scene(), ports())

    expect([...world.entities.all()].map(entity => entity.id)).toEqual(['a', 'b'])
    expect(world.entities.get('a')?.name).toBe('Plate-forme')
    expect(world.entities.get('a')?.components).toEqual([newComponent('Movement')])
    expect([...world.entities.withComponent('Movement')].map(one => one.id)).toEqual(['a'])
  })

  it('restores every baked source as a logical runtime entity', () => {
    const baked = {
      ...meshNode('baked'),
      instances: [
        { sourceId: 'tree-a', name: 'Tree A', transform: IDENTITY_TRANSFORM },
        { sourceId: 'tree-b', name: 'Tree B', transform: IDENTITY_TRANSFORM },
      ],
    }
    const world = worldFromScene('doc-1', { ...EMPTY_SCENE, nodes: [baked] }, ports())

    expect([...world.entities.all()].map(entity => entity.id)).toEqual([
      'baked',
      'tree-a',
      'tree-b',
    ])
    expect(world.entities.get('tree-a')?.name).toBe('Tree A')
    expect(world.entities.get('tree-b')?.name).toBe('Tree B')
  })

  /**
   * 🛑 The whole safety of Play Mode. A world writing positions in place would edit the scene the
   * user is editing, and STOP would have something to restore — which is exactly what it must not.
   */
  it('copies every vector, so a step cannot reach the document', () => {
    const state = scene()
    const world = worldFromScene('doc-1', state, ports())
    const entity = world.entities.get('a')
    if (!entity) throw new Error('no entity')

    entity.transform.position.y = 42
    const held = entity.components[0]
    if (held) Object.assign(held, { speed: 99 })

    expect(state.nodes[0]?.transform.position.y).toBe(0)
    // The components too, and not by a spread: a shallow copy leaves the document's own objects
    // in the world, where a system writing into one edits the scene with no store action at all.
    expect(state.nodes[0]?.components).toEqual([newComponent('Movement')])
  })

  /** Written into documents since 20/08 and read by nothing until the controller arrived. */
  it('carries how the scene says it is walked', () => {
    const state = {
      ...scene(),
      world: { ...EMPTY_SCENE.world, play: { ...DEFAULT_PLAY, gravity: 9.81 } },
    }

    expect(worldFromScene('doc-1', state, ports()).play.gravity).toBe(9.81)
  })

  /**
   * The scene's floor is not a node, so it is no entity — and a game whose ground nobody stands
   * on is the first thing anybody tries.
   */
  it('gives the scene ground a body of its own when it is shown', () => {
    const physics = notedPhysics()
    const ground = { ...EMPTY_SCENE.world.ground, visible: true, size: 40 }
    const state = { ...scene(), world: { ...EMPTY_SCENE.world, ground } }

    worldFromScene('doc-1', state, ports(physics)).step(1 / 60)

    const floor = physics.added.find(body => body.body === 'world.ground')
    expect(floor?.kind).toBe('fixed')
    expect(floor?.shape.kind === 'cuboid' ? floor.shape.hx : 0).toBe(20)
  })

  it('gives no ground to a scene that shows none', () => {
    const physics = notedPhysics()

    worldFromScene('doc-1', scene(), ports(physics)).step(1 / 60)

    expect(physics.added).toEqual([])
  })

  it('stands the scene on a relief heightfield instead of the default cuboid', () => {
    const physics = notedPhysics()
    const samples = {
      width: 4,
      height: 4,
      values: new Float32Array(16).fill(0.5),
    }
    const state: SceneState = {
      ...scene(),
      world: {
        ...EMPTY_SCENE.world,
        ground: { ...EMPTY_SCENE.world.ground, visible: true, size: 40 },
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            { id: 'terrain', elevation: { min: 0, max: 4 } },
          ),
        ],
      },
    }

    worldFromScene(
      'doc-1',
      state,
      ports(physics),
      {},
      1,
      new Map([['asset_height', samples]]),
    ).step(1 / 60)

    const floor = physics.added.find(body => body.body === 'world.ground')
    const relief = physics.added.find(body => body.body === 'world.relief.terrain')
    expect(floor).toBeUndefined()
    expect(relief?.kind).toBe('fixed')
    expect(relief?.shape.kind).toBe('heightfield')
    expect(relief?.shape.kind === 'heightfield' ? relief.shape.heights[0] : 0).toBeCloseTo(2)
  })

  it('keeps the cuboid when a relief has no heightmap and the plane is shown', () => {
    const physics = notedPhysics()
    const held = ports(physics)
    const state: SceneState = {
      ...scene(),
      world: {
        ...EMPTY_SCENE.world,
        ground: { ...EMPTY_SCENE.world.ground, visible: true, size: 40 },
        layers: [reliefLayer({ assetId: 'asset_height' }, { id: 'terrain' })],
      },
    }

    worldFromScene('doc-1', state, held).step(1 / 60)

    expect(physics.added.find(body => body.body === 'world.ground')?.shape.kind).toBe('cuboid')
    expect(physics.added.find(body => body.body.startsWith('world.relief.'))).toBeUndefined()
    expect(held.log.recent().some(entry => entry.message.includes('no heightmap'))).toBe(true)
  })

  it('still lays the default cuboid when the scene has no relief', () => {
    const physics = notedPhysics()
    const ground = { ...EMPTY_SCENE.world.ground, visible: true, size: 40 }
    const state = { ...scene(), world: { ...EMPTY_SCENE.world, ground } }

    worldFromScene('doc-1', state, ports(physics)).step(1 / 60)

    expect(physics.added.map(body => body.body)).toEqual(['world.ground'])
    expect(physics.added[0]?.shape.kind).toBe('cuboid')
  })

  it('stands two disjoint terrains on two independent heightfields', () => {
    const physics = notedPhysics()
    const samples = {
      width: 4,
      height: 4,
      values: new Float32Array(16).fill(0.5),
    }
    const state: SceneState = {
      ...scene(),
      world: {
        ...EMPTY_SCENE.world,
        ground: { ...EMPTY_SCENE.world.ground, visible: true, size: 40 },
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            { id: 'isle', origin: { x: 0, z: 0 }, size: { x: 9, z: 9 } },
          ),
          reliefLayer(
            { assetId: 'asset_height' },
            { id: 'range', origin: { x: 200, z: 0 }, size: { x: 9, z: 9 } },
          ),
        ],
      },
    }

    worldFromScene(
      'doc-1',
      state,
      ports(physics),
      {},
      1,
      new Map([['asset_height', samples]]),
    ).step(1 / 60)

    const isle = physics.added.find(body => body.body === 'world.relief.isle')
    const range = physics.added.find(body => body.body === 'world.relief.range')
    expect(physics.added.find(body => body.body === 'world.ground')).toBeUndefined()
    expect(isle?.shape.kind).toBe('heightfield')
    expect(range?.shape.kind).toBe('heightfield')
    expect(isle?.shape.kind === 'heightfield' ? isle.shape.offset : null).toEqual({
      x: 0,
      y: 0,
      z: 0,
    })
    expect(range?.shape.kind === 'heightfield' ? range.shape.offset : null).toEqual({
      x: 200,
      y: 0,
      z: 0,
    })
  })

  /**
   * 🛑 An entity's transform is LOCAL and the physics composes no parent — so the body goes in at
   * its COMPOSED place. Left out, a whole set tidied under a group was solid to nobody.
   */
  it('puts a node hanging from another into the physics, at its composed place', () => {
    const physics = notedPhysics()
    const held = ports(physics)
    const parent = {
      ...meshNode('parent'),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 10, y: 0, z: 0 } },
      components: [newComponent('Collider')],
    }
    const child = {
      ...meshNode('child', 'parent'),
      name: 'Caisse',
      transform: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 2, z: 0 } },
      components: [newComponent('Collider')],
    }

    worldFromScene('doc-1', { ...scene(), nodes: [parent, child] }, held).step(1 / 60)

    expect(physics.added.map(body => body.body)).toEqual(['parent', 'child'])
    expect(physics.added[1]?.transform.position).toMatchObject({ x: 10, y: 2, z: 0 })
    expect(held.log.recent()).toEqual([])
  })

  /**
   * 🛑 The THIRD traversal, and the one a first pass missed: a kinematic body is built at its
   * composed place and then PLACED every step. Placed raw, a platform under a group jumped to its
   * local place on the first step — and `poses` skips a kinematic, so nothing brought it back.
   */
  it('places a kinematic body under a group at its composed place, every step', () => {
    const physics = notedPhysics()
    const held = ports(physics)
    const group = {
      ...meshNode('group'),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 5, y: 0, z: 0 } },
    }
    const platform = {
      ...meshNode('lift', 'group'),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 1, z: 0 } },
      components: [
        newComponent('Collider'),
        withComponentField(newComponent('RigidBody'), 'kind', 'kinematic'),
      ],
    }

    worldFromScene('doc-1', { ...scene(), nodes: [group, platform] }, held).step(1 / 60)

    expect(physics.placed.map(pose => pose.position)).toMatchObject([{ x: 5, y: 1, z: 0 }])
  })

  it('names the document it came from, so an entity can be referenced in full', () => {
    expect(worldFromScene('doc-1', scene(), ports()).scene).toEqual({
      kind: 'document',
      id: 'doc-1',
    })
  })
})

/**
 * 🛑 `createHierarchy` reads the DOCUMENT's nodes while the entities hold copies, so a parent the
 * game moves is composed from where it stood when Play began.
 */
describe('a body hanging from a parent the game moves', () => {
  it('is placed where the parent stands NOW, not where the scene left it', () => {
    const lift = {
      ...meshNode('lift'),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 0, z: 0 } },
      components: [
        { ...newComponent('Movement'), axis: 'y', distance: 10, speed: 10, loop: 'pingPong' },
      ],
    }
    const rider = {
      ...meshNode('rider'),
      parentId: lift.id,
      transform: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 1, z: 0 } },
      components: [newComponent('Collider'), { ...newComponent('RigidBody'), kind: 'kinematic' }],
    }
    const state: SceneState = { ...EMPTY_SCENE, nodes: [lift, rider] }
    const physics = notedPhysics()
    const world = worldFromScene('doc-1', state, ports(physics))

    // Several steps: a walker leans into its pace rather than reaching it whole on the first.
    for (let step = 0; step < 30; step++) world.step(1 / 60)

    const lifted = world.entities.get(lift.id)?.transform.position.y ?? 0
    const placed = physics.placed.at(-1)?.position.y ?? 0
    expect(lifted).toBeGreaterThan(1)
    // One metre above whatever the lift has reached — the whole of what composing a parent means.
    expect(placed).toBeCloseTo(lifted + 1, 6)
  })
})

/**
 * The window answers what the tree says, because the runtime holds no tree: the arm reads two
 * fields, and what fills them is the structure the module stands in.
 */
describe('a scene holding a player module', () => {
  const armAt = (state: SceneState, world: World) =>
    world.entities.get(state.nodes.find(node => node.name === 'SpringArm')?.id ?? '')?.components[0]

  const idOf = (state: SceneState, name: string) => state.nodes.find(node => node.name === name)?.id

  it('hands the arm the body and the eye it hangs with', () => {
    const state: SceneState = { ...EMPTY_SCENE, nodes: [...playerModuleNodes()] }

    const arm = armAt(state, worldFromScene('doc-1', state, ports()))

    expect(arm?.subject).toBe(idOf(state, 'Capsule'))
    expect(arm?.camera).toBe(idOf(state, 'Camera'))
  })

  /** 🛑 The point of resolving it here: what the fields SAY stopped being what the arm follows. */
  it('binds an arm whose two fields were emptied', () => {
    const state: SceneState = {
      ...EMPTY_SCENE,
      nodes: playerModuleNodes().map(node =>
        node.name === 'SpringArm'
          ? { ...node, components: [{ ...newComponent('SpringArm'), subject: '', camera: '' }] }
          : node,
      ),
    }

    const arm = armAt(state, worldFromScene('doc-1', state, ports()))

    expect(arm?.subject).toBe(idOf(state, 'Capsule'))
    expect(arm?.camera).toBe(idOf(state, 'Camera'))
  })

  /** The runtime holds no camera: what the node sees through is answered here, off the tree. */
  it('films through the lens the camera node carries', () => {
    const state: SceneState = {
      ...EMPTY_SCENE,
      world: { ...EMPTY_SCENE.world, play: { ...DEFAULT_PLAY, camera: 'thirdPerson' } },
      nodes: playerModuleNodes().map(node =>
        node.type === 'camera' ? { ...node, camera: { ...node.camera, fov: 35 } } : node,
      ),
    }
    const views: (CameraView | null)[] = []
    const world = worldFromScene(
      'doc-1',
      state,
      ports(undefined, {
        place: () => {},
        view: view => views.push(view),
        veil: () => {},
      }),
    )

    world.step(1 / 60)
    world.lateUpdate(0, 1 / 60)

    expect(views.at(-1)?.fieldOfView).toBe(35)
  })
})

/**
 * 🛑 What the whole design turns on: nothing here touches the ARM. The body is carried onto what
 * the player rides, and the arm — which watches the body — follows for free. An arm rewritten at
 * runtime, or a body reparented, would both have been ways of saying the same thing worse.
 */
describe('a player module that possesses something', () => {
  const drivable = (possesses: string): SceneState => ({
    ...EMPTY_SCENE,
    nodes: [
      {
        ...meshNode('car'),
        name: 'Car',
        transform: { ...IDENTITY_TRANSFORM, position: { x: 12, y: 0, z: -5 } },
      },
      ...playerModuleNodes().map(node =>
        node.components?.some(one => one.type === 'Player')
          ? {
              ...node,
              components: [withComponentField(newComponent('Player'), 'possesses', possesses)],
            }
          : node,
      ),
    ],
  })

  const bodyAt = (state: SceneState, world: World) => {
    world.step(1 / 60)
    world.lateUpdate(1, 1 / 60)
    const body = state.nodes.find(node => node.name === 'Capsule')?.id ?? ''
    return world.entities.get(body)?.transform.position
  }

  it('stands its body on what it rides, without an arm being rewritten', () => {
    const state = drivable('Car')

    expect(bodyAt(state, worldFromScene('doc-1', state, ports()))).toMatchObject({ x: 12, z: -5 })
  })

  it('leaves its body where the module put it when it rides nothing', () => {
    const state = drivable('')

    expect(bodyAt(state, worldFromScene('doc-1', state, ports()))).toMatchObject({ x: 0, z: 0 })
  })
})

describe('a relief the physics can stand on', () => {
  it('stops a downward ray on the relief, not on the cuboid plane at zero', async () => {
    const physics = await loadJoltPhysics()
    const samples = { width: 4, height: 4, values: new Float32Array(16).fill(2) }
    const state: SceneState = {
      ...scene(),
      world: {
        ...EMPTY_SCENE.world,
        ground: { ...EMPTY_SCENE.world.ground, visible: true, size: 40 },
        layers: [reliefLayer({ assetId: 'asset_height' }, { id: 'terrain', size: { x: 3, z: 3 } })],
      },
    }

    worldFromScene(
      'doc-1',
      state,
      ports(physics),
      {},
      1,
      new Map([['asset_height', samples]]),
    ).step(1 / 60)

    const hit = physics.cast({ x: 1.5, y: 10, z: 1.5 }, { x: 1.5, y: -10, z: 1.5 }, 0, [])
    physics.dispose()

    // y = 2 is 8 m of the 20 m asked; the cuboid's top face at 0 would have been 0,5.
    expect(hit).toBeCloseTo(0.4, 2)
  })
})
