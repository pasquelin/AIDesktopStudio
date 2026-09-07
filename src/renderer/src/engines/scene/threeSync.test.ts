import {
  AmbientLight,
  type BufferGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
  SpriteMaterial,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { geometryFor } from './threeFactory'
import { DEFAULT_MATERIAL } from './sceneState'
import {
  wearGeometry,
  applyLight,
  applyMaterial,
  applyNegative,
  unmarkTools,
  applySprite,
  standardMaterialOf,
  tiledGeometry,
} from './threeSync'

describe('applyNegative', () => {
  const painted = (negative: boolean): MeshStandardMaterial => {
    const material = new MeshStandardMaterial()
    applyMaterial(material, { ...DEFAULT_MATERIAL, color: '#00ff00' }, '')
    applyNegative(material, '#ff715b', negative)
    return material
  }

  /** Roblox's look for a tool: seen through, and not wearing the paint it will be cut with. */
  it('shows a marked shape red and translucent', () => {
    const material = painted(true)

    expect(material.color.getHexString()).toBe('ff715b')
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBeLessThan(1)
  })

  // Or a tool standing in front of the matter would hide it rather than show through it.
  it('lets a marked shape be seen through by whatever stands behind it', () => {
    expect(painted(true).depthWrite).toBe(false)
  })

  /** Taking the mark off has to give the shape its own paint back, opaque, in the same pass. */
  it('leaves an unmarked shape exactly as its descriptor asked', () => {
    const material = painted(false)

    expect(material.color.getHexString()).toBe('00ff00')
    expect(material.transparent).toBe(false)
    expect(material.opacity).toBe(1)
    expect(material.depthWrite).toBe(true)
  })
})

describe('unmarkTools', () => {
  /**
   * The export SHARES its materials — `placedCopy` says so — so a mark left on one shipped a red,
   * 45 %-opaque cube into every `.glb`. A mark is an editing role, not a finish.
   */
  it('gives an exported copy back the paint the mark was covering', () => {
    const material = new MeshStandardMaterial()
    applyMaterial(material, { ...DEFAULT_MATERIAL, color: '#00ff00' }, '')
    applyNegative(material, '#ff715b', true)
    const mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material)

    unmarkTools(mesh)
    const worn = standardMaterialOf(mesh)

    expect(worn?.color.getHexString()).toBe('00ff00')
    expect(worn?.transparent).toBe(false)
    expect(worn?.opacity).toBe(1)
    // The one on screen keeps its mark: the copy is what travels, and the viewport is not it.
    expect(material.color.getHexString()).toBe('ff715b')
  })

  it('leaves a shape that carries no mark exactly as it was', () => {
    const material = new MeshStandardMaterial()
    applyMaterial(material, { ...DEFAULT_MATERIAL, color: '#00ff00' }, '')
    const mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material)

    unmarkTools(mesh)
    expect(mesh.material).toBe(material)
  })
})

describe('applyMaterial', () => {
  it('writes the descriptor into the material it was given', () => {
    const material = new MeshStandardMaterial()

    applyMaterial(
      material,
      { ...DEFAULT_MATERIAL, color: '#ff0000', roughness: 0.25, metalness: 0.5 },
      '',
    )

    expect(material.color.getHexString()).toBe('ff0000')
    expect(material.roughness).toBe(0.25)
    expect(material.metalness).toBe(0.5)
  })

  // Replacing it would compile a shader program per pointer move of a roughness slider.
  it('keeps the same material instance', () => {
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material)

    applyMaterial(material, DEFAULT_MATERIAL, '#868a91')

    expect(mesh.material).toBe(material)
  })

  it('falls back to the studio colour when the descriptor carries none', () => {
    const material = new MeshStandardMaterial()

    applyMaterial(material, DEFAULT_MATERIAL, '#868a91')

    expect(material.color.getHexString()).toBe('868a91')
  })

  // The palette is only readable once a canvas is in the document, so it can legitimately be
  // empty — and `Color.set('')` throws.
  it('leaves the colour alone when neither the descriptor nor the palette has one', () => {
    const material = new MeshStandardMaterial()
    material.color.set('#123456')

    applyMaterial(material, DEFAULT_MATERIAL, '')

    expect(material.color.getHexString()).toBe('123456')
  })
})

describe('applySprite', () => {
  const sprite = { color: '#ff0000', opacity: 1, map: null }

  it('writes the descriptor into the material it was given', () => {
    const material = new SpriteMaterial()

    applySprite(material, sprite, '#123456')

    expect(material.color.getHexString()).toBe('ff0000')
    expect(material.opacity).toBe(1)
  })

  it('falls back to the studio colour when the descriptor carries none', () => {
    const material = new SpriteMaterial()

    applySprite(material, { ...sprite, color: null }, '#00ff00')

    expect(material.color.getHexString()).toBe('00ff00')
  })

  it('fades the sprite', () => {
    const material = new SpriteMaterial()

    applySprite(material, { ...sprite, opacity: 0.5 }, '#123456')

    expect(material.opacity).toBe(0.5)
  })

  // Switched off at full opacity, every picture with an alpha channel would draw its whole quad.
  it('leaves the material transparent, whatever the opacity says', () => {
    const material = new SpriteMaterial()

    applySprite(material, sprite, '#123456')

    expect(material.transparent).toBe(true)
  })
})

describe('wearGeometry', () => {
  const box = (width: number): BufferGeometry =>
    geometryFor({ kind: 'box', width, height: 1, depth: 1 })

  it('puts the mesh on the shape it is given', () => {
    const mesh = new Mesh(box(1))
    const next = box(2)

    wearGeometry(mesh, next)

    expect(mesh.geometry).toBe(next)
  })

  it('hands back the shape it took off, rather than disposing it', () => {
    const worn = box(1)
    const mesh = new Mesh(worn)
    const dispose = vi.spyOn(worn, 'dispose')

    // The caller frees it: only it knows which cache lent it, and disposing one the cache still
    // lends empties every other node of that shape.
    expect(wearGeometry(mesh, box(2))).toBe(worn)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('says nothing was taken off when the mesh already wore that shape', () => {
    const worn = box(1)

    expect(wearGeometry(new Mesh(worn), worn)).toBeNull()
  })
})

/**
 * The maps repeat at a DENSITY, not a count: one number over UVs that run 0..1 whatever a face
 * measures gave a forty-metre band and the sixteen-metre one beside it two different textures,
 * which is what sent this batch back. The repeat rides on the UVs and not on the texture,
 * because the engine shares one `Texture` between every mesh asking for the same picture.
 */
describe('tiledGeometry', () => {
  const spanOf = (geometry: BufferGeometry): { u: number; v: number } => {
    const uv = geometry.attributes.uv
    if (!uv) return { u: Number.NaN, v: Number.NaN }

    const us: number[] = []
    const vs: number[] = []
    for (let at = 0; at < uv.count; at += 1) {
      us.push(uv.getX(at))
      vs.push(uv.getY(at))
    }
    return { u: Math.max(...us) - Math.min(...us), v: Math.max(...vs) - Math.min(...vs) }
  }

  it('puts one square per metre down each side of a face, however oblong', () => {
    const span = spanOf(tiledGeometry({ kind: 'plane', width: 40, height: 16 }, 1))

    expect(span.u).toBeCloseTo(40)
    expect(span.v).toBeCloseTo(16)
  })

  it('gives two faces of different shapes squares of the same size', () => {
    const wide = spanOf(tiledGeometry({ kind: 'plane', width: 40, height: 16 }, 1))
    const narrow = spanOf(tiledGeometry({ kind: 'plane', width: 16, height: 8 }, 1))

    expect(wide.u / 40).toBeCloseTo(narrow.u / 16)
    expect(wide.v / 16).toBeCloseTo(narrow.v / 8)
  })

  it('reads the density as squares per metre', () => {
    const span = spanOf(tiledGeometry({ kind: 'plane', width: 10, height: 10 }, 2.5))

    expect(span.u).toBeCloseTo(25)
  })

  /*
   * The density a picture is asked to FIT at — one over the metres it covers. Textures repeat, so
   * a projection centred on nothing puts 0,5 at the middle of the face: the left half of a plane
   * then shows the right half of the photograph, and no density anywhere makes it whole.
   */
  it('lays a picture down once, whole, at the density that covers the face', () => {
    const uv = tiledGeometry({ kind: 'plane', width: 4, height: 4 }, 0.25).attributes.uv
    const us: number[] = []
    for (let at = 0; at < (uv?.count ?? 0); at += 1) us.push(Number(uv?.getX(at)))

    expect(Math.min(...us)).toBeCloseTo(0)
    expect(Math.max(...us)).toBeCloseTo(1)
  })

  // A surface of revolution keeps its own UVs, scaled: projecting one would seam it all round.
  it('measures a cylinder round its side and down its height', () => {
    const span = spanOf(
      tiledGeometry(
        { kind: 'cylinder', radiusTop: 1, radiusBottom: 1, height: 4, segments: 24 },
        1,
      ),
    )

    expect(span.u).toBeCloseTo(2 * Math.PI)
    expect(span.v).toBeCloseTo(4)
  })

  // A tube's `v` runs ROUND it, not down a bounding box: measured off the box it came back as a
  // height, and the squares on the shipped tube were half the size asked for and not square.
  it('measures a tube round its own section', () => {
    const span = spanOf(
      tiledGeometry({ kind: 'tube', radius: 0.2, tubularSegments: 48, radialSegments: 12 }, 1),
    )

    expect(span.v).toBeCloseTo(2 * Math.PI * 0.2)
  })

  // The one that reaches the screen: a mesh built with a density, not only one edited into it.
  it('is what a mesh is born with, and what a change of density rebuilds', () => {
    const mesh = new Mesh(tiledGeometry({ kind: 'plane', width: 4, height: 4 }, 1))
    expect(spanOf(mesh.geometry).u).toBeCloseTo(4)

    wearGeometry(mesh, tiledGeometry({ kind: 'plane', width: 4, height: 4 }, 2))
    expect(spanOf(mesh.geometry).u).toBeCloseTo(8)
  })
})

describe('applyLight', () => {
  it('writes colour and intensity on an ambient light', () => {
    const light = new AmbientLight()

    applyLight(light, { kind: 'ambient', color: '#00ff00', intensity: 0.4 })

    expect(light.color.getHexString()).toBe('00ff00')
    expect(light.intensity).toBe(0.4)
  })

  it('moves the target of a directional light', () => {
    const light = new DirectionalLight()

    applyLight(light, {
      kind: 'directional',
      color: '#ffffff',
      intensity: 2,
      target: { x: 1, y: -2, z: 3 },
    })

    expect(light.target.position.toArray()).toEqual([1, -2, 3])
  })

  it('writes both halves of a hemisphere light', () => {
    const light = new HemisphereLight()

    applyLight(light, {
      kind: 'hemisphere',
      skyColor: '#00aaff',
      groundColor: '#ffaa00',
      intensity: 0.5,
    })

    expect(light.color.getHexString()).toBe('00aaff')
    expect(light.groundColor.getHexString()).toBe('ffaa00')
  })

  it('writes the falloff of a point light', () => {
    const light = new PointLight()

    applyLight(light, { kind: 'point', color: '#ffffff', intensity: 1, distance: 12, decay: 1.5 })

    expect(light.distance).toBe(12)
    expect(light.decay).toBe(1.5)
    expect(light.shadow.camera.far).toBe(12)
  })

  it('restores the unbounded point light shadow range', () => {
    const light = new PointLight()
    applyLight(light, { kind: 'point', color: '#ffffff', intensity: 1, distance: 12, decay: 2 })

    applyLight(light, { kind: 'point', color: '#ffffff', intensity: 1, distance: 0, decay: 2 })

    expect(light.shadow.camera.far).toBe(500)
  })

  it('keeps a valid shadow range below the point light near plane', () => {
    const light = new PointLight()

    applyLight(light, { kind: 'point', color: '#ffffff', intensity: 1, distance: 0.1, decay: 2 })

    expect(light.shadow.camera.far).toBe(500)
  })

  it('writes the cone of a spot light', () => {
    const light = new SpotLight()

    applyLight(light, {
      kind: 'spot',
      color: '#ffffff',
      intensity: 1,
      distance: 8,
      angle: 0.5,
      penumbra: 0.3,
      decay: 2,
      target: { x: 0, y: -1, z: 0 },
    })

    expect(light.angle).toBe(0.5)
    expect(light.penumbra).toBe(0.3)
    expect(light.target.position.y).toBe(-1)
  })

  // The helper draws from the target's world matrix, which nothing else refreshes before the
  // frame that follows the edit.
  it('refreshes the world matrix of the target it moved', () => {
    const light = new SpotLight()

    applyLight(light, {
      kind: 'spot',
      color: '#ffffff',
      intensity: 1,
      distance: 0,
      angle: 0.1,
      penumbra: 0,
      decay: 2,
      target: { x: 4, y: 0, z: 0 },
    })

    expect(light.target.matrixWorld.elements[12]).toBe(4)
  })

  it('leaves a light alone when the descriptor is for another kind', () => {
    const light = new AmbientLight()

    applyLight(light, { kind: 'point', color: '#ffffff', intensity: 3, distance: 5, decay: 1 })

    expect(light.intensity).toBe(3)
    expect('distance' in light).toBe(false)
  })
})

describe('standardMaterialOf', () => {
  it('hands back the material a mesh was built with', () => {
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(undefined, material)

    expect(standardMaterialOf(mesh)).toBe(material)
  })

  it('refuses an array of materials', () => {
    const mesh = new Mesh(undefined, [new MeshStandardMaterial()])

    expect(standardMaterialOf(mesh)).toBeNull()
  })
})
