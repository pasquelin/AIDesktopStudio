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
 * The wheel index that serves the torch a platform actually needs, `null` for PyPI's own.
 *
 * `pyproject.toml` pins the same thing for `uv` under `[tool.uv.sources]` — a section pip has
 * never read, which is why the pin is spelled a second time for the pip the interpreter carries.
 */
const TORCH_INDEX: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
  // Measured 2026-09-08: PyPI's Linux torch drags 4.9 GB of nvidia-* wheels plus triton — 5 638 MB
  // installed against 684 on macOS. The CPU index answers the same torch without them.
  linux: 'https://download.pytorch.org/whl/cpu',
  // PyPI serves the CPU wheel on Windows, so an NVIDIA card generated on the processor unnoticed.
  // `cu126` and not the newer `cu130` or `cu132`, all three of which publish a 2.14.0 wheel
  // (verified 2026-09-08 on the index): it is what pytorch.org's own selector preselects, and its
  // driver floor is the lowest — a machine too old for CUDA 13 would be back to the silent CPU.
  win32: 'https://download.pytorch.org/whl/cu126',
}

/**
 * `--extra-index-url` and NOT `--index-url`: the second REPLACES PyPI, and diffusers, transformers
 * and imageio are published nowhere but there. Both indexes offer torch, and PEP 440 orders a
 * local version above the plain release — `2.14.0+cpu` wins over PyPI's `2.14.0`.
 */
export function torchIndexArgsFor(platform: NodeJS.Platform): readonly string[] {
  const index = TORCH_INDEX[platform]
  return index === undefined ? [] : ['--extra-index-url', index]
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

/** Everything the environment lacks, in ONE pip run: it resolves them together or not at all. */
export async function installEngineLibraries(deps: InstallEngineLibraries): Promise<void> {
  if (deps.declaration.length === 0) return

  const read = pipProgress()
  // No `--upgrade`: it would replace the signed `torch==2.14.0` this build ships, and a Mach-O
  // this build did not sign is refused at `dlopen` under the hardened runtime (`resources.ts`).
  // Without it pip leaves a satisfied requirement alone and still installs the absent and the
  // stale, which is the whole job. `--upgrade-strategy` governs DEPENDENCIES and would not have
  // covered a torch the declaration names itself.
  await deps.spawn(
    deps.python,
    [
      '-m',
      'pip',
      'install',
      '--no-input',
      ...torchIndexArgsFor(deps.platform),
      ...deps.declaration,
    ],
    line => {
      const ratio = read(line)
      if (ratio !== null) deps.onProgress(ratio)
    },
    deps.signal,
  )
}
