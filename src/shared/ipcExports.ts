import type { ConvertibleType, MeshImportLoss } from './domain/meshImport'
import type { OraDocument } from './domain/openRaster'
import type { ExportFormat } from './domain/scene'
import type { ExportTargetId } from './domain/exportRegistry'
import type { PbrChannel } from './domain/material'

/**
 * What every "save an edit back into the project" channel carries, whatever the payload is.
 *
 * Written once because the three that extend it went from two to three in one batch, and the
 * per-field contract had already drifted: two spelled it out and the newcomer left it bare.
 */
export type SaveRequestBase = {
  /** The asset to overwrite, keeping its id and its place in the shelf. Absent creates one. */
  replaces?: string
  name: string
  /** The asset this one was edited from, so the two stay traceable to each other. */
  derivedFrom?: string
}

/** An edited take on its way back to disk — see `StudioBridge['assets']['saveAudio']`. */
export type SaveAudioRequest = SaveRequestBase & {
  /** 16-bit PCM WAV, encoded by the renderer that decoded it. */
  wav: Uint8Array
}

/**
 * An edited picture on its way back to disk — see `StudioBridge['assets']['savePicture']`.
 *
 * `png` is base64 where its two neighbours carry `Uint8Array`, and the reason is written where
 * the same pixels leave for an export: a `Buffer` does not cross the bridge, and base64 is what
 * the extraction already produced (`main/window/dialogs.ts`). `extract.base64` hands back a
 * string, `derive` hands back bytes; each sends what it holds rather than paying for a
 * conversion — which on a 4K picture is megabytes copied twice for nothing.
 */
export type SavePictureRequest = SaveRequestBase & {
  /** PNG payload, base64 and never a data URL — the prefix is part of the picture otherwise. */
  png: string
}

/**
 * A character's own file on its way back to disk, its skeleton written into it.
 *
 * 🛑 `replaces` is REQUIRED where its neighbours make it optional: ⌘S rewrites the very `.glb`
 * the window opened, in place. An optional one would be the door a copy appears beside it by —
 * and « the open format must BE the document, never an export next to it ».
 */
export type SaveMeshRequest = {
  replaces: string
  /** The whole container, patched by the renderer that read it. */
  glb: Uint8Array
}

/**
 * A 3D file that arrived as something else, back from the window as the `.glb` it is from now on.
 *
 * `type` is what the CONTENT said — the folder's guess, corrected where it was impossible
 * (`convertedTypeOf`) — and the main refiles the row when the two differ. The original is kept
 * beside the new file, out of the catalogue, and `losses` is what the conversion could not carry.
 */
export type ConvertMeshRequest = {
  replaces: string
  glb: Uint8Array
  type: ConvertibleType
  losses: readonly MeshImportLoss[]
}

/**
 * A motion on its way into the project's `animations` folder — see
 * `StudioBridge['assets']['saveAnimation']`.
 *
 * A NEW asset unless `replaces` names one: a motion is a file of its own, playable by every
 * character whose bones carry the same names. `replaces` is the file a workbench REOPENED and
 * corrected — without it every pass files a copy beside the last, and none of them is the motion.
 */
export type SaveAnimationRequest = SaveRequestBase & { glb: Uint8Array }

/**
 * A poster a window drew for a motion, on its way beside the clip — see
 * `StudioBridge['assets']['saveAnimationThumbnail']`.
 *
 * `projectPath` and `sourcePath` travel with the bytes rather than being trusted from the state:
 * a render costs seconds, and the project it was asked for may have closed or the clip moved by
 * the time it lands. The main process refuses both cases instead of filing the poster elsewhere.
 */
export type SaveAnimationThumbnailRequest = {
  projectPath: string
  assetId: string
  sourcePath: string
  png: Uint8Array
  /**
   * Overwrites a still the clip already has, which the automatic pass may never do.
   *
   * Only a person asking for it: the pass skips what is already drawn, so without this a poor
   * frame chosen once would be the one forever.
   */
  replace?: true
}

/**
 * A layered picture on its way to disk as OpenRaster — see `StudioBridge['assets']['saveLayered']`.
 *
 * Two channels rather than one taking either: what the main process does with them differs
 * entirely — one writes bytes it was handed, the other assembles a container.
 */
export type SaveLayeredRequest = SaveRequestBase & {
  document: OraDocument
}

/**
 * A player module on its way into the project as a glTF of its own — see
 * `StudioBridge['assets']['savePlayerModule']`.
 *
 * Text and not bytes, unlike its neighbours: what the renderer holds is a glTF document, and
 * `JSON.stringify` on this side is what the main process would otherwise redo on the other.
 */
export type SavePlayerModuleRequest = {
  name: string
  /** The module as a glTF document, already serialised — see `savePlayerModule`. */
  gltf: string
}

/**
 * A channel the renderer computed, on its way into the project — see
 * `StudioBridge['assets']['saveTexture']`.
 *
 * `map` is required, and that is what keeps the channel honest: it says which of the eight
 * these pixels ARE, the shelf badges it, and the catalogue can then answer "which normal maps
 * does this project hold". Bytes with no channel are an ordinary picture and belong elsewhere.
 */
export type SaveTextureRequest = {
  name: string
  map: PbrChannel
  /** The channel asset they were computed from, so the two stay traceable to each other. */
  derivedFrom?: string
  /** PNG, encoded by the renderer that drew it. */
  png: Uint8Array
}

/** What a render is asked for, before a single frame is computed. */
export type RenderStartRequest = {
  /** Suggested file name, without its extension. */
  name: string
  /** Frames per second of the film, which is also the rate the stills are declared at. */
  fps: number
}

/** One computed frame, on its way to the staging folder. */
export type RenderFrameRequest = {
  /** The session it belongs to, as `render.start` answered it. */
  id: string
  /** Its place in the film. The order of the calls decides nothing. */
  index: number
  /** Already encoded by the renderer: the GPU lives where the scene does. */
  png: Uint8Array
}

/** A composition on its way to a file. The name is a suggestion; the extension is the writer's. */
export type PostPresetExportRequest = {
  /** Suggested file name, without its extension. */
  name: string
  /** The preset file, already serialized — see `postPresetFile`. */
  content: string
}

/** A scene on its way to a file the studio will never look at again. */
export type SceneExportRequest = {
  /** Suggested file name, without its extension — the target decides that. */
  name: string
  format: ExportFormat
  /** Already encoded by the renderer: three.js's exporters run where the scene lives. */
  data: Uint8Array
}

/**
 * The montage itself, as an OpenTimelineIO file — the cut, not a film of it.
 *
 * Encoded by the renderer like a scene is, and for the same reason: only the window holds the
 * catalogue a clip's media is resolved against.
 */
export type MontageExportRequest = {
  /**
   * The row the window is already showing for this export, and the name `tasks.cancel` answers
   * to. Minted there rather than here: a bundle is gigabytes, and an id this side only handed
   * back at the END would leave the whole write unstoppable.
   */
  id: string
  /** Suggested file name, without its extension — the target decides that. */
  name: string
  /**
   * `montage.otio` for the cut alone, `montage.otioz` for the cut with its media inside, and
   * `montage.edl` for the event list.
   *
   * The literals rather than `ExportTargetId`: this writer takes no other, and the wider type let
   * a caller pass `scene.glb` and compile, failing at runtime as an opaque parse error.
   */
  target: 'montage.otio' | 'montage.otioz' | 'montage.edl' | 'montage.fcpxml'
  /**
   * The cut, serialized. TEXT whatever the target — an OTIO is JSON and an EDL is columns, and
   * both are files somebody reads with their eyes. A bundle wraps this rather than writing it.
   */
  content: string
  /**
   * What the cut points at, for a bundle only. The PATHS never cross back: this side resolves
   * each url against the open project and reads it, so a montage cannot have a file outside the
   * project packed into something it then hands to somebody else.
   */
  media?: readonly { source: string; entry: string }[]
}

/**
 * What came out of a bundle the studio was asked to read.
 *
 * The cut travels as TEXT and the media as catalogue ids — never as bytes: the archive can be
 * gigabytes, and this side has already copied every medium into the project and given it a row.
 * The window relinks each clip by the entry its `target_url` names, and composes the document.
 */
export type MontageImportResult = {
  /** `content.otio`, verbatim. Parsed by the window, which is the side that reads a timeline. */
  content: string
  /** Each medium that landed, by the entry the cut names it under and the row it became. */
  media: readonly { entry: string; assetId: string }[]
  /** Where they landed, relative to the project — what the explorer will show them under. */
  folder: string
}

/** One file of an export, already encoded by the renderer that drew it. */
export type ExportedFile = {
  /** No separator and no extension: it is joined to a folder this process chose. */
  name: string
  /** Carried rather than derived: a target writes `.png`s, and one of them writes a `.glb`. */
  extension: string
  bytes: Uint8Array
}

/**
 * Several files on their way to a folder. Unlike a scene, this kind of export means nothing
 * file by file — a base colour without the ORM beside it is half a material, and five faces of
 * a sky are not a sky — so the dialog asks for a folder and they land in one named after them.
 *
 * Shared by the texture and the skybox rather than written twice: the two differ in what they
 * draw, never in what "write these together" means.
 */
export type FolderExportRequest = {
  /** The folder to create inside the chosen one, named after what is being exported. */
  folder: string
  files: readonly ExportedFile[]
  /**
   * Which entry of `exportRegistry` this is. The channels stay one per section — they are asked
   * from different places and refused for different reasons — but what they CARRY is one
   * vocabulary, so the writing side derives the extension it will accept instead of holding a
   * list that says nothing about which target went wrong.
   */
  target: ExportTargetId
}
