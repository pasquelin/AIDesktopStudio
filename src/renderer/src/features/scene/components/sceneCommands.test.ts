import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cameraShot, timelineWith } from '@/engines/scene/animation-fixtures'
import { cameraNodeFixture, meshNode, pathNodeFixture } from '@/engines/scene/scene-fixtures'
import { playerModuleNodes } from '@/engines/scene/nodeFactory'
import { bezierPathOf, type GeometryDescriptor } from '@shared/domain/scene'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { useAnimationViews } from '@/stores/animationView'
import { clearScenes, installScene, sceneNodeNow } from '@/stores/scene-fixtures'
import { sceneOf, selectIn, useScenes } from '@/stores/scenes'
import { useSceneClipboard } from '@/stores/sceneClipboard'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { runSceneCommand } from './sceneCommands'
import { useOptimizationDialog } from '@/hooks/useOptimizationDialog'
import { useGameExportDialog } from '@/hooks/useGameExportDialog'

const DOCUMENT = 'doc-1'

const at = (x: number) => ({ x, y: 0, z: 0 })

const rail = () => pathNodeFixture('rail', { points: [at(0), at(10), at(20)] })

const pointsNow = (): number[] => {
  const node = sceneNodeNow(DOCUMENT, 'rail')
  return node?.type === 'path' ? node.path.points.map(point => point.x) : []
}

beforeEach(() => {
  clearScenes()
  useSceneViews.setState({ views: {} })
  useAnimationViews.setState({ views: {} })
  installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [rail()], selectedIds: ['rail'] })
  useOptimizationDialog.getState().close()
  useGameExportDialog.getState().close()
})

it('opens optimization only after a selection and its live renderer exist', () => {
  // The command checks engine presence only; constructing WebGL would make this unit test browser-only.
  registerSceneEngine(DOCUMENT, {} as unknown as SceneRenderer)

  runSceneCommand(DOCUMENT, 'scene.optimizeSelection')

  expect(useOptimizationDialog.getState().request).toEqual({
    documentId: DOCUMENT,
    selectedIds: ['rail'],
    scope: 'selection',
  })
  forgetSceneEngine(DOCUMENT)
})

it('opens the whole-world performance report without requiring a selection', () => {
  installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [rail()], selectedIds: [] })
  registerSceneEngine(DOCUMENT, {} as unknown as SceneRenderer)

  runSceneCommand(DOCUMENT, 'scene.worldPerformance')

  expect(useOptimizationDialog.getState().request).toEqual({
    documentId: DOCUMENT,
    selectedIds: [],
    scope: 'world',
  })
  forgetSceneEngine(DOCUMENT)
})

it('opens the game export report from a live scene', () => {
  registerSceneEngine(DOCUMENT, {} as unknown as SceneRenderer)

  runSceneCommand(DOCUMENT, 'scene.exportGame')

  expect(useGameExportDialog.getState().documentId).toBe(DOCUMENT)
  forgetSceneEngine(DOCUMENT)
})

it('opens the game export report even when the viewport is not mounted', () => {
  runSceneCommand(DOCUMENT, 'scene.exportGame')

  expect(useGameExportDialog.getState().documentId).toBe(DOCUMENT)
})

/**
 * Delete is an accelerator of the native Édition menu, so it never reaches the band's own
 * `onKeyDown`: clicking a shot while its camera stood selected deleted THE CAMERA. Seen on
 * screen on 18/08, and green in the whole suite.
 */
describe('deleting while a shot is chosen in the band', () => {
  beforeEach(() => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [cameraNodeFixture('cam-a')],
      selectedIds: ['cam-a'],
      animation: timelineWith([], { shots: [cameraShot('shot-1')] }),
    })
  })

  it('takes the shot away and leaves the camera standing', () => {
    useAnimationViews.getState().setSelected(DOCUMENT, ['shot-1'])

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(sceneOf(useScenes.getState(), DOCUMENT).animation.shots).toEqual([])
    expect(sceneNodeNow(DOCUMENT, 'cam-a')).not.toBeNull()
  })

  // A key of the band answers to the same set as a shot, and it is the band that takes those.
  it('lets Delete through to the selection when the band holds no shot', () => {
    useAnimationViews.getState().setSelected(DOCUMENT, ['row-1@0'])

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(sceneNodeNow(DOCUMENT, 'cam-a')).toBeNull()
  })
})

/**
 * 🛑 A command that CREATES names what it made: a bare « ran » left a client running
 * `scene.duplicate` again for an id that never came — ten refusals in one bench pass (2026-09-02).
 */
describe('a command that makes something', () => {
  it('answers the roots of what it duplicated, the children carried along unnamed', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [meshNode('parent'), meshNode('child', 'parent')],
      selectedIds: ['parent'],
    })

    const made = runSceneCommand(DOCUMENT, 'scene.duplicate')

    const nodes = sceneOf(useScenes.getState(), DOCUMENT).nodes
    expect(nodes).toHaveLength(4)
    expect(made).toEqual({ nodeIds: [nodes[2]?.id] })
    expect(nodes[3]?.parentId).toBe(nodes[2]?.id)
  })

  it('answers the group it put over the selection', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [meshNode('a'), meshNode('b')],
      selectedIds: ['a', 'b'],
    })

    const made = runSceneCommand(DOCUMENT, 'scene.group')

    const group = sceneOf(useScenes.getState(), DOCUMENT).nodes.find(node => node.type === 'group')
    expect(made).toEqual({ nodeIds: [group?.id] })
  })

  it('answers what it pasted, and a plain « ran » for an empty selection', () => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('a')], selectedIds: ['a'] })
    runSceneCommand(DOCUMENT, 'scene.copy')

    const pasted = runSceneCommand(DOCUMENT, 'scene.paste')
    expect(pasted).toEqual({ nodeIds: [sceneOf(useScenes.getState(), DOCUMENT).nodes[1]?.id] })

    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('a')], selectedIds: [] })
    expect(runSceneCommand(DOCUMENT, 'scene.duplicate')).toBe(true)
  })
})

describe('deleting while a control point is held', () => {
  it('takes the point away and leaves the rail standing', () => {
    useSceneViews.getState().setPickedPathPoint(DOCUMENT, { nodeId: 'rail', index: 1 })

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(pointsNow()).toEqual([0, 20])
    expect(sceneNodeNow(DOCUMENT, 'rail')).not.toBeNull()
  })

  it('lets go of the point it took, so the gizmo holds nothing that is gone', () => {
    useSceneViews.getState().setPickedPathPoint(DOCUMENT, { nodeId: 'rail', index: 1 })

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(useSceneViews.getState().views[DOCUMENT]?.pickedPathPoint).toBeNull()
  })

  /**
   * One point is not a line, so `withoutPoint` refuses — and the refusal has to stay handled:
   * falling through to the selection would delete the rail the gesture was working on.
   */
  it('keeps both the point and the rail when the rail is down to two points', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [pathNodeFixture('rail', { points: [at(0), at(10)] })],
      selectedIds: ['rail'],
    })
    useSceneViews.getState().setPickedPathPoint(DOCUMENT, { nodeId: 'rail', index: 0 })

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(pointsNow()).toEqual([0, 10])
    expect(sceneNodeNow(DOCUMENT, 'rail')).not.toBeNull()
  })

  it('deletes the selected rail itself when no point is held', () => {
    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(sceneNodeNow(DOCUMENT, 'rail')).toBeNull()
  })

  /**
   * A point is picked by a click in the VIEWPORT and let go of by another one; the tree selects
   * through a door that knows nothing of it. Without this, a point left over from a rail worked
   * on earlier ate the Delete meant for the object just picked in the tree.
   */
  it('lets Delete through to the tree’s selection when the point belongs to another rail', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [rail(), meshNode('box')],
      selectedIds: ['box'],
    })
    useSceneViews.getState().setPickedPathPoint(DOCUMENT, { nodeId: 'rail', index: 1 })

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(sceneNodeNow(DOCUMENT, 'box')).toBeNull()
    expect(pointsNow()).toEqual([0, 10, 20])
  })

  // The same leftover on a rail already at its floor swallowed every Delete and did nothing.
  it('lets Delete through even when the leftover point could not have been removed anyway', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [pathNodeFixture('rail', { points: [at(0), at(10)] }), meshNode('box')],
      selectedIds: ['box'],
    })
    useSceneViews.getState().setPickedPathPoint(DOCUMENT, { nodeId: 'rail', index: 0 })

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(sceneNodeNow(DOCUMENT, 'box')).toBeNull()
  })
})

/**
 * They lived in the viewport component, where only a mounted scene could reach them: an MCP
 * client asking to undo was answered `wrongSurface` — measured on the bench pass of 2026-08-25,
 * six requests, none able to take anything back.
 */
describe('taking a change back', () => {
  it('undoes and redoes the scene the command names', () => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('cube')], selectedIds: ['cube'] })
    runSceneCommand(DOCUMENT, 'scene.delete')
    expect(sceneOf(useScenes.getState(), DOCUMENT).nodes).toHaveLength(0)

    expect(runSceneCommand(DOCUMENT, 'scene.undo')).toBe(true)
    expect(sceneOf(useScenes.getState(), DOCUMENT).nodes).toHaveLength(1)

    expect(runSceneCommand(DOCUMENT, 'scene.redo')).toBe(true)
    expect(sceneOf(useScenes.getState(), DOCUMENT).nodes).toHaveLength(0)
  })
})

/**
 * 🛑 `false` and not `true`: a caller told `ok` on an empty stack sends the undo again. Nine in
 * a row on the bench pass of 2026-08-26, and the decor came apart.
 */
describe('an undo with nothing behind it', () => {
  it('says it did nothing rather than answering done', () => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('cube')], selectedIds: ['cube'] })

    expect(runSceneCommand(DOCUMENT, 'scene.undo')).toBe(false)
    expect(runSceneCommand(DOCUMENT, 'scene.redo')).toBe(false)

    runSceneCommand(DOCUMENT, 'scene.delete')
    expect(runSceneCommand(DOCUMENT, 'scene.undo')).toBe(true)
  })
})

describe('deleting the control point a rail or a band holds', () => {
  const runOf = (id: string): number[] => {
    const node = sceneNodeNow(DOCUMENT, id)
    if (node?.type === 'path') return node.path.points.map(point => point.x)
    return node?.type === 'mesh' && node.geometry.kind === 'ribbon'
      ? node.geometry.path.points.map(point => point.x)
      : []
  }

  it('takes the point away from a rail', () => {
    useSceneViews.getState().setPickedPathPoint(DOCUMENT, { nodeId: 'rail', index: 1 })

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(runOf('rail')).toEqual([0, 20])
  })

  /**
   * 🛑 A band holds its rail INSIDE its shape, and the refusal read the node's type: Delete on a
   * point of a band fell straight through to the selection and took the band away whole.
   */
  it('takes the point away from a band, and leaves the band standing', () => {
    const shape: GeometryDescriptor = {
      kind: 'ribbon',
      path: bezierPathOf([at(0), at(10), at(20)], false),
      width: 1,
      height: 0.2,
      segments: 16,
    }
    const band = { ...meshNode('band'), geometry: shape }
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [band], selectedIds: ['band'] })
    useSceneViews.getState().setPickedPathPoint(DOCUMENT, { nodeId: 'band', index: 1 })

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(runOf('band')).toEqual([0, 20])
    expect(sceneNodeNow(DOCUMENT, 'band')).not.toBeNull()
  })
})

describe('the gestures a player module refuses', () => {
  const nodesNow = () => sceneOf(useScenes.getState(), DOCUMENT).nodes
  const idOf = (name: string) => nodesNow().find(node => node.name === name)?.id ?? ''

  const pick = (name: string) => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [...playerModuleNodes()] })
    selectIn(DOCUMENT, [idOf(name)])
  }

  // 🛑 The clipboard as well as the scenes: it is a module-level store that outlives a case, so
  // what a neighbouring one cut was still sitting in it when this file gained a second describe.
  beforeEach(() => {
    clearScenes()
    useSceneClipboard.getState().copy([])
  })

  it('keeps its camera through a Delete that named it', () => {
    pick('Camera')

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(nodesNow().some(node => node.name === 'Camera')).toBe(true)
  })

  /** A cut that cannot remove must not look copied either — hence the check before the write. */
  it('keeps its body through a Cut that named it, and copies nothing', () => {
    pick('Capsule')

    runSceneCommand(DOCUMENT, 'scene.cut')

    expect(nodesNow().some(node => node.name === 'Capsule')).toBe(true)
    expect(useSceneClipboard.getState().nodes).toEqual([])
  })

  /** 🛑 Held BEFORE as well as after: a name the module no longer wears selects nothing, deletes
   * nothing, and passes this case without exercising a single refusal. */
  it('lets go of what it does not require', () => {
    pick('Figure')
    expect(nodesNow().some(node => node.name === 'Figure')).toBe(true)

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(nodesNow().some(node => node.name === 'Figure')).toBe(false)
  })

  it('goes away whole when the module itself is named', () => {
    pick('Player_Module')

    runSceneCommand(DOCUMENT, 'scene.delete')

    expect(nodesNow()).toEqual([])
  })

  it('refuses to be duplicated into a second one', () => {
    pick('Player_Module')

    runSceneCommand(DOCUMENT, 'scene.duplicate')

    expect(nodesNow().filter(node => node.name === 'Player_Module')).toHaveLength(1)
  })
})

/**
 * The six sides and the camera. Commands rather than an action of the native menu's own: the
 * Blender scheme reaches them from the keypad, which only a command can be bound to.
 */
describe('the numbered views', () => {
  it('stands the camera at the side the command names', () => {
    const viewFrom = vi.fn()
    // Only the one method the command reaches for: the rest of `SceneRenderer` is another suite's.
    registerSceneEngine(DOCUMENT, { viewFrom } as unknown as SceneRenderer)

    expect(runSceneCommand(DOCUMENT, 'scene.viewTop')).toBe(true)
    expect(viewFrom).toHaveBeenCalledWith('top')

    runSceneCommand(DOCUMENT, 'scene.viewBack')
    expect(viewFrom).toHaveBeenLastCalledWith('back')
    forgetSceneEngine(DOCUMENT)
  })

  /** A tab whose viewport is not mounted has no engine, and the command must not throw on it. */
  it('says nothing to a scene whose viewport is not mounted', () => {
    expect(() => runSceneCommand(DOCUMENT, 'scene.viewTop')).not.toThrow()
    expect(() => runSceneCommand(DOCUMENT, 'scene.frameFollow')).not.toThrow()
  })

  /** Unity's ⇧F, which the engine holds: the view travels with what moves — see `frameFollow`. */
  it('asks the engine to follow the selection', () => {
    const frameFollow = vi.fn()
    registerSceneEngine(DOCUMENT, { frameFollow } as unknown as SceneRenderer)

    expect(runSceneCommand(DOCUMENT, 'scene.frameFollow')).toBe(true)
    expect(frameFollow).toHaveBeenCalledTimes(1)
    forgetSceneEngine(DOCUMENT)
  })

  it('looks through the chosen camera, and steps back out on a second call', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [cameraNodeFixture('cam-a')],
      selectedIds: ['cam-a'],
    })

    runSceneCommand(DOCUMENT, 'scene.viewCamera')
    expect(sceneViewOf(useSceneViews.getState(), DOCUMENT).panes[0]).toEqual({
      kind: 'camera',
      nodeId: 'cam-a',
    })

    runSceneCommand(DOCUMENT, 'scene.viewCamera')
    expect(sceneViewOf(useSceneViews.getState(), DOCUMENT).panes[0]).toBe('free')
  })

  /** Nothing chosen takes the first camera of the scene, which is what Blender's `Numpad0` does. */
  it('takes the first camera of the scene when none is chosen', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [meshNode('cube'), cameraNodeFixture('cam-b')],
    })

    runSceneCommand(DOCUMENT, 'scene.viewCamera')

    expect(sceneViewOf(useSceneViews.getState(), DOCUMENT).panes[0]).toEqual({
      kind: 'camera',
      nodeId: 'cam-b',
    })
  })

  it('looks through nothing at all in a scene that has no camera', () => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('cube')] })

    expect(runSceneCommand(DOCUMENT, 'scene.viewCamera')).toBe(true)
    expect(sceneViewOf(useSceneViews.getState(), DOCUMENT).panes[0]).toBe('free')
  })
})
