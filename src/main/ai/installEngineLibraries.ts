/**
 * Installs the door's tensor libraries with the interpreter the app already ships.
 *
 * `pip` and not `uv`: nothing but the embedded interpreter can be assumed on the computer, and it
 * carries pip. The declaration comes from the ENGINE (`engine.requirements`), never from a list
 * written here — one copied into TypeScript would drift from the one `uv` resolves.
 */

export type InstallEngineLibraries = {
  /** The embedded interpreter — `bundledEngine().python`. Never the computer's own. */
  readonly python: string
  /**
   * Which machine this runs on, INJECTED — `process.platform` is never read here.
   *
   * The same reason `HardwarePort` takes it: a default read from the process let tests assert the
   * macOS tree and go red on a CI runner, and the compiler is what makes a caller say.
   */
  readonly platform: NodeJS.Platform
  /**
   * Whether an NVIDIA card sits in this machine, INJECTED — `isNvidia` reads it off the probe.
   *
   * Injected for the same reason as `platform`, and for one more: a card is what decides between
   * a 682 MB install and a 2.6 GB one, and no test can grow one to assert that branch.
   */
  readonly hasNvidia: boolean
  /**
   * Free bytes on the volume the INTERPRETER lives on, or `null` where none could be read.
   *
   * Its volume and not the weights': the libraries land in the embedded runtime's site-packages,
   * while the model folder is a setting that may point at another disk entirely.
   */
  readonly freeBytes: () => Promise<number | null>
  /** What `pyproject.toml` declares for the door's extra, handed over verbatim. */
  readonly declaration: readonly string[]
  /** Every line the run writes, stdout and stderr alike: pip draws its bar on the second. */
  readonly spawn: (
    command: string,
    args: readonly string[],
    onLine: (line: string) => void,
    signal: AbortSignal,
  ) => Promise<void>
  readonly onProgress: (ratio: number) => void
  readonly signal: AbortSignal
}

/**
 * The THIRD spelling of this pin: `engine/pyproject.toml` writes it for `uv` under
 * `[tool.uv.sources]`, a section pip has never read, and `scripts/prepare-engine-runtime.mjs`
 * writes it for the build. `installEngineLibraries.test.ts` holds this one and the pyproject in
 * step; the build's own copy is guarded by nothing.
 */
const CPU_INDEX = 'https://download.pytorch.org/whl/cpu'

/**
 * The CUDA build a card earns, and the wheels that may only move together.
 *
 * Read off the index 2026-09-08 (cp312, `win_amd64` and `manylinux_2_28_x86_64`): `cu126` asks the
 * lowest driver of the tags carrying this torch, and serves the whole chain, nvidia-* included.
 *
 * 🛑 Each pin carries its LOCAL segment. torchvision 0.29.0 reads `Requires-Dist: torch
 * (==2.14.0)` with none of its own, which the embedded `2.14.0+cpu` satisfies — drop a segment and
 * pip keeps the CPU torch beside a CUDA torchvision, dead at `import torchvision`.
 *
 * **Blind spot, in clear**: torchaudio 2.11.0 is the last published anywhere (2026-09-08) and
 * declares no torch dependency at all, so NOTHING will say so the day the pairing breaks.
 */
const CUDA_INDEX = 'https://download.pytorch.org/whl/cu126'
const CUDA_PINS: Readonly<Record<string, string>> = {
  torch: '2.14.0+cu126',
  torchvision: '0.29.0+cu126',
  torchaudio: '2.11.0+cu126',
}

/** `torch>=2.6` → `torch`. The declaration writes no marker and no extra — see `requirements.py`. */
const nameOf = (requirement: string): string => requirement.split(/[<>=!~;[\s]/)[0] ?? ''

/**
 * Where a machine with no card fetches torch from, and nothing where PyPI already serves it.
 *
 * `--extra-index-url` and NOT `--index-url`: the second REPLACES PyPI, where diffusers and
 * transformers are published alone. PEP 440 orders `2.14.0+cpu` above PyPI's plain `2.14.0`, so
 * the pinned index still wins. Measured 2026-09-08: PyPI's Linux torch drags 4.9 GB of nvidia-*
 * wheels plus triton — 5 638 MB installed against 684 on macOS.
 */
const cpuIndexFor = (platform: NodeJS.Platform): readonly string[] =>
  platform === 'linux' ? ['--extra-index-url', CPU_INDEX] : []

/**
 * What the volume must hold before pip opens a socket. A FLOOR, never a measured peak — the
 * reading `reservationBytes` already gets under R3 of ADR-19.
 *
 * Measured 2026-09-08: 682 MB installed for the processor wheels, 5 638 MB for a Linux CUDA torch
 * with its nvidia-* chain. The Windows figure is the `cu126` wheel's own DOWNLOAD size and its
 * unpacked tree is larger — a disk under even that was never going to hold the install.
 */
const CPU_BYTES = 682e6
const CUDA_BYTES: Readonly<Record<string, number>> = { win32: 2_602e6, linux: 5_638e6 }

/** The volume cannot hold what was asked. Thrown BEFORE pip runs, so nothing is half written. */
export class NotEnoughDiskError extends Error {
  constructor(
    readonly neededBytes: number,
    readonly freeBytes: number,
  ) {
    super(`the engine libraries ask for ${neededBytes} bytes, the disk holds ${freeBytes}`)
    this.name = 'NotEnoughDiskError'
  }
}

/** One call to pip: where it fetches from, and what it is asked for. */
type PipRun = {
  /** The index arguments this run needs, empty where PyPI is what serves it. */
  readonly index: readonly string[]
  readonly packages: readonly string[]
}

/**
 * The runs, and whether any of them ASKED the CUDA index — never what landed, which only
 * `torch_cuda()` can say. Answered here rather than read back off an argv: the guard against a
 * silent fall back to the processor hangs on it.
 */
export type PipPlan = {
  readonly runs: readonly PipRun[]
  readonly cuda: boolean
}

/**
 * What to run pip with, and how many times: once where a card changes nothing, twice where it does.
 *
 * The two cannot share a run. `--index-url` REPLACES PyPI, which the tensor wheels need — an
 * `--extra-index-url` leaves pip free to answer `torch==2.14.0` from PyPI, and on Windows that is
 * the CPU build, so the pin would land on the wrong artefact. Everything else comes in the second
 * run, where the torch just installed satisfies the `==2.14.0` its dependants ask for.
 *
 * 🛑 This does NOT overturn the Linux CPU index of `engine/pyproject.toml`. That decision refused
 * 5 638 MB of nvidia-* wheels INSIDE an AppImage of ~3 GB shipped to every Linux user, card or no
 * card. The AppImage does not move; only a machine that has the card downloads this.
 */
export function pipRunsFor(
  platform: NodeJS.Platform,
  hasNvidia: boolean,
  declaration: readonly string[],
): PipPlan {
  if (declaration.length === 0) return { runs: [], cuda: false }

  const plain: PipRun = { index: cpuIndexFor(platform), packages: declaration }
  // macOS is left alone: no torch has been built against a CUDA card there for years, and its
  // wheel is the signed one this build ships.
  if (!hasNvidia || platform === 'darwin') return { runs: [plain], cuda: false }

  const pinned: string[] = []
  const rest: string[] = []
  for (const line of declaration) {
    const name = nameOf(line)
    const pin = CUDA_PINS[name]
    if (pin === undefined) rest.push(line)
    else pinned.push(`${name}==${pin}`)
  }
  // A door declaring none of the three: nothing here replaces a torch, so nothing changes.
  if (pinned.length === 0) return { runs: [plain], cuda: false }

  return {
    runs: [
      { index: ['--index-url', CUDA_INDEX], packages: pinned },
      ...(rest.length === 0 ? [] : [{ index: [], packages: rest }]),
    ],
    cuda: true,
  }
}

const DOWNLOADED = /([\d.]+)\/([\d.]+)\s*(kB|MB|GB)/
const SIZES: Readonly<Record<string, number>> = { kB: 1e3, MB: 1e6, GB: 1e9 }
/** The last hundredth is the install itself, which pip draws no bar for. */
const RESOLVED = 0.99

/**
 * What pip's own bar says, turned into one ratio.
 *
 * **Blind spot, in clear**: the total is only what pip has ANNOUNCED so far, and it grows as the
 * resolver discovers wheels — so this is held monotonic by construction rather than by measure. A
 * bar that walked backwards on a 682 MB download would read as a failure.
 */
export function pipProgress(): (line: string) => number | null {
  let done = 0
  let total = 0
  let current = 0
  let highest = 0

  return line => {
    const found = DOWNLOADED.exec(line)
    if (!found) return null

    const unit = SIZES[found[3] ?? ''] ?? 1
    const at = Number(found[1]) * unit
    const size = Number(found[2]) * unit
    // A different size means pip restarted its bar on the next wheel, so the one before it landed.
    if (size !== current) {
      done += current
      total += size
      current = size
    }

    highest = Math.max(highest, total === 0 ? 0 : Math.min((done + at) / total, RESOLVED))
    return highest
  }
}

/**
 * Everything the environment lacks, in the runs `pipRunsFor` composed.
 *
 * Answers what it ASKED the indexes for, and never what landed: the caller confirms that against
 * `torch_cuda()`, because an install that quietly falls back to the processor is the very failure
 * this repairs.
 */
export async function installEngineLibraries(
  deps: InstallEngineLibraries,
): Promise<{ readonly cuda: boolean }> {
  const { runs, cuda } = pipRunsFor(deps.platform, deps.hasNvidia, deps.declaration)
  if (runs.length === 0) return { cuda: false }

  // Refused BEFORE pip opens a socket: a run that fills the volume half way leaves an environment
  // no later reading can explain, and a card turned this download from 682 MB into gigabytes.
  // A `null` reading refuses nothing — absence is not a measurement.
  const free = await deps.freeBytes()
  const needed = cuda ? (CUDA_BYTES[deps.platform] ?? CPU_BYTES) : CPU_BYTES
  if (free !== null && free < needed) throw new NotEnoughDiskError(needed, free)

  // One reader across both runs: pip restarts its bar on the second, and the reader is what holds
  // the ratio monotonic across that restart.
  const read = pipProgress()

  for (const run of runs) {
    // No `--upgrade`: it would replace the signed `torch==2.14.0` this build ships, and a Mach-O
    // this build did not sign is refused at `dlopen` under the hardened runtime (`resources.ts`).
    // `--upgrade-strategy` governs DEPENDENCIES and would not have covered a torch named here.
    await deps.spawn(
      deps.python,
      ['-m', 'pip', 'install', '--no-input', ...run.index, ...run.packages],
      line => {
        const ratio = read(line)
        if (ratio !== null) deps.onProgress(ratio)
      },
      deps.signal,
    )
  }

  return { cuda }
}
