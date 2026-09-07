import {
  BasicShadowMap,
  DirectionalLight,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PointLight,
  AmbientLight,
} from 'three'
import { Box3, Frustum, Matrix4, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { SHADOW_QUALITIES } from '@shared/domain/scene'
import {
  applyShadowFlags,
  applyShadowPolicy,
  applyShadowQuality,
  applyShadows,
  fitShadowCamera,
  holdShadowMap,
  limitShadowUpdates,
  oweShadowPass,
  ownedByAnotherNode,
  resizeShadowMap,
  shadowReachOf,
  throwsOf,
  tuneShadowMaps,
} from './shadows'

/** Enough of a renderer for what this reads: jsdom has no WebGL to build a real one. */
function fakeRenderer() {
  return { shadowMap: { type: PCFShadowMap } }
}

describe('applyShadowQuality', () => {
  it('maps the studio words onto three.js map types', () => {
    const renderer = fakeRenderer()
    applyShadowQuality(renderer, 'hard')

    expect(renderer.shadowMap.type).toBe(BasicShadowMap)
  })

  // three.js 0.185 falls back to PCF from its deprecated softest filter: a third word here
  // would have been a setting that renders exactly like the second one.
  it('offers only the filters three.js actually applies', () => {
    expect(SHADOW_QUALITIES).toEqual(['hard', 'soft'])
  })

  it('maps soft onto the filter three.js keeps', () => {
    const renderer = fakeRenderer()
    applyShadowQuality(renderer, 'soft')

    expect(renderer.shadowMap.type).toBe(PCFShadowMap)
  })
})

describe('applyShadowFlags', () => {
  /**
   * The defect this replaced: a group's children are nodes carrying flags of their own, and
   * writing over them wrote nothing into their nodes — so nothing ever put them back.
   */
  it('stops at a child that stands for a node of its own', () => {
    const root = new Object3D()
    const child = new Object3D()
    const under = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    child.add(under)
    root.add(child)
    // A sibling the walk must still reach, so this reads as "stops there" and not "stops".
    const scenery = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    root.add(scenery)

    applyShadowFlags(root, true, true, candidate => candidate === child)

    expect(root.castShadow).toBe(true)
    expect(scenery.castShadow).toBe(true)
    expect(child.castShadow).toBe(false)
    // And not around it either: what hangs under a node belongs to that node.
    expect(under.castShadow).toBe(false)
  })

  // A model's own tree is scenery, and three.js reads the flags per mesh: the walk goes through it.
  it('walks past a child that stands for nothing, down to the meshes', () => {
    const root = new Object3D()
    const scenery = new Object3D()
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    scenery.add(mesh)
    root.add(scenery)
    const node = new Object3D()
    root.add(node)

    applyShadowFlags(root, true, true, candidate => candidate === node)

    expect(mesh.castShadow).toBe(true)
    expect(node.castShadow).toBe(false)
  })

  // A model is one node over a whole imported tree, and three.js reads the flags per mesh.
  it('reaches every mesh under the object, not only the object', () => {
    const root = new Object3D()
    const branch = new Object3D()
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    branch.add(mesh)
    root.add(branch)

    applyShadowFlags(root, true, false, () => false)

    expect(mesh.castShadow).toBe(true)
    expect(mesh.receiveShadow).toBe(false)
  })

  it('turns them back off, so unchecking the box actually reaches the tree', () => {
    const root = new Object3D()
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    root.add(mesh)

    applyShadowFlags(root, true, true, () => false)
    applyShadowFlags(root, false, false, () => false)

    expect(mesh.castShadow).toBe(false)
    expect(mesh.receiveShadow).toBe(false)
  })
})

describe('ownedByAnotherNode', () => {
  it('stops on a child the engine holds under that very name', () => {
    const child = new Object3D()
    child.name = 'node-7'

    expect(ownedByAnotherNode(id => (id === 'node-7' ? child : undefined))(child)).toBe(true)
  })

  // An imported file names its own objects, and one of them carrying an id would otherwise keep
  // the flags a model is supposed to spread over its whole tree.
  it('walks through a namesake the engine does not hold', () => {
    const impostor = new Object3D()
    impostor.name = 'node-7'

    expect(ownedByAnotherNode(id => (id === 'node-7' ? new Object3D() : undefined))(impostor)).toBe(
      false,
    )
  })

  it('walks through what the file left unnamed', () => {
    expect(ownedByAnotherNode(() => undefined)(new Object3D())).toBe(false)
  })
})

describe('resizeShadowMap', () => {
  it('sizes the square map a light allocates', () => {
    const light = new DirectionalLight()
    resizeShadowMap(light, 1024)

    expect(light.shadow.mapSize.width).toBe(1024)
    expect(light.shadow.mapSize.height).toBe(1024)
  })

  // The map was allocated at the previous size: kept, three.js would draw into the old one.
  it('drops the map it had, so the new size is the one built', () => {
    const light = new PointLight()
    const map = { dispose: vi.fn(), setSize: vi.fn() }
    // A render target as three.js would have left one behind.
    Reflect.set(light.shadow, 'map', map)

    resizeShadowMap(light, 4096)

    expect(map.dispose).toHaveBeenCalled()
    expect(light.shadow.map).toBeNull()
  })

  it('does nothing when the size has not moved', () => {
    const light = new DirectionalLight()
    resizeShadowMap(light, 1024)
    const map = { dispose: vi.fn() }
    Reflect.set(light.shadow, 'map', map)

    resizeShadowMap(light, 1024)

    expect(map.dispose).not.toHaveBeenCalled()
  })

  // Ambient and hemisphere lights have no shadow to size, and neither has a plain object.
  it('leaves alone what casts nothing', () => {
    expect(() => resizeShadowMap(new AmbientLight(), 1024)).not.toThrow()
    expect(() => resizeShadowMap(new Object3D(), 1024)).not.toThrow()
  })
})

/**
 * A directional shadow frustum is a ten-unit box by default, centred on the light's target. A
 * set laid down twenty metres off that target threw nothing at all — with no hint as to why.
 */
describe('fitShadowCamera', () => {
  const sunOver = (x: number, y: number, z: number): DirectionalLight => {
    const light = new DirectionalLight()
    light.position.set(x, y, z)
    return light
  }
  const frustumOf = (light: DirectionalLight): Frustum => {
    light.shadow.updateMatrices(light)
    const camera = light.shadow.camera
    return new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    )
  }

  it('frames an empty scene on the floor, around the target', () => {
    const light = sunOver(0, 10, 5)
    fitShadowCamera(light, { bounds: new Box3(), floor: 20 })

    expect(light.shadow.camera.right).toBe(10)
    expect(light.shadow.camera.left).toBe(-10)
    expect(light.shadow.camera.top).toBe(10)
    expect(light.shadow.camera.bottom).toBe(-10)
  })

  it('frames a set where it STANDS, seen from the light, not around the target', () => {
    const light = sunOver(0, 10, 0)
    const crate = new Box3(new Vector3(24.5, 0, 24.5), new Vector3(25.5, 1, 25.5))

    fitShadowCamera(light, { bounds: crate, floor: 20 })

    expect(frustumOf(light).intersectsBox(crate)).toBe(true)
  })

  it('keeps the frustum at least the floor wide around a small set', () => {
    const light = sunOver(0, 10, 5)
    fitShadowCamera(light, { bounds: new Box3(new Vector3(), new Vector3(1, 1, 1)), floor: 20 })

    expect(light.shadow.camera.right - light.shadow.camera.left).toBeCloseTo(20)
  })

  it('runs the depth past the farthest caster, so the ground its shadow lands on is inside', () => {
    const light = sunOver(0, 100, 0)
    const set = new Box3(new Vector3(-5, 0, -5), new Vector3(5, 10, 5))

    fitShadowCamera(light, { bounds: set, floor: 20 })

    expect(light.shadow.camera.far).toBeGreaterThan(100)
    expect(light.shadow.camera.near).toBeLessThan(90)
  })

  it('never shortens the depth under what three.js builds a sun with', () => {
    const light = sunOver(0, 10, 0)
    fitShadowCamera(light, { bounds: new Box3(new Vector3(), new Vector3(1, 1, 1)), floor: 20 })

    expect(light.shadow.camera.far).toBeGreaterThanOrEqual(500)
  })

  /** A frustum of width zero projects to Infinity: the sun then rasterises NOTHING, silently. */
  it('never writes a frustum of width zero, whatever the floor', () => {
    const light = sunOver(0, 10, 0)
    fitShadowCamera(light, { bounds: new Box3(), floor: 0 })

    expect(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true)
  })

  it('stands a sun straight overhead, where the view has no side to lean on', () => {
    const light = sunOver(0, 10, 0)
    fitShadowCamera(light, {
      bounds: new Box3(new Vector3(-5, 0, -5), new Vector3(5, 1, 5)),
      floor: 0,
    })

    expect(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true)
    expect(light.shadow.camera.right - light.shadow.camera.left).toBeCloseTo(10, 1)
  })

  // three.js never reads a camera's own bounds back: the matrix has to be asked for.
  it('recomputes the projection, or the new size shows on nothing', () => {
    const light = sunOver(0, 10, 5)
    const update = vi.spyOn(light.shadow.camera, 'updateProjectionMatrix')

    fitShadowCamera(light, { bounds: new Box3(), floor: 40 })

    expect(update).toHaveBeenCalled()
  })

  it('does nothing when the frame has not moved', () => {
    const light = sunOver(0, 10, 5)
    const frame = { bounds: new Box3(new Vector3(), new Vector3(4, 1, 4)), floor: 20 }
    fitShadowCamera(light, frame)
    const update = vi.spyOn(light.shadow.camera, 'updateProjectionMatrix')

    fitShadowCamera(light, frame)

    expect(update).not.toHaveBeenCalled()
  })

  // A spot and a point shadow through a perspective camera, which has no box to size.
  it('leaves alone a shadow that is not cast through a box', () => {
    const frame = { bounds: new Box3(), floor: 20 }
    expect(() => fitShadowCamera(new PointLight(), frame)).not.toThrow()
    expect(() => fitShadowCamera(new AmbientLight(), frame)).not.toThrow()
  })
})

describe('limiting a shadow pass', () => {
  it('updates only the changed light and restores off-screen rendering afterwards', () => {
    const changed = new DirectionalLight()
    const held = new PointLight()

    const restore = limitShadowUpdates([changed, held], false, new Set([changed]))

    expect(changed.shadow.autoUpdate).toBe(true)
    expect(held.shadow.autoUpdate).toBe(false)
    restore()
    expect(held.shadow.autoUpdate).toBe(true)
  })

  it('updates every light after a caster changes', () => {
    const first = new DirectionalLight()
    const second = new PointLight()

    limitShadowUpdates([first, second], true, new Set())

    expect(first.shadow.autoUpdate).toBe(true)
    expect(second.shadow.autoUpdate).toBe(true)
  })
})

describe('turning shadows off', () => {
  const stage = () => {
    const root = new Object3D()
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    root.add(mesh)
    return { root, material: mesh.material }
  }

  /**
   * `shadowMap.enabled` feeds the program cache key, but three re-reads that key only when a
   * material's own version moves or the lights state does — and this flag moves neither. Switched
   * alone it leaves every material still sampling a map nothing updates any more, so the shadows
   * freeze on screen instead of going away.
   */
  it('marks the materials, or the shadows stay frozen on screen', () => {
    const { root, material } = stage()
    const renderer = { shadowMap: { enabled: true } }
    const before = material.version

    applyShadows(renderer, false, root)

    expect(renderer.shadowMap.enabled).toBe(false)
    expect(material.version).toBeGreaterThan(before)
  })

  it('recompiles nothing when the flag was already where it is asked to be', () => {
    const { root, material } = stage()
    const renderer = { shadowMap: { enabled: true } }
    const before = material.version

    applyShadows(renderer, true, root)

    expect(material.version).toBe(before)
  })

  it('walks a node carrying no material at all', () => {
    const renderer = { shadowMap: { enabled: false } }

    expect(() => applyShadows(renderer, true, new Object3D())).not.toThrow()
  })
})

describe('applyShadowPolicy', () => {
  const renderer = () => ({ shadowMap: { type: PCFShadowMap, enabled: true, autoUpdate: true } })

  it('turns the pass on or off as the policy says, and never leaves it to three.js', () => {
    const off = renderer()
    applyShadowPolicy(off, { shadows: false, shadowQuality: 'hard' })

    expect(off.shadowMap.enabled).toBe(false)
    expect(off.shadowMap.type).toBe(BasicShadowMap)
    // The frames that owe a depth pass ask for one; nobody redraws every map of every light.
    expect(off.shadowMap.autoUpdate).toBe(false)
  })

  it('carries the soft filter through, as a viewport on its own settings would', () => {
    const on = renderer()
    applyShadowPolicy(on, { shadows: true, shadowQuality: 'soft' })

    expect(on.shadowMap.enabled).toBe(true)
    expect(on.shadowMap.type).toBe(PCFShadowMap)
  })
})

describe('shadowReachOf', () => {
  it('spans the DIAGONAL of the ground a set covers, never its width', () => {
    const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 3, 10))

    expect(shadowReachOf(bounds, 0)).toBeCloseTo(10 * Math.SQRT2)
  })

  it('never falls under the floor the caller stands on', () => {
    expect(shadowReachOf(new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1)), 20)).toBe(20)
  })

  it('answers the floor alone for a scene that occupies nothing', () => {
    expect(shadowReachOf(new Box3(), 20)).toBe(20)
  })
})

/** The pass both engines run: the editor on every placement, an exported game as a scene lands. */
describe('tuneShadowMaps', () => {
  it('sizes the map of every light and frames the ones that frame a box', () => {
    const sun = new DirectionalLight()
    sun.position.set(0, 10, 5)
    const bulb = new PointLight()
    const bounds = new Box3(new Vector3(-20, 0, -20), new Vector3(20, 3, 20))

    const tuned = tuneShadowMaps([sun, bulb], 1024, () => ({ bounds, floor: 0 }))

    expect(sun.shadow.mapSize.width).toBe(1024)
    expect(bulb.shadow.mapSize.width).toBe(1024)
    expect(tuned?.framed).toEqual([sun])
    expect(tuned?.reach).toBeCloseTo(40 * Math.SQRT2)
    expect(sun.shadow.camera.right - sun.shadow.camera.left).toBeCloseTo(40, 1)
  })

  it('never measures a scene no light would read — a pass for nothing', () => {
    const measure = vi.fn(() => ({ bounds: new Box3(), floor: 40 }))

    expect(tuneShadowMaps([new PointLight(), new AmbientLight()], 512, measure)).toBeNull()
    expect(measure).not.toHaveBeenCalled()
  })
})

describe('holding a map off the per-frame redraw', () => {
  it('draws it on the pass it is owed, and on no other', () => {
    const sun = new DirectionalLight()
    holdShadowMap(sun)
    expect(sun.shadow.autoUpdate).toBe(false)

    oweShadowPass([sun, new AmbientLight()])
    expect(sun.shadow.needsUpdate).toBe(true)
  })
})

describe('throwsOf', () => {
  it('reads the direction a sun throws, off the target both engines stand in the scene', () => {
    const sun = new DirectionalLight()
    sun.position.set(0, 4, 0)
    sun.target.position.set(0, 0, 0)
    sun.updateMatrixWorld()
    sun.target.updateMatrixWorld()
    const bounds = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 2, 1))

    const thrown = throwsOf([sun], bounds, 40)

    expect(thrown?.along).toHaveLength(1)
    expect(thrown?.along[0]?.y).toBeLessThan(0)
    expect(thrown?.reach).toBe(40)
  })
})

/** The pass both engines run: the editor on every placement, an exported game as a scene lands. */
