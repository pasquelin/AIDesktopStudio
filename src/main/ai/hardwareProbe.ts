import type {
  MemoryDomain,
  MemorySnapshot,
  RuntimeOccupancy,
  RuntimeSnapshot,
  VramReading,
} from '@shared/domain/aiMemory'
import type { RuntimeEndpointId } from '@shared/domain/aiRuntime'
import { isRecord } from '@shared/guards'
import { orElse } from '@shared/promises'

/** What a probe can say about the GPU. Nothing about its memory — see `gpuIdentityOf`. */
export type GpuIdentity = {
  readonly vendorId: number | null
  readonly deviceId: number | null
  /** `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, …)` — a name, never a capacity. */
  readonly renderer: string | null
  readonly machineModel: string | null
}

export type HardwareFacts = {
  readonly platform: NodeJS.Platform
  readonly arch: string
  /** Raw. Reserving cores for the interface is a policy, and policies are not the probe's. */
  readonly cpuCount: number
  readonly physicalBytes: number
  /**
   * What the port could establish is free RIGHT NOW, and it is the softest figure here.
   *
   * Measured 2026-08-21 on this Mac: `os.freemem()` answered 29.51 GB — free plus speculative
   * pages — while 31.58 GB sat in reclaimable inactive pages it does not count. A port is expected
   * to do better where it can, and `null` when it cannot.
   */
  readonly freeBytes: number | null
  /** `null` when the path could not be stat'd; a probe reports absence rather than guessing zero. */
  readonly diskFreeBytes: number | null
  readonly gpu: GpuIdentity | null
  /**
   * What the GPU holds, ANSWERED by a runtime — `getVramState()` — and `null` where none did.
   *
   * The one reading of this whole file that does not come from the system: it is why a snapshot
   * may say `runtime` at all, and why `admissionFor` finally has a producer.
   */
  readonly vram: VramReading | null
}

/**
 * Every machine reading the probe is allowed, injected.
 *
 * Measured 2026-08-20: a `platform = process.platform` default let three tests assert the macOS
 * tree and go red on the CI runner. Passing it is what makes the compiler ask.
 */
export type HardwarePort = {
  platform: () => NodeJS.Platform
  arch: () => string
  cpuCount: () => number
  totalBytes: () => number
  availableBytes: () => Promise<number | null>
  diskFreeBytes: () => Promise<number | null>
  /** `app.getGPUInfo`. Typed `unknown` by Electron itself, so it is narrowed rather than trusted. */
  gpuInfo: () => Promise<unknown>
  /** The inference runtime's own video-memory reading, or `null` where it cannot open the GPU. */
  vram: () => Promise<VramReading | null>
}

const record = (value: unknown): Record<string, unknown> | null => (isRecord(value) ? value : null)

const numberAt = (source: Record<string, unknown> | null, key: string): number | null =>
  typeof source?.[key] === 'number' ? source[key] : null

const stringAt = (source: Record<string, unknown> | null, key: string): string | null =>
  typeof source?.[key] === 'string' ? source[key] : null

/**
 * Reads what `getGPUInfo` actually returns, and nothing more: `electron.d.ts` types the call
 * `Promise<unknown>` and declares no GPU-memory field, so nothing here may assume a shape.
 *
 * With no device flagged active, the first is taken — on a dual-GPU laptop that is the integrated
 * one, which under-promises rather than over-promises.
 */
export function gpuIdentityOf(info: unknown): GpuIdentity | null {
  const root = record(info)
  if (!root) return null

  const devices = Array.isArray(root.gpuDevice) ? root.gpuDevice : []
  const active = record(devices.find(device => record(device)?.active === true) ?? devices[0])

  return {
    vendorId: numberAt(active, 'vendorId'),
    deviceId: numberAt(active, 'deviceId'),
    renderer: stringAt(record(root.auxAttributes), 'glRenderer'),
    machineModel: stringAt(root, 'machineModelName'),
  }
}

/**
 * Whether the card in this machine is an NVIDIA one — which is the whole of what CUDA needs here.
 *
 * `0x10de` is NVIDIA's PCI vendor id. The name is read as well, and not as a nicety: `getGPUInfo`
 * answers a renderer and no id under some drivers, and a card nobody identified is a card whose
 * owner generates on the processor without being told.
 */
export function isNvidia(gpu: GpuIdentity | null): boolean {
  return gpu?.vendorId === 0x10de || /NVIDIA|GeForce|Quadro|Tesla|CUDA/i.test(gpu?.renderer ?? '')
}

/**
 * Whether the CPU and the GPU draw from one pot — MEASURED where a runtime answered.
 *
 * `[D]` Without a reading it falls back to the deduction it has always made: Apple Silicon is
 * unified, everything else is assumed split. `unifiedSize` is what `node-llama-cpp` documents as
 * the shared portion, and it is greater than zero on a SoC alone.
 */
export function memoryDomainOf(
  platform: NodeJS.Platform,
  arch: string,
  vram: VramReading | null,
): MemoryDomain {
  if (vram !== null) return vram.unifiedBytes > 0 ? 'unified' : 'split'
  return platform === 'darwin' && arch === 'arm64' ? 'unified' : 'split'
}

/**
 * 🛑 A card of no capacity is not a card: a llama.cpp build with no GPU answers zeroes rather than
 * refusing, and passed on that reads as a machine holding NOTHING — every model refused for want
 * of memory it never needed, on a machine that runs them on its CPU perfectly well.
 */
const usable = (reading: VramReading | null): VramReading | null =>
  reading !== null && reading.totalBytes > 0 ? reading : null

/** The probe holds the "absence rather than a guess" policy for every reading that may fail. */
export async function hardwareProbe(port: HardwarePort): Promise<HardwareFacts> {
  const [availableBytes, diskFreeBytes, info, vram] = await Promise.all([
    orElse(port.availableBytes(), null),
    orElse(port.diskFreeBytes(), null),
    orElse(port.gpuInfo(), null),
    orElse(port.vram(), null),
  ])

  return {
    platform: port.platform(),
    arch: port.arch(),
    cpuCount: port.cpuCount(),
    physicalBytes: port.totalBytes(),
    freeBytes: availableBytes,
    diskFreeBytes,
    gpu: gpuIdentityOf(info),
    vram: usable(vram),
  }
}

/** The thresholds ADR-19 leaves undecided. Passed in, never chosen here. */
export type ProbeBudget = {
  readonly appBudgetBytes: number
  readonly headroomBytes: number
  readonly rendererReservedBytes: number
}

/**
 * The pot the weights actually come out of — a runtime's own reading whenever there is one.
 *
 * 🛑 On BOTH domains, and the unified case is the one that was wrong: `[M]` on this M2 Max,
 * `os.freemem()` answers 27,0 GiB while llama.cpp answers 77,8 GiB allocatable — the difference is
 * 29,9 GiB of inactive pages the system reading does not count. Reading the system there because
 * "it is the same memory" threw away the better of two readings and refused models that fit.
 */
function potOf(facts: HardwareFacts, budget: ProbeBudget): { capacity: number; free: number } {
  if (facts.vram !== null) {
    return { capacity: facts.vram.totalBytes, free: facts.vram.freeBytes }
  }

  return {
    capacity: budget.appBudgetBytes,
    free: facts.freeBytes ?? budget.appBudgetBytes,
  }
}

/**
 * The machine reading a verdict and an admission are both weighed against.
 *
 * `source` is `runtime` exactly when a runtime answered for the video memory, which is what R1 of
 * ADR-19 asks: a probe alone sorts a catalogue and explains a refusal, and admits nothing.
 * `rendererReservedBytes` comes off the CAPACITY alone — the free reading is a residue the window
 * is already out of, and taking it off both counted it twice.
 */
export function memorySnapshotOf(
  facts: HardwareFacts,
  budget: ProbeBudget,
  at: number,
  runtimeBytes: Readonly<Record<RuntimeEndpointId, RuntimeOccupancy>> = {},
): MemorySnapshot {
  // Guarded here too: `hardwareProbe` normalises what a port answered, and a `HardwareFacts`
  // composed anywhere else must not be able to zero the machine.
  const reading = usable(facts.vram)
  const domain = memoryDomainOf(facts.platform, facts.arch, reading)
  const pot = potOf({ ...facts, vram: reading }, budget)
  const allowed = pot.capacity - budget.rendererReservedBytes

  return {
    domain,
    source: reading === null ? 'probe' : 'runtime',
    at,
    physicalBytes: facts.physicalBytes,
    appBudgetBytes: pot.capacity,
    rendererReservedBytes: budget.rendererReservedBytes,
    runtimeBytes,
    headroomBytes: budget.headroomBytes,
    availableBytes: Math.max(0, Math.min(allowed, pot.free) - budget.headroomBytes),
  }
}

/** R1 of ADR-19, held by the type: the one door a runtime reading reaches an admission through. */
export function asRuntimeSnapshot(snapshot: MemorySnapshot): RuntimeSnapshot | null {
  return snapshot.source === 'runtime' ? { ...snapshot, source: 'runtime' } : null
}
