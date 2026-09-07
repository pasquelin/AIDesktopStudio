import {
  BatchedMesh,
  BufferGeometry,
  BoxGeometry,
  InstancedMesh,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Texture,
} from 'three'
import { describe, expect, it } from 'vitest'
import { MARKER_NAME } from './markerPaint'
import { densityOf, EMPTY_STATS, geometryBytesOf, statsOf, totalStats } from './sceneStats'

function texturedMaterial(width: number, height: number): MeshStandardMaterial {
  const material = new MeshStandardMaterial()
  const texture = new Texture()
  // jsdom decodes no image; what the count reads is the size, which a plain object carries.
  texture.image = { width, height }
  material.map = texture
  return material
}

describe('statsOf', () => {
  it('counts shared interleaved storage once and includes morph buffers', () => {
    const geometry = new BufferGeometry()
    const interleaved = new InterleavedBuffer(new Float32Array(12), 6)
    geometry.setAttribute('position', new InterleavedBufferAttribute(interleaved, 3, 0))
    geometry.setAttribute('normal', new InterleavedBufferAttribute(interleaved, 3, 3))
    geometry.morphAttributes.position = [
      new InterleavedBufferAttribute(new InterleavedBuffer(new Float32Array(6), 3), 3, 0),
    ]

    expect(geometryBytesOf([new Mesh(geometry, new MeshStandardMaterial())])).toBe(18 * 4)
  })

  it('counts a cube through its index rather than its positions', () => {
    const cube = new Mesh(new BoxGeometry(), new MeshStandardMaterial())

    const stats = statsOf([cube])

    // A box is 24 vertices and 36 indices: 12 triangles, two per face.
    expect(stats.triangles).toBe(12)
    expect(stats.vertices).toBe(24)
    expect(stats.draws).toBe(1)
  })

  it('counts a shared geometry once, and each mesh that draws it as its own call', () => {
    const geometry = new BoxGeometry()
    const first = new Mesh(geometry, new MeshStandardMaterial())
    const second = new Mesh(geometry, new MeshStandardMaterial())

    const stats = statsOf([first, second])

    expect(stats.triangles).toBe(12)
    expect(stats.draws).toBe(2)
  })

  it('counts a shared texture once', () => {
    const material = texturedMaterial(256, 256)
    const first = new Mesh(new BoxGeometry(), material)
    const second = new Mesh(new PlaneGeometry(), material)

    expect(statsOf([first, second]).textureBytes).toBe(256 * 256 * 4)
  })

  /**
   * A marker is an aid, not content: a scene holding five lamps and no object at all reported
   * 2 304 triangles, which is the number somebody reads to judge how heavy their MODEL is.
   */
  it('leaves out the markers a lamp or a camera is drawn as', () => {
    const light = new Object3D()
    const body = new Object3D()
    body.name = MARKER_NAME
    body.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
    light.add(body)

    expect(statsOf([light])).toEqual(EMPTY_STATS)
  })

  it('leaves out what is hidden', () => {
    const cube = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    cube.visible = false

    expect(statsOf([cube])).toEqual(EMPTY_STATS)
  })

  it('walks children, since a model arrives as a tree', () => {
    const root = new Object3D()
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))

    expect(statsOf([root]).draws).toBe(2)
  })

  /**
   * The renderer hands the object of EVERY node, and a node hanging from another is already
   * inside its parent's — so it arrived twice. The three deduped counts hid it; `draws` did not,
   * and a cube parented under a group reported two draw calls for one mesh.
   */
  it('counts a mesh once, however many ways the caller reaches it', () => {
    const root = new Object3D()
    const child = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    root.add(child)

    expect(statsOf([root, child]).draws).toBe(1)
  })

  it('skips what a caller has already counted elsewhere', () => {
    const geometry = new BoxGeometry()
    const seen = { geometries: new Set<unknown>([geometry]), textures: new Set<unknown>() }

    const stats = statsOf([new Mesh(geometry, new MeshStandardMaterial())], seen)

    // The draw still counts — it is a second call — but the buffer is not counted twice.
    expect(stats.triangles).toBe(0)
    expect(stats.draws).toBe(1)
  })

  it('counts nothing for a texture whose image never landed', () => {
    const material = new MeshStandardMaterial()
    material.map = new Texture()

    expect(statsOf([new Mesh(new BoxGeometry(), material)]).textureBytes).toBe(0)
  })
})

describe('densityOf', () => {
  it('reads a small crowded object as denser than a large plain one', () => {
    const small = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial())
    const large = new Mesh(new BoxGeometry(10, 10, 10), new MeshStandardMaterial())

    expect(densityOf(small)).toBeGreaterThan(densityOf(large))
  })

  it('answers zero for something that carries no triangle at all', () => {
    expect(densityOf(new Object3D())).toBe(0)
  })

  it('gives a flat surface its triangles rather than a division by zero', () => {
    const plane = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial())
    plane.scale.set(1, 1, 0)

    expect(Number.isFinite(densityOf(plane))).toBe(true)
    expect(densityOf(plane)).toBeGreaterThan(0)
  })
})

describe('totalStats', () => {
  it('adds up what each part holds', () => {
    const total = totalStats([
      { triangles: 12, vertices: 24, draws: 1, textureBytes: 100 },
      { triangles: 2, vertices: 4, draws: 1, textureBytes: 0 },
    ])

    expect(total).toEqual({ triangles: 14, vertices: 28, draws: 2, textureBytes: 100 })
  })

  it('adds up nothing to nothing', () => {
    expect(totalStats([])).toEqual(EMPTY_STATS)
  })

  it('counts every copy an instance draws, not the one shape it holds', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const lone = densityOf(new Mesh(geometry, new MeshStandardMaterial()))

    const many = new InstancedMesh(geometry, new MeshStandardMaterial(), 8)
    for (let at = 0; at < 8; at += 1) {
      many.setMatrixAt(at, new Matrix4().makeTranslation(at * 2, 0, 0))
    }
    many.instanceMatrix.needsUpdate = true

    // Its box spans every copy while its geometry is one: read as a lone cube, the most crowded
    // thing on screen came out at the coolest step of the density ramp.
    expect(densityOf(many)).toBeGreaterThan(0)
    expect(densityOf(many)).toBeLessThan(lone)
  })

  it('counts every copy a lot draws, for the same reason', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const lone = densityOf(new Mesh(geometry, new MeshStandardMaterial()))

    const lot = new BatchedMesh(8, 8 * 24, 8 * 36, new MeshStandardMaterial())
    const shape = lot.addGeometry(geometry)
    for (let at = 0; at < 8; at += 1) {
      lot.setMatrixAt(lot.addInstance(shape), new Matrix4().makeTranslation(at * 2, 0, 0))
    }

    expect(densityOf(lot)).toBeGreaterThan(0)
    expect(densityOf(lot)).toBeLessThan(lone)
  })
})
