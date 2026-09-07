import { createDefaultScene } from '@/engines/scene/defaultScene'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { installScene } from '@/stores/scene-fixtures'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'
import { displayOfPane } from '@/stores/sceneViewChrome'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import type { Asset } from '@shared/domain/asset'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'

const DOCUMENT = 'doc-scene'

function scene(): SceneState {
  return sceneOf(useScenes.getState(), DOCUMENT)
}

const nodeNamed = (name: string): SceneNode | undefined =>
  scene().nodes.find(node => node.name === name)

async function cameraId(): Promise<string> {
  const added = await runAction('node.add', { kind: 'camera', name: 'Caméra' })
  return added.ok ? (added.data as { nodeId: string }).nodeId : ''
}

/** What the catalogue holds for this suite: `node.addModel` and `world.setSceneLighting` read it. */
const inCatalogue = (id: string, type: Asset['type']): Asset => ({
  id,
  name: id,
  type,
  location: 'local',
  tags: [],
  createdAt: '2026-08-20T10:00:00.000Z',
})

const CATALOGUE = [inCatalogue('asset-mesh', 'mesh'), inCatalogue('sky-1', 'skybox')]

beforeEach(() => {
  installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
  installFakeBridge({
    assets: {
      search: query => Promise.resolve(CATALOGUE.filter(one => query.ids?.includes(one.id))),
    },
  })
})

describe('what a shot does with its camera', () => {
  async function shotOnRail(): Promise<{ shotId: string; pathId: string }> {
    const opened = await runAction('camera.addShot', { nodeId: await cameraId() })
    const rail = await runAction('node.add', { kind: 'path', name: 'Rail' })

    return {
      shotId: opened.ok ? (opened.data as { shotId: string }).shotId : '',
      pathId: rail.ok ? (rail.data as { nodeId: string }).nodeId : '',
    }
  }

  /** The inspector's own button: one gesture makes the rail AND binds it, so one ⌘Z takes both. */
  it('lays a rail where the camera stands and binds it in one entry', async () => {
    const opened = await runAction('camera.addShot', { nodeId: await cameraId() })
    const shotId = opened.ok ? (opened.data as { shotId: string }).shotId : ''

    expect(await runAction('camera.createAndBindPath', { shotId })).toEqual({ ok: true })

    const laid = scene().nodes.find(node => node.type === 'path')
    expect(scene().animation.shots[0]?.motion).toMatchObject({ pathId: laid?.id })

    useScenes.getState().undo(DOCUMENT)
    expect(scene().nodes.some(node => node.type === 'path')).toBe(false)
    expect(scene().animation.shots[0]?.motion).toBeUndefined()
  })

  it('takes a camera’s line up the band, and refuses one that cannot move', async () => {
    const first = await cameraId()
    const second = await cameraId()
    await runAction('camera.addShot', { nodeId: first })
    await runAction('camera.addShot', { nodeId: second })

    // The stack decides what the film looks through, and a camera new to the band arrives on top:
    // the first one is at the bottom, so the only way it can go is up.
    expect(await runAction('camera.reorder', { nodeId: first, by: -1 })).toMatchObject({
      ok: true,
      data: { steps: -1 },
    })
    expect(scene().animation.shots[0]?.cameraId).toBe(first)
    expect(await runAction('camera.reorder', { nodeId: 'node-z', by: 1 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('binds a rail to a shot, taking the whole of it forwards by default', async () => {
    const { shotId, pathId } = await shotOnRail()

    expect(await runAction('camera.bindPathToShot', { shotId, pathId })).toEqual({ ok: true })
    expect(scene().animation.shots[0]?.motion).toEqual({
      pathId,
      from: 0,
      to: 1,
      easing: 'linear',
    })
  })

  it('takes the stretch and the speed curve it was given', async () => {
    const { shotId, pathId } = await shotOnRail()

    await runAction('camera.bindPathToShot', {
      shotId,
      pathId,
      from: 1,
      to: 0.25,
      easing: 'easeInOut',
    })

    // `from` past `to` is left alone rather than reordered: that is what runs a rail backwards.
    expect(scene().animation.shots[0]?.motion).toMatchObject({
      from: 1,
      to: 0.25,
      easing: 'easeInOut',
    })
  })

  it('lets a shot go of its rail, leaving the camera where its own transform puts it', async () => {
    const { shotId, pathId } = await shotOnRail()
    await runAction('camera.bindPathToShot', { shotId, pathId })

    await runAction('camera.bindPathToShot', { shotId, pathId: '' })

    expect(scene().animation.shots[0]?.motion).toBeUndefined()
  })

  it('refuses a rail that is not a path, rather than binding an id nothing answers to', async () => {
    const { shotId } = await shotOnRail()
    const mesh = await runAction('node.add', { kind: 'box', name: 'Caisse' })

    expect(
      await runAction('camera.bindPathToShot', {
        shotId,
        pathId: mesh.ok ? (mesh.data as { nodeId: string }).nodeId : '',
      }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(scene().animation.shots[0]?.motion).toBeUndefined()
  })

  it('aims a shot at a node, at a point, and at nothing at all', async () => {
    const { shotId } = await shotOnRail()
    const mesh = await runAction('node.add', { kind: 'box', name: 'Statue' })
    const nodeId = mesh.ok ? (mesh.data as { nodeId: string }).nodeId : ''

    await runAction('camera.aimShotAt', { shotId, targetId: nodeId })
    expect(scene().animation.shots[0]?.target).toEqual({ kind: 'node', nodeId })

    await runAction('camera.aimShotAt', { shotId, atX: 1, atZ: -3 })
    expect(scene().animation.shots[0]?.target).toEqual({
      kind: 'point',
      at: { x: 1, y: 0, z: -3 },
    })

    await runAction('camera.aimShotAt', { shotId })
    expect(scene().animation.shots[0]?.target).toBeUndefined()
  })

  // `aimCamera` drops a camera watching itself, since `lookAt` on no direction hands back the
  // identity — a shot silently aimed down the Z axis.
  it('refuses to have a camera watch itself, or a node the scene has not got', async () => {
    const opened = await runAction('camera.addShot', { nodeId: await cameraId() })
    const shotId = opened.ok ? (opened.data as { shotId: string }).shotId : ''

    expect(
      await runAction('camera.aimShotAt', {
        shotId,
        targetId: scene().animation.shots[0]?.cameraId,
      }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(await runAction('camera.aimShotAt', { shotId, targetId: 'nowhere' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('refuses an edit naming a shot the document has not got', async () => {
    expect(
      await runAction('camera.bindPathToShot', { shotId: 'nowhere', pathId: '' }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  // Without them a client can open a shot and never edit one: the two actions above name it by
  // an id only this reading hands over.
  it('publishes the shots, the lens of a camera and the points of a rail', async () => {
    const { pathId } = await shotOnRail()

    const outcome = await runAction('scene.state', {})
    const read = outcome.ok
      ? (outcome.data as {
          shots: { id: string }[]
          nodes: { id: string; camera?: unknown; path?: unknown }[]
        })
      : null

    expect(read?.shots).toHaveLength(1)
    expect(read?.nodes.find(node => node.id === pathId)?.path).toMatchObject({
      kind: 'catmullrom',
    })
    expect(read?.nodes.some(node => node.camera !== undefined)).toBe(true)
  })
})

describe('hierarchy and selection', () => {
  it('hangs a node under another, and back under the scene', async () => {
    const parent = await runAction('node.add', { kind: 'box', name: 'Parent' })
    const parentId = parent.ok ? (parent.data as { nodeId: string }).nodeId : ''
    const child = await runAction('node.add', { kind: 'sphere', name: 'Enfant' })
    const childId = child.ok ? (child.data as { nodeId: string }).nodeId : ''

    await runAction('node.reparent', { nodeId: childId, parentId })
    expect(nodeNamed('Enfant')?.parentId).toBe(parentId)

    await runAction('node.reparent', { nodeId: childId })
    expect(nodeNamed('Enfant')?.parentId).toBeNull()
  })

  it('refuses a parent the scene does not hold', async () => {
    const child = await runAction('node.add', { kind: 'sphere', name: 'Enfant' })
    const nodeId = child.ok ? (child.data as { nodeId: string }).nodeId : ''

    expect(await runAction('node.reparent', { nodeId, parentId: 'node-z' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  /**
   * `reparentNode` refuses a move that would close the tree on itself by handing the state back
   * untouched — which reads as done to anyone who only checked that the parent exists.
   */
  it('refuses to hang a node under itself or under its own child', async () => {
    const parent = await runAction('node.add', { kind: 'box', name: 'Parent' })
    const parentId = parent.ok ? (parent.data as { nodeId: string }).nodeId : ''
    const child = await runAction('node.add', { kind: 'sphere', name: 'Enfant' })
    const childId = child.ok ? (child.data as { nodeId: string }).nodeId : ''
    await runAction('node.reparent', { nodeId: childId, parentId })

    expect(await runAction('node.reparent', { nodeId: parentId, parentId })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(await runAction('node.reparent', { nodeId: parentId, parentId: childId })).toMatchObject(
      {
        ok: false,
        refusal: 'badInput',
      },
    )
    expect(nodeNamed('Parent')?.parentId).toBeNull()
  })

  it('selects nodes, and refuses a list holding one the scene lost', async () => {
    const added = await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    expect(await runAction('node.select', { nodeIds: [nodeId] })).toEqual({ ok: true })
    expect(scene().selectedIds).toEqual([nodeId])

    expect(await runAction('node.select', { nodeIds: [nodeId, 'node-z'] })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})

/**
 * The two the native menu offers by name and no command can — `scene.display` cycles, and
 * cycling to a chosen mode means counting the ones in between.
 */
describe('a still of the view, and a world in one call', () => {
  const CAPTURED: Asset = {
    id: 'asset-still',
    name: 'Scène',
    type: 'image',
    location: 'local',
    tags: [],
    createdAt: '2026-08-20T10:00:00.000Z',
  }

  it('writes what a preset is about and leaves the rest of the world alone', async () => {
    await runAction('world.setGroundPlane', { visible: true, size: 12 })

    expect(await runAction('world.applyPreset', { preset: 'night' })).toEqual({ ok: true })

    expect(scene().world).toMatchObject({ envIntensity: 0.15, exposure: 1.6 })
    // `night` says nothing about a ground, so the one turned on stays exactly as it was.
    expect(scene().world.ground).toMatchObject({ visible: true, size: 12 })
  })

  it('captures at the quality asked for, and refuses while no viewport is mounted', async () => {
    const captureStill = vi.fn(async () => new Uint8Array([1]))
    const savePicture = vi.fn(async () => CAPTURED)
    installFakeBridge({ assets: { savePicture } })
    registerSceneEngine(DOCUMENT, { captureStill } as unknown as SceneRenderer)

    expect(await runAction('scene.capture', { quality: 'ultraHd' })).toEqual({ ok: true })
    expect(captureStill).toHaveBeenCalledWith('ultraHd')
    expect(savePicture).toHaveBeenCalled()

    forgetSceneEngine(DOCUMENT)
    expect(await runAction('scene.capture', {})).toMatchObject({ ok: false, refusal: 'failed' })
  })
})

describe('how the scene is looked at', () => {
  it('points the main view at a side, through the engine that owns the camera', async () => {
    const viewFrom = vi.fn()
    registerSceneEngine(DOCUMENT, { viewFrom } as unknown as SceneRenderer)

    expect(await runAction('view.direction', { direction: 'top' })).toEqual({ ok: true })
    expect(viewFrom).toHaveBeenCalledWith('top')

    forgetSceneEngine(DOCUMENT)
  })

  // A tab whose viewport is not mounted has no engine, and a side to look from is a move only
  // the engine can make.
  it('refuses a side while no viewport is mounted', async () => {
    forgetSceneEngine(DOCUMENT)

    expect(await runAction('view.direction', { direction: 'top' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })

  it('names the way the main view is drawn, where the command only cycles', async () => {
    expect(await runAction('view.setDisplayMode', { mode: 'wireframe' })).toEqual({ ok: true })
    expect(displayOfPane(sceneViewOf(useSceneViews.getState(), DOCUMENT).displays, 0)).toBe(
      'wireframe',
    )
  })
})

/** The half of the document that belongs to no node — lit, backed, floored and graded. */
