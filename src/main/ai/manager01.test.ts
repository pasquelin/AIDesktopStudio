import type { MemorySnapshot } from '@shared/domain/aiMemory'
import type { AiOverview } from '@shared/domain/aiOverview'
import { aiRoleId, ASSISTANT_ROLE, AUTO_RIG_ROLE, DICTATION_ROLE } from '@shared/domain/aiRole'
import { STT_MODEL } from '@shared/domain/dictation'
import type { DownloadProgress, LocalModel } from '@shared/domain/localModel'
import { GIBI } from '@shared/domain/localModel-fixtures'
import { ollamaModel } from '@shared/domain/ollamaModel'
import { DEFAULT_SETTINGS, type PartialSettings, type Settings } from '@shared/domain/settings'
import { describe, expect, it, vi } from 'vitest'
import type { HardwareFacts } from './hardwareProbe'
import type { LocalRuntime, LocalRuntimes } from './localRuntimes'
import { shippedModel } from './catalogue'
import { createAiManager, type ManagerDeps } from './manager'

const FACTS: HardwareFacts = {
  platform: 'linux',
  arch: 'x64',
  cpuCount: 8,
  physicalBytes: 96 * GIBI,
  freeBytes: 34 * GIBI,
  diskFreeBytes: 500 * GIBI,
  gpu: null,
  vram: null,
}

const SNAPSHOT: MemorySnapshot = {
  domain: 'unified',
  source: 'probe',
  at: 0,
  physicalBytes: 96 * GIBI,
  appBudgetBytes: 48 * GIBI,
  rendererReservedBytes: GIBI,
  runtimeBytes: {},
  headroomBytes: 2 * GIBI,
  availableBytes: 34 * GIBI,
}

/** A runtime that installs nothing and holds nothing — what most of these cases need behind them. */
const idleRuntime = (install: LocalRuntime['install'] = () => Promise.resolve()): LocalRuntime => ({
  read: () => Promise.resolve({ ready: true, installed: new Set<string>(), loaded: new Set() }),
  install,
  remove: () => Promise.resolve(),
})

/**
 * A download that hangs until the test lets it go, or until it is aborted.
 *
 * `begun` is what a test waits on before settling it: the manager starts the fetch a tick late,
 * so the lock is in place before anything can clear it.
 */
type Held = {
  runtimes: LocalRuntimes
  begun: Promise<void>
  report: (progress: DownloadProgress) => void
  settle: () => void
  fail: (error: Error) => void
  calls: () => number
}

const heldInstall = (): Held => {
  let resolve: (() => void) | undefined
  let reject: ((error: Error) => void) | undefined
  let tell: ((progress: DownloadProgress) => void) | undefined
  let started: () => void = () => {}
  let calls = 0

  return {
    begun: new Promise<void>(ok => {
      started = ok
    }),
    runtimes: {
      'sherpa-onnx': idleRuntime((_model, onProgress, signal) => {
        calls += 1
        tell = onProgress
        started()
        return new Promise<void>((ok, no) => {
          resolve = ok
          reject = no
          signal.addEventListener('abort', () => no(new Error('aborted')))
        })
      }),
    },
    report: progress => tell?.(progress),
    settle: () => resolve?.(),
    fail: error => reject?.(error),
    calls: () => calls,
  }
}

const manager = (over: Partial<ManagerDeps> = {}) =>
  createAiManager({
    facts: () => Promise.resolve(FACTS),
    snapshotOf: () => SNAPSHOT,
    settings: () => DEFAULT_SETTINGS,
    writeSettings: () => undefined,
    currentProjectPath: () => null,
    readyClouds: () => [],
    runtimes: { 'sherpa-onnx': idleRuntime(), ollama: idleRuntime() },
    emit: () => {},
    log: () => {},
    now: () => 0,
    idleUnloadMinutes: () => 0,
    ollamaInstalled: () => false,
    installOllama: () => Promise.resolve(),
    engineMissing: () => Promise.resolve(null),
    installEngine: () => Promise.resolve(),
    ...over,
  })

const other = (id: string): LocalModel => ({ ...STT_MODEL, id })

const nothing = (_progress: DownloadProgress): void => {}

/** One candidate of the whole overview, whichever row holds it. */
const candidateOf = (overview: AiOverview, modelId: string) =>
  overview.roles.flatMap(row => row.candidates).find(one => one.model.id === modelId)

describe('the AI manager', () => {
  it('offers MIA for download without selecting it before its checkpoints are installed', async () => {
    const mia = shippedModel('make-it-animatable')
    expect(mia).not.toBeNull()

    const overview = await manager({
      runtimes: {
        'sherpa-onnx': idleRuntime(),
        plugin: idleRuntime(),
        ollama: idleRuntime(),
      },
    }).overview()
    const row = overview.roles.find(candidate => candidate.role === AUTO_RIG_ROLE)

    expect(row?.candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ model: mia, installed: false })]),
    )
    expect(row?.provider).toBeNull()
  })

  it('refuses installation before a distribution-blocked runtime is contacted', async () => {
    const install = vi.fn(() => Promise.resolve())
    const ai = manager({ runtimes: { 'sherpa-onnx': idleRuntime(install) } })
    const blocked: LocalModel = { ...STT_MODEL, distributionStatus: 'blocked' }

    await expect(ai.installModel(blocked, nothing)).rejects.toThrow('model is not admitted')
    expect(install).not.toHaveBeenCalled()
  })

  it('refuses selecting a distribution-blocked local model', async () => {
    const blocked: LocalModel = {
      ...STT_MODEL,
      id: 'blocked-model',
      distributionStatus: 'blocked',
    }
    const ai = manager({
      settings: () => ({
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, ownModels: [blocked] },
      }),
    })

    await expect(
      ai.choose(DICTATION_ROLE, { kind: 'local', modelId: blocked.id }, 'app'),
    ).rejects.toThrow('model is not admitted')
  })

  it('does not remove a model while a runtime client holds it', async () => {
    const remove = vi.fn(() => Promise.resolve())
    const ai = manager({
      runtimes: { 'sherpa-onnx': { ...idleRuntime(), remove } },
    })
    const release = ai.hold(STT_MODEL.id)

    await ai.remove(STT_MODEL.id)
    expect(remove).not.toHaveBeenCalled()

    release()
    await ai.remove(STT_MODEL.id)
    expect(remove).toHaveBeenCalledOnce()
  })

  it('lists a discovered Ollama chat model on the assistant', async () => {
    const qwen = ollamaModel({ name: 'qwen3:8b', size: 5_000_000_000 })
    expect(qwen).not.toBeNull()
    if (!qwen) return

    const overview = await manager({
      runtimes: {
        'sherpa-onnx': idleRuntime(),
        ollama: {
          ...idleRuntime(),
          discover: () => Promise.resolve([qwen]),
          read: () =>
            Promise.resolve({
              ready: true,
              installed: new Set(['qwen3:8b']),
              loaded: new Set(),
            }),
        },
      },
    }).overview()

    const row = overview.roles.find(one => one.role === ASSISTANT_ROLE)
    expect(row?.candidates.some(one => one.model.id === 'qwen3:8b')).toBe(true)
  })

  /**
   * A tag deleted outside the studio is gone from the listing. The stored choice stays: wiping
   * it would lose a preference the person would want back after they restore the tag.
   */
  it('keeps the stored choice when a discovered tag disappears', async () => {
    const qwen = ollamaModel({ name: 'qwen3:8b', size: 5_000_000_000 })
    expect(qwen).not.toBeNull()
    if (!qwen) return

    let listed: readonly LocalModel[] = [qwen]
    const written: PartialSettings[] = []
    const stored: Settings = {
      ...DEFAULT_SETTINGS,
      ai: {
        ...DEFAULT_SETTINGS.ai,
        roles: { [ASSISTANT_ROLE]: { kind: 'local', modelId: 'qwen3:8b' } },
      },
    }
    const ai = manager({
      settings: () => stored,
      writeSettings: partial => {
        written.push(partial)
      },
      runtimes: {
        'sherpa-onnx': idleRuntime(),
        ollama: {
          ...idleRuntime(),
          discover: () => Promise.resolve(listed),
          read: () =>
            Promise.resolve({
              ready: true,
              installed: new Set(listed.map(model => model.id)),
              loaded: new Set(),
            }),
        },
      },
    })

    expect(candidateOf(await ai.overview(), 'qwen3:8b')).toBeDefined()
    listed = []
    ai.forgetDiscovered()

    expect(candidateOf(await ai.overview(), 'qwen3:8b')).toBeUndefined()
    expect(written).toEqual([])
    expect(stored.ai.roles[ASSISTANT_ROLE]).toEqual({ kind: 'local', modelId: 'qwen3:8b' })
  })

  it('says Ollama is missing until a binary is on this computer', async () => {
    expect((await manager().overview()).ollama.installed).toBe(false)
    expect((await manager({ ollamaInstalled: () => true }).overview()).ollama.installed).toBe(true)
  })

  it('reports the official-archive install until it lands', async () => {
    let release!: () => void
    const held = new Promise<void>(ok => {
      release = ok
    })
    const seen: (number | null)[] = []
    const ai = manager({
      installOllama: async onProgress => {
        onProgress(0.4)
        await held
      },
      emit: overview => seen.push(overview.ollama.progress),
    })

    const running = ai.installOllama()
    await vi.waitFor(() => {
      expect(seen).toContain(0.4)
    })
    release()
    const done = await running

    expect(done.ollama.progress).toBeNull()
    expect(done.ollama.failed).toBe(false)
  })

  it('keeps the Install offer and says so when the official archive did not land', async () => {
    const overview = await manager({
      installOllama: () => Promise.reject(new Error('zstd is not on this computer')),
    }).installOllama()

    expect(overview.ollama.installed).toBe(false)
    expect(overview.ollama.failed).toBe(true)
  })

  it('writes every employment of one pick in a single settings save', async () => {
    const written: PartialSettings[] = []
    await manager({
      writeSettings: partial => {
        written.push(partial)
      },
    }).chooseMany(
      [
        { role: aiRoleId('image', 'txt2img'), provider: { kind: 'local', modelId: 'ssd-1b' } },
        { role: aiRoleId('image', 'inpaint'), provider: { kind: 'local', modelId: 'ssd-1b' } },
      ],
      'app',
    )

    expect(written).toHaveLength(1)
    expect(written[0]?.ai?.roles).toMatchObject({
      'image/txt2img': { kind: 'local', modelId: 'ssd-1b' },
      'image/inpaint': { kind: 'local', modelId: 'ssd-1b' },
    })
  })

  /**
   * The status line and the manager screen fetch the same files into the same folder. Two
   * streams onto one `.part` would fail a digest rather than a download, so the second caller
   * joins the first instead of opening one.
   */
  it('joins two callers asking for the same model onto one download', async () => {
    const held = heldInstall()
    const ai = manager({ runtimes: held.runtimes })

    const first = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    const second = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    await held.begun
    held.settle()
    await Promise.all([first, second])

    expect(held.calls()).toBe(1)
  })

  it('refuses a second model while one is being fetched', async () => {
    const held = heldInstall()
    const ai = manager({ runtimes: held.runtimes })

    const running = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    // Rejected rather than thrown: one channel for one failure, whatever the caller awaits on.
    await expect(ai.installModel(other('another'), nothing)).rejects.toThrow()

    await held.begun
    held.settle()
    await running
  })

  /**
   * A join that only shared the promise left the dictation status line at 0/0 with a cancel
   * button that did nothing, while the manager screen showed the same download moving.
   */
  it('reports to whoever joined, and lets them stop it', async () => {
    const held = heldInstall()
    const ai = manager({ runtimes: held.runtimes })
    const seen: number[] = []
    const mine = new AbortController()

    const first = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    const second = ai.installModel(STT_MODEL, step => seen.push(step.received), mine.signal)
    await held.begun

    held.report({ received: 7, total: 9 })
    expect(seen).toEqual([7])

    mine.abort()
    await expect(first).rejects.toThrow()
    await expect(second).rejects.toThrow()
  })

  // One lock, so a cancel from the manager screen reaches a download the status line began.
  it('cancels a download whatever asked for it', async () => {
    const held = heldInstall()
    const ai = manager({ runtimes: held.runtimes })

    const running = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    await held.begun
    await ai.cancelInstall()

    await expect(running).rejects.toThrow()
  })

  it('lets go of the lock when a download fails', async () => {
    const held = heldInstall()
    const ai = manager({ runtimes: held.runtimes })

    const running = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    await held.begun
    held.fail(new Error('network'))
    await expect(running).rejects.toThrow()

    // The second call is what the lock would have refused, had it stayed held.
    const again = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    await Promise.resolve()
    held.settle()
    await again

    expect(held.calls()).toBe(2)
  })

  /**
   * A window asked, and what it needs back is the state the studio is in. The dictation session
   * takes the other door — `installModel` rethrows, so it can tell a broken digest from a
   * network that gave up.
   */
  it('answers a window with an overview rather than raising, where the session gets the error', async () => {
    const log = vi.fn()
    const ai = manager({
      runtimes: { 'sherpa-onnx': idleRuntime(() => Promise.reject(new Error('network'))) },
      log,
    })

    await expect(ai.install(STT_MODEL.id)).resolves.toMatchObject({ installing: null })
    await expect(
      ai.installModel(STT_MODEL, nothing, new AbortController().signal),
    ).rejects.toThrow()
    // On the WARN and its subject: every compose also logs an `info` for the loader nothing wires
    // here, so a bare `toHaveBeenCalled` stayed green with the failure's own line deleted.
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining(STT_MODEL.id))
  })

  it('leaves a readable reason on the overview when a download drops', async () => {
    const after = await manager({
      runtimes: {
        'sherpa-onnx': idleRuntime(() => Promise.reject(new Error('net::ERR_NETWORK_CHANGED'))),
      },
    }).install(STT_MODEL.id)

    expect(after.installFailure).toEqual({ reason: 'network', modelId: STT_MODEL.id })
  })

  /**
   * Removing is a NETWORK call for a runtime that pulls its own weights, where deleting files
   * barely ever failed. Raised, it reached a `void removeAiModel(…)` in the window and became an
   * unhandled rejection: nothing in the journal, no overview, the row still saying "installed".
   */
  it('answers a window with an overview when a removal fails, rather than raising', async () => {
    const log = vi.fn()
    const ai = manager({
      runtimes: {
        'sherpa-onnx': {
          ...idleRuntime(),
          remove: () => Promise.reject(new Error('delete refused: HTTP 500')),
        },
      },
      log,
    })

    await expect(ai.remove(STT_MODEL.id)).resolves.toMatchObject({ installing: null })
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining(STT_MODEL.id))
  })

  /**
   * Which project is open decides which choices apply, and nothing inside the manager sees that
   * change: a settings window left open would keep a stale path and stale badges.
   */
  it('re-publishes the overview against the project that is open now', async () => {
    const seen: (string | null)[] = []
    let path: string | null = null
    const ai = manager({
      currentProjectPath: () => path,
      emit: overview => seen.push(overview.projectPath),
    })

    path = '/projects/one'
    await ai.refresh()

    expect(seen).toEqual(['/projects/one'])
  })

  it('says which install is running, so a window that did not ask still follows it', async () => {
    const held = heldInstall()
    const ai = manager({ runtimes: held.runtimes })

    const running = ai.installModel(STT_MODEL, nothing, new AbortController().signal)
    await held.begun
    expect((await ai.overview()).installing?.modelId).toBe(STT_MODEL.id)

    held.settle()
    await running
    expect((await ai.overview()).installing).toBeNull()
  })
})

/**
 * A runtime that HOLDS a model — what an idle one deliberately cannot do, and what the two
 * gestures ADR-21 § D asks for are about.
 */
