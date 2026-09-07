import { net, protocol } from 'electron'
import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path'
import { pathIsInside } from '@main/export/pathIsInside'
import { pathToFileURL } from 'node:url'
import { ASSET_SCHEME, hostedParts, type Asset } from '@shared/domain/asset'
import { stemOf } from '@shared/domain/fileName'
import { SOURCES_FOLDER } from '@shared/domain/meshImport'
import { log } from '@main/log'
import { webCodecsReads } from '@main/media/service'

/**
 * Resolves an asset's stored path inside its project, or refuses.
 *
 * The refusal is the point. The path comes from the catalogue, and a catalogue is a file in a
 * folder the user can edit: `../../.ssh/id_rsa` written into a row would otherwise be served
 * to the renderer over a scheme the CSP allows.
 */
export function assetFilePath(projectPath: string, relativePath: string): string | null {
  if (isAbsolute(relativePath)) return null

  const root = resolve(projectPath)
  const file = resolve(root, relativePath)

  return file.startsWith(root + sep) ? file : null
}

/** A dependency of one imported 3D asset, canonicalised inside that asset's `.sources`. */
export async function conversionNeighbourPath(
  projectPath: string,
  asset: Asset,
  neighbour: string,
): Promise<string | null> {
  if (!asset.path || !assetFilePath(projectPath, asset.path) || isAbsolute(neighbour)) return null
  if (basename(dirname(asset.path)) !== stemOf(basename(asset.path))) return null
  const parts = neighbour.split('/')
  if (parts.length === 0 || parts.some(part => part === '' || part === '.' || part === '..')) {
    return null
  }

  try {
    const projectRoot = await realpath(resolve(projectPath))
    const sourceRoot = await realpath(resolve(projectPath, dirname(asset.path), SOURCES_FOLDER))
    if (!pathIsInside(projectRoot, sourceRoot)) return null
    const file = await realpath(resolve(sourceRoot, ...parts))
    return pathIsInside(sourceRoot, file) ? file : null
  } catch {
    return null
  }
}

/**
 * Which file the scheme hands over. The proxy comes first: it exists for sources WebCodecs
 * will not decode, and for 4K the monitor must not open the original.
 */
export function servedFileOf(projectPath: string, asset: Asset): string | null {
  if (asset.proxyPath) return assetFilePath(projectPath, asset.proxyPath)
  if (asset.path) return assetFilePath(projectPath, asset.path)
  return linkedFileOf(asset)
}

/**
 * What an export composites from: the original when WebCodecs can read it, else the proxy.
 * Playback uses `servedFileOf` and always prefers the proxy — a 4K original is the slow path.
 */
export function exportFileOf(projectPath: string, asset: Asset): string | null {
  if (asset.path && webCodecsReads(asset.probe?.codec)) {
    return assetFilePath(projectPath, asset.path)
  }
  if (asset.proxyPath) return assetFilePath(projectPath, asset.proxyPath)
  if (asset.path) return assetFilePath(projectPath, asset.path)
  return linkedFileOf(asset)
}

/**
 * The still that stands for an asset, when one was written beside it — what the `poster` host
 * serves. Never falls back to the asset's own file: a `.glb` handed to an `<img>` is the broken
 * tile this exists to replace, and answering nothing lets the browser draw its icon instead.
 */
export function posterFileOf(projectPath: string, asset: Asset): string | null {
  return asset.posterPath ? assetFilePath(projectPath, asset.posterPath) : null
}

/**
 * The file the user would call theirs: what the project holds, else the media they linked —
 * never the proxy, which is ours and which they never put there. This is what "show it in the
 * Finder" means; the scheme wants the opposite order, and that is `servedFileOf`.
 */
export function ownFileOf(projectPath: string, asset: Asset): string | null {
  if (asset.path) return assetFilePath(projectPath, asset.path)
  return linkedFileOf(asset)
}

/** A linked media sits outside the project, so only an absolute path can name it. */
function linkedFileOf(asset: Asset): string | null {
  if (!asset.sourcePath) return null
  return isAbsolute(asset.sourcePath) ? asset.sourcePath : null
}

/**
 * Declares the scheme before the app is ready. Required for `img-src ai-desktop-studio:` to be honoured
 * and for the renderer to fetch over it at all; Electron ignores the call afterwards.
 */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // The window loads on another origin, so reading an asset is a cross-origin request.
        // Without this `<img>` still paints and only the decoder fails — which reads as a
        // broken monitor rather than as a refusal.
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/**
 * `null` is « no file », the project having gone included — a resolver absorbs that refusal
 * itself. A REJECTION therefore means a defect, which `servedPath` journals as one.
 */
type AssetResolver = (key: string) => Promise<string | null>

/**
 * One resolver per host of the scheme, each reading the key ITS host is named by: an asset id for
 * `asset` and `poster`, a favourite id for `favorite` — kept outside every project, which is why
 * no catalogue can answer for it — and a project-relative PATH for `thumb`, whose subject is a
 * file the catalogue has most often never heard of. A further kind is a further entry.
 */
export type AssetResolvers = Readonly<Record<string, AssetResolver>>

export function serveAssets(resolvers: AssetResolvers): void {
  protocol.handle(ASSET_SCHEME, async request => {
    const file = await servedPath(request.url, resolvers)

    if (!file) return new Response(null, { status: 404 })

    // A container is not a picture. Served as it is, its ZIP bytes reach an `<img>` and decode
    // to nothing — every tile, every inspector and every layer sourced from it draws empty. The
    // format requires a flatten inside precisely so that a reader wanting a picture has one.
    const flat = await flattenedContainer(file)
    if (flat) return new Response(flat, { headers: { 'content-type': 'image/png' } })

    return net.fetch(pathToFileURL(file).toString())
  })
}

/** `null` for anything that is not a container, which is every other file this scheme serves. */
async function flattenedContainer(file: string): Promise<Uint8Array | null> {
  // Streamed by the reader itself, not read whole: this answers one request per tile of a grid,
  // and a container of ten 4K layers is hundreds of megabytes in the process owning every window.
  const { containerPictureOf } = await import('./openRasterFile')
  return await containerPictureOf(file)
}

/**
 * Which file a URL of the scheme names — the routing itself, apart from the handler so it can be
 * tested without an Electron `protocol`. A host nobody registered is answered with nothing.
 */
export async function servedPath(url: string, resolvers: AssetResolvers): Promise<string | null> {
  const parsed = hostedParts(url)
  if (!parsed) return null

  // `hasOwn`, not a plain lookup: every key of `Object.prototype` would otherwise be a live host,
  // and `ai-desktop-studio://toString/x` would reach `net.fetch` with a path nobody registered.
  if (!Object.hasOwn(resolvers, parsed.host)) return null

  const resolveHost = resolvers[parsed.host]
  if (!resolveHost) return null

  try {
    return await resolveHost(parsed.id)
  } catch (error: unknown) {
    // Still answered as « no file », because a `protocol.handle` cannot let anything fly — but
    // said as a DEFECT: the ordinary refusal is the resolver's to absorb, so whatever reaches
    // here is a resolver that broke, and the journal is the only place it will ever show.
    log.error('assets', `serving ${parsed.host}/${parsed.id} failed: ${String(error)}`)
    return null
  }
}
