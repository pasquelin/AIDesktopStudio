/**
 * A LUT is stored as a plain PICTURE — the horizontal strip of slices `LUTImageLoader` reads —
 * so it lives in the catalogue as a texture like any other, with a thumbnail, a version and a
 * folder. A second asset kind for the same bytes would buy nothing.
 */
import type { Data3DTexture } from 'three'
import { LUTImageLoader } from 'three/addons/loaders/LUTImageLoader.js'
import { assetUrl, versionedUrl } from '@shared/domain/asset'

const loader = new LUTImageLoader()

/** Stamped, or ⌘S over a LUT shows nothing: the id never moves — as `textureCache` does. */
export async function loadLutTexture(
  assetId: string,
  version?: string,
): Promise<Data3DTexture | null> {
  return await loadLutFrom(versionedUrl(assetUrl(assetId), version))
}

/**
 * The same picture read from wherever it is served. An exported game has no `asset://` — its
 * files sit beside the page, and its port is what turns an id into a URL.
 */
export async function loadLutFrom(url: string): Promise<Data3DTexture | null> {
  const read = await loader.loadAsync(url)
  return read.texture3D
}
