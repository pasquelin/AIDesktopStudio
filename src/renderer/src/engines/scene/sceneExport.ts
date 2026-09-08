import { localizedError } from '@shared/localizedError'
import {
  DirectionalLight,
  type AnimationClip,
  Object3D,
  Scene,
  SpotLight,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { decompress } from 'three/addons/utils/WebGLTextureUtils.js'
import type { ExportFormat } from '@shared/domain/scene'
import { OVERLAY_NAME } from './sceneView'
import { MARKER_NAME } from './markerPaint'
import { unmarkTools } from './threeSync'

/**
 * A scene on its way out of the studio.
 *
 * What is exported is the objects the document describes, and nothing else: the grid, the
 * trihedron, the gizmo and the light helpers are siblings of the nodes in the viewport rather
 * than children of one, so handing over the node objects leaves them behind by construction.
 *
 * Copies are handed over rather than the objects themselves. Three reasons, all of them ones a
 * file would otherwise show: the exporters write a *local* transform, so a selected child would
 * land where it sits inside its parent rather than where it sits in the scene; `USDZExporter`
 * takes a single root, and gathering several under one would mean pulling them out of the
 * viewport mid-export; and the wireframe overlay is the one thing that really is a child of a
 * mesh, so it is dropped from the copy instead of hidden in the original.
 */

/**
 * How a compressed texture becomes one an exporter can write. Neither format holds a GPU
 * compression scheme, and neither exporter skips what it cannot write — both throw, losing the
 * whole file over a picture. KTX2 is wired into the model loader, so an imported model wearing
 * one is ordinary rather than exotic.
 */
export type TextureDecoder = { decompress: (texture: Texture) => Texture }

type OwnedDecoder = TextureDecoder & { dispose: () => void }

/**
 * One renderer for the whole export rather than one per texture.
 *
 * Handed no renderer, `decompress` builds a `WebGLRenderer` and destroys it again on every
 * single call — and it is called per map slot, so a model wearing four compressed maps opened
 * and lost four GPU contexts. A browser hands out about sixteen and evicts the OLDEST when it
 * runs short, so what goes black is a viewport somebody was looking at.
 *
 * Its own, never the viewport's: `decompress` calls `setSize` on whatever it is given, and would
 * resize the canvas being looked at. Built lazily — an export with no compressed texture, which
 * is nearly all of them, must not open a context to find that out.
 */
function ownedDecoder(): OwnedDecoder {
  let renderer: WebGLRenderer | null = null

  return {
    decompress: texture => {
      renderer ??= new WebGLRenderer({ antialias: false })
      return decompress(texture, Infinity, renderer)
    },
    dispose: () => {
      if (!renderer) return
      renderer.dispose()
      // `dispose` frees three's own objects; the context itself only goes with this.
      renderer.forceContextLoss()
      renderer = null
    },
  }
}

export type ExportOptions = {
  /**
   * What the document calls a node, read by the id its object carries. Without it a file names
   * its meshes with UUIDs — the picking identity, which is the studio's business and nobody
   * else's.
   */
  nameOf?: (id: string) => string | undefined
  /** Injected by the tests: jsdom has no WebGL, so nothing can decode a compressed texture. */
  decoder?: TextureDecoder
  /**
   * The document's own animation, built from the COPIES — the file holds those, not the objects
   * on screen. Called before the copies are renamed, so each still wears the node id.
   *
   * The clips a loaded model brought are not asked for here: they ride on the objects themselves
   * and `clone` carries them over, so they are collected from the copies directly.
   */
  clipsFor?: (copies: readonly Object3D[]) => AnimationClip[]
  /**
   * Where a node stands in the DOCUMENT, read by the id its object carries. A node rebuilt after
   * an undo hangs last under its parent, so without this a file lists it out of order — a noisy
   * diff for whoever versions their scenes. What it does not rank comes after, in its own order.
   */
  rankOf?: (id: string) => number | undefined
  /**
   * What the file carries of the studio's own, written on the SCENE — `GLTFLoader` hands
   * `scenes[i].extras` back as `scene.userData`, and reads nothing of the root's.
   *
   * glTF only: the other three formats reserve no place for a reader to ignore.
   */
  extras?: Record<string, unknown>
}

/** The clips the copied models brought with them, gathered wherever they hang in the subtree. */
export function clipsIn(roots: readonly Object3D[]): AnimationClip[] {
  const found: AnimationClip[] = []
  for (const root of roots) root.traverse(child => found.push(...child.animations))

  return found
}

export async function exportObjects(
  objects: readonly Object3D[],
  format: ExportFormat,
  { nameOf, decoder, clipsFor, rankOf, extras }: ExportOptions = {},
): Promise<Uint8Array> {
  // Said rather than written: both exporters default to `onlyVisible`, so a hidden node used to
  // produce a valid, empty file — and nothing on screen distinguished that from a success.
  if (objects.length > 0 && objects.every(object => !object.visible)) {
    throw localizedError('exportNothingVisible')
  }

  const owned = decoder ? null : ownedDecoder()

  try {
    const roots = objects.map(object => placedCopy(object))
    if (rankOf) {
      roots.sort(byRank(rankOf))
      for (const root of roots) root.traverse(child => child.children.sort(byRank(rankOf)))
    }
    // BEFORE the rename, which is what lets a caller find a node by the id it still wears. The
    // baked clips name their objects by uuid, so renaming afterwards cannot unbind them.
    const animations = [...clipsIn(roots), ...(clipsFor?.(roots) ?? [])]
    if (nameOf) for (const root of roots) rename(root, nameOf)

    return await write(roots, format, decoder ?? owned ?? ownedDecoder(), animations, extras)
  } finally {
    owned?.dispose()
  }
}

function write(
  roots: readonly Object3D[],
  format: ExportFormat,
  decoder: TextureDecoder,
  animations: readonly AnimationClip[],
  extras?: Record<string, unknown>,
): Promise<Uint8Array> {
  if (format === 'glb' || format === 'gltf')
    return toGltf(roots, format, decoder, animations, extras)
  if (format !== 'usdz') return toShapes(oneScene(roots), format)

  const exporter = new USDZExporter()
  exporter.setTextureUtils(decoder)

  return exporter.parseAsync(oneScene(roots))
}

/**
 * Geometry, and geometry alone. Binary in all three: an ASCII mesh is some four times the bytes
 * for the same triangles, and every reader of these formats takes both.
 *
 * Loaded on demand, as the loaders are — a project exports a `.glb` a hundred times for each of
 * these, and together they are 30 Ko nobody else needs.
 */
async function toShapes(
  root: Object3D,
  format: Extract<ExportFormat, 'obj' | 'ply' | 'stl'>,
): Promise<Uint8Array> {
  if (format === 'obj') {
    // The one that has no binary spelling at all: OBJ is a text format and nothing else.
    const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js')
    return new TextEncoder().encode(new OBJExporter().parse(root))
  }

  if (format === 'ply') {
    const { PLYExporter } = await import('three/addons/exporters/PLYExporter.js')
    // The RETURN value, never the callback: `parse` schedules `onDone` through
    // `requestAnimationFrame`, which a hidden window never runs — and it returns before scheduling
    // anything at all when it refuses a mesh. Waiting on the callback hung both ways.
    const parsed: unknown = new PLYExporter().parse(root, () => {}, { binary: true })
    if (!(parsed instanceof ArrayBuffer)) throw localizedError('plyExportEmpty')
    return new Uint8Array(parsed)
  }

  const { STLExporter } = await import('three/addons/exporters/STLExporter.js')
  const view = new STLExporter().parse(root, { binary: true })
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

/**
 * A copy standing where the original stands in the world. Geometries and materials are shared
 * rather than duplicated — `clone` keeps the references — so the copy costs objects, not buffers.
 */
export function placedCopy(object: Object3D): Object3D {
  // `SkeletonUtils.clone` rather than `clone`: `SkinnedMesh.copy` keeps the ORIGINAL's skeleton,
  // whose bones live outside the copied subtree. glTF then writes `"joints":[null,null]` — a file
  // no viewer opens — and this one call rebinds each copied mesh onto the copied bones.
  const copy = cloneSkinned(object)

  object.updateWorldMatrix(true, false)
  object.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale)
  aimAtTarget(object, copy)
  // `clone` carried the original's `matrix` over, and decomposing writes the three components
  // beside it rather than through it. `USDZExporter` reads that matrix and never refreshes it,
  // so without this the placement above reaches glTF — which does refresh — and nothing else.
  copy.updateMatrix()

  dropOverlays(copy)
  // The tool mark is an editing role, not a finish — and the copy SHARES its materials, so
  // without this a shape marked Negate shipped red at 45 % into the file. Same rule as the
  // overlays above: what only the viewport needed does not travel.
  unmarkTools(copy)
  return copy
}

/**
 * A directional or spot light points at a target that is a SIBLING of the nodes, so it never
 * travels with the copy and the light lands in the file aimed down its default axis. glTF has no
 * target at all — `KHR_lights_punctual` reads the node's own −Z — and three says as much on the
 * way out: "make light.target a child of the light with position 0,0,-1".
 *
 * So the copy is turned to look where the original looked, and given a target of its own there.
 */
function aimAtTarget(object: Object3D, copy: Object3D): void {
  if (!(object instanceof DirectionalLight) && !(object instanceof SpotLight)) return
  if (!(copy instanceof DirectionalLight) && !(copy instanceof SpotLight)) return

  object.target.updateWorldMatrix(true, false)
  // `lookAt` on a light aims its −Z, which is the axis the exporters read.
  copy.lookAt(new Vector3().setFromMatrixPosition(object.target.matrixWorld))

  copy.target = new Object3D()
  copy.target.position.set(0, 0, -1)
  copy.add(copy.target)
}

/** Document order for what is ranked; what is not keeps its own order, after. Stable. */
const byRank =
  (rankOf: (id: string) => number | undefined) =>
  (one: Object3D, other: Object3D): number =>
    (rankOf(one.name) ?? Infinity) - (rankOf(other.name) ?? Infinity)

/**
 * The name the document gave a node, in place of the id its object wears. That id is the picking
 * identity — `nodeIdOf` reads it back off a hit — so it cannot be changed in the viewport, and a
 * file full of UUIDs is what came out of exporting the objects as they stand.
 */
function rename(root: Object3D, nameOf: (id: string) => string | undefined): void {
  root.traverse(child => {
    const name = nameOf(child.name)
    if (name) child.name = name
  })
}

/**
 * The wireframe overlay, and the bodies a camera and a lamp are drawn as. Both are workshop
 * furniture hung under the very nodes being handed over: left in, a file would carry a camera
 * shaped like a camera and a bulb where a lamp is.
 */
function dropOverlays(object: Object3D): void {
  // Collected first: removing a child mid-walk would skip the one that takes its place.
  const overlays: Object3D[] = []
  object.traverse(child => {
    if (child.name === OVERLAY_NAME || child.name === MARKER_NAME) overlays.push(child)
  })

  for (const overlay of overlays) overlay.removeFromParent()
}

/**
 * The one container all four exporters take, and the only one that adds no node: `GLTFExporter`
 * and `USDZExporter` both test `isScene` and write a scene's CHILDREN, where a `Group` becomes
 * one more `Xform` in the file. Pushed rather than added, so no copy's `parent` moves.
 *
 * It is also what makes `animations` mean what it says: that option is read flat for ONE input
 * and per input beyond, so several roots and a flat list wrote nothing at all — measured 20/08 on
 * a `.gltf` of eight roots, which Unreal 5.8.1 imported with no `AnimSequence`.
 */
function oneScene(roots: readonly Object3D[], extras?: Record<string, unknown>): Scene {
  const scene = new Scene()
  scene.children.push(...roots)
  // `serializeUserData` writes this to the scene's `extras`, which is where `glbSkin` puts the
  // studio's own too — one place per file, whichever side wrote it.
  if (extras) scene.userData = extras
  return scene
}

async function toGltf(
  roots: readonly Object3D[],
  format: Exclude<ExportFormat, 'usdz'>,
  decoder: TextureDecoder,
  animations: readonly AnimationClip[],
  extras?: Record<string, unknown>,
): Promise<Uint8Array> {
  const binary = format === 'glb'
  const exporter = new GLTFExporter()
  exporter.setTextureUtils(decoder)

  // `animations` is passed rather than left out, and that is the whole point of this option: the
  // exporter writes NOTHING of an animation it was not handed — a scene animated in the studio,
  // and a model that arrived animated, both left as still poses.
  const result = await exporter.parseAsync(oneScene(roots, extras), {
    binary,
    animations: [...animations],
  })

  if (result instanceof ArrayBuffer) return new Uint8Array(result)
  // `.gltf` is JSON, and what a text file holds is its bytes: the encoding is the writer's, and
  // the writer is the main process.
  return new TextEncoder().encode(JSON.stringify(result))
}
