import type { Object3D } from 'three'
import type { SmoothPath } from '@shared/domain/scene'
import {
  BoxGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type ColorSpace,
} from 'three'
import {
  DEFAULT_CAMERA,
  DEFAULT_PATH,
  type CameraDescriptor,
  type LightDescriptor,
  type TextDescriptor,
} from '@shared/domain/scene'
import type { Bounds } from './rigFit'
import type { RigState } from './rigState'
import type { PictureOrientation, TextureCache } from './textureCache'
import {
  DEFAULT_MATERIAL,
  DEFAULT_SPRITE,
  DEFAULT_TEXT,
  shadowDefaults,
  IDENTITY_TRANSFORM,
  type CameraNode,
  type LightNode,
  type MeshNode,
  type ModelNode,
  type PathNode,
  type SceneNode,
  type SpriteNode,
  type TextNode,
} from './sceneState'

/**
 * Scene nodes for tests. Declared once so a new required field on `SceneNodeBase` breaks in one
 * place rather than in every suite that builds a node by hand. Narrowed rather than `SceneNode`:
 * a test that dresses a mesh needs its material to exist.
 */
export function meshNode(id: string, parentId: string | null = null): MeshNode {
  return {
    id,
    parentId,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'mesh' }),
    type: 'mesh',
    geometry: { kind: 'box', width: 1, height: 1, depth: 1 },
    material: DEFAULT_MATERIAL,
  }
}

/** What a walk of the tree actually meets — a source a group draws for is not in it. */
export function walked(root: Object3D): Object3D[] {
  const met: Object3D[] = []
  root.traverse(child => met.push(child))
  return met
}

/** A transform others hang from — what makes a body a CHILD rather than a root of the scene. */
export function groupNodeFixture(id: string, parentId: string | null = null): SceneNode {
  return {
    id,
    parentId,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'group' }),
    type: 'group',
  }
}

/** Nothing but shapes, for the benches that measure what a node COUNT costs. */
export function meshNodes(count: number): MeshNode[] {
  return Array.from({ length: count }, (_unused, index) => meshNode(`node_${index}`))
}

/** The one light kind that builds a helper and a target beside itself. */
export function directionalLight(id: string): LightNode {
  return lightNodeFixture(id, {
    kind: 'directional',
    color: '#ffffff',
    intensity: 1,
    target: { x: 0, y: 0, z: 0 },
  })
}

export function lightNodeFixture(
  id: string,
  light: LightDescriptor = { kind: 'ambient', color: '#222222', intensity: 1 },
): LightNode {
  return {
    id,
    parentId: null,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'light', light }),
    type: 'light',
    light,
  }
}

export function spriteNodeFixture(id: string, map: string | null = null): SpriteNode {
  return {
    id,
    parentId: null,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'sprite' }),
    type: 'sprite',
    sprite: { ...DEFAULT_SPRITE, map: map === null ? null : { assetId: map } },
  }
}

export function textNodeFixture(id: string, text: Partial<TextDescriptor> = {}): TextNode {
  return {
    id,
    parentId: null,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'text' }),
    type: 'text',
    text: { ...DEFAULT_TEXT, ...text },
    material: DEFAULT_MATERIAL,
  }
}

export function cameraNodeFixture(id: string, camera: Partial<CameraDescriptor> = {}): CameraNode {
  return {
    id,
    parentId: null,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'camera' }),
    type: 'camera',
    camera: { ...DEFAULT_CAMERA, ...camera },
  }
}

/** Typed on the smooth rail alone: a Bézier one is handed in whole, `bezierPathOf` making it. */
export function pathNodeFixture(id: string, path: Partial<SmoothPath> = {}): PathNode {
  return {
    id,
    parentId: null,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'path' }),
    type: 'path',
    path: { ...DEFAULT_PATH, ...path },
  }
}

export function modelNodeFixture(id: string, assetId = 'asset-1'): ModelNode {
  return {
    id,
    parentId: null,
    name: id,
    visible: true,
    transform: IDENTITY_TRANSFORM,
    ...shadowDefaults({ type: 'model' }),
    type: 'model',
    model: { assetId },
  }
}

/**
 * What the engine would report for a model carrying these bones, in one chain.
 *
 * For the suites that only care that a rig HAS bones — a bone picker, a track on one — and that
 * would otherwise each spell a whole `RigState` of their own.
 */
/** A standing figure of ordinary proportions, for a suite that is not testing the shape. */
const STANDING_BOUNDS: Bounds = {
  min: { x: -0.3, y: 0, z: -0.2 },
  max: { x: 0.3, y: 1.8, z: 0.2 },
}

export function rigStateFixture(names: readonly string[]): RigState {
  const rigged = names.length > 0
  const bones = names.map((name, index) => ({ name, parent: names[index - 1] ?? null }))

  return {
    status: rigged ? 'skinnedMesh' : 'staticMesh',
    bones,
    boneNames: [...names],
    boneCount: names.length,
    // Nothing once there are bones, which is what the engine answers.
    bounds: rigged ? null : STANDING_BOUNDS,
    // Empty rather than absent for a bare mesh: a fit with no point to read leaves the joints
    // where the proportions put them, which is what a suite not testing the shape wants.
    points: rigged ? null : new Float32Array(),
  }
}

/**
 * A texture cache whose loads the test settles by hand, so arrival order is what is under test —
 * which is what every suite around a `TextureBinding` is really about.
 */
export function scriptedTextureCache() {
  const pending = new Map<string, (texture: Texture | null) => void>()
  const acquired: string[] = []
  const released: string[] = []
  const spaces = new Map<string, ColorSpace>()
  /** Which way up each slot asked for its picture — `from-image` for a model's own maps. */
  const orientations = new Map<string, PictureOrientation>()
  /** What the catalogue would say each asset was last written at — set by the test that cares. */
  const versions = new Map<string, string>()

  const cache: TextureCache = {
    acquire: (assetId, colorSpace, _version, orientation = 'flipY') => {
      acquired.push(assetId)
      spaces.set(assetId, colorSpace)
      orientations.set(assetId, orientation)
      return new Promise(resolve => pending.set(assetId, resolve))
    },
    release: assetId => {
      released.push(assetId)
    },
    versionOf: assetId => versions.get(assetId),
    dispose: () => {},
  }

  return {
    cache,
    acquired,
    released,
    spaces,
    orientations,
    versions,
    settle: async (assetId: string, texture: Texture | null = new Texture()) => {
      pending.get(assetId)?.(texture)
      await Promise.resolve()
      return texture
    },
  }
}

/** A `.gltf` node as a file lists it — the two fields an export test reads. */
export type GltfNode = { name?: string; children?: number[] }

/** The nodes of the scene a renderer exports, in the order the file lists them. */
export async function gltfNodesOf(renderer: {
  exportTo: (format: 'gltf', scope: 'scene') => Promise<Uint8Array>
}): Promise<GltfNode[]> {
  const file = new TextDecoder().decode(await renderer.exportTo('gltf', 'scene'))
  // `as`: a `.gltf` file holds glTF, and `nodes` is the field this reads.
  return (JSON.parse(file) as { nodes?: GltfNode[] }).nodes ?? []
}

/** A mesh carrying the morph targets named, the way `GLTFLoader` hands one back. */
export function morphedMesh(...names: string[]): Mesh {
  const geometry = new BoxGeometry()
  geometry.morphAttributes.position = names.map(
    () =>
      new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3),
  )
  const mesh = new Mesh(geometry, new MeshStandardMaterial())
  mesh.updateMorphTargets()
  mesh.morphTargetDictionary = Object.fromEntries(names.map((name, index) => [name, index]))
  return mesh
}
