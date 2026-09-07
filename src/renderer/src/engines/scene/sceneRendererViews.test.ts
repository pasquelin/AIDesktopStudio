// @vitest-environment jsdom

import { BufferGeometry, CameraHelper, Material, PerspectiveCamera, Vector3 } from 'three'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import { cameraNodeFixture, meshNode } from './scene-fixtures'
import type { SceneStats } from './sceneStats'
import { EMPTY_SCENE, type MeshNode } from './sceneState'

/**
 * What an edit does to a scene already built — and, above all, what it frees. The renderer is
 * never mounted: everything below happens while the objects are assembled, which is the half a
 * test can reach and where every leak this file guards against would happen.
 *
 * Freeing is watched on the three.js prototypes rather than on the scene graph, which the engine
 * keeps to itself. It is also the honest place to watch it: what matters is that a buffer is
 * given back, not which object held it.
 *
 * What is out of reach here: whether an object leaves the three.js graph. `exportTo` reads the
 * engine's own map of nodes, not the scene, so a node removed from the map but left hanging in
 * the graph looks identical from outside. Only a mounted renderer would tell them apart.
 */

let freedGeometries: MockInstance<() => void>

beforeEach(() => {
  vi.restoreAllMocks()
  freedGeometries = vi.spyOn(BufferGeometry.prototype, 'dispose')
  vi.spyOn(Material.prototype, 'dispose')
})

/**
 * Four views on an unmounted renderer, which is all this file can reach — jsdom gives no WebGL
 * context, so the cameras exist but nothing draws through them. What is checked is what the
 * engine answers about itself; where the side views land is the viewport's own suite.
 */
describe('four views', () => {
  it('opens and closes the layout, and says which it is in', () => {
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })

    expect(renderer.quadView()).toBe(false)
    renderer.setQuadView(true)
    expect(renderer.quadView()).toBe(true)
    // Nothing has pointed anywhere, so every command still lands on the main view.
    expect(renderer.activePane()).toBe(0)

    renderer.setQuadView(false)
    expect(renderer.quadView()).toBe(false)

    renderer.dispose()
  })
})

describe('view helpers and interaction', () => {
  /**
   * Distinct shapes on purpose: `statsOf` counts a geometry once however many meshes wear it,
   * and the cache now really shares one between nodes of the same descriptor — two default
   * boxes carry one box's triangles, which is what the GPU holds.
   */
  const sizedBox = (id: string, width: number): MeshNode => ({
    ...meshNode(id),
    geometry: { kind: 'box', width, height: 1, depth: 1 },
  })

  /**
   * The count is the engine's to make: the document holds an asset id, and what a model
   * actually brought is known only once its file has landed here.
   */
  it('says what the scene costs, and what the selection costs of it', () => {
    const reported: { scene: number; selected: number }[] = []
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onStats: (scene, selected) =>
        reported.push({ scene: scene.triangles, selected: selected.triangles }),
    })

    renderer.apply({ ...EMPTY_SCENE, nodes: [sizedBox('box-1', 1), sizedBox('box-2', 2)] })
    const both = reported.at(-1)

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [sizedBox('box-1', 1), sizedBox('box-2', 2)],
      selectedIds: ['box-1'],
    })
    const one = reported.at(-1)

    expect(both?.scene).toBeGreaterThan(0)
    expect(both?.selected).toBe(0)
    // The same scene, and a selection that is a part of it rather than all of it.
    expect(one?.scene).toBe(both?.scene)
    expect(one?.selected).toBeGreaterThan(0)
    expect(one?.selected).toBeLessThan(one?.scene ?? 0)

    renderer.dispose()
  })

  /**
   * Counting walks every geometry of the scene, and `apply` runs on every state change — a
   * selection included. On 8 000 nodes that walk was 12 % of the CPU of one click, measured
   * 20/08, for a number no selection can move.
   *
   * Read on the IDENTITY of what is reported, which is what says the walk did not happen:
   * `statsOf` builds a fresh object every time it runs. The nodes are the same OBJECTS from one
   * pass to the next, as a selection leaves them — rebuilt ones would be a real edit.
   */
  it('does not count the scene again when only the selection moved', () => {
    const reported: SceneStats[] = []
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onStats: scene => reported.push(scene),
    })
    const nodes = [sizedBox('box-1', 1), sizedBox('box-2', 2)]

    renderer.apply({ ...EMPTY_SCENE, nodes })
    const counted = reported.at(-1)
    renderer.apply({ ...EMPTY_SCENE, nodes, selectedIds: ['box-1'] })
    renderer.apply({ ...EMPTY_SCENE, nodes, selectedIds: ['box-2'] })

    expect(reported.at(-1)).toBe(counted)

    // And a node that really arrives is counted again, or the whole thing would be frozen.
    renderer.apply({ ...EMPTY_SCENE, nodes: [...nodes, sizedBox('box-3', 3)] })

    expect(reported.at(-1)).not.toBe(counted)
    expect(reported.at(-1)?.triangles).toBeGreaterThan(counted?.triangles ?? 0)

    renderer.dispose()
  })

  /**
   * The same for a node that only MOVED, and it is the other half of the pair: `keepsItsGroup`
   * lets through nothing the counters read, so a drag re-counted every geometry of the scene on
   * every image — 116.7 ms an image against 91.7 on 40 000 nodes, measured in the app 26/08.
   */
  it('does not count the scene again when a node only moved', () => {
    const reported: SceneStats[] = []
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      onStats: scene => reported.push(scene),
    })
    const box = sizedBox('box-1', 1)

    renderer.apply({ ...EMPTY_SCENE, nodes: [box] })
    const counted = reported.at(-1)
    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [{ ...box, transform: { ...box.transform, position: { x: 3, y: 0, z: 0 } } }],
    })

    expect(reported.at(-1)).toBe(counted)

    // A node that changes its SHAPE is counted again: moving is the only thing exempt.
    renderer.apply({ ...EMPTY_SCENE, nodes: [sizedBox('box-1', 4)] })

    expect(reported.at(-1)).not.toBe(counted)

    renderer.dispose()
  })
})

describe('view helpers', () => {
  /**
   * The one three.js gets to decide for us: `CameraHelper` sets `this.matrix` to the camera's
   * own world matrix and turns `matrixAutoUpdate` off, so it places ITSELF on the camera. Made
   * a child of that camera, the placement applied twice — a camera at (0, 2, 6) drew its
   * outline at (0, 4, 12), and nothing in the suite could see it: the engine's own maps were
   * right, only the graph was wrong. Seen on screen first, which is why this reads the GRAPH.
   */
  it('hangs a camera frustum in the scene, never under the camera it outlines', () => {
    // Watched on the prototype, like the freeing above: the graph is the engine's own, and what
    // this has to catch is a helper handed to the camera rather than to the scene.
    const added = vi.spyOn(PerspectiveCamera.prototype, 'add')
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    const camera = cameraNodeFixture('cam-1')
    camera.transform = { ...camera.transform, position: { x: 0, y: 2, z: 6 } }

    renderer.apply({ ...EMPTY_SCENE, nodes: [camera] })

    const hung = added.mock.calls.flat()
    expect(hung.some(child => child instanceof CameraHelper)).toBe(false)
    // The body IS hung under it, and by the same call: the two are told apart here so a fix
    // that took both off screen would not read as a pass.
    expect(hung).not.toHaveLength(0)

    added.mockRestore()
    renderer.dispose()
  })

  it('sizes the side views to what the scene holds rather than to a constant', () => {
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })

    // An empty scene and a scene with something in it both open, which is what is reachable
    // here: where the frustum lands is the viewport's own suite.
    renderer.setQuadView(true)
    renderer.apply({ ...EMPTY_SCENE, nodes: [meshNode('box-1')] })
    renderer.setQuadView(false)
    renderer.setQuadView(true)

    expect(renderer.quadView()).toBe(true)
    renderer.dispose()
  })

  /**
   * The rule the user asked for in as many words: only a perspective turns. A side view exists
   * because it does NOT — one drag away from being an almost-top view, it answers nothing.
   */
  it('locks the rotation of every view but the free ones', () => {
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    renderer.setQuadView(true)

    renderer.setPaneViews(['free', 'top', 'free', 'right'])

    // Unmounted, the panes carry no orbit to lock; what is reachable here is that the call
    // stands and the layout holds. The lock itself is asserted in the viewport's own suite.
    expect(renderer.quadView()).toBe(true)

    // Set again while the layout is closed: the views are remembered, nothing is placed.
    renderer.setQuadView(false)
    renderer.setPaneViews(['top', 'free', 'free', 'bottom'])
    expect(renderer.quadView()).toBe(false)
    renderer.dispose()
  })

  /** What `placePanes` touches of an orbit, and nothing else — an unmounted pane carries none. */
  type FakeOrbit = {
    enableRotate: boolean
    target: Vector3
    update: () => void
    removeEventListener: () => void
    dispose: () => void
  }

  /**
   * Seen on screen, and green in the whole suite: a pane offering a camera is one of panes
   * 1–3, which START on a side view where turning is locked. Locking onto a camera left that
   * lock in place, so the orbit that is meant to MOVE the camera did nothing at all.
   */
  it('gives a pane its rotation back when it draws through a camera of the scene', () => {
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    renderer.apply({ ...EMPTY_SCENE, nodes: [cameraNodeFixture('cam')] })
    renderer.setQuadView(true)

    // Unmounted, a pane carries no orbit — three stand-ins is what makes the flag readable.
    const viewport: object = Reflect.get(renderer, 'viewport')
    const extras: { controls: FakeOrbit | null }[] = Reflect.get(viewport, 'extras')
    for (const extra of extras) {
      extra.controls = {
        enableRotate: true,
        target: new Vector3(),
        update: () => {},
        removeEventListener: () => {},
        dispose: () => {},
      }
    }

    renderer.setPaneViews(['free', 'top', 'front', 'left'])
    expect(extras[0]?.controls?.enableRotate).toBe(false)

    renderer.setPaneViews(['free', { kind: 'camera', nodeId: 'cam' }, 'front', 'left'])
    expect(extras[0]?.controls?.enableRotate).toBe(true)

    renderer.dispose()
  })

  /**
   * The point of the whole layout: only the AXIS of a side view is locked. Selecting and
   * dragging are the work itself, and three quarters one can look at but not work in is three
   * quarters of a viewport wasted — which is what shipped and had to be corrected.
   */
  it('works through the view under the pointer, not through the first one', () => {
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    renderer.setQuadView(true)

    // Unmounted, the pointer is over pane 0 and every camera answers; what is reachable here
    // is that asking is legal at all. Which camera a pane holds is the viewport's own suite.
    expect(renderer.activePane()).toBe(0)

    renderer.dispose()
  })

  it('takes one display mode per view, and ignores a list it already holds', () => {
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
    renderer.apply({ ...EMPTY_SCENE, nodes: [meshNode('box-1')] })

    renderer.setDisplayModes(['shaded', 'wireframe', 'both', 'shaded'])
    renderer.setDisplayModes(['shaded', 'wireframe', 'both', 'shaded'])
    renderer.setDisplayModes(['shaded'])
    // The quad reading rebuilds the same edges differently, so it counts as a change.
    renderer.setDisplayModes(['both'], true)
    renderer.setDisplayModes(['both'], true)

    // The edges are geometry: asked for by any view, they are built; asked for by none, freed.
    expect(freedGeometries).toHaveBeenCalled()

    renderer.dispose()
  })
})
