import { createDefaultScene } from '@/engines/scene/defaultScene'
import { createNodeOf, playerModuleNodes } from '@/engines/scene/nodeFactory'
import { PLAYER_KIND } from '@/engines/scene/playerModule'
import { EMPTY_SCENE, type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { AnimationTrack } from '@shared/domain/animation'
import type { Asset } from '@shared/domain/asset'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
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

describe('the shape of a rail', () => {
  const railId = async (): Promise<string> => {
    const added = await runAction('node.add', { kind: 'path', name: 'Rail' })
    return added.ok ? (added.data as { nodeId: string }).nodeId : ''
  }

  const points = () => {
    const node = nodeNamed('Rail')
    return node?.type === 'path' ? node.path.points : []
  }

  it('sets the tension and the closing, and refuses a call that names neither', async () => {
    const nodeId = await railId()

    await runAction('node.setPathShape', { nodeId, tension: 0, closed: true })
    expect(nodeNamed('Rail')).toMatchObject({ path: { tension: 0, closed: true } })

    expect(await runAction('node.setPathShape', { nodeId })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('lays a point where it was aimed, and slips one halfway after a named one', async () => {
    const nodeId = await railId()

    await runAction('path.addPoint', { nodeId, pointX: 4, pointY: 1, pointZ: -8 })
    expect(points().at(-1)).toEqual({ x: 4, y: 1, z: -8 })

    await runAction('path.addPoint', { nodeId, index: 0 })
    expect(points()[1]).toEqual({ x: 0, y: 0, z: -2.5 })
  })

  it('refuses a point that is both aimed at and placed by rank', async () => {
    const nodeId = await railId()

    expect(
      await runAction('path.addPoint', { nodeId, index: 0, pointX: 1, pointY: 0, pointZ: 0 }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(await runAction('path.addPoint', { nodeId, pointX: 1 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('moves a point, and refuses a rank naming none', async () => {
    const nodeId = await railId()

    await runAction('path.movePoint', { nodeId, index: 1, pointY: 3 })
    expect(points()[1]).toEqual({ x: 0, y: 3, z: -5 })

    expect(await runAction('path.movePoint', { nodeId, index: 7, pointY: 3 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /** Two points is the floor: one point is not a line, and the refusal is what says so. */
  it('drops a point, and refuses to take a rail below two', async () => {
    const nodeId = await railId()

    await runAction('path.addPoint', { nodeId })
    expect(points()).toHaveLength(3)

    await runAction('path.removePoint', { nodeId, index: 2 })
    expect(points()).toHaveLength(2)

    expect(await runAction('path.removePoint', { nodeId, index: 1 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

/**
 * The half of `node.transform` and `node.setCameraLens` that no other test reaches: tracks ADD to what
 * is underneath, so a value written raw onto a keyed node springs back the moment it is played.
 */
describe('a node an animation already drives', () => {
  const keyedTrack = (nodeId: string): AnimationTrack => ({
    id: 'track-position',
    name: 'Position',
    index: 0,
    muted: false,
    solo: false,
    locked: false,
    target: { nodeId, property: 'position' },
    rest: IDENTITY_TRANSFORM,
    keys: [],
  })

  function installKeyedBox(): string {
    const fresh = createDefaultScene()
    const box = createNodeOf('box')
    const nodeId = box?.id ?? ''

    installScene(DOCUMENT, {
      ...fresh,
      nodes: box ? [{ ...box, name: 'Caisse' }] : [],
      selectedIds: [],
      animation: { ...fresh.animation, tracks: [keyedTrack(nodeId)] },
    })

    return nodeId
  }

  it('writes a key rather than a move while auto-key records', async () => {
    const nodeId = installKeyedBox()
    await runAction('animation.autoKey', { on: true })

    await runAction('node.transform', { nodeId, positionY: 2 })

    expect(scene().animation.tracks[0]?.keys).toEqual([{ time: 0, value: { x: 0, y: 2, z: 0 } }])
    // Left where it rests: the channel adds the two metres back on top of it.
    expect(nodeNamed('Caisse')?.transform.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('moves the node itself when nothing records', async () => {
    const nodeId = installKeyedBox()
    await runAction('animation.autoKey', { on: false })

    await runAction('node.transform', { nodeId, positionY: 2 })

    expect(scene().animation.tracks[0]?.keys).toEqual([])
    expect(nodeNamed('Caisse')?.transform.position).toMatchObject({ y: 2 })
  })

  /**
   * The fallback for an axis nobody named is the pose PLAYED, and this is what says so: taken from
   * the rest instead, the two metres the channel already holds would be keyed back to zero.
   */
  it('leaves the axes it was not given exactly where the channel plays them', async () => {
    const nodeId = installKeyedBox()
    await runAction('animation.autoKey', { on: true })
    await runAction('node.transform', { nodeId, positionY: 2 })

    await runAction('node.transform', { nodeId, positionX: 5 })

    expect(scene().animation.tracks[0]?.keys).toEqual([{ time: 0, value: { x: 5, y: 2, z: 0 } }])
  })

  /**
   * A lens whose channel plays reads the descriptor PLUS what the channel adds. Writing the value
   * asked for into the descriptor as well would move the rest under every other key of that
   * channel — the value at this instant would be right and every other one wrong.
   */
  it('keys a camera’s lens without moving the rest it is measured against', async () => {
    const fresh = createDefaultScene()
    const camera = createNodeOf('camera')
    const nodeId = camera?.id ?? ''
    const lens: AnimationTrack = {
      id: 'track-fov',
      name: 'Objectif',
      index: 0,
      muted: false,
      solo: false,
      locked: false,
      target: { nodeId, property: 'fov' },
      keys: [],
    }
    installScene(DOCUMENT, {
      ...fresh,
      nodes: camera ? [{ ...camera, name: 'Caméra' }] : [],
      selectedIds: [],
      animation: { ...fresh.animation, tracks: [lens] },
    })
    await runAction('animation.autoKey', { on: true })

    await runAction('node.setCameraLens', { nodeId, fov: 30, near: 0.5 })

    const written = nodeNamed('Caméra')
    expect(written?.type === 'camera' && written.camera).toMatchObject({ fov: 50, near: 0.5 })
    expect(scene().animation.tracks[0]?.keys).toEqual([{ time: 0, value: { x: -20, y: 0, z: 0 } }])
  })

  it('answers the lens fields it wrote, as the viewport reads them', async () => {
    const added = await runAction('node.add', { kind: 'camera', name: 'Caméra' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    expect(await runAction('node.setCameraLens', { nodeId, fov: 24, near: 0.5 })).toEqual({
      ok: true,
      data: { fov: 24, near: 0.5 },
    })
  })

  /** The floor `CAMERA_SPECS` holds, which the number field clamps and the registry cannot say. */
  it('refuses a near plane the inspector’s own field would not take', async () => {
    const added = await runAction('node.add', { kind: 'camera', name: 'Caméra' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    expect(await runAction('node.setCameraLens', { nodeId, near: 0 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

/**
 * 🛑 What « d'un mètre vers le haut » becomes in one call. Without it a caller reads the pose,
 * does the arithmetic and writes the result — three chances to be wrong, and section 7 of the
 * bench scored 0 on five requests, every one written as an absolute.
 */
describe('a change given as a difference', () => {
  it('adds to a position and multiplies a scale', async () => {
    await runAction('node.add', { kind: 'box', name: 'Caisse', positionY: 2 })
    const id = nodeNamed('Caisse')?.id ?? ''

    await runAction('node.transform', { nodeId: id, positionY: 1, relative: true })
    expect(nodeNamed('Caisse')?.transform.position.y).toBe(3)

    await runAction('node.transform', { nodeId: id, scaleX: 0.5, relative: true })
    expect(nodeNamed('Caisse')?.transform.scale.x).toBe(0.5)
  })

  it('still writes a final value when nothing says otherwise', async () => {
    await runAction('node.add', { kind: 'box', name: 'Caisse', positionY: 2 })
    const id = nodeNamed('Caisse')?.id ?? ''

    await runAction('node.transform', { nodeId: id, positionY: 1 })
    expect(nodeNamed('Caisse')?.transform.position.y).toBe(1)
  })
})

/**
 * The two doors read ONE rule — `carvePlan` — and this is the half of it the window cannot show.
 * The scar this must not reopen: `canCarve` once filtered instead of refusing, and through this
 * very door that silently promoted the SECOND id to matter.
 */
describe('folding shapes through the outside door', () => {
  const shapes = async (): Promise<{ wall: string; cube: string }> => {
    await runAction('node.add', { kind: 'box', name: 'Mur' })
    await runAction('node.add', { kind: 'sphere', name: 'Cube' })
    // The wall is scaled up, so the election has a bigger and a smaller to tell apart.
    await runAction('node.transform', {
      nodeId: nodeNamed('Mur')?.id ?? '',
      scaleX: 4,
      scaleY: 3,
      scaleZ: 2,
    })
    return { wall: nodeNamed('Mur')?.id ?? '', cube: nodeNamed('Cube')?.id ?? '' }
  }

  const solid = (): SceneNode | undefined => scene().nodes.find(node => node.type === 'carved')

  it('elects the same matter whichever order the ids are named in', async () => {
    const { wall, cube } = await shapes()
    await runAction('node.combineIntoSolid', { nodeIds: [cube, wall], operation: 'subtract' })

    expect(solid()?.name).toBe('Mur')
  })

  it('lets a client name the matter outright', async () => {
    const { wall, cube } = await shapes()
    await runAction('node.combineIntoSolid', {
      nodeIds: [wall, cube],
      operation: 'subtract',
      matterId: cube,
    })

    expect(solid()?.name).toBe('Cube')
  })

  it('marks a shape as a tool, so joining it pierces instead', async () => {
    const { wall, cube } = await shapes()
    await runAction('node.markAsCuttingTool', { nodeIds: [cube] })
    await runAction('node.combineIntoSolid', { nodeIds: [wall, cube], operation: 'unite' })

    const cut = solid()
    expect(cut?.type === 'carved' && cut.carved.steps[0]?.operation).toBe('subtract')
  })

  it('takes the mark off when asked', async () => {
    const { cube } = await shapes()
    await runAction('node.markAsCuttingTool', { nodeIds: [cube] })
    await runAction('node.markAsCuttingTool', { nodeIds: [cube], negative: false })

    const shape = nodeNamed('Cube')
    expect(shape?.type === 'mesh' && shape.negative).toBe(false)
  })

  /** The repair a client reaches for when the fold ran backwards — one call, no undo. */
  it('folds a solid the other way round', async () => {
    const { wall, cube } = await shapes()
    await runAction('node.combineIntoSolid', { nodeIds: [wall, cube], operation: 'subtract' })
    const made = scene().nodes.find(node => node.type === 'carved')
    expect(made?.name).toBe('Mur')

    await runAction('node.swapSolidMatterAndTool', { nodeId: made?.id ?? '' })

    expect(scene().nodes.find(node => node.type === 'carved')?.name).toBe('Cube')
  })

  it('refuses to flip what is not a solid', async () => {
    const { wall } = await shapes()

    expect(await runAction('node.swapSolidMatterAndTool', { nodeId: wall })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('refuses to mark what carries no shape', async () => {
    await runAction('node.add', { kind: 'point', name: 'Lampe' })

    expect(
      await runAction('node.markAsCuttingTool', { nodeIds: [nodeNamed('Lampe')?.id ?? ''] }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
  })
})

/**
 * 🛑 Measured on the bench pass of 2026-08-31 against deepseek-chat: `camera.target` was refused
 * 28 times on a bare `badInput`, and the model answered the same call again word for word.
 */
describe('what a refused aim tells the caller', () => {
  const detailOf = (outcome: { ok: boolean; detail?: string }): string => outcome.detail ?? ''

  it('names the shot it could not find, and the call that answers one', async () => {
    const outcome = await runAction('camera.aimShotAt', { shotId: 'shot-nowhere', targetId: 'x' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(detailOf(outcome)).toContain('shot-nowhere')
    expect(detailOf(outcome)).toContain('scene.state')
  })

  it('names the field to repair, and the other way of aiming', async () => {
    const opened = await runAction('camera.addShot', { nodeId: await cameraId() })
    const shotId = opened.ok ? (opened.data as { shotId: string }).shotId : ''

    const outcome = await runAction('camera.aimShotAt', { shotId, targetId: 'nowhere' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(detailOf(outcome)).toContain('targetId')
    expect(detailOf(outcome)).toContain('atX')
  })

  it('says which document has to be in front when none is', async () => {
    useDocuments.setState({ activeId: null })

    const outcome = await runAction('camera.aimShotAt', { shotId: 'anything' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'wrongSurface' })
    expect(detailOf(outcome)).toContain('document.activate')
  })
})

/**
 * 🛑 `removeNode` always answers a command, so a refusal that lived only inside it came back as
 * « removed » to a client that had lost nothing — the one shape `refused` exists to prevent.
 */
describe('a player module an outside client acts on', () => {
  const nodesNow = () => sceneOf(useScenes.getState(), 'doc-1').nodes
  const idOf = (name: string) => nodesNow().find(node => node.name === name)?.id ?? ''

  beforeEach(() => {
    installScene('doc-1', { ...EMPTY_SCENE, nodes: [...playerModuleNodes()] })
  })

  it('refuses a second module rather than letting document order decide', async () => {
    expect(await runAction('node.add', { kind: PLAYER_KIND })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(nodesNow().filter(node => node.name === 'Player_Module')).toHaveLength(1)
  })

  it('refuses to remove the eye it films through, and says so', async () => {
    expect(await runAction('node.remove', { nodeId: idOf('Camera') })).toMatchObject({ ok: false })
    expect(nodesNow().some(node => node.name === 'Camera')).toBe(true)
  })

  /** The figure is what the module SHOWS, never one of the three parts it cannot lose. */
  it('still removes what the module does not require', async () => {
    expect(await runAction('node.remove', { nodeId: idOf('Figure') })).toMatchObject({ ok: true })
    expect(nodesNow().some(node => node.name === 'Figure')).toBe(false)
  })
})
