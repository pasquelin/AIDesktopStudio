import type { AssetType } from './asset'

/**
 * The `kind` the upload endpoint sorts a file under. Its own vocabulary, close to `AssetType`
 * but not the same: a texture and a skybox are images to the API, and `mesh` is `3d`.
 */
export type UploadKind = '3d' | 'asset' | 'audio' | 'avatar' | 'image' | 'model' | 'text' | 'video'

export const UPLOAD_KIND_BY_TYPE: Record<AssetType, UploadKind> = {
  image: 'image',
  // The API has no notion of a sky: it is a picture on the way up, and what makes it one is how
  // the studio files it on the way back.
  skybox: 'image',
  video: 'video',
  audio: 'audio',
  mesh: '3d',
  // The API has no animation class either — the Uthana file carrying a capoeira is filed `3d`
  // there, beside the characters. Sending it up as anything else would be inventing a class.
  animation: '3d',
}

/**
 * What the API accepts, by extension. Anything absent is refused rather than guessed: the
 * upload endpoint validates the content type server-side, and a wrong one fails after the whole
 * file has gone up — which for a rush is minutes of transfer for a rejection.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/m4a',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.obj': 'model/obj',
  '.fbx': 'application/vnd.autodesk.fbx',
  '.stl': 'model/stl',
  '.ply': 'model/ply',
  '.dae': 'model/vnd.collada+xml',
  '.usdz': 'model/vnd.usdz+zip',
}

/**
 * The content type of a file about to go up, or `null` when the API does not take it.
 *
 * `null` is an answer, not a failure to find one: refusing here costs nothing, while sending an
 * unsupported file means uploading it in full before the server says no.
 */
export function uploadMimeTypeOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? null : (MIME_BY_EXTENSION[fileName.slice(dot).toLowerCase()] ?? null)
}
