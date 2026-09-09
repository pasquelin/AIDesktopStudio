import {
  ASSET_TYPES,
  isLocalPicture,
  PICTURES,
  type Asset,
  type AssetType,
} from '@shared/domain/asset'
import { isPlayerModulePath } from '@shared/domain/playerModuleFile'
import { workspaceOfType } from '@shared/domain/assetKind'
import type { DocumentDescriptor, DocumentKind } from '@shared/domain/document'
import type { WorkspaceId } from '@shared/domain/workspace'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { restoreDocument } from '@/features/shell/documentLoad'
import { loadTake } from '@/features/audio/components/TakeEditor/loadTake'
import { becomeAsset, placeAsset } from '@/features/image/placeAsset'
import { placeMaterialChannel } from '@/features/material/components/placeChannel'
import { importableAssetTypeOf } from '@shared/domain/importFormat'
import { sourceNatureOf } from '@shared/domain/fileRole'
import { documentOfKind, useDocuments } from '@/stores/documents'
import { addAnimationTo, addModelTo } from '@/stores/scenes'
import { addAssetToSequence, sequenceTakes } from '@/stores/sequences'
import { setSkyboxSource } from '@/stores/skyboxes'

/**
 * Where an asset can be sent, as something one can list rather than something one falls through.
 *
 * This used to be a cascade of `if`s inside `openAsset`, which worked for double-clicking and
 * for nothing else: a menu can only offer what it can enumerate.
 *
 * There is no cascade left to fall down. A double-click opens the asset in its own space —
 * `editorIntent`, one entry, no arbitration — and this table is what the context menu lists and
 * what a drop lands in. Its ORDER is therefore the menu's, which is why the montage sits near
 * the end: the destination that takes every kind reads last.
 */
export type AssetIntent = {
  id: string
  /** Where this destination lives — the menu reads its glyph off the workspace table. */
  workspace: WorkspaceId
  /** The document it writes into — which is what `ready` looks for among the open tabs. */
  kind: DocumentKind
  labelKey: string
  /**
   * The kinds this destination takes, judged on the type alone and never on the asset.
   *
   * The platform forces it: during a drag, `dataTransfer.getData()` answers an empty string, so
   * a target knows the kind flying over it and nothing else.
   */
  accepts: readonly AssetType[]
  /**
   * Whether THIS asset can go there right now: a document of that kind must be open somewhere —
   * in front or not — and the destination must be able to take that particular asset.
   *
   * It takes the asset where `accepts` cannot, because the menu holds one and the drag the
   * other. A `ready` that only counted open tabs would offer a row that then refuses in
   * silence — a cloud picture greyed in nowhere, and enabled everywhere it cannot land.
   */
  ready: (asset: Asset) => boolean
  /**
   * Whether this destination could take the asset at all, with no document in the question.
   *
   * What `ready` cannot answer for a tab that does not exist yet: opening an asset makes its
   * document, and making one for an asset the editor then refuses leaves an empty tab where a
   * refusal belonged.
   */
  takes: (asset: Asset) => boolean
  /** Resolves once the asset has landed — a destination may have to read its file first. */
  run: (asset: Asset) => Promise<void>
  /**
   * The same landing, into a named document rather than into whichever one is open.
   *
   * What lets a double-click open an asset in a document it has just made: `run` can only ever
   * find an existing tab, and the tab that edits an asset does not exist until it is asked for.
   */
  into: (documentId: string, asset: Asset) => Promise<void>
  /**
   * The same landing, for a document made FOR this asset — what a double-click asks for.
   *
   * Absent on every destination but the image, and the absence is the point: sending a mesh to a
   * scene or a take to the audio editor already fills a fresh document with the asset and nothing
   * else. A picture did not — it landed as a layer on a blank 1024² canvas with a white
   * background — so `⌘S` had no faithful flatten to write back. `openAsset` prefers this when a
   * destination offers one, and falls back to `into` where none is needed.
   */
  become?: (documentId: string, asset: Asset) => Promise<void>
  /**
   * What this destination has to say when the tab it would open is ALREADY there.
   *
   * `openAsset` brings that tab back rather than making a second one, and never resizes it: the
   * document keeps its size and the work done in it. But a document that drifted from its asset
   * is one whose ⌘S will shrink the file, so the reopening is the first moment it can be said.
   *
   * Absent on every destination but the image, like `become` and for the same reason: the others
   * do not write their asset's file back at the document's size.
   */
  revisit?: (documentId: string, asset: Asset) => Promise<void>
}

/**
 * The tab this destination would write into.
 *
 * Reading the tab in FRONT is what kept an asset from crossing workspaces — a double-click
 * could only ever land on the tab already on screen, and did nothing at all from anywhere else.
 * The explorer has always crossed; this is the same promise for an asset.
 */
function targetOf(kind: DocumentKind): DocumentDescriptor | null {
  return documentOfKind(useDocuments.getState(), kind)
}

/**
 * A tab brought forward and filled from disk, in that order — everything that must happen before
 * anything is written INTO a document, and every step of it is load-bearing.
 *
 * Exported because a second caller assembles a document of its own (`openModelMaterial`) and had
 * copied the two lines: the order is an invariant with a silent failure mode, so the day it gains
 * a third step, a copy that did not gain it writes over a file nobody read.
 *
 * Answers whether the document is there at all — a descriptor that has gone leaves nothing to
 * write into.
 */
export async function readyForWriting(documentId: string): Promise<boolean> {
  const target = useDocuments.getState().documents[documentId]
  if (!target) return false

  // Brought forward before it is written into: an asset landing in a tab nobody is looking at is
  // indistinguishable from a double-click that did nothing.
  openDocument(target)

  // And its file read before anything is written into it. A tab that has never been on screen
  // holds no state, and writing into it makes `restoreDocument` take it for one already loaded:
  // the file is then never read, and the next save writes this over it.
  await restoreDocument(documentId)
  return true
}

/**
 * A destination that needs an open tab of its kind, and an asset it can take.
 *
 * `eligible` mirrors the guard inside `put`: every one of them refuses in silence, and the
 * cascade has to know that before it commits rather than after.
 *
 * Its document is `null` when there is none to name yet — the question opening an asset asks
 * before it makes one. A guard that reads the document answers `true` there rather than
 * refusing: a document that does not exist has nothing to refuse with, and the fresh one this
 * makes is the default its space builds.
 */
function inDocument(
  kind: DocumentKind,
  put: (documentId: string, asset: Asset) => void,
  eligible: (asset: Asset, documentId: string | null) => boolean = () => true,
  fill?: (documentId: string, asset: Asset) => Promise<void>,
): Pick<AssetIntent, 'kind' | 'ready' | 'takes' | 'run' | 'into' | 'become'> {
  /** Only what is placed at the end differs between the two landings. */
  const land = async (
    documentId: string,
    asset: Asset,
    place: (documentId: string, asset: Asset) => void | Promise<void>,
  ): Promise<void> => {
    if (!(await readyForWriting(documentId))) return
    await place(documentId, asset)
  }

  const into = (documentId: string, asset: Asset): Promise<void> => land(documentId, asset, put)

  return {
    kind,
    into,
    ...(fill
      ? { become: (documentId: string, asset: Asset) => land(documentId, asset, fill) }
      : {}),
    takes: asset => eligible(asset, null),
    ready: asset => {
      const target = targetOf(kind)
      return target !== null && eligible(asset, target.id)
    },
    run: async asset => {
      const target = targetOf(kind)
      if (target) await into(target.id, asset)
    },
  }
}

export const ASSET_INTENTS: readonly AssetIntent[] = [
  {
    id: 'skyboxes.source',
    workspace: 'skyboxes',
    labelKey: 'intents.skyboxSource',
    accepts: PICTURES,
    ...inDocument('skybox', setSkyboxSource, isLocalPicture),
  },
  {
    id: '3d.mesh',
    workspace: '3d',
    labelKey: 'intents.sceneMesh',
    accepts: ['mesh'],
    ...inDocument('scene', addModelTo),
  },
  {
    // A motion is not a thing in a scene: it goes ON the character that is selected, which is
    // why this one can be listed and still refuse — `addAnimationTo` says so.
    id: '3d.animation',
    workspace: '3d',
    labelKey: 'intents.sceneAnimation',
    accepts: ['animation'],
    ...inDocument('scene', addAnimationTo),
  },
  {
    id: 'audio.take',
    workspace: 'audio',
    labelKey: 'intents.audioTake',
    accepts: ['audio'],
    ...inDocument('audio', loadTake),
  },
  {
    id: 'image.layer',
    workspace: 'image',
    labelKey: 'intents.imageLayer',
    accepts: PICTURES,
    // Through `import()`, like the two measuring gestures beside it: `eager-graph.test.ts` holds
    // the opening chunk's reach into the editors at two files, and nothing here runs before a
    // double-click lands on a picture.
    revisit: async (documentId, asset) => {
      const { reportAssetDrift } = await import('@/features/image/assetFidelity')
      await reportAssetDrift(documentId, asset.id, asset.name)
    },
    ...inDocument('image', placeAsset, isPaintablePicture, becomeAsset),
  },
  {
    id: 'video.clip',
    workspace: 'video',
    labelKey: 'intents.videoClip',
    // Where everything ends up, hence its place near the end and the kinds it takes.
    accepts: ASSET_TYPES,
    // The only guard that reads its document: which tracks are free is a property of the
    // montage, not of the asset. A montage yet to be made has none locked.
    ...inDocument('sequence', addAssetToSequence, (asset, documentId) =>
      documentId === null ? true : sequenceTakes(documentId, asset),
    ),
  },
  {
    id: 'materials.channel',
    workspace: 'materials',
    labelKey: 'intents.materialChannel',
    accepts: PICTURES,
    // The base colour is what a bare drop fills; a named channel comes from the slot itself.
    ...inDocument('material', placeMaterialChannel, isLocalPicture),
  },
]

/**
 * Whether a file is a player MODULE rather than a mesh — the one thing that tells the two
 * double-clicks apart, since both are glTF and both live on the mesh shelf.
 */
export function opensAsPlayerModule(asset: Asset): boolean {
  return (
    asset.type === 'mesh' &&
    asset.location === 'local' &&
    isPlayerModulePath(asset.path ?? asset.name)
  )
}

/** Every destination that would take this kind, whether or not its space is open right now. */
export function intentsFor(type: AssetType): readonly AssetIntent[] {
  return ASSET_INTENTS.filter(intent => intent.accepts.includes(type))
}

/**
 * The importable meshes ARE the models the studio edits; a `.gltf` is not among them, it is a
 * document. Read off the PATH — a catalogued row is named without its extension — and never for a
 * row the cloud holds, which has no file for the tab to read.
 */
export function opensAsCharacter(asset: Asset): boolean {
  return (
    asset.type === 'mesh' &&
    asset.location === 'local' &&
    importableAssetTypeOf(asset.path ?? asset.name) === 'mesh'
  )
}

/**
 * Where an asset is EDITED, as opposed to where it can be sent — the destination in its own
 * space. An image is edited in Images, a mesh in 3D, a take in Audio.
 *
 * Derived from the table rather than tabulated beside it, for the reason this file already gives
 * about workspace glyphs: a second table is free to disagree with the first, and one that named
 * the wrong space would send an asset to an editor that cannot open it.
 *
 * `null` would mean a kind whose own space takes nothing of it, which no kind does today — a
 * test holds the six.
 *
 * A picture that HOLDS A CHANNEL is edited in Materials, and `map` is the whole of what says so:
 * the studio stopped filing channels under a kind of their own — a channel is a picture — and
 * without this a double-click on a normal map would open the pixels rather than the material
 * they belong to.
 */
export function editorIntent(asset: Asset): AssetIntent | null {
  const workspace = asset.map ? 'materials' : workspaceOfType(asset.type)

  return (
    ASSET_INTENTS.find(
      intent => intent.workspace === workspace && intent.accepts.includes(asset.type),
    ) ?? null
  )
}

/**
 * Where the PIXELS of a picture are edited — Images, for every picture on this disk.
 *
 * Whether a row here would double up with a surface's own double-click is the CALLER's question:
 * refusing an `image` here left the assembling spaces, which have no such gesture, with none at
 * all. `null` for a picture not on disk — `assetUrl` answers 404 for a cloud row.
 */
export function pixelEditorIntent(asset: Asset): AssetIntent | null {
  return isPaintablePicture(asset) ? IMAGE_INTENT : null
}

/** A picture the image editor can actually decode — not an OpenEXR heightmap. */
function isPaintablePicture(asset: Asset): boolean {
  if (!isLocalPicture(asset)) return false
  const nature = sourceNatureOf(asset.path ?? asset.name)
  return nature.domain === 'other' ? true : nature.openable
}

const IMAGE_INTENT = ASSET_INTENTS.find(intent => intent.workspace === 'image') ?? null
