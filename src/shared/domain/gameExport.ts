import type { AnimationGraphModule } from './animationGraph'
import type { CsgGraph } from './csg'
import type { GeometryDescriptor } from './geometry'
import type { InputMap } from './inputMap'
import type { RenderPolicy } from './renderPolicy'

/**
 * What an exported game ships beside its page, and the one thing its writer and its reader both
 * read. The writer is the main process, the reader is the page: neither parses the other's code.
 */
export const EXPORTED_GAME_VERSION = 1

/** Named rather than spelled twice: the page fetches it, the writer writes it. */
export const EXPORTED_GAME_FILE = 'game.json'

export type GeometrySimplification = 'off' | 'conservative' | 'balanced' | 'aggressive'
export const GEOMETRY_SIMPLIFICATIONS: readonly GeometrySimplification[] = [
  'off',
  'conservative',
  'balanced',
  'aggressive',
]

export type TextureReduction = 'off' | 'half' | 'quarter'
export const TEXTURE_REDUCTIONS: readonly TextureReduction[] = ['off', 'half', 'quarter']

export type TextureCompression = 'off' | 'conservative' | 'balanced' | 'aggressive'
export const TEXTURE_COMPRESSIONS: readonly TextureCompression[] = [
  'off',
  'conservative',
  'balanced',
  'aggressive',
]

/** Lossy choices are absent by default and never inferred from a SAFE optimization request. */
export type LossyOptimization = {
  generateLods: boolean
  geometrySimplification: GeometrySimplification
  textureReduction: TextureReduction
  textureCompression: TextureCompression
}

export const NO_LOSSY_OPTIMIZATION: LossyOptimization = Object.freeze({
  generateLods: false,
  geometrySimplification: 'off',
  textureReduction: 'off',
  textureCompression: 'off',
})

export function hasVisualChanges(options: LossyOptimization | undefined): boolean {
  return (
    options !== undefined &&
    (options.generateLods ||
      options.geometrySimplification !== 'off' ||
      options.textureReduction !== 'off' ||
      options.textureCompression !== 'off')
  )
}

/**
 * What an export does to every game, whatever the caller asks — the list the dialogue reads its
 * rows off, so a step gained or lost by the exporter cannot leave the window saying otherwise.
 * Each name is the last part of a `game.export.*` label key.
 */
export const SAFE_EXPORT_STEPS: readonly string[] = [
  'safeRuntime',
  'instancing',
  'batching',
  'deduplication',
  'geometryBuffers',
  'losslessCompression',
  'removeUnused',
]

export type ExportedScene = {
  /** The document id, which every reference of a scene already carries. */
  id: string
  /** What a person calls it — and what `game.scene.load` may name it by. */
  title: string
  /** Where the glTF sits, relative to the page. */
  file: string
  /** SAFE storage compression; decoded before the glTF parser sees the bytes. */
  compression?: 'gzip'
  /** Runtime-only geometry plan compiled from the authoring scene before it crossed IPC. */
  optimization?: CompiledSceneOptimization
}

export type CompiledNodeGeometry = {
  nodeId: string
  geometry?: GeometryDescriptor
  carved?: CsgGraph
  lodGeometries?: readonly GeometryDescriptor[]
  lodCarved?: readonly CsgGraph[]
  mesh?: CompiledMeshGeometry
  lodMeshes?: readonly CompiledMeshGeometry[]
  modelAssetId?: string
}

/** Tight runtime buffers encoded once during export, never recomputed by the shipped game. */
export type CompiledMeshGeometry = {
  encoding: 'float32-base64'
  indexEncoding?: 'uint16-base64' | 'uint32-base64'
  position: string
  normal: string
  uv: string
  index?: string
  tangent?: string
  color?: string
}

export type CompiledModelMesh = {
  meshIndex: number
  geometry?: CompiledMeshGeometry
  /** Distant levels only: the loaded model remains exact LOD0. */
  lodMeshes?: readonly CompiledMeshGeometry[]
}

/**
 * One STOREY, on purpose: the model plans are a dictionary of the project, named once beside the
 * game rather than repeated under each scene — a second copy per scene would have said nothing
 * about which of the two the reader obeys.
 */
export type CompiledSceneOptimization = {
  nodes: readonly CompiledNodeGeometry[]
}

export type ExportedScript = {
  /** The reference a `Script` component carries, as `refToString` spells one. */
  script: string
  file: string
  /** SAFE storage compression; decoded before the sandbox receives the source. */
  compression?: 'gzip'
}

export type ExportedGame = {
  version: number
  title: string
  /** The scene the game opens on. One of `scenes`, or the game shows nothing. */
  entryScene: string
  scenes: readonly ExportedScene[]
  scripts: readonly ExportedScript[]
  /** Asset id → the file beside the page. What `createBundledAssets` is handed. */
  assets: Readonly<Record<string, string>>
  /** Asset ids stored as gzip because doing so reduced their exact byte representation. */
  compressedAssets?: readonly string[]
  modelAssets?: Readonly<Record<string, readonly CompiledModelMesh[]>>
  /** Absent in older exports and equivalent to every LOSSY option being off. */
  lossyOptimization?: LossyOptimization
  /** What an image costs, as the author saw it. Absent in older exports — see its default. */
  render?: RenderPolicy
  inputMaps?: readonly InputMap[]
  /** The state machines bodies are animated by, as the project holds them. */
  animationGraphs?: readonly AnimationGraphModule[]
}

/** Which scene a name stands for — its title first, as a person says it, then its id. */
export function exportedSceneNamed(game: ExportedGame, named: string): ExportedScene | null {
  return (
    game.scenes.find(one => one.title === named) ??
    game.scenes.find(one => one.id === named) ??
    null
  )
}

/** One scene as it is handed over: its identity, and the glTF it is. */
export type SceneToExport = {
  id: string
  title: string
  content: string
  /** Assets the exported runtime reaches; absent keeps compatibility with older callers. */
  assetIds?: readonly string[]
  /** Built from this scene for this export; never written back into the authoring document. */
  optimization?: CompiledSceneOptimization
}

/** One script, already JavaScript — the studio transpiles, the sandbox never sees TypeScript. */
export type ScriptToExport = { script: string; code: string }

/** What the WINDOW composes and hands over: the scenes as glTF, the scripts as JavaScript. */
export type GameExportRequest = {
  title: string
  /** The scene the game opens on, by document id. */
  entryScene: string
  scenes: readonly SceneToExport[]
  scripts: readonly ScriptToExport[]
  inputMaps?: readonly InputMap[]
  /** The state machines bodies are animated by, as the project holds them. */
  animationGraphs?: readonly AnimationGraphModule[]
  /** Must be named by the caller: no export path enables a visual change on its behalf. */
  lossyOptimization?: LossyOptimization
  /** What an image costs, carried through so a game draws it the way the editor did. */
  render?: RenderPolicy
  /** Image bytes prepared off the UI and main threads, keyed by their logical asset identity. */
  assetOverrides?: readonly ExportedAssetOverride[]
  modelAssets?: Readonly<Record<string, readonly CompiledModelMesh[]>>
  /**
   * Where to write, INSIDE the project and relative to its root. Absent, a folder picker asks —
   * which is the only way a person at the window ever does it, and the only way a caller with no
   * screen never can.
   */
  folder?: string
}

export type ExportedAssetOverride = {
  id: string
  bytes: Uint8Array
  extension: 'glb' | 'jpg' | 'png'
}

export type GameExportOutcome = {
  /** The folder's NAME, never its path: where it sits is the main process's business. */
  folder: string
  scenes: number
  scripts: number
  assets: number
  /** Assets a scene points at and the catalogue no longer holds — listed, never dropped. */
  missing: readonly string[]
}
