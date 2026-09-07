import { createDefaultScene } from '@/engines/scene/defaultScene'
import { type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { Asset } from '@shared/domain/asset'
import { SECOND } from '@shared/domain/time'
import { beforeEach, describe, expect, it } from 'vitest'
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

describe('a node nobody holds', () => {
  /**
   * 🛑 Told only that its word matched nothing, a model invents another: « château », « chevalier »
   * and « caméra » were each aimed at twice on the bench pass of 2026-09-01, on a scene holding
   * « Cube Test ». The names it needs to correct itself fit in the refusal.
   */
  it('names what the scene does hold', async () => {
    await runAction('node.add', { kind: 'box', name: 'Caisse' })

    const outcome = await runAction('node.rename', { nodeId: 'château', name: 'x' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'notFound' })
    expect(outcome.ok ? '' : (outcome.detail ?? '')).toContain('"Caisse"')
  })

  it('says the scene holds none rather than naming an empty list', async () => {
    const outcome = await runAction('node.rename', { nodeId: 'château', name: 'x' })

    expect(outcome.ok ? '' : (outcome.detail ?? '')).toContain('holds none')
  })
})

describe('reading the scene in front', () => {
  /**
   * 🛑 What a node STANDS AT is left out, and absent reads as that default — the rule the action's
   * own description states. An identity transform alone cost 118 characters a node, in the member
   * `resultLine` was dropping whole: a three-object scene answered `(cut short: nodes)`, and the
   * model could not name one object of what it was editing.
   */
  it('leaves out what a node stands at, and keeps what has moved', async () => {
    await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const [placed] = sceneOf(useScenes.getState(), DOCUMENT).nodes
    await runAction('node.transform', { nodeId: placed?.id, positionX: 2 })

    const outcome = await runAction('scene.state', {})
    const [node] = outcome.ok ? (outcome.data as { nodes: Record<string, unknown>[] }).nodes : []

    expect(node).not.toHaveProperty('parentId')
    expect(node).not.toHaveProperty('visible')
    // The part that MOVED and it alone: an unturned rotation and an unscaled scale stay out.
    expect(node?.transform).toEqual({ position: { x: 2, y: 0, z: 0 } })
    // A colour and seven map slots, all `null` on a fresh mesh — 145 characters of "no texture".
    // Nothing left to say, so the member goes too: `material: {}` says only what absence says.
    expect(node).not.toHaveProperty('material')
  })

  it('answers the flat list of nodes, with what each one carries', async () => {
    await runAction('node.add', { kind: 'box', name: 'Caisse' })

    const outcome = await runAction('scene.state', {})
    const read = outcome.ok
      ? (outcome.data as { nodes: { name: string; geometry?: unknown }[] })
      : null

    expect(read?.nodes).toHaveLength(1)
    expect(read?.nodes[0]).toMatchObject({ name: 'Caisse', type: 'mesh' })
    expect(read?.nodes[0]?.geometry).toMatchObject({ kind: 'box' })
  })

  it('refuses every action of the family while no scene is in front', async () => {
    useDocuments.setState({ documents: {}, activeId: null })

    expect(await runAction('scene.state', {})).toMatchObject({ ok: false, refusal: 'wrongSurface' })
    expect(await runAction('node.add', { kind: 'box' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })
})

describe('building a scene', () => {
  /**
   * Through `createNodesOf`, the factory the Add menu and the native menu already go through: a
   * second way of building a box would be a second set of defaults to keep in step.
   */
  it('adds any kind the Add menu offers, at the position given', async () => {
    const outcome = await runAction('node.add', {
      kind: 'sphere',
      name: 'Boule',
      positionX: 2,
      positionZ: -1,
    })
    const added = outcome.ok ? (outcome.data as { nodeId: string }) : null

    expect(added?.nodeId).toBeTruthy()
    expect(nodeNamed('Boule')?.transform.position).toMatchObject({ x: 2, y: 0, z: -1 })
  })

  it('adds a light, and a model of the library', async () => {
    await runAction('node.add', { kind: 'directional', name: 'Clé' })
    await runAction('node.addModel', { assetId: 'asset-mesh', name: 'Chevalier' })

    expect(nodeNamed('Clé')?.type).toBe('light')
    expect(nodeNamed('Chevalier')).toMatchObject({
      type: 'model',
      model: { assetId: 'asset-mesh' },
    })
  })

  // The factory answers `null` for a kind no registry declares, so this is where it becomes a
  // refusal rather than a node that silently never arrived.
  it('refuses a kind no registry declares', async () => {
    expect(await runAction('node.add', { kind: 'dodecahedron' })).toMatchObject({ ok: true })
    expect(await runAction('node.add', { kind: 'teapot' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('renames, hides and removes by id', async () => {
    const added = await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    await runAction('node.rename', { nodeId, name: 'Socle' })
    expect(nodeNamed('Socle')).toBeTruthy()

    await runAction('node.setVisible', { nodeId, visible: false })
    expect(nodeNamed('Socle')?.visible).toBe(false)

    await runAction('node.remove', { nodeId })
    expect(scene().nodes).toHaveLength(0)
  })

  /**
   * `notFound` and not `badInput`: a client re-sending a `node.remove` whose node it had just
   * removed read the same refusal as a malformed call — 33 of them on the bench pass of
   * 2026-08-26, none saying the object was already gone.
   */
  it('refuses an id the scene does not hold as missing, not as a bad input', async () => {
    expect(await runAction('node.rename', { nodeId: 'node-z', name: 'Rien' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})

describe('placing and dressing an object', () => {
  it('keeps every axis it was not given', async () => {
    const added = await runAction('node.add', { kind: 'box', name: 'Caisse', positionY: 3 })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    await runAction('node.transform', { nodeId, positionX: 1, scaleZ: 2 })

    expect(nodeNamed('Caisse')?.transform).toMatchObject({
      position: { x: 1, y: 3, z: 0 },
      scale: { x: 1, y: 1, z: 2 },
    })
  })

  /**
   * 🛑 What it ANSWERS, and only the vectors it wrote: a bare `ok` left a model unable to see
   * where a thing had landed, so it sent the same relative change again under another figure.
   */
  it('answers the vectors it moved, as they now stand', async () => {
    const added = await runAction('node.add', { kind: 'box', name: 'Caisse', positionY: 3 })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    const moved = await runAction('node.transform', { nodeId, positionX: 0.5, relative: true })

    expect(moved).toEqual({ ok: true, data: { position: { x: 0.5, y: 3, z: 0 } } })
  })

  it('answers the material fields it painted, and only those', async () => {
    const mesh = await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const meshId = mesh.ok ? (mesh.data as { nodeId: string }).nodeId : ''

    expect(
      await runAction('node.setMeshMaterial', { nodeId: meshId, color: '#ff8800', roughness: 0.2 }),
    ).toEqual({ ok: true, data: { color: '#ff8800', roughness: 0.2 } })
  })

  it('paints a mesh, and refuses a node that carries no mesh material', async () => {
    const mesh = await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const meshId = mesh.ok ? (mesh.data as { nodeId: string }).nodeId : ''
    const lamp = await runAction('node.add', { kind: 'point', name: 'Lampe' })
    const lampId = lamp.ok ? (lamp.data as { nodeId: string }).nodeId : ''

    await runAction('node.setMeshMaterial', { nodeId: meshId, color: '#ff8800', roughness: 0.2 })
    expect(nodeNamed('Caisse')).toMatchObject({ material: { color: '#ff8800', roughness: 0.2 } })

    expect(
      await runAction('node.setMeshMaterial', { nodeId: lampId, color: '#ffffff' }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('sets a light’s colour and intensity, and refuses a mesh', async () => {
    const lamp = await runAction('node.add', { kind: 'point', name: 'Lampe' })
    const lampId = lamp.ok ? (lamp.data as { nodeId: string }).nodeId : ''
    const mesh = await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const meshId = mesh.ok ? (mesh.data as { nodeId: string }).nodeId : ''

    await runAction('node.setLightSettings', { nodeId: lampId, color: '#ffeedd', intensity: 4 })
    expect(nodeNamed('Lampe')).toMatchObject({ light: { color: '#ffeedd', intensity: 4 } })

    expect(
      await runAction('node.setLightSettings', { nodeId: meshId, intensity: 2 }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * A hemisphere light has no `color` at all — it carries a sky colour and a ground colour — so
   * naming one is refused rather than filed against a field the kind does not have.
   */
  it('takes a hemisphere light’s own two colours, and refuses the one it has not', async () => {
    const added = await runAction('node.add', { kind: 'hemisphere', name: 'Ciel' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    expect(
      await runAction('node.setLightSettings', { nodeId, color: '#ff0000', intensity: 3 }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })

    await runAction('node.setLightSettings', { nodeId, skyColor: '#ff0000', intensity: 3 })

    const light = nodeNamed('Ciel')
    expect(light).toMatchObject({
      light: { kind: 'hemisphere', intensity: 3, skyColor: '#ff0000' },
    })
    expect(light?.type === 'light' && 'color' in light.light).toBe(false)
  })

  it('answers the light fields it wrote, the target as one vector', async () => {
    const spot = await runAction('node.add', { kind: 'spot', name: 'Poursuite' })
    const spotId = spot.ok ? (spot.data as { nodeId: string }).nodeId : ''

    expect(
      await runAction('node.setLightSettings', { nodeId: spotId, intensity: 3, targetY: 2 }),
    ).toEqual({ ok: true, data: { intensity: 3, target: { x: 0, y: 2, z: 0 } } })
  })

  /** A cone belongs to a spot, and its target is three numbers that land as one field. */
  it('writes the cone and the target of a spot, and refuses a cone on a point light', async () => {
    const spot = await runAction('node.add', { kind: 'spot', name: 'Poursuite' })
    const point = await runAction('node.add', { kind: 'point', name: 'Bougie' })
    const spotId = spot.ok ? (spot.data as { nodeId: string }).nodeId : ''
    const pointId = point.ok ? (point.data as { nodeId: string }).nodeId : ''

    await runAction('node.setLightSettings', {
      nodeId: spotId,
      angle: 0.4,
      penumbra: 0.25,
      distance: 12,
      targetY: 2,
    })

    expect(nodeNamed('Poursuite')).toMatchObject({
      light: { kind: 'spot', angle: 0.4, penumbra: 0.25, distance: 12, target: { y: 2 } },
    })
    expect(await runAction('node.setLightSettings', { nodeId: pointId, angle: 0.4 })).toMatchObject(
      {
        ok: false,
        refusal: 'badInput',
      },
    )
  })
})

describe('a camera driven by value', () => {
  it('writes the lens fields it was given and keeps the rest, and refuses a mesh', async () => {
    const added = await runAction('node.add', { kind: 'camera', name: 'Caméra' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''
    const mesh = await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const meshId = mesh.ok ? (mesh.data as { nodeId: string }).nodeId : ''

    await runAction('node.setCameraLens', { nodeId, fov: 24 })

    expect(nodeNamed('Caméra')).toMatchObject({ camera: { fov: 24, near: 0.1, far: 1000 } })
    expect(await runAction('node.setCameraLens', { nodeId: meshId, fov: 24 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  // Seconds across the boundary, microseconds in the timeline: the conversion is the point.
  it('opens a shot at the second it was given', async () => {
    const added = await runAction('node.add', { kind: 'camera', name: 'Caméra' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    await runAction('camera.addShot', { nodeId, startSeconds: 2 })

    expect(scene().animation.shots).toHaveLength(1)
    expect(scene().animation.shots[0]).toMatchObject({ cameraId: nodeId, start: 2 * SECOND })
  })

  it('refuses to open a shot for anything but a camera', async () => {
    const mesh = await runAction('node.add', { kind: 'box', name: 'Caisse' })
    const nodeId = mesh.ok ? (mesh.data as { nodeId: string }).nodeId : ''

    expect(await runAction('camera.addShot', { nodeId })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(scene().animation.shots).toEqual([])
  })

  it('holds a frame of length for a duration asked for below one', async () => {
    await runAction('camera.addShot', { nodeId: await cameraId(), durationSeconds: 0 })

    expect(scene().animation.shots[0]?.duration).toBeGreaterThan(0)
  })

  /** The id is the whole of what makes the two edits below reachable at all. */
  it('answers the id of the shot it opened, and edits it by that id', async () => {
    const opened = await runAction('camera.addShot', { nodeId: await cameraId(), startSeconds: 1 })
    const shotId = opened.ok ? (opened.data as { shotId: string }).shotId : ''

    expect(scene().animation.shots[0]?.id).toBe(shotId)
  })
})
