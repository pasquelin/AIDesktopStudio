import { localizedError } from '@shared/localizedError'
import { saveCharacterDocument } from '@/character/characterSave'
import { forgetCharacterSkins } from '@/character/characterSkins'
import { workshopIdOf } from '@shared/domain/character'
import { chainsOnMontage, EMPTY_AUDIO_EDIT, parseAudioEdits } from '@/engines/audio/edits'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { traitsOfCanvas } from '@/engines/canvas/canvasTraits'
import {
  canvasFromOra,
  canvasFromOraContent,
  oraStackFromContent,
  oraStackOf,
  oraSurfacesOf,
} from '@/engines/canvas/oraDocument'
import { newMaterial } from '@/engines/material/materialState'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import {
  EMPTY_SEQUENCE,
  EMPTY_SOUND_SEQUENCE,
  type SequenceState,
} from '@/engines/timeline/timelineState'
import { canvasHost } from '@/features/image/canvasHosts'
import { bytesToBase64 } from '@shared/base64'
import { getBridge } from '@/services/bridge'
import { audioEditStore } from '@/stores/audioEdits'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import { characterStore, isCharacterDirty, useCharacters } from '@/stores/character'
import { useCharacterView } from '@/stores/characterView'
import { codeFileOf, isCodeDirty, scriptRefAt, scriptRefOf, useCode } from '@/stores/code'
import { characterAssetOf, useDocuments } from '@/stores/documents'
import type { DocumentStore } from '@/stores/documentStore'
import { guiStore } from '@/stores/gui'
import { materialStore } from '@/stores/materials'
import { sceneStore } from '@/stores/scenes'
import { sequenceStore } from '@/stores/sequences'
import { skyboxStore } from '@/stores/skyboxes'
import type { Asset } from '@shared/domain/asset'
import {
  DOCUMENT_KIND_KEY,
  type DocumentDescriptor,
  type DocumentDraft,
  type DocumentKind,
} from '@shared/domain/document'
import { type CapabilityTrait, type WritableFormat } from '@shared/domain/formatCapability'
import { ORA_MERGED_PATH, type OraSurface } from '@shared/domain/openRaster'
import { otioStudioMetadata } from '@shared/domain/otio'
import { createSkyboxContent } from '@shared/domain/skybox'
import type { StudioBridge } from '@shared/ipc'
import { orElse } from '@shared/promises'
import {
  createDefaultGui,
  forgetTroubledGui,
  guiFromPayload,
  guiPayload,
  guiRefusesToSave,
} from './guiDocument'
import {
  forgetCarriedMaterial,
  materialFromPayload,
  materialPayload,
  materialRefusesToSave,
} from './materialDocument'
import {
  forgetCarriedScene,
  sceneFromPayloadFile,
  scenePayloadOf,
  sceneRefusesToSave,
} from './sceneDocument'
import { sceneDocumentCodec } from './sceneDocumentCodec'
import {
  forgetCarriedMetadata,
  montageIsIncomplete,
  sequenceFromPayload,
  sequencePayload,
  serializeSequencePayload,
} from './sequenceDocument'
import {
  forgetCarriedSky,
  skyboxFromPayload,
  skyboxPayload,
  skyRefusesToSave,
} from './skyboxDocument'
export type CapturedDraft = Omit<DocumentDraft, 'title'>
type AssetTarget = {
  replaces?: string
  derivedFrom?: string
  name: string
  format: WritableFormat
}
type DocumentFile =
  | {
      assetOnly?: undefined
      saveOwn?: undefined
      capture: (
        documentId: string,
        signal?: AbortSignal,
      ) => Promise<{
        draft: CapturedDraft
        commit: () => void
        wasEdited: boolean
      }>
      install: (documentId: string, content: string, parts?: readonly OraSurface[]) => void
      createDefault: (documentId: string) => void
      rehydrate?: (documentId: string, content: string, parts: readonly OraSurface[]) => void
      rehydrateFromAsset?: (documentId: string, assetId: string) => Promise<void>
    }
  | {
      assetOnly: true
      saveOwn: (documentId: string) => Promise<boolean>
      capture?: undefined
      install?: undefined
      createDefault?: undefined
      rehydrate?: undefined
      rehydrateFromAsset?: undefined
    }
export type DocumentIo = AssetWriting &
  DocumentFile & {
    autosaves?: false
    holds: (documentId: string) => boolean
    incomplete?: (documentId: string) => string | null
    dirty: (documentId: string) => boolean
    forget: (document: DocumentDescriptor) => void
  }
type AssetWriting =
  | {
      writeAsset?: undefined
      traitsOf?: undefined
    }
  | {
      writeAsset: (
        documentId: string,
        target: AssetTarget,
        captured: CapturedDraft,
      ) => Promise<Asset | null>
      traitsOf: (documentId: string) => CapabilityTrait[]
    }
type TextDocumentCodec<S> = {
  toPayload: (state: S, documentId: string) => unknown
  fromPayload: (payload: unknown, documentId: string) => S
  createDefault: () => S
  serialize?: (payload: unknown) => string
  encode?: (state: S, documentId: string, signal?: AbortSignal) => Promise<string>
}
function textDocumentIo<S>(
  store: DocumentStore<S>,
  {
    toPayload,
    fromPayload,
    createDefault,
    serialize = payload => JSON.stringify(payload),
    encode,
  }: TextDocumentCodec<S>,
): DocumentIo {
  return {
    capture: async (documentId, signal) => {
      const current = store.use.getState()
      const mark = store.markOf(current, documentId)
      const state = store.stateOf(current, documentId)
      const content = encode
        ? await encode(state, documentId, signal)
        : serialize(toPayload(state, documentId))
      return {
        draft: { content },
        commit: () => store.use.getState().markSaved(documentId, mark),
        wasEdited: store.hasUnsavedWork(current, documentId),
      }
    },
    install: (documentId, content) => {
      store.use.getState().replace(documentId, fromPayload(JSON.parse(content), documentId))
      const loaded = store.use.getState()
      loaded.markSaved(documentId, store.markOf(loaded, documentId))
    },
    createDefault: documentId => store.use.getState().ensure(documentId, createDefault),
    holds: documentId => store.hasState(store.use.getState(), documentId),
    dirty: documentId => store.hasUnsavedWork(store.use.getState(), documentId),
    forget: document => store.use.getState().drop(document.id),
  }
}
const OTIO_AUDIO_EDITS = 'audioEdits'
function audioHasUnsavedWork(
  documentId: string,
  edits = audioEditStore.use.getState(),
  montage = sequenceStore.use.getState(),
): boolean {
  return (
    audioEditStore.hasUnsavedWork(edits, documentId) ||
    sequenceStore.hasUnsavedWork(montage, documentId)
  )
}
function soundMontageOf(parsed: SequenceState): SequenceState {
  if (parsed === EMPTY_SEQUENCE) return EMPTY_SOUND_SEQUENCE
  const tracks = parsed.tracks.filter(track => track.kind === 'audio')
  return tracks.length === 0 ? EMPTY_SOUND_SEQUENCE : { ...parsed, tracks }
}
const AUDIO_IO: DocumentIo = {
  capture: documentId => {
    const edits = audioEditStore.use.getState()
    const montage = sequenceStore.use.getState()
    const editMark = audioEditStore.markOf(edits, documentId)
    const montageMark = sequenceStore.markOf(montage, documentId)
    const written = sequenceStore.stateOf(montage, documentId)
    return Promise.resolve({
      draft: {
        content: serializeSequencePayload(
          sequencePayload(written, documentId, {
            [DOCUMENT_KIND_KEY]: 'audio',
            [OTIO_AUDIO_EDITS]: chainsOnMontage(audioEditStore.stateOf(edits, documentId), written),
          }),
        ),
      },
      commit: () => {
        audioEditStore.use.getState().markSaved(documentId, editMark)
        sequenceStore.use.getState().markSaved(documentId, montageMark)
      },
      wasEdited: audioHasUnsavedWork(documentId, edits, montage),
    })
  },
  install: (documentId, content) => {
    const payload: unknown = JSON.parse(content)
    audioEditStore.use
      .getState()
      .replace(documentId, parseAudioEdits(otioStudioMetadata(payload)[OTIO_AUDIO_EDITS]))
    sequenceStore.use
      .getState()
      .replace(documentId, soundMontageOf(sequenceFromPayload(payload, documentId)))
    const edits = audioEditStore.use.getState()
    edits.markSaved(documentId, audioEditStore.markOf(edits, documentId))
    const montage = sequenceStore.use.getState()
    montage.markSaved(documentId, sequenceStore.markOf(montage, documentId))
  },
  createDefault: documentId => {
    audioEditStore.use.getState().ensure(documentId, () => EMPTY_AUDIO_EDIT)
    sequenceStore.use.getState().ensure(documentId, () => EMPTY_SOUND_SEQUENCE)
  },
  holds: documentId => audioEditStore.hasState(audioEditStore.use.getState(), documentId),
  dirty: audioHasUnsavedWork,
  incomplete: montageIsIncomplete,
  forget: ({ id }) => {
    audioEditStore.use.getState().drop(id)
    sequenceStore.use.getState().drop(id)
    forgetCarriedMetadata(id)
  },
}
async function layeredAsset(
  captured: CapturedDraft,
  target: AssetTarget,
  bridge: StudioBridge,
): Promise<Asset | null> {
  const stack = oraStackFromContent(captured.content)
  if (!stack) return null
  return await bridge.assets.saveLayered({
    ...target,
    document: { stack, surfaces: captured.parts ?? [] },
  })
}
async function flatAsset(
  captured: CapturedDraft,
  target: AssetTarget,
  bridge: StudioBridge,
): Promise<Asset | null> {
  const merged = captured.parts?.find(one => one.path === ORA_MERGED_PATH)
  if (!merged) return null
  return await bridge.assets.savePicture({ ...target, png: bytesToBase64(merged.png) })
}
const IMAGE_IO: DocumentIo = {
  autosaves: false,
  capture: async documentId => {
    const canvases = useCanvases.getState()
    const mark = canvasStore.markOf(canvases, documentId)
    const wasEdited = canvasStore.hasUnsavedWork(canvases, documentId)
    const state = canvasOf(canvases, documentId)
    const host = canvasHost(documentId)
    if (!host) throw localizedError('documentPixelsUnavailable', { document: documentId })
    const merged = await host.flatten()
    if (!merged) throw localizedError('documentFlattenUnavailable', { document: documentId })
    const parts = oraSurfacesOf(await host.pixelSnapshots(), merged)
    return {
      draft: { content: JSON.stringify(oraStackOf(state, parts)), parts },
      commit: () => useCanvases.getState().markSaved(documentId, mark),
      wasEdited,
    }
  },
  install: (documentId, content, parts = []) => {
    const canvases = useCanvases.getState()
    canvases.replace(documentId, canvasFromOraContent(content, parts).state)
    canvases.markSaved(documentId, canvasStore.markOf(useCanvases.getState(), documentId))
    IMAGE_IO.rehydrate?.(documentId, content, parts)
  },
  rehydrate: (documentId, content, parts) => {
    const host = canvasHost(documentId)
    if (!host) return
    void (async () => {
      for (const pixels of canvasFromOraContent(content, parts).pixels) {
        await orElse(host.restoreSnapshot(pixels), undefined)
      }
    })()
  },
  rehydrateFromAsset: async (documentId, assetId) => {
    const host = canvasHost(documentId)
    const layered = host ? await getBridge()?.assets.readLayered(assetId) : null
    if (!host || !layered) return
    for (const pixels of canvasFromOra(layered).pixels) {
      await orElse(host.restoreSnapshot(pixels), undefined)
    }
  },
  writeAsset: async (documentId, target, captured) => {
    const bridge = getBridge()
    const host = canvasHost(documentId)
    if (!bridge || !host) return null
    const replaced = target.replaces
    if (replaced) {
      void import('@/features/image/assetFidelity')
        .then(({ reportAssetDrift }) => reportAssetDrift(documentId, replaced, target.name))
        .catch(() => undefined)
    }
    const written = await (target.format === 'ora'
      ? layeredAsset(captured, target, bridge)
      : flatAsset(captured, target, bridge))
    if (!written) return null
    if (target.replaces) await host.forgetPicture(target.replaces)
    return written
  },
  traitsOf: documentId => traitsOfCanvas(canvasOf(useCanvases.getState(), documentId)),
  createDefault: documentId => useCanvases.getState().ensure(documentId, () => DEFAULT_CANVAS),
  holds: documentId => canvasStore.hasState(useCanvases.getState(), documentId),
  dirty: documentId => canvasStore.hasUnsavedWork(useCanvases.getState(), documentId),
  forget: document => useCanvases.getState().drop(document.id),
}
const SCRIPT_IO: DocumentIo = {
  capture: documentId => {
    const script = scriptRefOf(documentId)
    const held = codeFileOf(documentId)
    const source = held?.source ?? ''
    return Promise.resolve({
      draft: { content: source },
      commit: () => {
        if (script !== null) useCode.getState().committed(script, source)
      },
      wasEdited: isCodeDirty(held),
    })
  },
  install: (documentId, content) => {
    const script = scriptRefOf(documentId)
    if (script !== null) useCode.getState().installed(script, content)
  },
  createDefault: documentId => {
    const script = scriptRefOf(documentId)
    if (script !== null && codeFileOf(documentId) === undefined) {
      useCode.getState().installed(script, '')
    }
  },
  holds: documentId => codeFileOf(documentId) !== undefined,
  dirty: documentId => isCodeDirty(codeFileOf(documentId)),
  forget: document => useCode.getState().forget(scriptRefAt(document.path)),
}
const modelOf = (documentId: string): string =>
  characterAssetOf(useDocuments.getState(), documentId) ?? ''

export const IO_BY_KIND: Record<DocumentKind, DocumentIo> = {
  image: IMAGE_IO,
  character: {
    assetOnly: true,
    saveOwn: saveCharacterDocument,
    autosaves: false,
    holds: documentId => characterStore.hasState(useCharacters.getState(), modelOf(documentId)),
    dirty: documentId => isCharacterDirty(useCharacters.getState(), modelOf(documentId)),
    forget: document => {
      const assetId = document.kind === 'character' ? (document.sourceAssetId ?? '') : ''
      useCharacters.getState().drop(assetId)
      useCharacterView.getState().forgetCharacterView(assetId)
      forgetCharacterSkins(assetId)
      sceneStore.use.getState().drop(workshopIdOf(assetId))
    },
  },
  scene: {
    ...textDocumentIo(sceneStore, {
      toPayload: scenePayloadOf,
      fromPayload: sceneFromPayloadFile,
      createDefault: createDefaultScene,
      encode: sceneDocumentCodec.encode,
    }),
    incomplete: sceneRefusesToSave,
    forget: ({ id }) => {
      sceneStore.use.getState().drop(id)
      forgetCarriedScene(id)
    },
  },
  sequence: {
    ...textDocumentIo(sequenceStore, {
      toPayload: sequencePayload,
      fromPayload: sequenceFromPayload,
      createDefault: () => EMPTY_SEQUENCE,
      serialize: serializeSequencePayload,
    }),
    incomplete: montageIsIncomplete,
    forget: ({ id }) => {
      sequenceStore.use.getState().drop(id)
      forgetCarriedMetadata(id)
    },
  },
  audio: AUDIO_IO,
  skybox: {
    ...textDocumentIo(skyboxStore, {
      toPayload: skyboxPayload,
      fromPayload: skyboxFromPayload,
      createDefault: createSkyboxContent,
    }),
    incomplete: skyRefusesToSave,
    forget: ({ id }) => {
      skyboxStore.use.getState().drop(id)
      forgetCarriedSky(id)
    },
  },
  script: SCRIPT_IO,
  material: {
    ...textDocumentIo(materialStore, {
      toPayload: materialPayload,
      fromPayload: materialFromPayload,
      createDefault: newMaterial,
    }),
    incomplete: materialRefusesToSave,
    forget: ({ id }) => {
      materialStore.use.getState().drop(id)
      forgetCarriedMaterial(id)
    },
  },
  gui: {
    ...textDocumentIo(guiStore, {
      toPayload: guiPayload,
      fromPayload: guiFromPayload,
      createDefault: createDefaultGui,
      serialize: payload => `${JSON.stringify(payload, null, 2)}\n`,
    }),
    incomplete: guiRefusesToSave,
    forget: ({ id }) => {
      guiStore.use.getState().drop(id)
      forgetTroubledGui(id)
    },
  },
}
export const ioOf = (documentId: string): DocumentIo | undefined => {
  const kind = useDocuments.getState().documents[documentId]?.kind
  return kind && IO_BY_KIND[kind]
}
