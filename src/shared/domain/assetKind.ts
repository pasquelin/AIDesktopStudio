import { ASSET_TYPES, type AssetType } from './asset'
import { channelFromProviderType, isMaterialPicture } from './material'
import type { WorkspaceId } from './workspace'

/**
 * What the API says about an asset's nature, gathered from the three separate fields it uses.
 *
 * Three, not one, and they disagree by design:
 *   - `kind` is the media class — eight values, the coarse sort.
 *   - `metadataType` is the provenance — eighty values, and the only axis `GET /assets` filters
 *     on. It is what separates a normal map from an albedo, both of which are `kind: 'image'`.
 *   - `mimeType` is the file itself, and the only one left on a hit from `/search/assets`, whose
 *     response schema drops `kind` entirely.
 *
 * Every field is optional because every one of them is absent from some response.
 */
export type RemoteTyping = {
  kind?: string
  metadataType?: string
  mimeType?: string
}

/** Skyboxes announce themselves in `metadata.type` and nowhere else once they are plain LDR. */
function isSkyboxType(metadataType: string): boolean {
  return metadataType.startsWith('skybox') || metadataType === 'upscale-skybox'
}

/**
 * What a provenance PRODUCED, read off the end of its name.
 *
 * The eighty values are overwhelmingly `<in>2<out>` or `<verb>-<out>`, so the output is the
 * suffix: `img23d` makes a mesh, `video2audio` makes a take, `audio2video` makes a clip. Reading
 * the tail is a rule, not a list — which matters because `kind` is absent from every search hit,
 * and without this a mesh found by search came back as nothing at all.
 *
 * Order counts: `video23d` ends in both `23d` and `video`, and what it yields is the mesh.
 */
const OUTPUT_SUFFIXES: readonly { suffixes: readonly string[]; type: AssetType }[] = [
  { suffixes: ['23d', '2splat', '-3d'], type: 'mesh' },
  { suffixes: ['2video', '-video'], type: 'video' },
  { suffixes: ['2audio', '-audio', 'voice-clone'], type: 'audio' },
]

function producedType(metadataType: string): AssetType | null {
  for (const { suffixes, type } of OUTPUT_SUFFIXES) {
    if (suffixes.some(suffix => metadataType.endsWith(suffix))) return type
  }
  return null
}

const TYPE_BY_KIND: Record<string, AssetType> = {
  image: 'image',
  // HDR images are what the skybox space consumes, and nothing else produces them.
  'image-hdr': 'skybox',
  video: 'video',
  audio: 'audio',
  '3d': 'mesh',
}

const TYPE_BY_MIME_PREFIX: Record<string, AssetType> = {
  'image/': 'image',
  'video/': 'video',
  'audio/': 'audio',
  'model/': 'mesh',
  // The one 3D format the API accepts that is not served under `model/`.
  'application/vnd.autodesk.fbx': 'mesh',
}

/**
 * Which shelf an API asset belongs on, or `null` when it belongs on none — a `json` or `text`
 * output of a captioning job is data *about* an asset, not an asset.
 *
 * The order matters more than the table does:
 *
 * 1. A PBR channel is a texture whatever its `kind` says. One converter job answers with seven
 *    pictures, and filing them as plain images would lose the whole material.
 * 2. An explicit non-image `kind` is trusted next: it is the API's own coarse answer.
 * 3. Only then `metadata.type`, which is what rescues the skyboxes and everything a search hit
 *    reports. A 360 produced by `skybox-base-360` is `kind: 'image'` — trusting `kind` alone
 *    filed every LDR skybox as an ordinary picture, and the skybox space never saw the thing it
 *    had just generated. The same step reads what a provenance produced from its suffix, which
 *    is the only thing left on a hit, where `kind` is absent.
 * 4. `mimeType` last, for the hits whose provenance says nothing either.
 *
 * The eighty values are not enumerated. Only the prefixes that change the answer are, because
 * the API adds types without warning and an unknown one must land somewhere sensible rather
 * than vanish.
 */
export function assetTypeOfRemote({
  kind,
  metadataType,
  mimeType,
}: RemoteTyping): AssetType | null {
  if (metadataType !== undefined && channelFromProviderType(metadataType)) return 'image'

  const byKind = kind === undefined ? undefined : TYPE_BY_KIND[kind]
  if (byKind !== undefined && byKind !== 'image') return byKind

  const byMetadata = metadataType === undefined ? null : metadataAssetType(metadataType)
  if (byMetadata !== null) return byMetadata

  if (byKind !== undefined) return byKind

  // A kind that was stated and is not a medium settles it: `json`, `text` and `document` are
  // data about assets. Falling through to the mime type here would file a captioning result as
  // a picture, because the record it came from still describes the image it was made from.
  if (kind !== undefined) return null

  for (const [prefix, type] of Object.entries(TYPE_BY_MIME_PREFIX)) {
    if (mimeType?.startsWith(prefix)) return type
  }
  return null
}

function metadataAssetType(metadataType: string): AssetType | null {
  if (isSkyboxType(metadataType)) return 'skybox'
  if (isMaterialPicture(metadataType)) return 'image'
  return producedType(metadataType)
}

/**
 * Where a kind is made — the space its generator belongs to, and the shelf its outputs land in.
 *
 * Shared rather than kept in the renderer's helpers: the main process names the shelf a
 * generation landed in when it writes the journal line, and it has no way to reach them.
 * `Record<AssetType, …>` so a new kind is a compile error rather than a silent hole.
 */
const WORKSPACE_OF_TYPE: Record<AssetType, WorkspaceId> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  mesh: '3d',
  skybox: 'skyboxes',
  // Where a motion is USED, which is the only shelf that means anything for one: nothing
  // generates an animation on its own, it is laid on a character.
  animation: '3d',
}

export function workspaceOfType(type: AssetType): WorkspaceId {
  return WORKSPACE_OF_TYPE[type]
}

/**
 * The kind a space MAKES — what the asset shelf narrows to by default when that space comes up.
 *
 * Searched rather than tabulated, the way `workspaceForKind` reads the document table: a second
 * table is free to disagree with the first, and a space filed under a kind it does not produce
 * is a shelf that answers nothing.
 *
 * `null` for a space no kind is made in — Materials, since a channel stopped being a kind of
 * its own. `soleTypeOf` is what answers for it: the space takes one kind and makes none.
 */
export function typeOfWorkspace(workspace: WorkspaceId): AssetType | null {
  return ASSET_TYPES.find(type => WORKSPACE_OF_TYPE[type] === workspace) ?? null
}
