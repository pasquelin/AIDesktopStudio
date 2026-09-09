import { localizedError } from '@shared/localizedError'
import { assetMasterUrl, assetUrl } from '@shared/domain/asset'

/**
 * An asset's bytes, over the `ai-desktop-studio://` scheme.
 *
 * The renderer never handles a file path: main resolves the id against the catalogue.
 */
export async function fetchAsset(assetId: string): Promise<Response> {
  return fetchOver(assetUrl(assetId), assetId)
}

/** An asset's bytes, which is what every container reader here asks for. */
export async function assetBytes(assetId: string): Promise<Uint8Array> {
  return new Uint8Array(await assetArrayBuffer(assetId))
}

/** The same, as the one buffer a parser takes whole — no view, no copy. */
export async function assetArrayBuffer(assetId: string): Promise<ArrayBuffer> {
  return (await fetchAsset(assetId)).arrayBuffer()
}

/** The original, for an export that must not play the 720p proxy. */
export async function fetchOriginalAsset(assetId: string, signal?: AbortSignal): Promise<Response> {
  return fetchOver(assetMasterUrl(assetId), assetId, signal)
}

async function fetchOver(url: string, assetId: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw localizedError('assetReadFailed', { name: assetId })
  return response
}
