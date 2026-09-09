import { runtimeEndpointId, type RuntimeEndpointId } from '@shared/domain/aiRuntime'
import type { AssistantProgress } from '@shared/domain/assistant'
import type { ProducingModality } from '@shared/domain/localFields'
import {
  MODEL_LOADERS,
  type DownloadProgress,
  type LocalModel,
  type ModelLoader,
} from '@shared/domain/localModel'

/**
 * The door a loader answers on FOR A GIVEN MODALITY — what `MemorySnapshot.runtimeBytes` is keyed
 * by, and what an admission plan names when it asks for something released.
 *
 * A function and not a `Record`, and the difference is not cosmetic: a `Record<ModelLoader, …>` can
 * only ever hold ONE door per loader, and an adapter serving two modalities — the same Python
 * runtime answering for images and for text — needs two. That is precisely what
 * `RuntimeEndpointId` was branded for, and the table shape forbade.
 *
 * A loader absent from this table answers on `<loader>/embedded`, which is what every runtime that
 * holds its weights in its own process does.
 */
// One process per modality, because a process is what a release plan can kill — a video model
// weighs tens of gigabytes, and co-located, freeing one door would take the other down with it.
// Keyed by `ProducingModality`, so a modality added without a door of its own does not compile.
const DIFFUSERS_DOORS: Readonly<Record<ProducingModality, string>> = {
  image: 'diffusion',
  video: 'video',
  audio: 'audio',
  mesh: '3d',
  skybox: 'skybox',
  // The one exception, and it is deliberate: a motion is dispatched BY MODEL ID inside the 3d
  // worker (`plugin_adapter.PLUGINS`), so the engine declares no door of its own for it. Giving
  // it one is a runtime change — a process to spawn and to kill — not a table to edit here.
  motion: '3d',
}

const DOORS_BY_LOADER: Readonly<Partial<Record<ModelLoader, Readonly<Record<string, string>>>>> = {
  ollama: { image: 'api-generate', '*': 'api-chat' },
  'onnx-runtime': { '*': 'selection' },
  // `*` is what an unnamed modality falls back on, never a door of its own.
  diffusers: { ...DIFFUSERS_DOORS, '*': 'diffusion' },
  plugin: { ...DIFFUSERS_DOORS, '*': 'diffusion' },
}

/** What the Python engine calls itself, and the only runtime whose doors are its processes. */
const ENGINE_RUNTIME = 'engine'

/** The door name alone, read off the one table. `embedded` is what a loader naming none answers. */
function doorOf(loader: ModelLoader, modality?: string): string {
  const doors = DOORS_BY_LOADER[loader]
  if (!doors) return 'embedded'

  return (modality && doors[modality]) ?? doors['*'] ?? 'embedded'
}

export function endpointOf(loader: ModelLoader, modality?: string): RuntimeEndpointId {
  return runtimeEndpointId(loader, doorOf(loader, modality))
}

/**
 * Every door a loader answers on, which is what an inverse map is built from.
 *
 * Enumerated rather than derived from a `Record`: with one door per loader an inverse was a
 * one-liner, and with several it is the only way to answer "which loader owns this door".
 */
export function endpointsOf(loader: ModelLoader): readonly RuntimeEndpointId[] {
  const doors = DOORS_BY_LOADER[loader]
  if (!doors) return [runtimeEndpointId(loader, 'embedded')]

  return [...new Set(Object.values(doors))].map(door => runtimeEndpointId(loader, door))
}

/** The door as the ENGINE names it — what `endpointOfDoor` reads back the other way. */
export function engineDoorOf(modality?: string): RuntimeEndpointId {
  return runtimeEndpointId(ENGINE_RUNTIME, doorOf('diffusers', modality))
}

/**
 * The same door, translated from the name an admission plan uses.
 *
 * 🛑 One door, two spellings: a plan says `diffusers/<door>` because it is keyed by LOADER, the
 * engine says `engine/<door>` because that is what it calls itself. Translated in one place
 * rather than left to a caller — the door half is identical, and it is the half that matters.
 */
export function engineDoorOfEndpoint(endpoint: RuntimeEndpointId): RuntimeEndpointId {
  const [, door] = endpoint.split('/')
  return runtimeEndpointId(ENGINE_RUNTIME, door ?? 'embedded')
}

/** One turn of a conversation. Roles, because that is how a chat door takes a prompt. */
export type ChatTurn = { readonly role: 'system' | 'user' | 'assistant'; readonly content: string }

export type ChatRequest = {
  readonly model: string
  /**
   * The window asked for. ADR-18 makes this conditional on a runtime DECLARING
   * `context: 'per-request'`; nothing declares anything yet, so the one adapter there is sends it
   * unconditionally. Written rather than promised: a runtime that ignores the field gets it anyway.
   */
  readonly contextTokens: number
  readonly messages: readonly ChatTurn[]
  /** Whether the answer must be one JSON object. Stated by the caller: nothing here guesses. */
  readonly json: boolean
  /**
   * The three knobs `localFieldsOf('text', …)` publishes. Absent where the caller fills none —
   * the assistant asks for none, and a door then keeps its own default.
   *
   * 🛑 Carried because the FORM offers them: a generation panel showing a temperature that
   * changes nothing is a control that lies, and the cloud runner honours all three.
   */
  readonly maxTokens?: number
  readonly temperature?: number
  readonly topP?: number
  /**
   * Stops the generation. Invariant 6 of `CLAUDE.md`: every long task is cancellable, and a turn
   * run in this process is the longest of them — a closed window otherwise leaves the model
   * generating to its ceiling with nobody to answer.
   */
  readonly signal?: AbortSignal
  /**
   * What the model has written so far. Absent where nobody watches, which is what leaves a
   * runtime free to answer whole — the returned string is the same either way.
   */
  readonly onProgress?: (progress: AssistantProgress) => void
}

/** What a generation on this machine is asked for. The fields a modality does not use are absent. */
export type GenerateRequest = {
  readonly model: string
  /** Which door answers, and what it writes. A door serves one, so nothing else names it. */
  readonly modality: ProducingModality
  readonly prompt: string
  /** Straight from the dynamic form, so a modality gains a field without this type changing. */
  readonly fields: Readonly<Record<string, unknown>>
  /** Where the result may be written. Owned by the main process, never by the runtime. */
  readonly destination: string
  /** From 0 to 1, as the runtime counts it. One that reports nothing simply never calls it. */
  readonly onProgress: (ratio: number) => void
  readonly signal?: AbortSignal
}

export type GenerateResult = {
  /** The file that was written. It is the main process's to file, and to delete. */
  readonly path: string
  /** What actually ran it, so a silent CPU fallback is visible rather than read as a slow machine. */
  readonly device: string
  readonly backend: string
}

/** What a load reports while it runs, and what stops it. */
export type LoadOptions = {
  /** From 0 to 1, as the runtime counts it. A runtime reporting nothing simply never calls it. */
  readonly onProgress: (ratio: number) => void
  readonly signal?: AbortSignal
}

/**
 * What a runtime on this machine can do, keyed by LOADER — the unit ADR-20 writes its whitelist on.
 *
 * ONE table and not two: installing and conversing are two capabilities of one thing, and a
 * runtime present in one table and absent from the other reads as ready and fails at the first
 * turn, or reads as dead while it could answer.
 */
export type LocalRuntime = {
  /** One round trip for the whole loader: per-model would cost one request per catalogue entry. */
  read: (models: readonly LocalModel[]) => Promise<RuntimeReading>
  install: (
    model: LocalModel,
    onProgress: (progress: DownloadProgress) => void,
    signal: AbortSignal,
  ) => Promise<void>
  remove: (model: LocalModel) => Promise<void>
  /** Absent for a runtime that holds no conversation — recognition reads audio. */
  chat?: (request: ChatRequest) => Promise<string>
  /**
   * Produces something that is not a sentence, and answers WHERE it landed.
   *
   * A path and never bytes: an image crossing a control frame is a frame nothing can journal or
   * replay, and `sttProtocol.ts` settled the rule once for 640 MB of weights. The main process
   * files what the path names into the project, which it already knows how to do.
   */
  generate?: (request: GenerateRequest) => Promise<GenerateResult>
  /**
   * Holds the weights in memory, and answers what they take once resident — a MEASUREMENT, where
   * `reservationBytes` is only what a publisher announced. Absent for a runtime that holds
   * nothing between calls.
   */
  load?: (model: LocalModel, options: LoadOptions) => Promise<number>
  /**
   * Frees a DOOR, or everything this runtime holds when none is named. Answering does not prove
   * the bytes came back — ADR-19.
   *
   * The endpoint is not optional decoration: one door per modality means two can be resident at
   * once, and an unload that freed "the last one loaded" would kill the wrong process while the
   * plan recorded the other as freed.
   */
  unload?: (endpoint?: RuntimeEndpointId) => Promise<void>
  /**
   * Ends the PROCESS behind a door, where `unload` only hands its weights back.
   *
   * Its own verb because the two have opposite costs: unloading is what makes room for the next
   * model on the same door, closing repays a cold start to reopen it. Absent for a runtime the
   * studio does not own the process of — Ollama's server outlives every release.
   */
  close?: (endpoint: RuntimeEndpointId) => Promise<void>
  /**
   * Models this runtime holds that are not in the shipped catalogue — Ollama tags. Absent for a
   * runtime that only ever serves manifests we already have.
   */
  discover?: () => Promise<readonly LocalModel[]>
}

export type RuntimeReading = {
  /** `false` is ordinary: the service is not answering and could not be started. */
  readonly ready: boolean
  /** The ids of the models handed in that it holds. Empty when it did not answer. */
  readonly installed: ReadonlySet<string>
  /** The models resident in memory, of those handed in. Empty when none is. */
  readonly loaded: ReadonlySet<string>
}

/**
 * The runtimes the wiring provides, by loader. **Blind spot, written rather than hidden**: nothing
 * checks that every loader has a line — one that has none reads as a runtime that is not answering,
 * which is the honest answer while nothing can install for it.
 */
export type LocalRuntimes = Readonly<Partial<Record<ModelLoader, LocalRuntime>>>

/** Every runtime that can list models we did not ship, asked together. A throw is an empty list. */
export async function discoveredOf(runtimes: LocalRuntimes): Promise<readonly LocalModel[]> {
  const lists = await Promise.all(
    MODEL_LOADERS.map(async loader => {
      try {
        return (await runtimes[loader]?.discover?.()) ?? []
      } catch {
        return []
      }
    }),
  )
  return lists.flat()
}

const ABSENT: RuntimeReading = { ready: false, installed: new Set(), loaded: new Set() }

/**
 * What each loader answers for the models that name it.
 *
 * `report` is not optional: the screen can only ever say "this runtime is not answering", and WHY
 * is the whole of what someone needs to fix it. Swallowed, it is invisible everywhere.
 */
export async function runtimeReadingsOf(
  runtimes: LocalRuntimes,
  models: readonly LocalModel[],
  report: (loader: ModelLoader, why: string) => void,
): Promise<ReadonlyMap<ModelLoader, RuntimeReading>> {
  const readingFor = async (loader: ModelLoader): Promise<RuntimeReading> => {
    const runtime = runtimes[loader]
    if (!runtime) {
      report(loader, 'nothing is wired for this loader')
      return ABSENT
    }

    // A `try` and not a `.catch`: an adapter that threw BEFORE handing back its promise would
    // escape the second, take `compose` down with it, and `report` would never be called — the
    // opposite of what this exists for.
    try {
      return await runtime.read(models.filter(model => model.loader === loader))
    } catch (error) {
      report(loader, String(error))
      return ABSENT
    }
  }

  return new Map(
    await Promise.all(
      [...new Set(models.map(model => model.loader))].map(
        async (loader): Promise<[ModelLoader, RuntimeReading]> => [
          loader,
          await readingFor(loader),
        ],
      ),
    ),
  )
}

/** What a runtime over files this studio fetches itself needs from the disk and the network. */
export type FileRuntimeDeps = {
  /** Where the weights land. One folder for the whole catalogue while it holds one file model. */
  folderFor: (model: LocalModel) => string
  isComplete: (model: LocalModel, folder: string) => Promise<boolean>
  fetch: (
    model: LocalModel,
    folder: string,
    onProgress: (progress: DownloadProgress) => void,
    signal: AbortSignal,
  ) => Promise<void>
  removeFiles: (model: LocalModel, folder: string) => Promise<void>
}

/** Ready by construction: what would have to be answering is this process. It holds no conversation. */
export function fileRuntime(deps: FileRuntimeDeps): LocalRuntime {
  return {
    read: async models => {
      const answers = await Promise.all(
        models.map(model => deps.isComplete(model, deps.folderFor(model))),
      )

      return {
        ready: true,
        installed: new Set(models.filter((_model, index) => answers[index]).map(model => model.id)),
        // Nothing is held between calls: the engine is opened per session and closed with it.
        loaded: new Set(),
      }
    },

    install: (model, onProgress, signal) =>
      deps.fetch(model, deps.folderFor(model), onProgress, signal),

    remove: model => deps.removeFiles(model, deps.folderFor(model)),
  }
}
