import { Group, Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three'
import type { AnimationClip, BufferGeometry, Skeleton, Texture, WebGLRenderer } from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { materialDefOf, textureSlotsOf } from '@shared/domain/gltf'
import { meshFormatOf, type MeshFormat } from '@shared/domain/meshFormat'
import type { ModelSource } from './modelCache'
import { texturesOf } from './sceneStats'

/**
 * Where the decoders are served from. A folder, not a file: each loader appends the names it
 * knows. `/decoders/` resolves against the page in both worlds — the dev server serves
 * `src/renderer/public/`, a build copies it beside the bundle — and never against the network,
 * which the window policy forbids and the studio promises.
 *
 * Put there by `scripts/copy-decoders.mjs` on postinstall; a checkout that skipped it loads
 * plain `.glb` files and reports a failure for compressed ones, like any unreadable file.
 */
const DECODER_ROOT = './decoders/'
const GLTF_MATERIAL_INDEX = 'gltfMaterialIndex'

export function gltfMaterialIndexOf(material: Material): number | null {
  const index = material.userData[GLTF_MATERIAL_INDEX]
  return typeof index === 'number' ? index : null
}

/**
 * A source and the handle that shuts it down. Both decoders own Web Workers and nothing else can
 * reach them from behind the load function, while an engine is rebuilt on every panel detach —
 * so `dispose` is required, not tidy.
 */
export type GltfSource = {
  load: ModelSource
  parse?: (bytes: ArrayBuffer, url: string) => Promise<Object3D>
  /**
   * A file read for the ANIMATION it carries rather than for its shape, and read whatever format
   * it is in: the studio takes `.glb`, `.gltf` and `.fbx`, and a shipped animation is named by
   * its FOLDER — so nothing says which of the three it is before the bytes arrive.
   */
  loadAnimation: ModelSource
  dispose: () => void
}

/**
 * The one place a `.glb` is turned into objects. Kept apart from the engine so the cache can be
 * driven by a stub under jsdom, which decodes nothing — same reason `TextureSource` exists.
 *
 * Draco squeezes geometry, KTX2 squeezes textures, and both are ordinary in a model downloaded
 * from anywhere: without them such a file fails exactly like a corrupt one.
 *
 * The renderer arrives late on purpose. `KTX2Loader` has to ask the GPU which compressed formats
 * it can actually transcode to, and the viewport has no renderer until it is mounted — while
 * this source is built in the engine's constructor.
 */
export function createGltfSource(
  rendererOf: () => WebGLRenderer | null,
  onFailure: (scope: string, error: unknown) => void = () => undefined,
  decoderRoot = DECODER_ROOT,
): GltfSource {
  const loader = new GLTFLoader()

  const draco = new DRACOLoader().setDecoderPath(`${decoderRoot}draco/`)
  loader.setDRACOLoader(draco)

  const ktx2 = new KTX2Loader().setTranscoderPath(`${decoderRoot}basis/`)
  loader.setKTX2Loader(ktx2)
  // WASM inlined in the module — unlike Draco/KTX2, nothing to fetch at runtime.
  loader.setMeshoptDecoder(MeshoptDecoder)

  let detected = false

  /** The glTF path, which is the only one carrying decoders, textures and a texture count. */
  const gltfOf = async (bytes: ArrayBuffer, url: string): Promise<Object3D> => {
    // Once, and only once there is a GPU to ask: called twice, the loader would rebuild its
    // support table on every model.
    const renderer = detected ? null : rendererOf()
    if (renderer) {
      ktx2.detectSupport(renderer)
      detected = true
    }

    const gltf = await loader.parseAsync(bytes, baseOf(url))
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return
      const materials: Material[] = Array.isArray(object.material)
        ? object.material
        : [object.material]
      for (const material of materials) {
        const index = gltf.parser.associations.get(material)?.materials
        if (index !== undefined) material.userData[GLTF_MATERIAL_INDEX] = index
      }
    })
    // Carried on the root rather than returned beside it: `Object3D.animations` is where three
    // itself keeps them, and the cache hands one object back. Dropping them here is what left
    // every model Scenario animates standing still, with nothing said.
    gltf.scene.animations = gltf.animations

    const { missing, declared } = unresolvedTextures(gltf)
    // A count, not a sentence: the scope carries the translated line the user reads, and this
    // detail rides beside it exactly as an SDK message would.
    if (missing > 0) onFailure(url, new Error(`${missing}/${declared}`))

    return gltf.scene
  }

  const parse = async (bytes: ArrayBuffer, url: string): Promise<Object3D> => {
    // Routed by the BYTES, never by the name: an asset reaches this side as `ia-studio://asset/<id>`
    // and an animation as `ia-studio://animation/walk` — neither spells an extension, and this side
    // holds no catalogue to ask.
    const format = meshFormatOf(new Uint8Array(bytes))
    if (format === 'gltf' || format === null) return gltfOf(bytes, url)
    return parseWith(format, bytes, url)
  }

  return {
    load: async url => parse(await bytesOf(url), url),
    parse,
    loadAnimation: async url => parse(await bytesOf(url), url),
    // `KTX2Loader` counts live instances: an undisposed one makes the next engine warn about itself.
    dispose: () => {
      draco.dispose()
      ktx2.dispose()
    },
  }
}

async function bytesOf(url: string): Promise<ArrayBuffer> {
  const answer = await fetch(url)
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`)
  return answer.arrayBuffer()
}

/** What `GLTFLoader.load` resolves a file's siblings against — its own url, up to the last slash. */
const baseOf = (url: string): string => url.slice(0, url.lastIndexOf('/') + 1)

/** Geometry alone is not a scene: three's two geometry loaders hand one back, unlit and unnamed. */
const meshOf = (geometry: BufferGeometry): Object3D =>
  new Mesh(geometry, new MeshStandardMaterial())

/**
 * Every format but glTF, each parser loaded only when a file actually is one: together they are
 * some 400 Ko, and all but one of them is rare in a project.
 */
async function parseWith(format: Exclude<MeshFormat, 'gltf'>, bytes: ArrayBuffer, url: string) {
  const text = (): string => new TextDecoder().decode(bytes)

  switch (format) {
    case 'fbx':
      return new (await import('three/addons/loaders/FBXLoader.js')).FBXLoader().parse(bytes, url)
    case 'obj':
      // No `.mtl`: an OBJ names its materials in a file beside it, which the asset scheme does not
      // serve — the shapes arrive, dressed in the default the loader gives them.
      return new (await import('three/addons/loaders/OBJLoader.js')).OBJLoader().parse(text())
    case 'ply':
      return meshOf(
        new (await import('three/addons/loaders/PLYLoader.js')).PLYLoader().parse(bytes),
      )
    case 'stl':
      return meshOf(
        new (await import('three/addons/loaders/STLLoader.js')).STLLoader().parse(bytes),
      )
    case 'collada': {
      const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js')
      // `null` for a document its parser could not make a scene of, where the others throw.
      const collada = new ColladaLoader().parse(text(), baseOf(url))
      if (!collada) throw new Error(`${url} is not a Collada document this build can read`)
      return collada.scene
    }
    case 'usd': {
      // `USDLoader`, not the `USDZLoader` every example written before r179 names: that one is a
      // deprecated alias, and constructing it warns on the console at every model.
      const { USDLoader } = await import('three/addons/loaders/USDLoader.js')
      return new USDLoader().parse(bytes, baseOf(url))
    }
    case 'bvh': {
      const { BVHLoader } = await import('three/addons/loaders/BVHLoader.js')
      return bvhRootOf(new BVHLoader().parse(text()))
    }
  }
}

/**
 * A BVH is a skeleton and one clip, and nothing to hang them on: the root bone becomes the
 * object's child so that the exporter and the scene see an ordinary hierarchy. The clip's tracks
 * name their bones the way three's own `.bones[Name]` spelling does; `PropertyBinding` resolves
 * that against the bone's name, which is why nothing is renamed here.
 */
function bvhRootOf(parsed: { skeleton: Skeleton; clip: AnimationClip }): Object3D {
  const root = new Group()
  const first = parsed.skeleton.bones[0]
  if (first) root.add(first)
  root.animations = [parsed.clip]
  return root
}

/**
 * The textures the file asks the scene's materials to wear, against the ones they got.
 *
 * `GLTFLoader` resolves a texture it could not read to `null` and carries on. The model then
 * lands whole, white, and SILENT — which is exactly how a window policy refusing the loader its
 * own blob went unnoticed until the pixels were measured. Counted so the studio can say it.
 *
 * READ, never asked for: `parser.getDependency('texture', i)` LOADS an index the parse never
 * wanted — a texture no material references would be decoded here, on the UI thread, for a
 * picture nothing will show and nothing will dispose. Both sides are compared as they stand.
 *
 * Only the materials that reached the scene are judged, and only the slots this build can read:
 * an unknown extension is a texture left uncounted, never a failure invented.
 */
function unresolvedTextures(gltf: GLTF): { missing: number; declared: number } {
  const { parser } = gltf
  const wanted = new Set<number>()
  const attached = new Set<Texture>()

  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh)) return

    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material]

    for (const material of materials) {
      const index = parser.associations.get(material)?.materials
      if (index !== undefined) {
        // The same reading of a glTF material the extraction uses, from the one module that
        // knows the rule: spelt twice, the two would answer differently the day one is edited.
        for (const { index: texture } of textureSlotsOf(materialDefOf(parser.json, index))) {
          wanted.add(texture)
        }
      }
      for (const texture of texturesOf(material)) attached.add(texture)
    }
  })

  return { missing: Math.max(0, wanted.size - attached.size), declared: wanted.size }
}
