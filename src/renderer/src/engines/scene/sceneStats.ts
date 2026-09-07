import {
  type BufferGeometry,
  BatchedMesh,
  Box3,
  InstancedMesh,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import { DRAWN_TRIANGLES } from './grouping'
import { MARKER_NAME } from './markerPaint'

/**
 * What a model costs, counted off the geometry rather than off a drawn frame.
 *
 * `renderer.info` answers for the LAST frame — what was in the frustum, at that instant, for that
 * camera. A budget is a property of the model: the triangles it carries do not stop existing when
 * the camera turns away. Counted here so the number is the same in four views as in one.
 */
export type SceneStats = {
  triangles: number
  vertices: number
  /** Distinct geometries, which is what a draw call costs at best — instancing aside. */
  draws: number
  /** Bytes the textures occupy once decoded, uncompressed and without mipmaps. */
  textureBytes: number
}

export const EMPTY_STATS: SceneStats = { triangles: 0, vertices: 0, draws: 0, textureBytes: 0 }

/** Four bytes per texel: RGBA8, which is what an uncompressed upload costs on the GPU. */
const BYTES_PER_TEXEL = 4

/**
 * Counts a subtree, sharing nothing twice.
 *
 * Geometries and textures are counted per distinct object, not per mesh: ten cubes sharing one
 * box carry one box's triangles on the GPU, and a count that added them ten times would send
 * someone optimising a model that is already fine.
 *
 * The studio's own primitives share a shape since `geometryCache`, so this reading now covers
 * them too: five hundred identical cubes report one cube's triangles and five hundred draws.
 * Before, only a model's clones were shared and the two halves of the overlay disagreed.
 */
export function statsOf(
  objects: Iterable<Object3D>,
  seen: { geometries?: Set<unknown>; textures?: Set<unknown> } = {},
): SceneStats {
  const geometries = seen.geometries ?? new Set<unknown>()
  const textures = seen.textures ?? new Set<unknown>()
  const stats = { ...EMPTY_STATS }
  // A caller hands the object of every node AND each of those holds its children, so a node
  // hanging from another arrived twice: `draws` counted it twice, the deduped three did not.
  const met = new Set<Object3D>()

  const count = (child: Object3D): void => {
    // Walked by hand rather than by `traverse`: a marker is a whole subtree to step over, and
    // `traverse` offers no way to stop at one. Visibility still gates the MESH alone, as before.
    if (child.name === MARKER_NAME || met.has(child)) return
    met.add(child)

    if (child instanceof Mesh && child.visible) {
      const geometry = child.geometry
      if (!geometries.has(geometry)) {
        geometries.add(geometry)
        stats.vertices += vertexCount(geometry)
        stats.triangles += triangleCount(geometry)
      }
      // Counted per mesh, unlike the buffers: two meshes sharing a geometry are still two draws.
      stats.draws += 1

      for (const material of materialsOf(child)) {
        for (const texture of texturesOf(material)) {
          if (textures.has(texture)) continue
          textures.add(texture)
          stats.textureBytes += textureBytesOf(texture)
        }
      }
    }

    for (const grandchild of child.children) count(grandchild)
  }

  for (const object of objects) count(object)

  return stats
}

type CountableGeometry = {
  index: { count: number } | null
  attributes: { position?: { count: number } }
}

function vertexCount(geometry: CountableGeometry): number {
  return geometry.attributes.position?.count ?? 0
}

function triangleCount(geometry: CountableGeometry): number {
  // The index is what the GPU actually draws through when there is one: a cube is 8 vertices and
  // 36 indices, and counting its positions would report a third of its triangles.
  const drawn = geometry.index?.count ?? vertexCount(geometry)
  return Math.floor(drawn / 3)
}

function materialsOf(mesh: Mesh): readonly Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Every map a standard material may carry. Read off the object: a `Material` declares none. */
export function texturesOf(material: Material): Texture[] {
  const found: Texture[] = []
  for (const value of Object.values(material)) {
    if (isTexture(value)) found.push(value)
  }
  return found
}

function isTexture(value: unknown): value is Texture {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'isTexture') === true
}

export function textureBytesOf(texture: Texture): number {
  const image: unknown = texture.image
  if (typeof image !== 'object' || image === null) return 0

  const width = Reflect.get(image, 'width')
  const height = Reflect.get(image, 'height')
  if (typeof width !== 'number' || typeof height !== 'number') return 0

  return width * height * BYTES_PER_TEXEL
}

/**
 * Every buffer a geometry holds, each once. 🛑 The ONE place that answers it: the optimization
 * report used to keep its own version without `morphAttributes`, so a morphed mesh weighed less
 * there than in the runtime profile — two figures for one geometry, shown to the same person.
 */
export function geometryArraysOf(geometry: BufferGeometry): ArrayBufferView[] {
  const arrays = new Set<ArrayBufferView>()
  if (geometry.index) arrays.add(geometry.index.array)
  for (const name of Object.keys(geometry.attributes)) arrays.add(geometry.getAttribute(name).array)
  for (const morphed of Object.values(geometry.morphAttributes))
    for (const attribute of morphed ?? []) arrays.add(attribute.array)
  return [...arrays]
}

export function geometryBytesOf(objects: Iterable<Object3D>): number {
  const geometries = new Set<unknown>()
  const arrays = new Set<unknown>()
  let bytes = 0
  for (const object of objects) {
    object.traverse(child => {
      if (!(child instanceof Mesh) || geometries.has(child.geometry)) return
      geometries.add(child.geometry)
      for (const array of geometryArraysOf(child.geometry)) {
        if (arrays.has(array)) continue
        arrays.add(array)
        bytes += array.byteLength
      }
    })
  }
  return bytes
}

/**
 * How tightly a mesh packs its triangles: triangles per unit of surface of the box around it.
 *
 * A box rather than the real surface — a real area means walking every triangle, which is the
 * work this number exists to avoid. It is a comparison between the objects of one scene, never
 * an absolute: what it answers is "which of these is the heavy one".
 */
export function densityOf(object: Object3D): number {
  // An instance holds ONE geometry and draws it `count` times, while its box spans every copy:
  // counted once against that box, a thousand cubes read as empty space and the density view
  // painted the most crowded thing on screen at the coolest step of its ramp.
  const triangles = drawnTrianglesOf(object)
  if (triangles === 0) return 0

  // A lot places its copies by matrix, so the box below reads one shape unless the lot has
  // measured itself. Measured once, then held.
  if (object instanceof BatchedMesh && !object.boundingBox) object.computeBoundingBox()

  const size = new Box3().setFromObject(object).getSize(new Vector3())
  const area = 2 * (size.x * size.y + size.y * size.z + size.z * size.x)
  // A flat plane and a point both enclose nothing; their triangles are all the answer there is.
  return area === 0 ? triangles : triangles / area
}

/** Adds up what several counts hold, for a scene read object by object. */
export function totalStats(parts: readonly SceneStats[]): SceneStats {
  return parts.reduce(
    (total, part) => ({
      triangles: total.triangles + part.triangles,
      vertices: total.vertices + part.vertices,
      draws: total.draws + part.draws,
      textureBytes: total.textureBytes + part.textureBytes,
    }),
    { ...EMPTY_STATS },
  )
}

/**
 * Whether two readings say the same thing. Read by the viewport, which is handed one on every
 * `apply` — and a running game applies sixty times a second.
 */
export function sameStats(one: SceneStats, other: SceneStats): boolean {
  return (
    one.triangles === other.triangles &&
    one.vertices === other.vertices &&
    one.draws === other.draws &&
    one.textureBytes === other.textureBytes
  )
}

/**
 * The triangles an object actually DRAWS. An instance draws its one shape `count` times; a lot
 * says what it draws, its buffer holding one copy of each shape and reserved room besides.
 */
function drawnTrianglesOf(object: Object3D): number {
  if (object instanceof BatchedMesh) {
    const written = object.userData[DRAWN_TRIANGLES]
    return typeof written === 'number' ? written : statsOf([object]).triangles
  }
  const stats = statsOf([object])
  return object instanceof InstancedMesh ? stats.triangles * object.count : stats.triangles
}
