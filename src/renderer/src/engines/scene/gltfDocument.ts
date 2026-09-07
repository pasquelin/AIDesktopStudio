/**
 * The scene as glTF holds it — which IS the scene document, not an export beside one.
 *
 * The standard carries the tree, the placements, the cameras and the punctual lights; everything
 * past that rides in the `extras` of the scene, which the format says a reader may ignore.
 *
 * Geometry is NOT baked: a mesh is a named node with its primitive in `extras`. Baking needs the
 * engine, which a save of an unmounted tab has not got — `sceneExport.ts` is what bakes.
 */
import { Color, Euler, Quaternion } from 'three'
import { toRadians } from '@shared/domain/angles'
import {
  DOCUMENT_ID_KEY,
  DOCUMENT_KIND_KEY,
  STUDIO_METADATA_KEY,
  type DocumentKind,
} from '@shared/domain/document'
import {
  GLTF_GENERATOR,
  GLTF_SCENE_STATE,
  GLTF_VERSION,
  gltfDefaultScene,
  gltfForeignAsset,
  gltfForeignExtensions,
  gltfForeignExtras,
  gltfStudioMetadata,
  isGltfDocument,
  KHR_LIGHTS_PUNCTUAL,
  type GltfNode,
  type GltfPunctualLight,
  type GltfVec3,
} from '@shared/domain/gltf'
import { isRecord } from '@shared/guards'
import { isComponentType } from '@shared/domain/componentRegistry'
import { byCodeUnit } from '@shared/text'
import { TEXTURE_SLOTS, type LightDescriptor, type Transform } from '@shared/domain/scene'
import { scenePayload, sceneFromPayload, timelineRowsLost } from './sceneDocument'
import { carriesMaterial, type SceneState } from './sceneState'

type WrittenNode = GltfNode & {
  name: string
  translation?: GltfVec3
  scale?: GltfVec3
  camera?: number
  extensions?: { [KHR_LIGHTS_PUNCTUAL]: { light: number } }
}

type GltfCamera = {
  type: 'perspective'
  name: string
  /** Vertical field of view in RADIANS, where a camera descriptor holds degrees. */
  perspective: { yfov: number; znear: number; zfar: number }
}

/**
 * A light as this studio WRITES one: the domain's shape, with everything it leaves optional filled
 * in. An absent `range` means a light that reaches everywhere, on both sides.
 */
type GltfLight = GltfPunctualLight & {
  name: string
  color: GltfVec3
  intensity: number
  range?: number
  spot?: { innerConeAngle: number; outerConeAngle: number }
}

export type GltfDocumentOptions = {
  documentId: string
  /** Which of the two kinds this container serves. The file name cannot say. */
  documentKind: DocumentKind
  /**
   * Project-relative URL of an asset, or `null` when this window has not been shown the row.
   * Absent, the file names nothing another application can follow — geometry stays unbaked.
   */
  uriOf?: (assetId: string) => string | null
}

/**
 * The scene as a file holds it. The scene's NAME is left to the file layer, which stamps it from
 * the document's title on every write — the same rule the montage follows, and what makes a
 * rename reach the field another application shows.
 */
export function gltfDocumentOf(
  state: SceneState,
  { documentId, documentKind, uriOf }: GltfDocumentOptions,
): unknown {
  const cameras: GltfCamera[] = []
  const lights: GltfLight[] = []
  // Once for the whole scene, never once per node: asking each node which others hang from it is
  // n² comparisons on the thread that draws — measured 18/08 at 27,6 ms for 1 000 nodes and
  // 367 ms for 5 000, against 0,06 and 1,2 this way.
  const childrenOfNode = new Map<string | null, number[]>()
  state.nodes.forEach((node, at) => {
    const siblings = childrenOfNode.get(node.parentId)
    if (siblings) siblings.push(at)
    else childrenOfNode.set(node.parentId, [at])
  })

  const nodes = state.nodes.map(node => {
    const written: WrittenNode = { name: node.name, ...placement(node.transform) }

    const children = childrenOfNode.get(node.id)
    if (children) written.children = children

    if (node.type === 'camera') {
      written.camera = cameras.length
      cameras.push({
        type: 'perspective',
        name: node.name,
        perspective: {
          yfov: toRadians(node.camera.fov),
          znear: node.camera.near,
          zfar: node.camera.far,
        },
      })
    }

    const light = node.type === 'light' ? punctualLight(node.name, node.light) : null
    if (light) {
      written.extensions = { [KHR_LIGHTS_PUNCTUAL]: { light: lights.length } }
      lights.push(light)
    }

    if (node.type === 'model') {
      const uri = uriOf?.(node.model.assetId)
      if (uri) written.extras = { uri }
    }

    return written
  })

  const images = imagesOf(state, uriOf)

  return {
    asset: { version: GLTF_VERSION, generator: GLTF_GENERATOR },
    scene: 0,
    scenes: [
      {
        nodes: childrenOfNode.get(null) ?? [],
        extras: {
          [STUDIO_METADATA_KEY]: {
            [DOCUMENT_ID_KEY]: documentId,
            [DOCUMENT_KIND_KEY]: documentKind,
            [GLTF_SCENE_STATE]: scenePayload(state),
          },
        },
      },
    ],
    nodes,
    ...(images.length > 0 ? { images } : {}),
    ...(cameras.length > 0 ? { cameras } : {}),
    ...(lights.length > 0
      ? {
          extensionsUsed: [KHR_LIGHTS_PUNCTUAL],
          extensions: { [KHR_LIGHTS_PUNCTUAL]: { lights } },
        }
      : {}),
  }
}

function imagesOf(state: SceneState, uriOf: GltfDocumentOptions['uriOf']): { uri: string }[] {
  if (!uriOf) return []

  const seen = new Set<string>()
  const images: { uri: string }[] = []
  for (const assetId of textureAssetIdsOf(state.nodes)) {
    const uri = uriOf(assetId)
    if (!uri || seen.has(uri)) continue
    seen.add(uri)
    images.push({ uri })
  }
  return images
}

/**
 * The scene a saved document holds, in whichever of the two spellings its file was written in —
 * decided by the payload rather than by the extension, so a file renamed by hand opens as what it
 * is. A project holds scenes saved before the studio wrote glTF, and they open unchanged.
 */
export function sceneFromGltf(document: unknown): SceneState {
  if (!isGltfDocument(document)) return sceneFromPayload(document)

  return sceneFromPayload(gltfStudioMetadata(document)[GLTF_SCENE_STATE])
}

/**
 * The root members `gltfDocumentOf` composes. Anything ELSE in a file came from somewhere else —
 * the studio writes no `meshes`, no `accessors` and no `animations` into a scene document.
 */
const COMPOSED = new Set([
  'asset',
  'scene',
  'scenes',
  'nodes',
  'images',
  'cameras',
  'extensionsUsed',
  'extensions',
])

/**
 * What a file holds beyond what a save would write back.
 *
 * **A composed member is not a REPRODUCED member, and reading only the root was the hole** — the
 * same one MaterialX had one layer down. `scenes` is composed and a save writes exactly ONE, so a
 * file holding three came back holding one, silently. Hence the look INSIDE the members that are
 * rewritten from something narrower than themselves.
 */
export function sceneHoldsMore(document: unknown): string[] {
  if (!isGltfDocument(document)) return []
  const held = Object.keys(document).filter(key => !COMPOSED.has(key))

  const scenes = document.scenes
  if (Array.isArray(scenes) && scenes.length > 1) held.push('scenes')

  // A Blender empty is one `nodes` entry and no new root key — count against the extras' own.
  const held3d = gltfStudioMetadata(document)[GLTF_SCENE_STATE]
  const known = isRecord(held3d) && Array.isArray(held3d.nodes) ? held3d.nodes.length : 0
  const written = Array.isArray(document.nodes) ? document.nodes.length : 0
  if (written > known) held.push('nodes')

  held.push(...extraPictures(document, held3d))

  // The default scene's extras are recomposed whole, exactly as the sky's are: a key another
  // application left beside ours there is dropped by the next save.
  held.push(
    ...gltfForeignExtras(gltfDefaultScene(document)?.extras).map(key => `scene.extras.${key}`),
  )
  held.push(...unknownComponents(document))
  held.push(...unknownTimelineRows(document))
  held.push(...skeletonsLeftBehind(document))
  held.push(...gltfForeignAsset(document))
  held.push(...gltfForeignExtensions(document, KHR_LIGHTS_PUNCTUAL))

  return held
}

function extraPictures(document: Record<string, unknown>, held3d: unknown): string[] {
  const written = Array.isArray(document.images) ? document.images.length : 0
  return written > textureAssetIdsIn(held3d).length ? ['images'] : []
}

function textureAssetIdsOf(nodes: SceneState['nodes']): string[] {
  return textureAssetIdsFrom(nodes.filter(carriesMaterial).map(node => node.material))
}

function textureAssetIdsIn(held3d: unknown): string[] {
  if (!isRecord(held3d) || !Array.isArray(held3d.nodes)) return []
  return textureAssetIdsFrom(held3d.nodes.map(node => (isRecord(node) ? node.material : null)))
}

function textureAssetIdsFrom(materials: readonly unknown[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const material of materials) {
    if (!isRecord(material)) continue
    for (const slot of TEXTURE_SLOTS) {
      const ref = material[slot]
      const assetId = isRecord(ref) && typeof ref.assetId === 'string' ? ref.assetId : ''
      if (!assetId || seen.has(assetId)) continue
      seen.add(assetId)
      ids.push(assetId)
    }
  }
  return ids
}

/**
 * The skeletons a scene written before they moved still carries.
 *
 * 🛑 A rig belongs to the model's own file now, and this reader drops the one a node holds. Named
 * here so the save REFUSES rather than writing the loss out — the rule the five other kinds live
 * under, and one a guard on root keys alone cannot see: `rig` sits inside a composed member.
 */
function skeletonsLeftBehind(document: Record<string, unknown>): string[] {
  const held3d = gltfStudioMetadata(document)[GLTF_SCENE_STATE]
  const nodes = isRecord(held3d) && Array.isArray(held3d.nodes) ? held3d.nodes : []
  const rigged = nodes.filter(node => isRecord(node) && isRecord(node.model) && 'rig' in node.model)

  return rigged.length > 0 ? ['nodes.model.rig'] : []
}

/** The timeline rows this build would drop, named `animation.<list>` — see `timelineRowsLost`. */
function unknownTimelineRows(document: Record<string, unknown>): string[] {
  const held3d = gltfStudioMetadata(document)[GLTF_SCENE_STATE]
  const animation = isRecord(held3d) ? held3d.animation : null
  return timelineRowsLost(animation).map(list => `animation.${list}`)
}

/**
 * The component types this build cannot act on, named `components.<Type>`.
 *
 * A scene written by a later build carries components whose behaviour this one has no system for.
 * The loader drops them from the state, so a save would recompose the file WITHOUT them — the same
 * silent loss `sceneHoldsMore` exists to prevent everywhere else.
 */
function unknownComponents(document: Record<string, unknown>): string[] {
  const held3d = gltfStudioMetadata(document)[GLTF_SCENE_STATE]
  const nodes = isRecord(held3d) && Array.isArray(held3d.nodes) ? held3d.nodes : []
  const unknown = new Set<string>()

  for (const node of nodes) {
    if (!isRecord(node) || node.components === undefined) continue

    // Not an array at all — a later build keying them by type, or a hand edit. The reader empties
    // it, so without this the loss would be written back at the first ⌘S without a word.
    if (!Array.isArray(node.components)) {
      unknown.add('')
      continue
    }

    for (const component of node.components) {
      if (!isRecord(component) || typeof component.type !== 'string') continue
      if (!isComponentType(component.type)) unknown.add(component.type)
    }
  }

  // By code unit: these are identifiers a reader compares, not words anyone reads in order. The
  // empty one names the member itself, which is what a shape rather than a list comes to.
  return [...unknown]
    .sort(byCodeUnit)
    .map(type => (type === '' ? 'components' : `components.${type}`))
}

/** Fields at their default are left out. The rotation is Euler here, a quaternion there. */
function placement({ position, rotation, scale }: Transform): Partial<WrittenNode> {
  const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z))

  return {
    ...(position.x || position.y || position.z
      ? { translation: [position.x, position.y, position.z] }
      : {}),
    ...(quaternion.x || quaternion.y || quaternion.z || quaternion.w !== 1
      ? { rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] }
      : {}),
    ...(scale.x !== 1 || scale.y !== 1 || scale.z !== 1
      ? { scale: [scale.x, scale.y, scale.z] }
      : {}),
  }
}

/**
 * Ambient and hemisphere are not punctual, and writing one as a directional would light another
 * application's scene from a direction nobody chose. Both are still in the extras.
 */
function punctualLight(name: string, light: LightDescriptor): GltfLight | null {
  if (light.kind === 'ambient' || light.kind === 'hemisphere') return null

  const color = new Color(light.color)
  const written: GltfLight = {
    type: light.kind,
    name,
    color: [color.r, color.g, color.b],
    intensity: light.intensity,
  }

  if (light.kind === 'directional') return written

  return {
    ...written,
    // Zero means "reaches everywhere" on both sides, and the extension spells that by saying
    // nothing rather than by a zero, which it forbids.
    ...(light.distance > 0 ? { range: light.distance } : {}),
    ...(light.kind === 'spot'
      ? {
          spot: {
            innerConeAngle: light.angle * (1 - light.penumbra),
            outerConeAngle: light.angle,
          },
        }
      : {}),
  }
}
