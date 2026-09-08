import { describe, expect, it, vi } from 'vitest'
import {
  installEngineLibraries,
  pipProgress,
  torchIndexArgsFor,
  type InstallEngineLibraries,
} from './installEngineLibraries'

describe('reading pip’s own bar', () => {
  it('answers nothing for a line that carries no size', () => {
    const read = pipProgress()

    expect(read('Collecting torch==2.13.0')).toBeNull()
  })

  /** A 682 MB download that walked backwards would read as a failure, not as a resolver. */
  it('never walks backwards when the resolver finds one more wheel', () => {
    const read = pipProgress()
    read('  ━━━━━━━━ 60.0/60.0 MB 5.0 MB/s')
    const settled = read('  ━━━━━━━━ 60.0/60.0 MB 5.0 MB/s') ?? 0

    // A second wheel: the total grows under a reading that was already near its end.
    expect(read('  ━━ 1.0/600.0 MB 5.0 MB/s') ?? 0).toBeGreaterThanOrEqual(settled)
  })

  it('stops short of the end, which pip draws no bar for', () => {
    const read = pipProgress()

    expect(read('  ━━━━━━━━ 60.0/60.0 MB 5.0 MB/s')).toBeLessThan(1)
  })

  it('reads kilobytes and gigabytes on the same scale as megabytes', () => {
    const read = pipProgress()

    expect(read('  ━━ 0.5/1.0 GB 5.0 MB/s')).toBeCloseTo(0.5, 2)
  })
})

describe('installing what the engine named', () => {
  const spawned = () => ({ spawn: vi.fn<InstallEngineLibraries['spawn']>(() => Promise.resolve()) })
  type Spawned = ReturnType<typeof spawned>['spawn']

  const install = (platform: NodeJS.Platform, declaration: readonly string[], spawn: Spawned) =>
    installEngineLibraries({
      python: '/app/engine/python/bin/python3',
      platform,
      declaration,
      spawn,
      onProgress: () => {},
      signal: new AbortController().signal,
    })

  /**
   * No `--upgrade`: it replaced the signed torch this build ships, which `dlopen` then refuses
   * under the hardened runtime. Its absence leaves a satisfied `torch>=2.6` where pip found it.
   */
  it('hands pip the declaration verbatim, in one run', async () => {
    const held = spawned()

    await install('darwin', ['torch>=2.6', 'diffusers>=0.40'], held.spawn)

    expect(held.spawn).toHaveBeenCalledWith(
      '/app/engine/python/bin/python3',
      ['-m', 'pip', 'install', '--no-input', 'torch>=2.6', 'diffusers>=0.40'],
      expect.any(Function),
      expect.anything(),
    )
  })

  /** An engine that answered a complete environment must not spawn pip to install nothing. */
  it('runs nothing when there is nothing to install', async () => {
    const held = spawned()

    await install('darwin', [], held.spawn)

    expect(held.spawn).not.toHaveBeenCalled()
  })
})

describe('choosing the wheel index the machine needs', () => {
  /** PyPI's Linux torch drags 4.9 GB of nvidia-* wheels for an AppImage of ~3 GB. */
  it('sends Linux to the CPU index', () => {
    expect(torchIndexArgsFor('linux')).toEqual([
      '--extra-index-url',
      'https://download.pytorch.org/whl/cpu',
    ])
  })

  /**
   * A CUDA index on Windows leaves the satisfied CPU torch in place and brings a `+cu126`
   * torchvision beside it, whose `Requires-Dist: torch (==2.14.0)` accepts it — a door that dies
   * at `import torchvision`. macOS already gets its arm64 wheel from PyPI.
   */
  it('names no index where PyPI is what the platform must be served from', () => {
    expect(torchIndexArgsFor('win32')).toEqual([])
    expect(torchIndexArgsFor('darwin')).toEqual([])
  })
})
