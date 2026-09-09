import type { Residency, RuntimeEndpointId } from './aiRuntime'

/**
 * What the studio knows about the memory a local model would take — see
 * `docs/ci/adr/ADR-19-contrat-memoire-local.md`.
 *
 * A snapshot is ASKED FOR, never computed: no caller may add back what a release was expected to
 * return. That is why `source` names who answered, and why a release hands one of these back.
 */

/** On `unified`, the renderer and the weights draw from ONE pot. Two budgets there would be false. */
export type MemoryDomain = 'unified' | 'split'

/**
 * What an inference runtime reports about the video memory — the one reading of this domain that
 * is neither a deduction nor a system call.
 *
 * `unifiedBytes` is the share the CPU and the GPU hold together, and it is what MEASURES the
 * domain above: greater than zero on a SoC, zero on a dedicated card.
 */
export type VramReading = {
  readonly totalBytes: number
  readonly freeBytes: number
  readonly unifiedBytes: number
}

/** `probe` may sort a catalogue and explain a refusal. It may never admit a job. */
export type MemorySource = 'runtime' | 'probe' | 'none'

/** What a runtime HOLDS — not how many jobs its process takes, which is `ProcessOccupancy`. */
export type RuntimeOccupancy = {
  readonly bytes: number
  /** Whether a release plan may count on these bytes right now — see `reclaimableOf`. */
  readonly reclaimable: boolean
}

/**
 * `readonly` throughout is what holds R2: `available += freed` after a release is the form the
 * ADR forbids by name, and here it is a compile error rather than a rule someone remembers. It
 * stops assignment through this type — not a cast, and not a clone.
 */
export type MemorySnapshot = {
  readonly domain: MemoryDomain
  readonly source: MemorySource
  readonly at: number
  readonly physicalBytes: number
  /** What the studio allows itself in total, runtimes included. */
  readonly appBudgetBytes: number
  /** What the window holds. On `unified`, out of the same pot as the weights. */
  readonly rendererReservedBytes: number
  readonly runtimeBytes: Readonly<Record<RuntimeEndpointId, RuntimeOccupancy>>
  /** Never committed: fragmentation, allocator cache, whatever the system declines to return. */
  readonly headroomBytes: number
  readonly availableBytes: number
}

/**
 * A reading a runtime answered for. An admission rule asks for one, so a probe cannot be passed
 * to it — R1 stops an accident, not a forgery: `source` is self-declared, unlike a minted id.
 */
export type RuntimeSnapshot = MemorySnapshot & { readonly source: 'runtime' }

/**
 * Whether a runtime's bytes may enter a release plan RIGHT NOW.
 *
 * Two arguments, and that is the whole point: no residency answers on its own, so the value moves
 * over time while the capabilities stand still. `owned` earns no exemption — it says who holds the
 * lifecycle, never that the bytes come back — which was measured twice: a page cache sits under a
 * memory-mapped model, and this studio's own GPU process kept 246 MB after closing every document.
 */
export function reclaimableOf(residency: Residency, releaseConfirmed: boolean): boolean {
  return residency === 'opaque' ? false : releaseConfirmed
}

/**
 * How a model stands against this machine. `unknown` is the DEFAULT rather than a failure: with
 * no runtime to answer, it is the only true reading — see `MemorySource`.
 */
export type Compatibility =
  'compatible' | 'slow' | 'experimental' | 'insufficient-memory' | 'incompatible' | 'unknown'

/** The values beside the type, so the bundles are checked against them rather than a copy. */
export const COMPATIBILITIES: readonly Compatibility[] = [
  'compatible',
  'slow',
  'experimental',
  'insufficient-memory',
  'incompatible',
  'unknown',
]

/**
 * What put a bound on a setting — temporary, and never written to disk. One member because
 * ADR-19 defers the pressure LEVELS, not the identity of whatever bounds.
 */
type ConstraintSource = 'memory-pressure'

/**
 * A setting the person owns and the system may BOUND, never overwrite.
 *
 * `requested` is the only half that is persisted. There is deliberately no `effective` field:
 * storing what `effectiveOf` derives would be a second truth about one value, which is the same
 * defect as adding back what a release was expected to return.
 */
export type Governed<T> = {
  requested: T
  /** A bound, never a value. Composed by the rule the setting already uses. */
  constraint?: { bound: T; by: ConstraintSource }
}

/**
 * What the engine applies. `compose` is the setting's own rule — `Math.min` for a shadow map, as
 * `shadowMapSizeFor` already composes a quality ceiling with a chosen size. Its parameters are
 * named because the order carries meaning: hand it `Math.max` and the bound becomes a FLOOR that
 * lifts the setting above what the person chose, which is the overwrite this type exists to stop.
 */
export function effectiveOf<T>(governed: Governed<T>, compose: (requested: T, bound: T) => T): T {
  const { requested, constraint } = governed
  return constraint ? compose(requested, constraint.bound) : requested
}
