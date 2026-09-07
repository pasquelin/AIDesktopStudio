import { isAbsolute } from 'node:path'
import type { AssetType } from '@shared/domain/asset'
import { aiRoleId } from '@shared/domain/aiRole'
import { contractOf } from '@shared/domain/aiCapability'
import { uploadMimeTypeOf } from '@shared/domain/assetMime'
import { CREDIT_UNIT } from '@shared/domain/credits'
import { extensionFromSignature } from '@shared/domain/domainFromSignature'
import { pathBaseNameOf } from '@shared/domain/fileName'
import type { JobTarget } from '@shared/domain/job'
import type { FieldKind } from '@shared/domain/model'
import { PROMPT_FIELD_KEY } from '@shared/domain/localFields'
import {
  tripoEntryOf,
  tripoRigCheckNote,
  TRIPO_LANE_LIMITS,
  type TripoEntry,
} from '@shared/domain/tripo'
import { extensionFromUrl } from '@main/assets/localBackend'
import type { CollectableProduction } from '@main/assets/localCollector'
import type { JobRunner, RemoteJob } from './jobManager'
import { TripoError, type TripoApi, type TripoTask } from './tripoApi'

export type TripoJobRunner = JobRunner & {
  /** What a finished task left on this disk, for the collector to file and then drop. */
  producedBy: (jobId: string) => CollectableProduction | null
  owns: (jobId: string) => boolean
}

export type TripoRunnerDeps = {
  /** The API bound to the key in force, or `null` while no Tripo account is held. */
  api: () => TripoApi | null
  /** Bytes off a signed URL. Through Electron's own stack — see `download` in `services.ts`. */
  download: (url: string) => Promise<Uint8Array>
  /** A picture or a mesh a body names by path, read to be sent up. */
  readFile: (path: string) => Promise<Uint8Array>
  /** Writes the result where `destinationFor` said. */
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>
  /** Where a downloaded result lands. The extension carries its dot, as `extname` writes it. */
  destinationFor: (taskId: string, extension: string) => Promise<string>
  /** How long the polls of one beat are gathered for before the grouped request goes out. */
  gather: (ms: number) => Promise<void>
  log: (level: 'info' | 'warn', message: string) => void
  gatherMs?: number
}

/** How many settled tasks stay answerable — the same ceiling `localJobRunner` keeps. */
const REMEMBERED = 64

/** Wide enough to gather the polls of jobs that started together, short enough to go unnoticed. */
const DEFAULT_GATHER_MS = 50

/**
 * Which of their output URLs an employment actually produced, in the order it is looked for.
 *
 * 🛑 MEASURED 2026-08-31: a text-to-model answers all three of `model_url`,
 * `rendered_image_url` and `generated_image_url` — the last two are the picture it drew on the
 * way — while a text-to-image answers `generated_image_url` ALONE. Reading one list for both
 * filed a picture as a mesh, or a mesh's preview as its result.
 *
 * 🛑 Keyed by `AssetType` and not by `string`: a shelf with no row is a silent drop, and that is
 * exactly what swallowed a paid retarget — `motion` files on `animation`, which nothing named.
 */
const RESULT_URLS: Record<AssetType, readonly string[]> = {
  mesh: ['model_url', 'pbr_model'],
  image: ['generated_image_url', 'image_url', 'rendered_image_url'],
  // A retarget answers `model_url` like any other model — measured 2026-08-31 on a paid one.
  animation: ['model_url'],
  // Declared holes: nothing of Tripo's produces these, and a missing row cost a paid retarget.
  video: [],
  audio: [],
  skybox: [],
}

/** The field kinds that carry a file rather than a value — what the form fills with a path. */
const FILE_KINDS: readonly FieldKind[] = ['image', 'mesh', 'raw']

/**
 * How a file reference travels, which is NOT the same on every endpoint.
 *
 * 🛑 MEASURED 2026-08-31: `file` wants an OBJECT — a bare string answers « Cannot construct
 * instance of FileParam … from String value » — while `input` and the `*_task_id` fields want the
 * string itself. Keyed by the field name, which is the only thing that tells them apart.
 */
const WRAPPED_FIELDS: readonly string[] = ['file', 'files']

function reference(held: string): unknown {
  return held.startsWith('http') ? { url: held } : { file_token: held }
}

function wrapped(key: string, held: string | readonly string[]): unknown {
  if (!WRAPPED_FIELDS.includes(key)) return held
  if (typeof held !== 'string') return held.map(reference)

  const one = reference(held)
  return key === 'files' ? [one] : one
}

/**
 * The shelf an entry's result lands on, read off what its EMPLOYMENT produces — never off its
 * family, which would file a texture endpoint of the 3D family as a mesh.
 */
function shelfOf(entry: TripoEntry): AssetType {
  const output = contractOf(aiRoleId(entry.family, entry.capability))?.output
  // `code` is the one medium that is not a shelf, and nothing of Tripo's writes a script.
  return output === undefined || output === 'code' ? 'mesh' : output
}

/** The lane a target is counted in and its published ceiling, or `null` for another runtime. */
export function tripoLaneOf(targetId: string): { name: string; limit: number } | null {
  const lane = tripoEntryOf(targetId)?.lane
  return lane === undefined ? null : { name: lane, limit: TRIPO_LANE_LIMITS[lane] }
}

export function createTripoRunner(deps: TripoRunnerDeps): TripoJobRunner {
  const produced = new Map<string, CollectableProduction>()
  /** What was asked for, kept so a success can be named after it. Empty after a relaunch. */
  const asked = new Map<string, string>()
  let batch: { ids: Set<string>; answer: Promise<Map<string, TripoTask>> } | null = null

  const held = (): TripoApi => {
    const api = deps.api()
    if (!api) throw new Error('no Tripo account is held for a generation that needs one')

    return api
  }

  /** Oldest first, which is what a `Map` iterates. `owns` reads this, so nothing goes on settling. */
  const forgetOldest = (): void => {
    for (const taskId of produced.keys()) {
      if (produced.size <= REMEMBERED) return
      produced.delete(taskId)
    }
  }

  const sendUp = async (path: string): Promise<string> => {
    const name = pathBaseNameOf(path)

    return await held().upload(
      name,
      await deps.readFile(path),
      uploadMimeTypeOf(name) ?? 'application/octet-stream',
    )
  }

  /** A path goes up; anything already theirs — a token, a URL — stands as it is. */
  const uploaded = async (value: string): Promise<string> =>
    isAbsolute(value) ? await sendUp(value) : value

  // 🛑 The FIELD says what is a file: a prompt beginning with `/` must never reach `readFile`.
  // Repeated fields upload a list of the same kind; one value is a list of one, never an empty list.
  async function assignField(
    sent: Record<string, unknown>,
    field: TripoEntry['fields'][number],
    value: unknown,
  ): Promise<void> {
    if (!FILE_KINDS.includes(field.kind)) {
      sent[field.key] = value
      return
    }
    if (field.repeated) {
      const held = (Array.isArray(value) ? value : [value]).filter(one => typeof one === 'string')
      if (held.length > 0)
        sent[field.key] = wrapped(field.key, await Promise.all(held.map(uploaded)))
      return
    }
    sent[field.key] = typeof value === 'string' ? wrapped(field.key, await uploaded(value)) : value
  }

  /**
   * The body their endpoint takes: the form's own keys, which ARE the API's, plus the model the
   * entry names. An empty value is left out rather than sent — their defaults are documented,
   * and an explicit null is not one of them.
   */
  const bodyFor = async (
    entry: TripoEntry,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const sent: Record<string, unknown> = entry.model ? { model: entry.model } : {}

    for (const field of entry.fields) {
      const value = body[field.key]
      if (value === undefined || value === null || value === '') continue

      // The field, never the value's shape, decides whether a string is a file path.
      await assignField(sent, field, value)
    }

    return sent
  }

  /**
   * One request per beat rather than one per task: their responses carry no rate header
   * (measured), so five watched generations would spend five requests against a ceiling
   * nothing here can read.
   */
  const stateOf = async (taskId: string): Promise<TripoTask | undefined> => {
    if (!batch) {
      const ids = new Set<string>()
      const answer = (async (): Promise<Map<string, TripoTask>> => {
        await deps.gather(deps.gatherMs ?? DEFAULT_GATHER_MS)
        batch = null
        const tasks = await held().status([...ids])
        return new Map(tasks.map(task => [task.taskId, task]))
      })()
      batch = { ids, answer }
    }

    batch.ids.add(taskId)
    return (await batch.answer).get(taskId)
  }

  /** Brings the result down while its URL is still signed, and keeps where it landed. */
  const bringDown = async (entry: TripoEntry, task: TripoTask): Promise<void> => {
    const shelf = shelfOf(entry)
    const url = (RESULT_URLS[shelf] ?? []).map(name => task.outputUrls[name]).find(Boolean)
    if (!url) {
      deps.log(
        'warn',
        `Tripo task ${task.taskId} succeeded with no ${shelf} among ${Object.keys(task.outputUrls).join(', ') || 'nothing'}`,
      )
      return
    }

    // 🛑 The BYTES name the file, and the URL only when they say nothing: measured, they answer
    // a picture at `…/generated_image.png` whose content is a JPEG.
    const bytes = await deps.download(url)
    const destination = await deps.destinationFor(
      task.taskId,
      extensionFromSignature(bytes) ?? extensionFromUrl(url, shelf),
    )
    await deps.writeFile(destination, bytes)

    // The prompt is empty after a relaunch, and that is the honest answer: the collector names
    // the asset after `authored` when the note carried one, and after the job's label otherwise.
    produced.set(task.taskId, {
      path: destination,
      type: shelf,
      prompt: asked.get(task.taskId) ?? '',
    })
    forgetOldest()
  }

  const answerFor = (entry: TripoEntry, task: TripoTask): RemoteJob => {
    // Gated on the ENTRY, not on an empty URL list: a mesh task answers `part_names` beside its
    // files, and those are not something a row says.
    const note = entry.answersFacts ? tripoRigCheckNote(task.output) : null

    return {
      jobId: task.taskId,
      status: task.status,
      assetIds: [],
      ...(task.progress === undefined ? {} : { progress: task.progress }),
      // In CREDITS, and said so: a Tripo credit is not a creative unit, and the row that draws
      // the figure must not label it with the other cloud's word.
      ...(task.credits === undefined ? {} : { cost: task.credits, costUnit: CREDIT_UNIT }),
      ...(note === null ? {} : { note }),
    }
  }

  const entryFor = (target: JobTarget): TripoEntry => {
    const entry = tripoEntryOf(target.id)
    if (!entry) throw new Error(`${target.id} names no Tripo endpoint this build publishes`)

    return entry
  }

  return {
    submit: async (target, body) => {
      const entry = entryFor(target)
      const taskId = await held().create(entry.endpoint, await bodyFor(entry, body))
      const prompt = body[PROMPT_FIELD_KEY]
      asked.set(taskId, typeof prompt === 'string' ? prompt : '')

      return { jobId: taskId, status: 'queued', assetIds: [] }
    },

    poll: async (taskId, target) => {
      const entry = entryFor(target)
      const task = await stateOf(taskId)
      // Their listing left it out — a retention window, a partial answer. Thrown as one of
      // THEIRS so the backoff can decide: a bare `Error` reads as `unexpected` and settles the
      // job on the first attempt, dropping a generation that may still be running.
      if (!task) throw new TripoError(0, 503, `Tripo said nothing about ${taskId}`)

      // An endpoint that answers rather than produces has nothing to bring down, and warning
      // that it wrote no mesh would teach a reader to skip the line that flags a lost one.
      if (task.status === 'success' && !entry.answersFacts && !produced.has(taskId)) {
        await bringDown(entry, task)
      }

      return answerFor(entry, task)
    },

    // 🛑 Their reference publishes no cancellation: a job reported as stopped goes on being
    // billed. The row is told by `Job.cancellable`; anything reaching here is told the same.
    cancel: taskId =>
      Promise.reject(new TripoError(0, 0, `Tripo does not stop a task it has started (${taskId})`)),

    forget: taskId => {
      asked.delete(taskId)
    },

    producedBy: taskId => produced.get(taskId) ?? null,

    owns: taskId => asked.has(taskId) || produced.has(taskId),
  }
}
