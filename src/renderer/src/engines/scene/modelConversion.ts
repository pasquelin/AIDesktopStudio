import { localizedError } from '@shared/localizedError'
import {
  LoadingManager,
  Line,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Points,
  Scene,
  type Material,
  type Object3D,
} from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { documentReferencesOf, mtlPathsBeside } from '@shared/domain/documentReferences'
import type { MeshFormat } from '@shared/domain/meshFormat'
import {
  convertedTypeOf,
  type ConvertibleType,
  type MeshImportLoss,
} from '@shared/domain/meshImport'
import { parseMeshBytes } from './gltfSource'
import { clipsIn } from './sceneExport'

/**
 * A 3D file that is not a `.glb`, turned into one — once, on arrival, on the UI thread.
 *
 * On the UI thread and not in a worker, measured rather than chosen: every loader here reads its
 * textures through `TextureLoader`, which needs an `<img>`, and a worker has none. The viewport
 * already parses these formats here at every load; this is the same cost paid one last time.
 */
export type ConvertedModel = {
  glb: Uint8Array
  /** The folder's role, corrected by what the file holds — see `convertedTypeOf`. */
  type: ConvertibleType
  losses: readonly MeshImportLoss[]
}

export type ConversionPorts = {
  /** A neighbour's text — the `.mtl` an OBJ names — or `null` when there is none to read. */
  readText: (url: string) => Promise<string | null>
  /** How long the pictures may take before the file is written without the late ones. */
  textureTimeoutMs?: number
}

const TEXTURE_TIMEOUT_MS = 60_000

/** Callbacks before the parse, wait after: a long FBX would otherwise trip the texture timeout. */
function picturesOf(manager: LoadingManager): { wait: (timeoutMs: number) => Promise<number> } {
  let started = 0
  let failed = 0
  let finished = false
  manager.onStart = () => {
    started += 1
  }
  manager.onError = () => {
    failed += 1
  }
  manager.onLoad = () => {
    finished = true
  }
  return {
    wait: timeoutMs =>
      new Promise(resolve => {
        const done = (): void => resolve(failed)
        if (started === 0 || finished) {
          done()
          return
        }
        const late = setTimeout(() => {
          failed += 1
          done()
        }, timeoutMs)
        manager.onLoad = () => {
          clearTimeout(late)
          done()
        }
      }),
  }
}

function materialsOf(root: Object3D): Material[] {
  const found: Material[] = []
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    found.push(...(Array.isArray(object.material) ? object.material : [object.material]))
  })
  return found
}

function geometryCountOf(root: Object3D): number {
  let count = 0
  root.traverse(object => {
    if (
      (object instanceof Mesh || object instanceof Line || object instanceof Points) &&
      object.geometry.hasAttribute('position')
    ) {
      count += 1
    }
  })
  return count
}

/** The libraries an OBJ names, read beside it and parsed as one material catalogue. */
async function materialsFor(
  text: string,
  baseUrl: string,
  manager: LoadingManager,
  ports: ConversionPorts,
) {
  const libraries = documentReferencesOf('obj', text)
  const texts: string[] = []
  let missing = false
  for (const library of libraries) {
    const material = await ports.readText(`${baseUrl}${library}`)
    if (material === null) missing = true
    else texts.push(mtlPathsBeside(material, library))
  }
  if (texts.length === 0) return { materials: null, missing: libraries.length > 0 }
  const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js')
  const materials = new MTLLoader(manager).setResourcePath(baseUrl).parse(texts.join('\n'), baseUrl)
  materials.preload()
  return { materials, missing }
}

async function parsed(
  format: MeshFormat,
  bytes: ArrayBuffer,
  baseUrl: string,
  manager: LoadingManager,
  ports: ConversionPorts,
): Promise<{ root: Object3D; losses: MeshImportLoss[] }> {
  if (format === 'gltf') {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
    const gltf = await new GLTFLoader(manager).parseAsync(bytes, baseUrl)
    gltf.scene.animations = gltf.animations
    return { root: gltf.scene, losses: [] }
  }
  if (format !== 'obj') {
    const root = await parseMeshBytes(format, bytes, `${baseUrl}model`, manager)
    return { root, losses: format === 'stl' || format === 'ply' ? ['materials'] : [] }
  }
  const text = new TextDecoder().decode(bytes)
  const loaded = await materialsFor(text, baseUrl, manager, ports)
  const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js')
  const loader = new OBJLoader(manager)
  if (loaded.materials) loader.setMaterials(loaded.materials)
  return {
    root: loader.parse(text),
    losses: loaded.materials && !loaded.missing ? [] : ['materials'],
  }
}

/**
 * The bytes of a 3D file, as the `.glb` they become.
 *
 * `baseUrl` is the folder the file's neighbours are served from, slash included: what the import
 * kept under `.sources`. `filed` is the role the folder gave the row, which the content corrects.
 */
export async function convertModelToGlb(
  bytes: ArrayBuffer,
  baseUrl: string,
  filed: ConvertibleType,
  format: MeshFormat,
  ports: ConversionPorts,
): Promise<ConvertedModel> {
  const manager = new LoadingManager()
  const pictures = picturesOf(manager)
  const { root, losses } = await parsed(format, bytes, baseUrl, manager, ports)
  if ((await pictures.wait(ports.textureTimeoutMs ?? TEXTURE_TIMEOUT_MS)) > 0) {
    losses.push('textures')
  }

  // `GLTFExporter` writes any other material as an approximation, and says so on the console —
  // said here instead, on the row, where the person can read it. Not on top of `materials`:
  // a default the loader invented is not the file's shading.
  const approximated = materialsOf(root).some(
    material =>
      !(material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial),
  )
  if (approximated && !losses.includes('materials')) losses.push('shading')

  const clips = clipsIn([root])
  const geometryCount = geometryCountOf(root)
  if (format !== 'gltf' && geometryCount === 0 && clips.length === 0) {
    throw localizedError('modelConversionUnsupported')
  }
  const scene = new Scene()
  scene.add(root)
  const exporter = new GLTFExporter()
  // Everything the file holds, seen or not: a hidden part is still the person's model.
  const written = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    animations: clips,
  })
  if (!(written instanceof ArrayBuffer)) throw localizedError('binaryGltfMissing')

  return {
    glb: new Uint8Array(written),
    type: convertedTypeOf(filed, { meshes: geometryCount, clips: clips.length }),
    losses: [...new Set(losses)],
  }
}
