import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  installEngineLibraries,
  NotEnoughDiskError,
  pipProgress,
  pipRunsFor,
  type InstallEngineLibraries,
} from './installEngineLibraries'

const ROOT = join(import.meta.dirname, '..', '..', '..')

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
  const spawned = () => vi.fn<InstallEngineLibraries['spawn']>(() => Promise.resolve())

  const install = (
    platform: NodeJS.Platform,
    declaration: readonly string[],
    spawn: ReturnType<typeof spawned>,
    hasNvidia = false,
    freeBytes: number | null = 100e9,
  ) =>
    installEngineLibraries({
      python: '/app/engine/python/bin/python3',
      platform,
      hasNvidia,
      freeBytes: () => Promise.resolve(freeBytes),
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
    const spawn = spawned()

    await install('darwin', ['torch>=2.6', 'diffusers>=0.40'], spawn)

    expect(spawn).toHaveBeenCalledWith(
      '/app/engine/python/bin/python3',
      ['-m', 'pip', 'install', '--no-input', 'torch>=2.6', 'diffusers>=0.40'],
      expect.any(Function),
      expect.anything(),
    )
  })

  /** An engine that answered a complete environment must not spawn pip to install nothing. */
  it('runs nothing when there is nothing to install', async () => {
    const spawn = spawned()

    await install('darwin', [], spawn)

    expect(spawn).not.toHaveBeenCalled()
  })

  /**
   * The two runs cannot be one: the CUDA index REPLACES PyPI, where diffusers alone is published.
   * What was asked for is answered back, because it is never what landed — the caller confronts
   * it with `torch_cuda()`.
   */
  it('asks the CUDA index first, PyPI second, and says it asked for CUDA', async () => {
    const spawn = spawned()

    const asked = await install('win32', ['torch>=2.6', 'diffusers>=0.40'], spawn, true)

    expect(spawn.mock.calls.map(call => call[1])).toEqual([
      [
        '-m',
        'pip',
        'install',
        '--no-input',
        '--index-url',
        'https://download.pytorch.org/whl/cu126',
        'torch==2.14.0+cu126',
      ],
      ['-m', 'pip', 'install', '--no-input', 'diffusers>=0.40'],
    ])
    expect(asked).toEqual({ cuda: true })
  })

  /** Half an environment is worse than none: pip must not start on a volume that cannot hold it. */
  it('refuses before spawning pip when the volume cannot hold the install', async () => {
    const spawn = spawned()

    await expect(install('darwin', ['torch>=2.6'], spawn, false, 100e6)).rejects.toBeInstanceOf(
      NotEnoughDiskError,
    )
    expect(spawn).not.toHaveBeenCalled()
  })

  /** A volume that could not be read is an absence, and an absence refuses nothing. */
  it('installs anyway when the free space could not be read', async () => {
    const spawn = spawned()

    await install('darwin', ['torch>=2.6'], spawn, false, null)

    expect(spawn).toHaveBeenCalledOnce()
  })

  /** A card turns 682 MB of wheels into gigabytes, and the threshold follows it. */
  it('refuses on a volume the same install would have fitted in without a card', async () => {
    const spawn = spawned()

    await expect(install('win32', ['torch>=2.6'], spawn, true, 1e9)).rejects.toBeInstanceOf(
      NotEnoughDiskError,
    )
    await install('win32', ['torch>=2.6'], spawn, false, 1e9)

    expect(spawn).toHaveBeenCalledOnce()
  })
})

describe('choosing the runs the machine needs', () => {
  /** What the `plugin` extra declares, which is the only one of the two naming torchaudio. */
  const DOOR = ['torch>=2.6', 'torchvision>=0.21', 'torchaudio>=2.6', 'diffusers>=0.40']
  const CUDA = 'https://download.pytorch.org/whl/cu126'

  /**
   * 🛑 The build writes this URL too — `scripts/prepare-engine-runtime.mjs`, same function name,
   * same Linux predicate — and a comment reading « change one, read all three » was the whole of
   * what held them together. uv adds `--index-strategy` there; the URL is what must not drift.
   */
  it('fetches from the same CPU index the build pins', () => {
    const prepare = readFileSync(join(ROOT, 'scripts/prepare-engine-runtime.mjs'), 'utf8')
    const [, url] = pipRunsFor('linux', false, ['torch>=2.6']).runs[0]?.index ?? []

    expect(url).toBeDefined()
    expect(prepare).toContain(url)
  })

  /** PyPI's Linux torch drags 4.9 GB of nvidia-* wheels for an AppImage of ~3 GB. */
  it('sends a Linux machine with no card to the CPU index', () => {
    expect(pipRunsFor('linux', false, DOOR).runs).toEqual([
      { index: ['--extra-index-url', 'https://download.pytorch.org/whl/cpu'], packages: DOOR },
    ])
  })

  it('names no index where PyPI is what the platform must be served from', () => {
    expect(pipRunsFor('win32', false, DOOR).runs).toEqual([{ index: [], packages: DOOR }])
    expect(pipRunsFor('darwin', false, DOOR).runs).toEqual([{ index: [], packages: DOOR }])
  })

  /**
   * 🛑 The wheels move together, and with their local segment, or the door dies at
   * `import torchvision`: its `Requires-Dist: torch (==2.14.0)` accepts the embedded `+cpu`
   * build, so a range would leave a CPU torch under a CUDA torchvision.
   */
  it('pins the tensor wheels to their CUDA build where a card can use them', () => {
    const platforms: NodeJS.Platform[] = ['win32', 'linux']

    for (const platform of platforms) {
      expect(pipRunsFor(platform, true, DOOR).runs).toEqual([
        {
          index: ['--index-url', CUDA],
          packages: [
            'torch==2.14.0+cu126',
            'torchvision==0.29.0+cu126',
            'torchaudio==2.11.0+cu126',
          ],
        },
        { index: [], packages: ['diffusers>=0.40'] },
      ])
    }
  })

  /**
   * 🛑 The pinned CUDA builds have NO counterpart in `engine/pyproject.toml`, where every other
   * version of this project is declared, and nothing but this test ties the two: bump the torch
   * the runtime embeds and the `+cu126` build named here would land a different one beside it.
   */
  it('names the same torch release the embedded runtime pins', () => {
    const project = readFileSync(join(ROOT, 'engine/pyproject.toml'), 'utf8')
    // Bounded to the array: `[\s\S]*?` crossed the closing bracket, so an `autorig` that stopped
    // pinning would have captured the next `torch==` in the file and stayed green on nothing.
    const autorig = /autorig\s*=\s*\[([^\]]*)\]/.exec(project)?.[1] ?? ''
    const embedded = /"torch==([\d.]+)"/.exec(autorig)?.[1]

    expect(pipRunsFor('win32', true, ['torch>=2.6']).runs[0]?.packages).toEqual([
      `torch==${embedded}+cu126`,
    ])
  })

  /** `diffusion` names no torchaudio, and a repair of that door must not bring one in. */
  it('pins nothing the profile did not declare', () => {
    const { runs } = pipRunsFor('win32', true, [
      'torch>=2.6',
      'torchvision>=0.21',
      'diffusers>=0.40',
    ])

    expect(runs[0]?.packages).toEqual(['torch==2.14.0+cu126', 'torchvision==0.29.0+cu126'])
  })

  /** macOS ships the signed arm64 wheel, and no torch has been built there for a card in years. */
  it('leaves macOS on PyPI even where a card was reported', () => {
    expect(pipRunsFor('darwin', true, DOOR).runs).toEqual([{ index: [], packages: DOOR }])
  })

  /** A door naming none of the three must not spawn a pip run that asks for nothing. */
  it('opens no CUDA run for a declaration holding no tensor wheel', () => {
    expect(pipRunsFor('win32', true, ['diffusers>=0.40']).runs).toEqual([
      { index: [], packages: ['diffusers>=0.40'] },
    ])
  })
})
