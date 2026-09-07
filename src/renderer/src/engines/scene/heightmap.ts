import { FloatType } from 'three'
import { assetUrl, versionedUrl } from '@shared/domain/asset'
import { heightmapSamplesOf, type HeightmapSamples } from '@shared/domain/heightmap'
import { decoderFor } from '@shared/domain/pictureDecoder'

/** Same head `loadTexture` reads, so a heightmap and a sky agree on what the file is. */
const SIGNATURE_BYTES = 64

/**
 * A heightmap named by asset id. Same URL a sky uses; decode asks `EXRLoader` for float32
 * so the file is not quantized to half on the way in.
 */
export async function loadHeightmap(
  assetId: string,
  read: (url: string) => Promise<ArrayBuffer> = bytesAt,
  version?: string,
): Promise<HeightmapSamples> {
  return heightmapFromExr(await read(versionedUrl(assetUrl(assetId), version)))
}

export async function heightmapFromExr(bytes: ArrayBuffer): Promise<HeightmapSamples> {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, SIGNATURE_BYTES))
  if (decoderFor(head) !== 'openexr') throw new Error('heightmap is not OpenEXR')

  const { EXRLoader } = await import('three/addons/loaders/EXRLoader.js')
  const loader = new EXRLoader()
  loader.type = FloatType
  const held = loader.parse(bytes)
  if (typeof held.width !== 'number' || typeof held.height !== 'number') {
    throw new Error('heightmap has no size')
  }
  if (!(held.data instanceof Float32Array)) throw new Error('heightmap did not decode as float32')
  return heightmapSamplesOf({ data: held.data, width: held.width, height: held.height })
}

async function bytesAt(url: string): Promise<ArrayBuffer> {
  const answer = await fetch(url)
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`)
  return await answer.arrayBuffer()
}
