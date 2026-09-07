import { readFile } from 'node:fs/promises'
import type { Asset, AssetQuery } from '@shared/domain/asset'
import type { ActivityReport } from '@main/project/activityLog'
import { fillHoles, TRANSLATIONS } from '@shared/i18n'
import { windowLanguage } from '@main/window/language'
import { embeddedTextures, withoutEmbeddedTextures, type EmbeddedTexture } from './glbTextures'
import { isPngBytes, probePng } from '@main/media/png'
import type { WriteRequest } from './localBackend'

/** What each picture a model carries is written as. Anything else keeps the model's own bytes. */
const EXTENSION_OF_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/ktx2': '.ktx2',
}

function extensionOfMime(mimeType: string): string {
  return EXTENSION_OF_MIME[mimeType] ?? '.png'
}

/**
 * What a picture taken out of a model is called: the model's name and the role it played.
 *
 * The same shape a derived channel already uses, and the same words — a base colour extracted
 * from a `.glb` and one computed in the materials space are the same thing on the shelf, so they
 * must not read as two different notions. A slot the studio has no channel for keeps its glTF
 * name, which is a fact about the file rather than a phrase anyone has to translate.
 */
function extractedTextureName(modelName: string, texture: EmbeddedTexture): string {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].material
  const role = texture.channel ? t.channel[texture.channel] : texture.slot

  return fillHoles(t.derivedName, { name: modelName, channel: role }, language)
}

export type TextureExtractionDeps = {
  /** Where the model's own file sits, or nothing for a row whose bytes are not in the project. */
  fileOf: (source: Asset) => string | null
  /** What is already derived from an asset — this is what makes a second run cost nothing. */
  search: (query: AssetQuery) => Promise<readonly Asset[]>
  write: (request: WriteRequest, bytes: Uint8Array) => Promise<Asset>
  /** Replaces the model bytes after every extracted picture has landed safely. */
  replaceModel: (source: Asset, bytes: Uint8Array) => Promise<void>
  newAssetId: () => string
  /** The project journal. A model that carries no picture is a normal answer, said out loud. */
  record: (entry: ActivityReport) => void
}

export type TextureExtraction = (source: Asset) => Promise<Asset[]>

/**
 * A model's own pictures, taken out into the project so the studio can act on them.
 *
 * Read and written in the MAIN process rather than in a window: the bytes are already a JPEG or a
 * PNG, so this is a file read and a copy — decoding them in the renderer to hand them back would
 * cost a re-encode that softens exactly what the model was painted with (invariant 6).
 *
 * **Idempotent**: a retry resumes missing pictures, then removes the model's embedded copies only
 * after every picture has landed. Concurrent clicks share the same run.
 */
export function createTextureExtraction(deps: TextureExtractionDeps): TextureExtraction {
  const running = new Map<string, Promise<Asset[]>>()

  return source => {
    const already = running.get(source.id)
    if (already) return already

    const run = extract(deps, source).finally(() => running.delete(source.id))
    running.set(source.id, run)
    return run
  }
}

async function extract(deps: TextureExtractionDeps, source: Asset): Promise<Asset[]> {
  if (source.type !== 'mesh') throw new Error(`asset ${source.id} is not a mesh`)

  const derived = await deps.search({ derivedFrom: source.id, type: 'image' })
  const already = derived.filter(asset => asset.map !== undefined || asset.packedSlot !== undefined)
  const file = deps.fileOf(source)
  if (!file) throw new Error(`asset ${source.id} has no file to read`)
  const bytes = await readModel(deps, source, file)
  const found = embeddedTextures(bytes)
  if (found.length === 0 && already.length > 0) return [...already]
  const extracted = await writeMissing(deps, source, found, already)
  if (found.length > 0 && source.modelMaterialIds && source.modelMaterialIds.length > 0) {
    await deps.replaceModel(source, withoutEmbeddedTextures(bytes))
  }
  recordResult(deps, source, extracted.length)
  return extracted
}

async function readModel(
  deps: TextureExtractionDeps,
  source: Asset,
  file: string,
): Promise<Uint8Array> {
  try {
    return await readFile(file)
  } catch (error) {
    deps.record({
      level: 'error',
      topic: 'import',
      messageKey: 'activity.extractFailed',
      params: { name: source.name },
    })
    throw error
  }
}

async function writeMissing(
  deps: TextureExtractionDeps,
  source: Asset,
  found: readonly EmbeddedTexture[],
  already: readonly Asset[],
): Promise<Asset[]> {
  const extracted: Asset[] = []
  for (const [index, texture] of found.entries()) {
    const existing = matchingAsset(already, texture, index, found.length)
    extracted.push(
      existing ??
        (await deps.write(requestFor(source, texture, deps.newAssetId(), index), texture.bytes)),
    )
  }
  return extracted
}

function recordResult(deps: TextureExtractionDeps, source: Asset, count: number): void {
  deps.record({
    level: 'info',
    topic: 'import',
    ...(count > 0
      ? { messageKey: 'activity.extractedTextures', params: { count, name: source.name } }
      : { messageKey: 'activity.extractedNothing', params: { name: source.name } }),
  })
}

function matchingAsset(
  assets: readonly Asset[],
  texture: EmbeddedTexture,
  index: number,
  textureCount: number,
): Asset | undefined {
  const indexed = assets.find(asset => asset.outputIndex === index && serves(asset, texture))
  if (indexed) return indexed
  return textureCount === 1
    ? assets.find(asset => asset.outputIndex === undefined && serves(asset, texture))
    : undefined
}

function serves(asset: Asset, texture: EmbeddedTexture): boolean {
  return texture.channel ? asset.map === texture.channel : asset.packedSlot === texture.slot
}

function requestFor(
  source: Asset,
  texture: EmbeddedTexture,
  id: string,
  outputIndex: number,
): WriteRequest {
  return {
    id,
    name: extractedTextureName(source.name, texture),
    type: 'image',
    extension: extensionOfMime(texture.mimeType),
    folderRole: 'image',
    // Traceable both ways: the inspector shows a model's own pictures beside it by asking the
    // catalogue what was derived from it.
    derivedFrom: source.id,
    outputIndex,
    // One or the other, never both: a slot naming exactly one channel says so through `map`, and
    // the rest carry the slot they came out of so something can later tell an ORM from a coat.
    ...(texture.channel ? { map: texture.channel } : { packedSlot: texture.slot }),
    modelTextureUses: texture.uses,
    // A PNG carries its size in its header, which `probePng` reads. A JPEG's is not read at all —
    // nothing probes an extracted picture afterwards, so its row shows none.
    ...(isPngBytes(texture.bytes) ? { probe: probePng(texture.bytes) ?? undefined } : {}),
  }
}
