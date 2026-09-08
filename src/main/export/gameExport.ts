import { TRANSLATIONS } from '@shared/i18n'
import { windowLanguage } from '@main/window/language'
import { pathBaseNameOf, safeFileName, stemOf } from '@shared/domain/fileName'
import { escapeXml } from '@shared/domain/xmlText'
import type { AnimationGraph, AnimationGraphModule } from '@shared/domain/animationGraph'
import type { ClipSource } from '@shared/domain/sceneModel'
import { freeName } from '@shared/domain/otioz'
import { availableParallelism } from 'node:os'
import { gzip } from 'node:zlib'
import { boundedPool, type BoundedPool } from '@main/boundedPool'
import { compactGlbGeometry } from './glbGeometry'
import {
  EXPORTED_GAME_FILE,
  EXPORTED_GAME_VERSION,
  type ExportedGame,
  type ExportedAssetOverride,
  type GameExportOutcome,
  type GameExportRequest,
  type ScriptToExport,
  type SceneToExport,
} from '@shared/domain/gameExport'

/** An asset's bytes, and the name to file them under. */
export type ExportedAsset = {
  name: string
  bytes: Uint8Array
  /** SHA-256 recorded by the catalogue when it ingested the file. */
  hash?: string
}

export type GameExportPorts = {
  /**
   * The bytes those ids name, keyed by id. An id the catalogue has lost is simply absent.
   *
   * 🛑 The whole list at once: `better-sqlite3` is synchronous on the main process, and one query
   * per asset is the N+1 that `AssetQuery.ids` was written against.
   */
  assetFiles: (ids: readonly string[]) => Promise<ReadonlyMap<string, ExportedAsset>>
  /**
   * Every file of the runtime bundle, `runtime.js` first among them.
   *
   * 🛑 A FOLDER, not one file: the bundle splits — the physics and the sandbox are chunks `runtime.js`
   * imports by name — and a page shipped with the entry alone is a page that loads nothing.
   */
  runtime: () => Promise<readonly { name: string; body: Uint8Array }[]>
  /** Writes one file of the exported folder, at a path relative to its root. */
  write: (relative: string, body: string | Uint8Array) => Promise<void>
  /**
   * The clip a shipped animation folder holds, by that folder's name.
   *
   * 🛑 An exported game has no studio to serve `animation://` from, so a graph naming a shipped
   * clip would play nothing at all — silently. Copied into the bundle instead, and the graph
   * rewritten to point at it as any project clip is.
   */
  bundledClip: (name: string) => Promise<Uint8Array | null>
}

/** 🛑 What the folder holds, minus its name: only the caller knows where it put it. */
export type GameExportReport = Omit<GameExportOutcome, 'folder'>

/**
 * Writes a game that runs with no studio: the page, the bundle, the manifest and what they reach.
 *
 * Asset reachability is computed from the typed authoring state before it crosses IPC. The text
 * sweep remains only for callers from an older renderer that did not send that list.
 *
 * 🛑 Neither reads a SCRIPT: an asset a script names by id in its own source is not copied, and
 * 404s in the game. The sweep once caught some of those by accident; a renderer that sends the
 * list — every one of them today — skips it, so nothing catches them at all.
 */
export async function writeExportedGame(
  ports: GameExportPorts,
  request: GameExportRequest,
): Promise<GameExportReport> {
  const { scenes, scripts } = request
  const taken = new Set<string>()
  const compression = boundedPool(() => Math.max(1, availableParallelism() - 2))
  const assetResult = await prepareAssets(ports, request, taken, compression)
  const graphs = await bundledGraphs(ports, request.animationGraphs ?? [], taken, assetResult)
  const content = await prepareContent(scenes, scripts, taken, compression)
  const game = exportedGameOf(request, assetResult, content, graphs)
  const runtime = await ports.runtime()
  await writeGameFiles(ports, request, assetResult.writes, content, runtime, game)
  return {
    scenes: scenes.length,
    scripts: scripts.length,
    assets: Object.keys(assetResult.assets).length,
    missing: assetResult.missing,
  }
}

type AssetResult = {
  assets: Record<string, string>
  compressed: string[]
  missing: string[]
  writes: Promise<void>[]
}

type StoredScene = { scene: SceneToExport; stored: StoredBody }
type StoredScript = { script: ScriptToExport; stored: StoredBody }
type PreparedContent = {
  scenes: StoredScene[]
  scripts: StoredScript[]
  sceneFiles: Map<string, string>
  scriptFiles: Map<string, string>
  compressedScenes: Set<string>
  compressedScripts: Set<string>
}

async function prepareAssets(
  ports: GameExportPorts,
  request: GameExportRequest,
  taken: Set<string>,
  compression: BoundedPool,
): Promise<AssetResult> {
  const missing: string[] = []
  const assets: Record<string, string> = {}
  const compressed: string[] = []
  const writes: Promise<void>[] = []
  const contentPaths = new Map<string, { body: Uint8Array; path: string; compressed: boolean }[]>()
  const overrides = new Map(request.assetOverrides?.map(override => [override.id, override]) ?? [])
  const ids = assetIdsIn(request.scenes)
  const found = await ports.assetFiles(ids)
  // Compacting and gzipping a model is the heavy half and answers only to its own bytes; the
  // naming below is not, `freeName` being pure and its result an order.
  const prepared = new Map<string, PreparedAsset>()
  await Promise.all(
    ids.map(async id => {
      const file = found.get(id)
      if (!file) return
      const overridden = overriddenAsset(file, overrides.get(id))
      prepared.set(id, await compression.run(() => optimizedAsset(overridden)))
    }),
  )

  const context: AssetPreparation = { ports, taken, contentPaths, assets, compressed, writes }
  for (const id of ids) {
    const ready = prepared.get(id)
    const file = found.get(id)
    if (!ready || !file) {
      missing.push(id)
      continue
    }
    await fileAsset(id, file, ready, context)
  }
  return { assets, compressed, missing, writes }
}

type AssetPreparation = Pick<AssetResult, 'assets' | 'compressed' | 'writes'> & {
  ports: GameExportPorts
  taken: Set<string>
  contentPaths: Map<string, { body: Uint8Array; path: string; compressed: boolean }[]>
}

/**
 * 🛑 Through `safeFileName` and deduplicated: an id comes from the WINDOW over IPC, so `../../x`
 * would be written wherever it pointed, and two ids cleaning to one name would overwrite each
 * other in silence.
 */
async function fileAsset(
  id: string,
  file: ExportedAsset,
  ready: PreparedAsset,
  context: AssetPreparation,
): Promise<void> {
  const optimized = ready.asset
  const key = optimized === file && file.hash ? file.hash : `bytes:${optimized.bytes.byteLength}`
  const candidates = context.contentPaths.get(key) ?? []
  const shared = await matchingContent(candidates, optimized.bytes)
  if (shared) {
    context.assets[id] = shared.path
    if (shared.compressed) context.compressed.push(id)
    return
  }
  const stored = storedFrom(optimized.bytes, ready.gzipped)
  const name = freeName(
    `${safeFileName(optimized.name, 'asset')}${stored.compressed ? '.gz' : ''}`,
    context.taken,
  )
  context.taken.add(name)
  context.assets[id] = `assets/${name}`
  if (stored.compressed) context.compressed.push(id)
  candidates.push({
    body: optimized.bytes,
    path: context.assets[id],
    compressed: stored.compressed,
  })
  context.contentPaths.set(key, candidates)
  context.writes.push(context.ports.write(context.assets[id], stored.body))
}

async function prepareContent(
  scenes: readonly SceneToExport[],
  scripts: readonly ScriptToExport[],
  taken: Set<string>,
  compression: BoundedPool,
): Promise<PreparedContent> {
  const storedScenes = await Promise.all(
    scenes.map(async scene => ({
      scene,
      stored: await compression.run(() => storedBody(scene.content)),
    })),
  )
  const storedScripts = await Promise.all(
    scripts.map(async script => ({
      script,
      stored: await compression.run(() => storedBody(script.code)),
    })),
  )
  const sceneFiles = new Map<string, string>()
  const compressedScenes = new Set<string>()
  for (const { scene, stored } of storedScenes) {
    const name = freeName(
      `${safeFileName(scene.id, 'scene')}.gltf${stored.compressed ? '.gz' : ''}`,
      taken,
    )
    taken.add(name)
    sceneFiles.set(scene.id, `scenes/${name}`)
    if (stored.compressed) compressedScenes.add(scene.id)
  }
  const scriptFiles = new Map<string, string>()
  const compressedScripts = new Set<string>()
  for (const { script, stored } of storedScripts) {
    const name = freeName(`${fileNameOf(script)}${stored.compressed ? '.gz' : ''}`, taken)
    taken.add(name)
    scriptFiles.set(script.script, name)
    if (stored.compressed) compressedScripts.add(script.script)
  }
  return {
    scenes: storedScenes,
    scripts: storedScripts,
    sceneFiles,
    scriptFiles,
    compressedScenes,
    compressedScripts,
  }
}

/**
 * Every shipped clip a graph names, written into the bundle, and the graphs pointed at the copies.
 *
 * A clip a folder no longer holds leaves its state as it was: the state then plays nothing, which
 * is the same silence a project clip whose file has gone already answers with.
 */
async function bundledGraphs(
  ports: GameExportPorts,
  graphs: readonly AnimationGraphModule[],
  taken: Set<string>,
  assets: AssetResult,
): Promise<readonly AnimationGraphModule[]> {
  const filed = new Map<string, string>()

  for (const name of shippedClipNames(graphs)) {
    const body = await ports.bundledClip(name)
    if (!body) continue

    const file = freeName(`${safeFileName(name, 'clip')}.glb`, taken)
    taken.add(file)
    const id = `${BUNDLED_CLIP}${name}`
    filed.set(name, id)
    assets.assets[id] = `assets/${file}`
    assets.writes.push(ports.write(assets.assets[id], body))
  }

  return graphs.map(module => ({ path: module.path, graph: pointedAtCopies(module.graph, filed) }))
}

/** How a shipped clip is filed in an exported game. A prefix no project asset id can wear. */
const BUNDLED_CLIP = 'clip:'

function shippedClipNames(graphs: readonly AnimationGraphModule[]): readonly string[] {
  const names = new Set<string>()
  for (const { graph } of graphs)
    for (const layer of graph.layers)
      for (const state of layer.states)
        if (state.source.kind === 'bundled') names.add(state.source.name)
  return [...names]
}

function pointedAtCopies(
  graph: AnimationGraph,
  filed: ReadonlyMap<string, string>,
): AnimationGraph {
  return {
    ...graph,
    layers: graph.layers.map(layer => ({
      ...layer,
      states: layer.states.map(state => {
        const id = state.source.kind === 'bundled' ? filed.get(state.source.name) : undefined
        return id
          ? {
              ...state,
              source: {
                ...copied(state.source.name, id),
                ...('clipIndex' in state.source && { clipIndex: state.source.clipIndex }),
              },
            }
          : state
      }),
    })),
  }
}

const copied = (name: string, assetId: string): ClipSource => ({ kind: 'asset', assetId, name })

function exportedGameOf(
  request: GameExportRequest,
  assets: AssetResult,
  content: PreparedContent,
  graphs: readonly AnimationGraphModule[],
): ExportedGame {
  return {
    version: EXPORTED_GAME_VERSION,
    title: request.title,
    entryScene: request.entryScene,
    scenes: request.scenes.map(one => ({
      id: one.id,
      title: one.title,
      file: content.sceneFiles.get(one.id) ?? '',
      ...(content.compressedScenes.has(one.id) ? { compression: 'gzip' } : {}),
      ...(one.optimization ? { optimization: one.optimization } : {}),
    })),
    scripts: request.scripts.map(one => ({
      script: one.script,
      file: `scripts/${content.scriptFiles.get(one.script)}`,
      ...(content.compressedScripts.has(one.script) ? { compression: 'gzip' } : {}),
    })),
    assets: assets.assets,
    ...(assets.compressed.length > 0 ? { compressedAssets: assets.compressed } : {}),
    ...(request.modelAssets ? { modelAssets: request.modelAssets } : {}),
    ...(request.lossyOptimization ? { lossyOptimization: request.lossyOptimization } : {}),
    ...(request.render ? { render: request.render } : {}),
    ...(request.inputMaps?.length ? { inputMaps: request.inputMaps } : {}),
    ...(graphs.length ? { animationGraphs: graphs } : {}),
  }
}

async function writeGameFiles(
  ports: GameExportPorts,
  request: GameExportRequest,
  assetWrites: readonly Promise<void>[],
  content: PreparedContent,
  runtime: readonly { name: string; body: Uint8Array }[],
  game: ExportedGame,
): Promise<void> {
  await Promise.all([
    ...assetWrites,
    ...content.scenes.map(({ scene, stored }) =>
      ports.write(content.sceneFiles.get(scene.id) ?? '', stored.body),
    ),
    ...content.scripts.map(({ script, stored }) =>
      ports.write(`scripts/${content.scriptFiles.get(script.script)}`, stored.body),
    ),
    ...runtime.map(file => ports.write(file.name, file.body)),
    ports.write(EXPORTED_GAME_FILE, `${JSON.stringify(game, null, 2)}\n`),
    ports.write('index.html', pageFor(request.title)),
  ])
}

type StoredBody = { body: string | Uint8Array; compressed: boolean }

/** The one gzip rule of the whole export: the compressed copy is filed only when it is smaller. */
function storedFrom(source: string | Uint8Array, gzipped: Uint8Array): StoredBody {
  const plain = typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength
  return gzipped.byteLength < plain
    ? { body: gzipped, compressed: true }
    : { body: source, compressed: false }
}

async function storedBody(source: string | Uint8Array): Promise<StoredBody> {
  return storedFrom(source, await gzipBytes(source))
}

async function gzipBytes(source: string | Uint8Array): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    gzip(source, { level: 9 }, (error, bytes) => {
      if (error) reject(error)
      else resolve(bytes)
    })
  })
}

/** An asset as it will be filed, carrying the gzip that chose it: nothing is gzipped twice. */
type PreparedAsset = { asset: ExportedAsset; gzipped: Uint8Array }

async function optimizedAsset(source: ExportedAsset): Promise<PreparedAsset> {
  const compact = source.name.toLowerCase().endsWith('.glb')
    ? compactGlbGeometry(source.bytes)
    : source.bytes
  if (compact === source.bytes) return { asset: source, gzipped: await gzipBytes(source.bytes) }

  const [originalGzip, compactGzip] = await Promise.all([
    gzipBytes(source.bytes),
    gzipBytes(compact),
  ])
  const originalStoredBytes = Math.min(source.bytes.byteLength, originalGzip.byteLength)
  const compactStoredBytes = Math.min(compact.byteLength, compactGzip.byteLength)
  return compactStoredBytes < originalStoredBytes
    ? { asset: { ...source, bytes: compact }, gzipped: compactGzip }
    : { asset: source, gzipped: originalGzip }
}

function overriddenAsset(
  source: ExportedAsset,
  override: ExportedAssetOverride | undefined,
): ExportedAsset {
  return override
    ? { name: `${stemOf(source.name)}.${override.extension}`, bytes: override.bytes }
    : source
}

const COMPARISON_CHUNK_BYTES = 1024 * 1024

async function matchingContent(
  candidates: readonly { body: Uint8Array; path: string; compressed: boolean }[],
  wanted: Uint8Array,
): Promise<{ body: Uint8Array; path: string; compressed: boolean } | null> {
  for (const candidate of candidates) {
    if (candidate.body.byteLength !== wanted.byteLength) continue
    if (await sameBytes(candidate.body, wanted)) return candidate
  }
  return null
}

async function sameBytes(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  for (let start = 0; start < left.byteLength; start += COMPARISON_CHUNK_BYTES) {
    const end = Math.min(start + COMPARISON_CHUNK_BYTES, left.byteLength)
    if (Buffer.compare(left.subarray(start, end), right.subarray(start, end)) !== 0) return false
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  return true
}

/** Every asset a scene names, once, in the order they were met. */
function assetIdsIn(scenes: readonly SceneToExport[]): readonly string[] {
  const found = new Set<string>()
  for (const scene of scenes) {
    if (scene.assetIds) {
      for (const id of scene.assetIds) if (id) found.add(id)
      continue
    }
    for (const [, id] of scene.content.matchAll(/"assetId"\s*:\s*"([^"]+)"/g)) {
      if (id) found.add(id)
    }
  }
  return [...found]
}

/** A script is named by its path; the file beside the page keeps the name and loses the folders. */
const fileNameOf = (script: ScriptToExport): string => `${stemOf(pathBaseNameOf(script.script))}.js`

/**
 * The page. Plain and self-contained — a stylesheet beside it is one more file to lose.
 *
 * 🛑 SERVED, never opened by double-click: a module script and a `fetch` are both refused under
 * `file://`, and the failure is a black page. The banner says so rather than leaving it to be
 * discovered.
 */
const pageFor = (title: string): string => `<!doctype html>
<html lang="${windowLanguage()}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeXml(title)}</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      canvas { display: block; width: 100%; height: 100%; }
      #trouble { position: absolute; inset: 1rem; color: #fff; font: 14px system-ui; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <p id="trouble" hidden></p>
    <script type="module">
      const start = async () => {
        try {
          const { startExportedGame } = await import('./runtime.js')
          await startExportedGame(document.getElementById('game'))
        } catch (error) {
          const said = document.getElementById('trouble')
          said.hidden = false
          console.error(error)
          said.textContent = ${JSON.stringify(TRANSLATIONS[windowLanguage()].diagnostics.gameStartFailed)}
        }
      }
      void start()
    </script>
  </body>
</html>
`
