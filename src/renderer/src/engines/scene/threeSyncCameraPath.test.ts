import {
  AmbientLight,
  CameraHelper,
  BoxGeometry,
  Line,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { bezierPathOf, DEFAULT_PATH, type PathDescriptor } from '@shared/domain/scene'
import { LIGHT_TYPES } from './lightTypes'
import {
  buildPath,
  dressWithRail,
  geometryFor,
  barName,
  handleName,
  handlePartOf,
  knobIndexOf,
  knobName,
  PATH_CURVE_NAME,
  PATH_KNOB_PREFIX,
  sizeKnobFor,
} from './threeFactory'
import {
  applyCamera,
  wearGeometry,
  applyLight,
  applyPath,
  giveSecondUvSet,
  showPathHandles,
  showPathKnobs,
  showRailLine,
} from './threeSync'

describe('a light descriptor handed to a light of another class', () => {
  // Read off the registry rather than typed out: a sixth kind of light is then covered the day
  // it lands, instead of quietly not being.
  const positioned = LIGHT_TYPES.filter(type => type.kind !== 'ambient')

  for (const type of positioned) {
    it(`leaves an ambient light alone when given a ${type.kind} descriptor`, () => {
      const light = new AmbientLight()
      const descriptor = type.create()

      expect(() => applyLight(light, descriptor)).not.toThrow()
      expect(light.intensity).toBe(descriptor.intensity)
    })
  }
})

describe('applyCamera', () => {
  const cameraWithHelper = (): PerspectiveCamera => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000)
    camera.add(new CameraHelper(camera))
    return camera
  }

  it('writes the lens and rebuilds the projection', () => {
    const camera = cameraWithHelper()

    applyCamera(camera, { fov: 90, near: 1, far: 10 })

    expect([camera.fov, camera.near, camera.far]).toEqual([90, 1, 10])
  })

  // The helper reads the projection matrix once: left alone it keeps outlining the old frustum.
  it('updates the frustum drawn from it', () => {
    const camera = cameraWithHelper()
    const helper = camera.children[0]
    if (!(helper instanceof CameraHelper)) throw new Error('the camera wears its helper')
    const update = vi.spyOn(helper, 'update')

    applyCamera(camera, { fov: 90, near: 1, far: 10 })

    expect(update).toHaveBeenCalled()
  })

  /**
   * The outline is what makes a viewport with five cameras unreadable, and the camera it is
   * drawn from is the very one a preview and a film render through — so a shortened reach must
   * not survive the call.
   */
  it('draws a shortened outline without leaving the camera short', () => {
    const camera = cameraWithHelper()
    const helper = camera.children[0]
    if (!(helper instanceof CameraHelper)) throw new Error('the camera wears its helper')
    const seen: number[] = []
    vi.spyOn(helper, 'update').mockImplementation(() => void seen.push(camera.far))

    applyCamera(camera, { fov: 50, near: 0.1, far: 1000 }, 2)

    expect(seen).toEqual([2])
    expect(camera.far).toBe(1000)
  })

  it('never lengthens a frustum past the lens it belongs to', () => {
    const camera = cameraWithHelper()
    const helper = camera.children[0]
    if (!(helper instanceof CameraHelper)) throw new Error('the camera wears its helper')
    const seen: number[] = []
    vi.spyOn(helper, 'update').mockImplementation(() => void seen.push(camera.far))

    applyCamera(camera, { fov: 50, near: 0.1, far: 5 }, 40)

    expect(seen).toEqual([5])
  })
})

describe('dressWithRail', () => {
  const rail = {
    ...DEFAULT_PATH,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  }

  /** A band wears the handles of the rail it is swept along — the mesh itself carries them. */
  it('hangs a line and a knob per point on whatever carries the rail', () => {
    const mesh = dressWithRail(new Mesh(), rail, { knob: '#ffffff' }, true)
    const knobs = mesh.children.filter(child => child.name.startsWith(PATH_KNOB_PREFIX))

    expect(knobs).toHaveLength(3)
    expect(mesh.getObjectByName(PATH_CURVE_NAME)).toBeDefined()
  })

  /**
   * 🛑 Drawn THROUGH the matter for a BAND: a rail hangs in the air, but a band's run lies inside
   * the very surface it shapes — its handles were behind it, and one cannot grab those.
   */
  it('draws a banded rail in front of every surface, and a bare one in its place', () => {
    const depthOf = (object: Object3D | undefined): boolean =>
      object instanceof Mesh && object.material instanceof MeshBasicMaterial
        ? object.material.depthTest
        : true
    const knobOf = (through: boolean): Object3D | undefined =>
      dressWithRail(new Mesh(), rail, { knob: '#ffffff' }, through).children.find(child =>
        child.name.startsWith(PATH_KNOB_PREFIX),
      )

    expect(depthOf(knobOf(true))).toBe(false)
    expect(knobOf(true)?.renderOrder).toBeGreaterThan(0)
    // A rail of its own hangs in the air: seen through everything it would cross the whole set.
    expect(depthOf(knobOf(false))).toBe(true)
  })
})

describe('showPathKnobs', () => {
  /**
   * Only a selected rail hands its points to the gizmo, and a knob per point on every rail is
   * what buries a sequence. The line stays, so an unselected rail can still be clicked.
   */
  it('hides the knobs and leaves the line', () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ]
    const object = buildPath({ ...DEFAULT_PATH, points }, '#ffffff')

    showPathKnobs(object, false)
    expect(
      object.children.filter(child => knobIndexOf(child.name) !== null).map(knob => knob.visible),
    ).toEqual([false, false])
    expect(object.getObjectByName(PATH_CURVE_NAME)?.visible).toBe(true)

    showPathKnobs(object, true)
    expect(
      object.children.filter(child => knobIndexOf(child.name) !== null).map(knob => knob.visible),
    ).toEqual([true, true])
  })
})

describe('applyPath when a run gains an anchor', () => {
  const rail = bezierPathOf(
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    false,
  )

  /**
   * 🛑 A band hangs its aids off its OWN mesh, and any node of the document may be reparented
   * under that mesh from the outliner. Swept whole, the rebuild took the reparented node out of
   * the scene and disposed a geometry the shared cache still counted as alive.
   */
  it('sweeps its own aids away and leaves what the document hung there', () => {
    const band = dressWithRail(new Mesh(), rail, { knob: '#ffffff' }, true)
    const child = new Mesh(new BoxGeometry(1, 1, 1))
    child.name = 'a-node-of-the-document'
    band.add(child)

    applyPath(band, bezierPathOf([...rail.points, { x: 20, y: 0, z: 0 }], false), '#ffffff')

    expect(band.getObjectByName('a-node-of-the-document')).toBe(child)
    expect(child.geometry.getAttribute('position')).toBeDefined()
    expect(band.children.filter(one => knobIndexOf(one.name) !== null)).toHaveLength(3)
  })
})

describe('showPathHandles', () => {
  const rail = bezierPathOf(
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 },
    ],
    false,
  )

  /**
   * 🛑 The pair of the anchor being worked on, and of no other: twenty-four anchors showing their
   * tangents at once is a run nobody can read, and Photoshop shows the one clicked.
   */
  it('shows the tangents of one anchor and hides every other', () => {
    const object = buildPath(rail, '#ffffff')

    showPathHandles(object, 1)
    const shown = object.children.filter(child => child.visible && handlePartOf(child.name))

    expect(shown.map(child => child.name).sort()).toEqual([
      handleName('in', 1),
      handleName('out', 1),
    ])
  })

  /**
   * 🛑 A COLOUR OF ITS OWN, handed in: the anchors wear the mesh token and the tangents another,
   * two things one drags for different reasons not reading as one. Written here as a hex, it
   * would be the one surface of the studio that never follows its palette.
   */
  it('paints the tangents in the colour it is handed, apart from the anchors', () => {
    const object = dressWithRail(
      new Mesh(),
      rail,
      { knob: '#111111', handle: '#e0a350', start: '#3d7ab8' },
      false,
    )
    const colourOf = (name: string): string => {
      const child = object.getObjectByName(name)
      return child instanceof Mesh && child.material instanceof MeshBasicMaterial
        ? `#${child.material.color.getHexString()}`
        : ''
    }

    expect(colourOf(handleName('out', 1))).toBe('#e0a350')
    expect(colourOf(knobName(1))).toBe('#111111')
    // 🛑 And the FIRST anchor apart from the rest: a run of identical dots says nothing about
    // which end it starts from, and a band swept along it has a direction to read.
    expect(colourOf(knobName(0))).toBe('#3d7ab8')
  })

  /** The bar is what makes a tangent readable as a lever: without it, a lone dot in a field. */
  it('ties each tangent to its anchor with a bar', () => {
    const object = buildPath(rail, '#ffffff')
    const bar = object.getObjectByName(barName('out', 1))
    const drawn = bar instanceof Line ? bar.geometry.getAttribute('position') : null

    expect(drawn?.count).toBe(2)
    expect(drawn?.getX(0)).toBeCloseTo(rail.points[1]!.x, 6)
  })

  it('hides them all when no anchor is held', () => {
    const object = buildPath(rail, '#ffffff')

    showPathHandles(object, 1)
    showPathHandles(object, null)

    expect(object.children.filter(child => child.visible && handlePartOf(child.name))).toEqual([])
  })

  /**
   * 🛑 Placed by the BUILD, not only by a later sync: left to the sync, every tangent sat at the
   * rail's own origin until something else changed the shape — a green dot in the middle of a
   * field, and no bar anywhere.
   */
  it('stands each tangent off its own anchor from the moment it is built', () => {
    const object = buildPath(rail, '#ffffff')
    const anchor = rail.points[1]!
    const out = object.getObjectByName(handleName('out', 1))
    const reach = rail.kind === 'bezier' ? rail.handles[1]!.out : { x: 0, y: 0, z: 0 }

    expect(out?.position.x).toBeCloseTo(anchor.x + reach.x, 6)
    expect(out?.position.z).toBeCloseTo(anchor.z + reach.z, 6)
  })
})

describe('showRailLine', () => {
  const rail = bezierPathOf(
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    false,
  )

  /**
   * 🛑 A band is a surface one clicks directly, so its line is an AID: left on, it drew a
   * permanent stripe down the middle of the tarmac, seen through the very cars it was under.
   */
  it('puts a band line away and brings it back', () => {
    const band = dressWithRail(new Mesh(), rail, { knob: '#ffffff' }, true)

    showRailLine(band, false)
    expect(band.getObjectByName(PATH_CURVE_NAME)?.visible).toBe(false)

    showRailLine(band, true)
    expect(band.getObjectByName(PATH_CURVE_NAME)?.visible).toBe(true)
  })
})

describe('a knob about to be drawn', () => {
  const pathOf = (points: PathDescriptor['points']): PathDescriptor => ({
    ...DEFAULT_PATH,
    points,
  })

  /** What the knob's own `onBeforeRender` calls, with the camera about to draw it. */
  const draw = (knob: Object3D, camera: PerspectiveCamera): void => {
    knob.parent?.updateMatrixWorld(true)
    sizeKnobFor(knob, camera)
  }

  const cameraAt = (z: number): PerspectiveCamera => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 0, z)
    return camera
  }

  /**
   * A knob of a fixed size in the SCENE covers five pixels once the view steps back, and a
   * target of five pixels is one nobody hits.
   */
  it('grows with the distance of the camera drawing it, keeping its size on screen', () => {
    const object = buildPath(
      pathOf([
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ]),
      '#ffffff',
    )
    const knob = object.children[1]
    if (!knob) throw new Error('the rail was built without a knob')

    draw(knob, cameraAt(5))
    const near = knob.scale.x

    draw(knob, cameraAt(10))

    expect(knob.scale.x).toBeCloseTo(near * 2, 3)
  })

  // Written into the matrix on the spot: a scale three has already composed for this draw shows
  // up one frame late, which reads as a lag.
  it('carries the size it just took into the matrix it is drawn with', () => {
    const object = buildPath(
      pathOf([
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ]),
      '#ffffff',
    )
    const knob = object.children[1]
    if (!knob) throw new Error('the rail was built without a knob')

    draw(knob, cameraAt(20))

    expect(knob.matrixWorld.elements[0]).toBeCloseTo(knob.scale.x, 5)
  })
})

describe('applyPath', () => {
  const pathOf = (points: PathDescriptor['points']): PathDescriptor => ({
    ...DEFAULT_PATH,
    points,
  })
  const at = (x: number) => ({ x, y: 0, z: 0 })

  it('draws the line and one knob per control point', () => {
    const object = buildPath(pathOf([at(0), at(10)]), '#ffffff')

    expect(object.children.filter(child => knobIndexOf(child.name) !== null)).toHaveLength(2)
    expect(object.getObjectByName(PATH_CURVE_NAME)).toBeDefined()
  })

  it('follows a point that moved without building a knob for it', () => {
    const object = buildPath(pathOf([at(0), at(10)]), '#ffffff')
    // By NAME rather than by position: an anchor carries its two tangents and their bars, so what
    // stands where among the children is not what this is about.
    const knob = object.getObjectByName(knobName(1))

    applyPath(object, pathOf([at(0), at(4)]), '#ffffff')

    expect(object.getObjectByName(knobName(1))).toBe(knob)
    expect(knob?.position.x).toBe(4)
  })

  it('grows a knob for a point added, and drops the one a point taken away had', () => {
    const object = buildPath(pathOf([at(0), at(10)]), '#ffffff')

    applyPath(object, pathOf([at(0), at(5), at(10)]), '#ffffff')
    expect(object.children.filter(child => knobIndexOf(child.name) !== null)).toHaveLength(3)

    applyPath(object, pathOf([at(0), at(10)]), '#ffffff')
    expect(object.children.filter(child => knobIndexOf(child.name) !== null)).toHaveLength(2)
  })
})

// An occlusion map reads the second UV set; without this, nudging a radius would stop it dead.
describe('wearGeometry and the second UV set', () => {
  it('carries it over to the shape that replaces the one that had it', () => {
    const mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }))
    giveSecondUvSet(mesh.geometry)

    wearGeometry(
      mesh,
      geometryFor({ kind: 'sphere', radius: 2, widthSegments: 8, heightSegments: 6 }),
    )

    expect(mesh.geometry.attributes.uv1).toBeDefined()
  })

  it('does not invent one for a shape that never had it', () => {
    const mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }))

    wearGeometry(
      mesh,
      geometryFor({ kind: 'sphere', radius: 2, widthSegments: 8, heightSegments: 6 }),
    )

    expect(mesh.geometry.attributes.uv1).toBeUndefined()
  })
})
