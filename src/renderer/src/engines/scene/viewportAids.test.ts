import { describe, expect, it } from 'vitest'
import {
  AxesHelper,
  Box3,
  BoxHelper,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  Matrix4,
  Vector3,
} from 'three'
import { CAMERA_LENS_REACH } from './threeFactory'
import {
  createViewportAids,
  type AidBody,
  type AidPalette,
  type AidRigs,
  type AidSettings,
} from './viewportAids'

const PALETTE: AidPalette = {
  box: '#ffffff',
  origin: '#888888',
  normal: '#00ff00',
  body: '#00aaff',
  arm: '#8888ff',
}

/** No walking body and no arm, which is what every case here but the last two is about. */
const NO_RIG: AidRigs = { bodies: new Map(), arms: new Map() }

const bodied = (bodies: ReadonlyMap<string, AidBody>): AidRigs => ({ bodies, arms: new Map() })

const OFF: AidSettings = {
  boundingBoxes: 'off',
  origins: false,
  normals: false,
  normalLength: 0.2,
}

/** A mesh with real normals, which is what `VertexNormalsHelper` reads in its constructor. */
function meshWithNormals(): Mesh {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(9), 3))
  return new Mesh(geometry)
}

/** What a generated asset routinely arrives as: a mesh carrying no normals at all. */
function meshWithout(): Mesh {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
  return new Mesh(geometry)
}

const boxes = (host: Object3D) => host.children.filter(child => child instanceof BoxHelper)

describe('the aids drawn over a scene', () => {
  it('draws nothing at all by default', () => {
    const aids = createViewportAids()
    aids.apply(new Map([['a', new Object3D()]]), [], OFF, PALETTE, NO_RIG)

    expect(aids.object.children).toHaveLength(0)
  })

  it('boxes the selection alone, or every object, on the setting', () => {
    const aids = createViewportAids()
    const objects = new Map([
      ['a', new Object3D()],
      ['b', new Object3D()],
    ])

    aids.apply(objects, ['a'], { ...OFF, boundingBoxes: 'selected' }, PALETTE, NO_RIG)
    expect(boxes(aids.object)).toHaveLength(1)

    aids.apply(objects, ['a'], { ...OFF, boundingBoxes: 'all' }, PALETTE, NO_RIG)
    expect(boxes(aids.object)).toHaveLength(2)

    aids.apply(objects, ['a'], OFF, PALETTE, NO_RIG)
    expect(boxes(aids.object)).toHaveLength(0)
  })

  // The map is keyed by node, and a node that left the scene leaves a helper drawn over nothing.
  it('drops the box of an object that has left the scene', () => {
    const aids = createViewportAids()
    const settings = { ...OFF, boundingBoxes: 'all' } satisfies AidSettings

    aids.apply(new Map([['a', new Object3D()]]), [], settings, PALETTE, NO_RIG)
    aids.apply(new Map(), [], settings, PALETTE, NO_RIG)

    expect(aids.object.children).toHaveLength(0)
  })

  it('keeps the helper it already built when nothing moved', () => {
    const aids = createViewportAids()
    const objects = new Map([['a', new Object3D()]])
    const settings = { ...OFF, boundingBoxes: 'all' } satisfies AidSettings

    aids.apply(objects, [], settings, PALETTE, NO_RIG)
    const built = boxes(aids.object)[0]
    aids.apply(objects, [], settings, PALETTE, NO_RIG)

    expect(boxes(aids.object)[0]).toBe(built)
  })

  /**
   * `VertexNormalsHelper` reads `geometry.attributes.normal.count` in its constructor and throws
   * without one — and a generated model routinely arrives with a mesh that has none. Left
   * unguarded, the toggle takes the viewport down on somebody's asset.
   */
  it('draws no normals on a mesh that carries none, rather than throwing', () => {
    const aids = createViewportAids()
    const objects = new Map([['a', meshWithout()]])

    expect(() =>
      aids.apply(objects, ['a'], { ...OFF, normals: true }, PALETTE, NO_RIG),
    ).not.toThrow()
    expect(aids.object.children).toHaveLength(0)
  })

  it('draws normals on the selection alone, and gives them back when it changes', () => {
    const aids = createViewportAids()
    const objects = new Map([
      ['a', meshWithNormals()],
      ['b', meshWithNormals()],
    ])
    const settings = { ...OFF, normals: true } satisfies AidSettings

    aids.apply(objects, ['a'], settings, PALETTE, NO_RIG)
    expect(aids.object.children).toHaveLength(1)

    aids.apply(objects, ['a', 'b'], settings, PALETTE, NO_RIG)
    expect(aids.object.children).toHaveLength(2)
  })

  /**
   * 🛑 The same trap the cage fell into, and it was left standing on the OTHER aids: the renderer
   * writes the local transforms and draws straight after, while three recomposes `matrixWorld`
   * at the draw. Measured — a mesh 40 m out under a moved parent was boxed at the origin.
   */
  it('boxes and marks an object where it stands in the WORLD, chain unrecomposed', () => {
    const module = new Object3D()
    module.position.set(0, 0, 40)
    const mesh = meshWithNormals()
    mesh.position.set(0, 2, 0)
    module.add(mesh)
    const aids = createViewportAids()

    aids.apply(
      new Map([['a', mesh]]),
      [],
      { ...OFF, boundingBoxes: 'all', origins: true },
      PALETTE,
      NO_RIG,
    )

    const box = aids.object.children.find(child => child instanceof BoxHelper)
    const axes = aids.object.children.find(child => child instanceof AxesHelper)
    expect(new Box3().setFromObject(box ?? new Object3D()).getCenter(new Vector3()).z).toBeCloseTo(
      40,
    )
    expect(axes?.position.z).toBeCloseTo(40)
  })

  it('hangs everything from one group, so a render pass hides the lot with one flag', () => {
    const aids = createViewportAids()
    aids.apply(
      new Map([['a', meshWithNormals()]]),
      ['a'],
      { boundingBoxes: 'all', origins: true, normals: true, normalLength: 0.2 },
      PALETTE,
      NO_RIG,
    )

    expect(aids.object.children.length).toBeGreaterThan(2)
    expect(aids.object.children.every(child => child.parent === aids.object)).toBe(true)
  })

  it('gives every helper back when it is disposed of', () => {
    const aids = createViewportAids()
    aids.apply(
      new Map([['a', meshWithNormals()]]),
      ['a'],
      { boundingBoxes: 'all', origins: true, normals: true, normalLength: 0.2 },
      PALETTE,
      NO_RIG,
    )
    aids.dispose()

    expect(aids.object.children).toHaveLength(0)
  })

  // A box is decoration: left in the ray it would take every click meant for what it wraps — and
  // a line is met within a whole world unit of itself, so the halo would be the size of the box.
  it('takes its helpers out of the raycaster', () => {
    const aids = createViewportAids()
    const boxed = new Mesh(new BufferGeometry())
    aids.apply(new Map([['a', boxed]]), [], { ...OFF, boundingBoxes: 'all' }, PALETTE, NO_RIG)

    const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1))

    expect(ray.intersectObject(aids.object, true)).toEqual([])
  })
})

/**
 * 🛑 The one thing drawn from a COMPONENT rather than from a geometry. A walking body is the two
 * figures the physics reads — `characters.capsuleOf` — and no node's shape carries them.
 */
describe('the cage a walking body wears', () => {
  const BODY = bodied(new Map([['a', { height: 1.8, radius: 0.3 }]]))

  /** A matrix no case should ever read — `?? ` here would otherwise pass a missing cage. */
  const MISSED = new Matrix4().setPosition(999, 999, 999)

  it('is drawn without anything being switched on', () => {
    const aids = createViewportAids()

    aids.apply(new Map([['a', new Object3D()]]), [], OFF, PALETTE, BODY)

    expect(aids.object.children).toHaveLength(1)
    expect(aids.idle()).toBe(false)
  })

  /**
   * 🛑 Nothing recomposes the chain here, and that is the whole case: the renderer writes the
   * LOCAL transforms and calls `apply` straight after, while `matrixWorld` is only recomposed at
   * the draw — measured on the player module, whose cage took the identity and, both updates
   * being off, stayed there. A case that recomposed the chain itself stayed green throughout.
   */
  it('stands where the node stands, chain unrecomposed, and follows it', () => {
    const module = new Object3D()
    module.position.set(0, 0, 10)
    const walker = new Object3D()
    walker.position.set(0, 0.9, 0)
    module.add(walker)

    const aids = createViewportAids()
    aids.apply(new Map([['a', walker]]), [], OFF, PALETTE, BODY)
    const placed = new Vector3().setFromMatrixPosition(
      aids.object.children[0]?.matrixWorld ?? MISSED,
    )
    expect(placed.y).toBeCloseTo(0.9)
    expect(placed.z).toBeCloseTo(10)

    module.position.set(4, 0, 10)
    aids.refreshBoxes()

    const moved = new Vector3().setFromMatrixPosition(
      aids.object.children[0]?.matrixWorld ?? MISSED,
    )
    expect(moved.x).toBeCloseTo(4)
    expect(moved.y).toBeCloseTo(0.9)
    expect(moved.z).toBeCloseTo(10)
  })

  /** Rebuilt on a change of FIGURE alone: `apply` runs on every selection and every drag frame. */
  it('is kept across an apply that changes neither figure', () => {
    const walker = new Object3D()
    const aids = createViewportAids()
    aids.apply(new Map([['a', walker]]), [], OFF, PALETTE, BODY)
    const first = aids.object.children[0]

    aids.apply(new Map([['a', walker]]), ['a'], OFF, PALETTE, BODY)

    expect(aids.object.children[0]).toBe(first)
  })

  it('is rebuilt when the controller is retuned', () => {
    const walker = new Object3D()
    const aids = createViewportAids()
    aids.apply(new Map([['a', walker]]), [], OFF, PALETTE, BODY)
    const first = aids.object.children[0]

    aids.apply(
      new Map([['a', walker]]),
      [],
      OFF,
      PALETTE,
      bodied(new Map([['a', { height: 2, radius: 0.3 }]])),
    )

    expect(aids.object.children[0]).not.toBe(first)
  })

  it('goes away with the node it outlined', () => {
    const aids = createViewportAids()
    aids.apply(new Map([['a', new Object3D()]]), [], OFF, PALETTE, BODY)

    aids.apply(new Map(), [], OFF, PALETTE, NO_RIG)

    expect(aids.object.children).toHaveLength(0)
  })
})

/**
 * 🛑 Drawn from a COMPONENT as well, and it is the only way to SEE an arm at all: nothing places
 * the camera until the scene plays, so the editor showed one standing at its parent's feet.
 */
describe('the arm a camera hangs on', () => {
  const RIG: AidRigs = {
    bodies: new Map(),
    arms: new Map([
      ['arm', { subjectId: 'a', lift: { x: 0, y: 1.6, z: 0 }, back: { x: 0, y: 0, z: 4 } }],
    ]),
  }

  /**
   * The two ENDS of the drawn arm, in world — what the eye actually reads off the screen. Read
   * off the bounding box rather than off two vertices: the arm is a solid, since `linewidth` is
   * ignored by WebGL and a one-pixel line was the thing nobody could see.
   */
  const spans = (aids: ReturnType<typeof createViewportAids>): [Vector3, Vector3] => {
    const drawn = aids.object.children[0]
    if (!drawn) throw new Error('no arm drawn')

    const box = new Box3().setFromObject(drawn)
    // The rig runs +y and +z from the body, so the low corner is the body and the high the seat.
    return [box.min.clone(), box.max.clone()]
  }

  /**
   * 🛑 From the body up to the camera's LENS, not to the camera's own point: the beam leaves
   * where the shot does. An arm drawn from the pivot ran level, four metres up in mid-air, and
   * read as a stray edge joined to neither end.
   */
  it('reaches from the body it watches to the lens that watches it', () => {
    const walker = new Object3D()
    walker.position.set(0, 0.9, 0)
    const aids = createViewportAids()

    aids.apply(new Map([['a', walker]]), [], OFF, PALETTE, RIG)
    const [body, seat] = spans(aids)

    expect(body.z).toBeCloseTo(0, 1)
    expect(body.y).toBeCloseTo(0.9, 1)

    // The seat is (0, 2.5, 4); the beam stops one lens short of it, along its own line.
    const reach = Math.hypot(1.6, 4)
    const short = (reach - CAMERA_LENS_REACH) / reach
    expect(seat.y).toBeCloseTo(0.9 + 1.6 * short, 1)
    expect(seat.z).toBeCloseTo(4 * short, 1)
  })

  it('paints the beam through, which is what tells it from a rod', () => {
    const walker = new Object3D()
    const aids = createViewportAids()

    aids.apply(new Map([['a', walker]]), [], OFF, PALETTE, RIG)
    const beam = aids.object.children[0]
    const paint = beam instanceof Mesh ? beam.material : null

    expect(paint instanceof MeshBasicMaterial && paint.transparent).toBe(true)
    expect(paint instanceof MeshBasicMaterial ? paint.opacity : 1).toBeLessThan(1)
  })

  /** The same trap the cage fell into: nothing recomposes the chain before an aid is drawn. */
  it('follows the body it hangs off, chain unrecomposed', () => {
    const module = new Object3D()
    const walker = new Object3D()
    walker.position.set(0, 0.9, 0)
    module.add(walker)
    const aids = createViewportAids()
    aids.apply(new Map([['a', walker]]), [], OFF, PALETTE, RIG)

    module.position.set(5, 0, 0)
    aids.refreshBoxes()

    expect(spans(aids)[0].x).toBeCloseTo(5, 1)
  })

  it('draws nothing for an arm whose body is not on stage', () => {
    const aids = createViewportAids()

    aids.apply(new Map(), [], OFF, PALETTE, RIG)

    expect(aids.object.children).toHaveLength(0)
  })

  it('goes away with the arm it drew', () => {
    const aids = createViewportAids()
    aids.apply(new Map([['a', new Object3D()]]), [], OFF, PALETTE, RIG)

    aids.apply(new Map([['a', new Object3D()]]), [], OFF, PALETTE, NO_RIG)

    expect(aids.object.children).toHaveLength(0)
  })
})
