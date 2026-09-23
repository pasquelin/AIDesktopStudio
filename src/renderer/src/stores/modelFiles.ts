import type { CharacterSocket } from '@shared/domain/character'
import { create } from 'zustand'
import { withoutKey } from '@shared/collections'
import type { RetargetFit } from '@/engines/scene/retarget'
import type { RigState } from '@/engines/scene/rigState'
import { EMPTY_STATS, type SceneStats } from '@/engines/scene/sceneStats'
import type { ModelPart } from '@/engines/scene/modelTextures'

type ClipsByNode = Record<string, readonly string[]>

/** How long each clip runs, in the seconds three measures it in, keyed by name. */
type LengthsByNode = Record<string, Readonly<Record<string, number>>>

type ModelFilesState = {
  /** Keyed by document, then by node: two tabs may hold the same model at different heads. */
  clips: Record<string, ClipsByNode>
  /** What each model IS, as the file that landed says — bones, roles and all. */
  rigs: Record<string, Record<string, RigState>>
  /**
   * How long each clip runs. Same reason as the names: the length lives in the GLB, so nothing
   * that reads only the document can draw a block of the right width.
   */
  lengths: Record<string, LengthsByNode>
  report: (
    documentId: string,
    nodeId: string,
    clips: readonly string[],
    lengths?: Readonly<Record<string, number>>,
  ) => void
  reportRig: (documentId: string, nodeId: string, rig: RigState) => void
  /**
   * The attachment points each character carries, by node. They live in the `.glb`, so only the
   * engine that loaded it ever sees them — and the inspector has to offer them by name.
   */
  sockets: Record<string, Record<string, readonly CharacterSocket[]>>
  reportSockets: (documentId: string, nodeId: string, sockets: readonly CharacterSocket[]) => void
  /** How many MATERIALS each model's file carries — its slots. The count lives in the GLB. */
  materials: Record<string, Record<string, number>>
  materialNames: Record<string, Record<string, readonly string[]>>
  materialSourceIndices: Record<string, Record<string, readonly (number | null)[]>>
  fileTextures: Record<string, Record<string, boolean>>
  parts: Record<string, Record<string, readonly ModelPart[]>>
  selectedParts: Record<string, string>
  selectPart: (documentId: string, partId: string | null) => void
  reportMaterials: (
    documentId: string,
    nodeId: string,
    count: number,
    names?: readonly string[],
    parts?: readonly ModelPart[],
    hasFileTextures?: boolean,
    sourceIndices?: readonly (number | null)[],
  ) => void
  /** The morph targets each model's file carries, by node — names only, the weights are a view. */
  morphs: Record<string, Record<string, readonly string[]>>
  reportMorphs: (documentId: string, nodeId: string, names: readonly string[]) => void
  stats: Record<string, SceneStats>
  reportStats: (documentId: string, stats: SceneStats) => void
  /**
   * How well each foreign clip fits the character playing it, by `clipKeyOf`.
   *
   * Engine state like everything else here: only the engine ever holds both skeletons at once,
   * and nothing in the document says which joints the two have in common.
   */
  fits: Record<string, Record<string, Record<string, RetargetFit>>>
  reportClipFit: (documentId: string, nodeId: string, clipKey: string, fit: RetargetFit) => void
  forget: (documentId: string) => void
}

/**
 * What each imported model's FILE turned out to hold — its clips and their lengths, its skeleton,
 * how many materials it carries — plus the two things only the engine can work out about it: how
 * far a binding is, and how a foreign clip fits.
 *
 * Engine state and not document state: a document holds the NAME of the clip it plays and the id
 * of the material it wears, never the list of the ones its file could offer.
 */
export const useModelFiles = create<ModelFilesState>()(set => ({
  clips: {},
  rigs: {},
  materials: {},
  materialNames: {},
  materialSourceIndices: {},
  fileTextures: {},
  parts: {},
  selectedParts: {},
  selectPart: (documentId, partId) =>
    set(state => ({
      selectedParts: partId
        ? { ...state.selectedParts, [documentId]: partId }
        : withoutKey(state.selectedParts, documentId),
    })),
  stats: {},
  lengths: {},
  fits: {},
  report: (documentId, nodeId, clips, lengths) =>
    set(state => ({
      clips: {
        ...state.clips,
        [documentId]: { ...state.clips[documentId], [nodeId]: clips },
      },
      lengths: {
        ...state.lengths,
        [documentId]: { ...state.lengths[documentId], [nodeId]: lengths ?? {} },
      },
    })),
  reportRig: (documentId, nodeId, rig) =>
    set(state => ({
      rigs: {
        ...state.rigs,
        [documentId]: { ...state.rigs[documentId], [nodeId]: rig },
      },
    })),

  sockets: {},
  reportSockets: (documentId, nodeId, sockets) =>
    set(state => ({
      sockets: {
        ...state.sockets,
        [documentId]: { ...state.sockets[documentId], [nodeId]: sockets },
      },
    })),

  reportMaterials: (
    documentId,
    nodeId,
    count,
    names = [],
    parts = [],
    hasFileTextures,
    sourceIndices = [],
  ) =>
    set(state => ({
      materials: {
        ...state.materials,
        [documentId]: { ...state.materials[documentId], [nodeId]: count },
      },
      materialNames: {
        ...state.materialNames,
        [documentId]: { ...state.materialNames[documentId], [nodeId]: names },
      },
      materialSourceIndices: {
        ...state.materialSourceIndices,
        [documentId]: {
          ...state.materialSourceIndices[documentId],
          [nodeId]: sourceIndices,
        },
      },
      parts: { ...state.parts, [documentId]: { ...state.parts[documentId], [nodeId]: parts } },
      fileTextures:
        hasFileTextures === undefined
          ? state.fileTextures
          : {
              ...state.fileTextures,
              [documentId]: { ...state.fileTextures[documentId], [nodeId]: hasFileTextures },
            },
    })),

  morphs: {},
  reportMorphs: (documentId, nodeId, names) =>
    set(state => ({
      morphs: {
        ...state.morphs,
        [documentId]: { ...state.morphs[documentId], [nodeId]: names },
      },
    })),

  reportStats: (documentId, stats) =>
    set(state => ({ stats: { ...state.stats, [documentId]: stats } })),

  reportClipFit: (documentId, nodeId, clipKey, fit) =>
    set(state => {
      const forDocument = state.fits[documentId] ?? {}
      return {
        fits: {
          ...state.fits,
          [documentId]: {
            ...forDocument,
            [nodeId]: { ...forDocument[nodeId], [clipKey]: fit },
          },
        },
      }
    }),

  forget: documentId =>
    set(state => ({
      clips: withoutKey(state.clips, documentId),
      rigs: withoutKey(state.rigs, documentId),
      lengths: withoutKey(state.lengths, documentId),
      fits: withoutKey(state.fits, documentId),
      materials: withoutKey(state.materials, documentId),
      materialNames: withoutKey(state.materialNames, documentId),
      materialSourceIndices: withoutKey(state.materialSourceIndices, documentId),
      fileTextures: withoutKey(state.fileTextures, documentId),
      parts: withoutKey(state.parts, documentId),
      selectedParts: withoutKey(state.selectedParts, documentId),
      stats: withoutKey(state.stats, documentId),
      morphs: withoutKey(state.morphs, documentId),
    })),
}))

export function modelStatsOf(state: ModelFilesState, documentId: string): SceneStats {
  return state.stats[documentId] ?? EMPTY_STATS
}

/**
 * Answered for a node nothing has reported for. Shared rather than built on the spot: this is
 * read through a zustand selector, and a fresh array per call is a new snapshot every render —
 * the loop then never settles, which is the very trap `SceneInspector` carries a note about.
 */
const NO_NAMES: readonly string[] = []

export function morphNamesOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): readonly string[] {
  return state.morphs[documentId]?.[nodeId] ?? NO_NAMES
}
const NO_SOURCE_INDICES: readonly (number | null)[] = []

/** The clips a node can be asked to play, or none — a model still loading has none yet. */
export function clipsOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): readonly string[] {
  return state.clips[documentId]?.[nodeId] ?? NO_NAMES
}

/** How long one clip of a node runs, in seconds, or nothing while its file has not landed. */
export function clipLengthOf(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
  clip: string,
): number | null {
  return state.lengths[documentId]?.[nodeId]?.[clip] ?? null
}

/** What a node's model is, or nothing at all while its file has not landed. */
export function rigOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): RigState | null {
  return state.rigs[documentId]?.[nodeId] ?? null
}

/** Zero is « not known yet » as much as « nothing to dress » — hence `slots > 0` at the call site. */
export function materialSlotsOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): number {
  return state.materials[documentId]?.[nodeId] ?? 0
}

export function materialNamesOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): readonly string[] {
  return state.materialNames[documentId]?.[nodeId] ?? NO_NAMES
}

export function materialSourceIndicesOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): readonly (number | null)[] {
  return state.materialSourceIndices[documentId]?.[nodeId] ?? NO_SOURCE_INDICES
}

export function modelPartsOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): readonly ModelPart[] {
  return state.parts[documentId]?.[nodeId] ?? NO_PARTS
}

export function fileTexturesOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): boolean | undefined {
  return state.fileTextures[documentId]?.[nodeId]
}

const NO_PARTS: readonly ModelPart[] = []

export function selectedModelPartOf(state: ModelFilesState, documentId: string): string | null {
  return state.selectedParts[documentId] ?? null
}

/**
 * How well one foreign clip fits this character, or nothing while the engine has not read it.
 *
 * `null` also answers a clip the model's own file brought: nothing is retargeted then, so there
 * is no fit to speak of — and « perfectly » would be a claim rather than a measurement.
 */
export function clipFitOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
  clipKey: string,
): RetargetFit | null {
  return state.fits[documentId]?.[nodeId]?.[clipKey] ?? null
}

/** The bones a node's model brought, or none — a mesh has none, and neither has a loading model. */
export function bonesOfNode(
  state: ModelFilesState,
  documentId: string,
  nodeId: string,
): readonly string[] {
  return state.rigs[documentId]?.[nodeId]?.boneNames ?? NO_NAMES
}
