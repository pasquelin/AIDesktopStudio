import { z } from 'zod'

/**
 * What the main process and the local AI engine say to each other: one JSON object per line, over
 * a unix socket — a named pipe on Windows. Paths, never bytes: a control frame that grows is one
 * nothing can journal or replay, and `sttProtocol.ts` settled the rule for 640 MB of weights.
 */

/**
 * The vocabulary both sides agree on, carried by every frame. `__init__.py` holds the same number
 * and `pythonProtocol.test.ts` reads it: no compiler sits between the two languages.
 *
 * 2: `worker.hello` no longer carries `device`.
 */
export const PROTOCOL_VERSION = 2

/** What the core answers itself, in the same turn — neither wakes a door. */
export type EngineOp = 'hardware.info' | 'memory.ledger' | 'engine.requirements'
export type EngineRequirementsProfile = 'diffusion' | 'autorig' | 'motion'
/** Read back by `pythonProtocol.test.ts` against what the engine's supervisor accepts. */
export const PROFILES: readonly EngineRequirementsProfile[] = ['diffusion', 'autorig', 'motion']

/**
 * What the core hands to a DOOR instead of answering. Each reads gigabytes or runs for seconds, so
 * each answers with the job it opened and pushes its result as an event.
 */
export type EngineJobOp =
  'models.load' | 'models.unload' | 'generate' | 'auto-rig' | 'worker.status' | 'memory.info'

/** Drops a request the engine still holds. Posted by `processClient` when a caller aborts. */
export const CANCEL_OP = 'engine.cancel'

export type EngineRequest = {
  readonly v: number
  readonly id: number
  readonly op: EngineOp | EngineJobOp | typeof CANCEL_OP
  readonly params: Readonly<Record<string, unknown>>
}

export function engineRequest(
  id: number,
  op: EngineOp | EngineJobOp | typeof CANCEL_OP,
  params: Readonly<Record<string, unknown>> = {},
): EngineRequest {
  return { v: PROTOCOL_VERSION, id, op, params }
}

/**
 * The greeting, and always the first frame: reading a Python stack can fail, and it has to fail at
 * the opening rather than at the first generation — the same handshake `SttReady` answers.
 */
const hello = z.object({
  v: z.number(),
  evt: z.literal('engine.hello'),
  engine: z.string(),
  protocol: z.number(),
  python: z.string(),
  platform: z.string(),
})

/**
 * A door announcing itself. Nothing reads it, so only what IDENTIFIES the frame is described:
 * spelling out fields no caller wants couples this file to `door.py` for nothing, and a value
 * drifting out of a literal union would drop the frame into `readFrame`'s null, which logs.
 */
const workerHello = z.object({ v: z.number(), evt: z.literal('worker.hello') })

/**
 * A job reporting how far it is. Pushed between two denoise steps — the only place a long job can
 * say anything, and the only place a cancel can land.
 */
const jobProgress = z.object({
  v: z.number(),
  evt: z.literal('job.progress'),
  job: z.string(),
  ratio: z.number(),
  phase: z.string().optional(),
})

/**
 * A job settling. It carries no run id: the run that opened it was answered long before, and what
 * a door produced belongs to the JOB — the shape `JobRunner` already speaks.
 *
 * 🛑 **A zod object DROPS what it does not name.** The engine answered `bytesResident` while this
 * named `bytes`, and the reading vanished in silence — every field a door sends belongs here. The
 * reverse costs too: a name no door sends is read as a contract by whoever writes the next fixture.
 */
const settledJob = z.object({
  v: z.number(),
  evt: z.union([z.literal('job.completed'), z.literal('job.failed')]),
  job: z.string(),
  code: z.string().optional(),
  message: z.string().optional(),
  path: z.string().optional(),
  device: z.string().optional(),
  backend: z.string().optional(),
  loadMs: z.number().optional(),
  generateMs: z.number().optional(),
  door: z.string().optional(),
  loaded: z.string().nullable().optional(),
  tensorBytes: z.number().nullable().optional(),
  heldBytes: z.number().nullable().optional(),
  machine: z.unknown().optional(),
  peakRssBytes: z.number().optional(),
})

/** What the engine says about a frame it could not read: there is no run id to answer under. */
const noticed = z.object({ v: z.number(), evt: z.string(), message: z.string() })

const refused = z.object({
  v: z.number(),
  id: z.number(),
  err: z.object({ code: z.string(), message: z.string(), detail: z.unknown().optional() }),
})

/** `ok` is REQUIRED, which is what keeps a refusal from reading as an answer settled with nothing. */
const settled = z.object({ v: z.number(), id: z.number(), ok: z.unknown() })

const frame = z.union([hello, workerHello, jobProgress, settledJob, noticed, refused, settled])

export type EngineHello = z.infer<typeof hello>
export type EngineJobProgress = z.infer<typeof jobProgress>
export type EngineWorkerHello = z.infer<typeof workerHello>
export type EngineSettledJob = z.infer<typeof settledJob>
export type EngineFrame = z.infer<typeof frame>

/** `null` for a line this protocol cannot read — the caller logs it rather than guessing at it. */
export function readFrame(line: string): EngineFrame | null {
  try {
    const parsed = frame.safeParse(JSON.parse(line) as unknown)
    return parsed.success ? parsed.data : null
  } catch {
    // A Python library writing to the socket rather than to stderr would land here. It is not a
    // reason to take the engine down: the frame is dropped, and the log says which line it was.
    return null
  }
}

export function isHello(value: EngineFrame): value is EngineHello {
  return 'evt' in value && value.evt === 'engine.hello'
}

export function isSettledJob(value: EngineFrame): value is EngineSettledJob {
  return 'job' in value && value.evt !== 'job.progress'
}

export function isJobProgress(value: EngineFrame): value is EngineJobProgress {
  return 'evt' in value && value.evt === 'job.progress'
}

export function isWorkerHello(value: EngineFrame): value is EngineWorkerHello {
  return 'evt' in value && value.evt === 'worker.hello'
}

/**
 * What the door's environment holds against what it was declared to need. Answered by the CORE,
 * which imports none of it: a `.dist-info` read is what tells absent from stale without paying the
 * 682 MB an import would. `declaration` travels because repairing means installing that same list.
 */
const requirements = z.object({
  extra: z.string(),
  declaration: z.array(z.string()),
  absent: z.array(z.object({ name: z.string(), wanted: z.string() })),
  stale: z.array(z.object({ name: z.string(), wanted: z.string(), installed: z.string() })),
  complete: z.boolean(),
})

export type EngineRequirements = z.infer<typeof requirements>

export function readRequirements(value: unknown): EngineRequirements {
  return requirements.parse(value)
}

/** What a routed op answers in the same turn: the job it opened, never its result. */
const opened = z.object({ jobId: z.string() })

export function readOpenedJob(value: unknown): string {
  return opened.parse(value).jobId
}

/**
 * The machine as a core WITHOUT a tensor library sees it. No video memory, and that is honest
 * rather than a gap: ADR-19 takes that reading from an inference runtime, and there is none yet.
 */
const hardware = z.object({
  platform: z.string(),
  machine: z.string(),
  pythonVersion: z.string(),
  /** Both `null` where the system declines: `os.cpu_count()` and `_total_bytes()` may, and an
   * unread reading is never given a default — a required field would lose the WHOLE machine. */
  cpuCount: z.number().nullable(),
  totalBytes: z.number().nullable(),
})

export type EngineHardware = z.infer<typeof hardware>

/** Throws on a shape the engine should never send: it is our own code, one version out of step. */
export function readHardware(value: unknown): EngineHardware {
  return hardware.parse(value)
}

/**
 * What one door holds: the DRIVER's number, never the allocator's — `DoorMemory` in `memory.py`
 * carries the measurement that settled it, and composes these four fields and no other.
 */
export const doorMemory = z.object({
  door: z.string(),
  heldBytes: z.number(),
  device: z.string(),
  backend: z.string(),
})

/**
 * What every door last reported. A door that never answered is ABSENT rather than zero: ADR-19 R1
 * turns on that difference — absent reads `unknown`, where a zero would be trusted.
 */
const ledger = z.object({ doors: z.array(doorMemory) })

export type EngineDoorMemory = z.infer<typeof doorMemory>

export function readMemoryLedger(value: unknown): readonly EngineDoorMemory[] {
  return ledger.parse(value).doors
}
