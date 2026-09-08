/**
 * What a local runtime declares it permits, keyed by the DOOR rather than by the runtime — see
 * `docs/ci/adr/ADR-18-capacites-runtime-par-porte.md`.
 *
 * Every value below changes a decision, never a label: `/v1/chat/completions` on Ollama ignores
 * `keep_alive` where its own `/api/chat` accepts it, so one runtime holds two profiles.
 */

/**
 * `<runtime>/<door>`, both segments lowercase kebab-case — `ollama/api-chat`, `llamacpp/embedded`.
 *
 * Branded rather than left a bare string, and the FORMAT is part of the contract: this keys
 * `MemorySnapshot.runtimeBytes`, where three spellings of one door would budget as three doors
 * and the two dead ones would answer for no bytes at all, with nothing to redden. The brand is
 * what reddens — a key that was not minted here fails to index that `Record`.
 */
export type RuntimeEndpointId = string & { readonly brand: unique symbol }

const SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * The only way to mint one, and it throws rather than answering null: an id is composed from
 * constants at a call site, so a malformed one is a programming error and not user input.
 *
 * Both segments are checked separately, which is what refuses `'ollama'` alone and what keeps a
 * slash out of a segment — three segments cannot be spelled.
 */
export function runtimeEndpointId(runtime: string, door: string): RuntimeEndpointId {
  if (!SEGMENT.test(runtime) || !SEGMENT.test(door)) {
    throw new Error(`not a runtime endpoint id: ${runtime}/${door}`)
  }

  // The one cast of this module: a brand exists to be unforgeable anywhere but here.
  return `${runtime}/${door}` as RuntimeEndpointId
}

/**
 * Who holds the residency policy — NOT how obedient a runtime has proven to be.
 *
 * `advisory` is a foreign process keeping its own policy: it may apply it for reasons invisible
 * from here, so ten honoured requests out of ten grant no control. Only a documented cession
 * moves a runtime to `owned`.
 */
export type Residency = 'owned' | 'advisory' | 'opaque'

/** Orthogonal to `Residency`: `owned` + `none` unloads without being able to confirm the effect. */
type MemoryReporting = 'authoritative' | 'best-effort' | 'none'

/** `per-install` means the window is fixed outside our control, so our own bounds clamp to it. */
type ContextControl = 'per-request' | 'per-install' | 'unknown'

/** `none` shows an indeterminate state: no percentage is ever composed from nothing. */
type ProgressChannel = 'push' | 'poll' | 'none'

/** `process-only` kills every job the worker holds, so such a job is never co-located. */
type Cancellation = 'cooperative' | 'process-only' | 'none'

/** `workflow-graph` submits a versioned graph, so the installable artefact is the graph. */
type Submission = 'params' | 'workflow-graph'

/**
 * How many jobs a process holds — NOT how many bytes it holds, which is `RuntimeOccupancy` in
 * `aiMemory.ts`. `exclusive-process` makes the process topology a function of the parallelism
 * wanted, and is irreversible once shipped.
 */
type ProcessOccupancy = 'multi-job' | 'exclusive-process'

/**
 * How a DEVICE is contended for, which two processes can do without either being busy.
 *
 * The axis ADR-18 did not have, and it is separate on purpose: adding `exclusive-device` to
 * `ProcessOccupancy` would put two decisions on one axis, and a saturated GPU is not a busy
 * process. The ADR already keeps `residency` and `memoryReporting` apart for the same reason.
 */
type DeviceContention = 'shared' | 'exclusive'

/**
 * What a worker ANNOUNCES about one door, at its handshake. Never a constant of the TypeScript.
 *
 * `[?]` No diffusion workload has been measured on any class of machine, here or on a dedicated
 * card, so no value below is decided — only the AXES are. A worker knows its backend, its adapter,
 * its model and its machine; the TypeScript knows none of the four.
 *
 * @adr Published by ADR-18 and reached by no import yet: the tag is what stops knip reading a
 * contract as dead code, and a deletion reading as a cleanup.
 */
export type PortOccupancy = {
  /** ADR-18, UNCHANGED: how many jobs this PROCESS holds. */
  readonly process: ProcessOccupancy
  readonly device: DeviceContention
  /** Numeric, where the two above enumerate. `null` when the worker bounds nothing itself. */
  readonly maxConcurrent: number | null
}

/**
 * What one door permits, one axis per line — the shape ADR-18 quotes at its line 62.
 *
 * @adr Same reason as `PortOccupancy` above.
 */
export type RuntimeCapabilities = {
  residency: Residency
  memoryReporting: MemoryReporting
  context: ContextControl
  progress: ProgressChannel
  cancellation: Cancellation
  submission: Submission
  occupancy: ProcessOccupancy
}
