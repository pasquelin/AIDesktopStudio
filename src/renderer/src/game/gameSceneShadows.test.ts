import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { SECOND } from '@shared/domain/time'
import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Texture,
} from 'three'
import { scatterLayer } from '@shared/domain/scene'
import { SCATTER_DISTANCE } from '@shared/domain/renderPolicy'
import { groupNode, lightNode, meshNode, modelNode } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { at, BOX, NOTHING, sceneOf, SUN } from './game-fixtures'
import { buildGameScene, type GameScene } from './gameScene'
import type { GameFlush } from './gameSceneFrame'

import { sceneFromTemplate } from '@/engines/scene/sceneTemplates'
import { playerPartsOf } from '@/engines/scene/playerModule'
import { rememberShippedCharacter, forgetShippedCharacter } from '@/engines/scene/shippedCharacter'

// A picture that lands as soon as it is asked for: what the loader does long after the build.
vi.mock('@/engines/scene/textureCache', () => ({
  loadTexture: () => new Promise(resolve => setTimeout(() => resolve(new Texture()), 0)),
}))

/** A frame that owes nothing at all. */
const STILL: GameFlush = { zoned: false, reframed: false, shadowed: false, changed: false }

/** The suns among a scene's lights — the ones with a map to owe. */
const sunsOf = (built: GameScene): DirectionalLight[] =>
  built.lights.filter((light): light is DirectionalLight => light instanceof DirectionalLight)

/**
 * 🛑 The editor puts a node's flags on the object that stands for it, lights included. The pass a
 * game ran walked MESHES alone: no light ever threw, so an exported game drew no shadow at all —
 * with `shadowMap.enabled` true, every material sampling a map nothing ever filled.
 */
describe('what an exported game throws a shadow with', () => {
  it('lets the light that carries the key of a scene throw one', async () => {
    const built = await buildGameScene(
      sceneOf([meshNode(BOX, { name: 'Crate' }), lightNode(SUN, { x: 0, y: 4, z: 0 })]),
      NOTHING,
    )

    const light = [...built.byEntity.values()].find(one => one instanceof DirectionalLight)
    expect(light?.castShadow).toBe(true)
  })

  it('makes an imported model both throw and catch, as the same file does in the editor', async () => {
    const source = new Object3D()
    source.add(new Mesh())
    const node = modelNode('model-1', 'Model')
    const built = await buildGameScene(
      sceneOf([node]),
      { urlOf: () => 'assets/model.glb' },
      undefined,
      undefined,
      async () => source,
    )

    const meshes: Mesh[] = []
    built.byEntity.get(node.id)?.traverse(one => {
      if (one instanceof Mesh) meshes.push(one)
    })
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.every(one => one.castShadow && one.receiveShadow)).toBe(true)
  })

  /**
   * three.js aims a directional shadow at `light.target`, whose world matrix it follows only once
   * the target stands in the scene. The editor adds it in `buildLight`; a game that did not would
   * throw every shadow at the world origin, with nothing to say so.
   */
  it('stands the target its sun aims at in the scene, as the editor does', async () => {
    const built = await buildGameScene(sceneOf([lightNode(SUN, { x: 0, y: 4, z: 0 })]), NOTHING)

    const light = [...built.byEntity.values()].find(one => one instanceof DirectionalLight)
    expect(light && built.scene.children.includes(light.target)).toBe(true)
  })

  it('leaves alone what the document says throws nothing', async () => {
    const node = { ...meshNode(BOX, { name: 'Crate' }), castShadow: false, receiveShadow: false }
    const built = await buildGameScene(sceneOf([node]), NOTHING)

    const drawn = built.byEntity.get(node.id)
    expect(drawn?.castShadow).toBe(false)
    expect(drawn?.receiveShadow).toBe(false)
  })

  /**
   * A group's flags would otherwise be written over every node hanging under it. Declared BEFORE
   * its group on purpose: written in document order, the child's own pass puts them back, and the
   * defect only shows on the order the pass reaches the parent last.
   */
  it('stops at a child that stands for a node of its own', async () => {
    const parent = { ...groupNode(undefined, 'Set'), castShadow: true, receiveShadow: true }
    const child = {
      ...meshNode(BOX, { name: 'Crate' }),
      parentId: parent.id,
      castShadow: false,
      receiveShadow: false,
    }
    const built = await buildGameScene(sceneOf([child, parent]), NOTHING)

    expect(built.byEntity.get(child.id)?.castShadow).toBe(false)
  })

  /** The editor tunes the nodes' lights and no other: one an import brought stays as it came. */
  it('counts the lights of the document, never one an imported file brought', async () => {
    const source = new Object3D()
    source.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
    source.add(new DirectionalLight())
    const built = await buildGameScene(
      sceneOf([modelNode('model-1', 'Model'), lightNode(SUN, { x: 0, y: 4, z: 0 })]),
      { urlOf: () => 'assets/model.glb' },
      undefined,
      undefined,
      async () => source,
    )

    expect(built.lights).toHaveLength(1)
    expect(sunsOf(built)[0]?.shadow.autoUpdate).toBe(false)
  })

  it('measures its frustum against what draws, never against the world', async () => {
    const built = await buildGameScene(
      {
        ...sceneOf([meshNode(BOX, { name: 'Crate' })]),
        world: {
          ...EMPTY_SCENE.world,
          layers: [
            scatterLayer({
              id: 'trees',
              assets: [{ assetId: 'pine', weight: 1 }],
              origin: { x: 0, z: 0 },
              size: { x: SCATTER_DISTANCE * 3, z: 256 },
              rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
            }),
          ],
        },
      },
      { urlOf: () => 'asset://pine' },
      undefined,
      undefined,
      async () => new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()),
    )

    expect(built.shadowBounds.max.x).toBeLessThanOrEqual(1)
    built.dispose()
  })
})

/**
 * What decides a frame in an exported game — see `createWebRender`, which reads it. A game hands
 * over every entity on every frame, moving or not, and seeks on every tick: what is owed comes
 * from what MOVED, never from the call.
 */
describe('what a settled frame answers', () => {
  // A block twenty metres wide and four tall around the crate: what the frustums are cut to on the
  // first frame, and what a crate moved by a metre stays inside of.
  const crateUnderSun = () =>
    buildGameScene(
      sceneOf([
        meshNode(BOX, { name: 'Crate', transform: at(1, 0.5, 1) }),
        meshNode({ kind: 'box', width: 20, height: 4, depth: 20 }, { name: 'Block' }),
        lightNode(SUN, { x: 0, y: 4, z: 0 }),
      ]),
      NOTHING,
    )
  const camera = new PerspectiveCamera()

  it('owes everything on its first frame, and nothing once the scene stood still', async () => {
    const built = await crateUnderSun()

    expect(built.flush(camera)).toMatchObject({ reframed: true })
    expect(sunsOf(built)[0]?.shadow.needsUpdate).toBe(true)
    expect(built.flush(camera)).toEqual(STILL)
    built.dispose()
  })

  it('owes nothing for a head that drives no clip, however far the clock has run', async () => {
    const built = await crateUnderSun()
    built.flush(camera)

    expect(built.seek(4 * SECOND)).toBe(false)
    expect(built.flush(camera)).toEqual(STILL)
    built.dispose()
  })

  it('owes nothing for a pose the object already stands at', async () => {
    const built = await crateUnderSun()
    const crate = [...built.byEntity.keys()][0] ?? ''
    built.flush(camera)

    expect(built.place(crate, at(1, 0.5, 1))).toBe(false)
    expect(built.flush(camera)).toEqual(STILL)
    built.dispose()
  })

  it('owes every map once scenery moved', async () => {
    const built = await crateUnderSun()
    const crate = [...built.byEntity.keys()][0] ?? ''
    built.flush(camera)
    const sun = sunsOf(built)[0]
    if (!sun) throw new Error('no sun')
    sun.shadow.needsUpdate = false

    expect(built.place(crate, at(2, 0.5, 1))).toBe(true)
    expect(built.flush(camera)).toMatchObject({ reframed: false, shadowed: true })
    expect(sun.shadow.needsUpdate).toBe(true)
    built.dispose()
  })

  it('owes a light that moved alone its own map and a fresh frustum, and no other map', async () => {
    const lamp = lightNode(SUN, { x: 5, y: 4, z: 5 })
    const built = await buildGameScene(
      sceneOf([meshNode(BOX, { name: 'Crate' }), lightNode(SUN, { x: 0, y: 4, z: 0 }), lamp]),
      NOTHING,
    )
    built.flush(camera)
    for (const light of sunsOf(built)) light.shadow.needsUpdate = false

    expect(built.place(lamp.id, at(6, 4, 5))).toBe(true)
    expect(built.flush(camera)).toMatchObject({ reframed: true })
    expect(sunsOf(built).map(light => light.shadow.needsUpdate)).toEqual([false, true])
    built.dispose()
  })

  /**
   * The editor grows its box on every move and refits the frustums to it. A game that cut them
   * once at load lost the shadow of anyone walking past what the scene occupied then.
   */
  it('reframes once a caster walked past what the frustums were cut to', async () => {
    const built = await crateUnderSun()
    const crate = [...built.byEntity.keys()][0] ?? ''
    built.flush(camera)

    built.place(crate, at(100, 0.5, 1))
    expect(built.flush(camera)).toMatchObject({ reframed: true })
    expect(built.shadowBounds.max.x).toBeGreaterThanOrEqual(100)
    expect(built.flush(camera)).toEqual(STILL)
    built.dispose()
  })

  it('reframes for a baked instance too, read off the sphere its slot moved', async () => {
    const node = {
      ...meshNode(BOX, { name: 'Crate' }),
      instances: [{ sourceId: 'slot-1', name: 'Crate 1', transform: at(0, 0, 0) }],
    }
    const built = await buildGameScene(
      sceneOf([node, lightNode(SUN, { x: 0, y: 4, z: 0 })]),
      NOTHING,
    )
    built.flush(camera)

    built.place('slot-1', at(80, 0, 0))
    expect(built.flush(camera)).toMatchObject({ reframed: true })
    expect(built.shadowBounds.max.x).toBeGreaterThanOrEqual(79)
    built.dispose()
  })

  it('reframes for a group that moved, on behalf of the light it carries', async () => {
    const set = groupNode(undefined, 'Set')
    const lamp = { ...lightNode(SUN, { x: 0, y: 4, z: 0 }), parentId: set.id }
    const built = await buildGameScene(
      sceneOf([meshNode(BOX, { name: 'Crate' }), set, lamp]),
      NOTHING,
    )
    built.flush(camera)

    built.place(set.id, at(30, 0, 0))
    expect(built.flush(camera)).toMatchObject({ reframed: true })
    built.dispose()
  })

  it('keeps its bounds finite for an entity built at scale zero', async () => {
    const flat = meshNode(BOX, {
      name: 'Flat',
      transform: { ...IDENTITY_TRANSFORM, scale: { x: 0, y: 0, z: 0 } },
    })
    const built = await buildGameScene(
      sceneOf([flat, lightNode(SUN, { x: 0, y: 4, z: 0 })]),
      NOTHING,
    )
    built.flush(camera)

    built.place(flat.id, {
      ...IDENTITY_TRANSFORM,
      position: { x: 3, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    built.flush(camera)
    expect(Number.isFinite(built.shadowBounds.max.x)).toBe(true)
    built.dispose()
  })

  /** A cell casts nothing, and one toggles at SCATTER_DISTANCE: a picture to draw, no map. */
  it('answers a picture and no map for a scatter cell that toggled', async () => {
    const built = await buildGameScene(
      {
        ...sceneOf([meshNode(BOX, { name: 'Crate' }), lightNode(SUN, { x: 0, y: 4, z: 0 })]),
        world: {
          ...EMPTY_SCENE.world,
          layers: [
            scatterLayer({
              id: 'trees',
              assets: [{ assetId: 'pine', weight: 1 }],
              origin: { x: 0, z: 0 },
              size: { x: SCATTER_DISTANCE * 3, z: 256 },
              rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
            }),
          ],
        },
      },
      { urlOf: () => 'asset://pine' },
      undefined,
      undefined,
      async () => new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()),
    )
    const eye = new PerspectiveCamera()
    eye.position.set(0, 10, 128)
    eye.updateMatrixWorld(true)
    built.flush(eye)
    const sun = sunsOf(built)[0]
    if (!sun) throw new Error('no sun')
    sun.shadow.needsUpdate = false

    eye.position.set(SCATTER_DISTANCE * 3, 10, 128)
    eye.updateMatrixWorld(true)
    expect(built.flush(eye)).toMatchObject({ changed: true, zoned: false, shadowed: false })
    expect(sun.shadow.needsUpdate).toBe(false)
    built.dispose()
  })

  it('answers a picture for a texture that landed after the build', async () => {
    const node = meshNode(BOX, { name: 'Crate' })
    if (node.type !== 'mesh') throw new Error('a mesh was asked for')
    const changed = { ...node, material: { ...node.material, map: { assetId: 'tex' } } }
    const built = await buildGameScene(sceneOf([changed]), { urlOf: () => 'assets/tex.png' })
    built.flush(camera)
    // The picture lands on a later tick than the build resolved on.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(built.flush(camera)).toMatchObject({ changed: true, shadowed: false })
    expect(built.flush(camera)).toEqual(STILL)
    built.dispose()
  })
})

it('keeps the first-person robot shadow without drawing its head over the camera', async () => {
  rememberShippedCharacter('hero')
  onTestFinished(forgetShippedCharacter)
  const state = sceneFromTemplate('firstPerson')
  const parts = playerPartsOf(state.nodes)
  expect(parts?.body?.type).toBe('group')
  expect(parts?.animated?.type).toBe('model')
  const material = new MeshBasicMaterial()
  const source = new Mesh(new BoxGeometry(), material)
  const built = await buildGameScene(
    state,
    { ...NOTHING, urlOf: () => 'hero.glb' },
    undefined,
    undefined,
    async () => source,
  )
  onTestFinished(() => built.dispose())
  const meshes: Mesh[] = []
  if (parts?.body)
    built.byEntity.get(parts.body.id)?.traverse(one => {
      if (one instanceof Mesh) meshes.push(one)
    })
  expect(meshes.length).toBeGreaterThan(0)
  for (const mesh of meshes) {
    expect(mesh.visible && mesh.castShadow).toBe(true)
    for (const held of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      expect(held.colorWrite).toBe(false)
      expect(held.depthWrite).toBe(false)
    }
  }
  expect(material.colorWrite).toBe(true)
  expect(material.depthWrite).toBe(true)
})
