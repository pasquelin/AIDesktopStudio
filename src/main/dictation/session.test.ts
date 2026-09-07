import { describe, expect, it, vi } from 'vitest'
import type { SttEvent } from '@shared/domain/dictation'
import { ChecksumMismatch, DownloadCancelled } from '../ai/modelInstall'
import { createSession, MAX_RESTARTS, type EngineListeners, type SessionHost } from './session'
import type { SttClient } from './sttClient'

function harness(overrides: Partial<SessionHost> = {}) {
  const events: SttEvent[] = []
  const timers: { run: () => void; delayMs: number }[] = []
  let captured: EngineListeners | null = null
  let loadFails: string | null = null

  const engine: SttClient = {
    load: () => (loadFails ? Promise.reject(new Error(loadFails)) : Promise.resolve()),
    push: vi.fn(),
    flush: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
  }

  const opened = vi.fn((listeners: EngineListeners) => {
    captured = listeners
    return engine
  })

  const host: SessionHost = {
    modelFolder: () => '/models',
    vadPath: () => '/resources/silero.onnx',
    settings: () => ({ threads: 2, silenceMs: 600, previewMs: 700, idleUnloadMinutes: 10 }),
    modelIsReady: () => Promise.resolve(true),
    download: () => Promise.resolve(),
    requestMicrophone: () => Promise.resolve('granted'),
    openEngine: opened,
    emit: event => void events.push(event),
    log: vi.fn(),
    join: (folder, name) => `${folder}/${name}`,
    schedule: (run, delayMs) => {
      timers.push({ run, delayMs })
      return () => {
        const at = timers.findIndex(timer => timer.run === run)
        if (at >= 0) timers.splice(at, 1)
      }
    },
    ...overrides,
  }

  return {
    session: createSession(host),
    events,
    engine,
    opened,
    timers,
    states: () => events.filter(event => event.type === 'state').map(event => event.state),
    settled: async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    },
    crash: (error: Error) => captured?.onFailure(error),
    speak: (text: string) => captured?.onFinal(text, 300),
    failLoad: (reason: string) => {
      loadFails = reason
    },
  }
}

describe('starting a session', () => {
  it('loads the engine and listens', async () => {
    const { session, states, opened } = harness()

    await session.start()

    expect(states()).toEqual(['loadingEngine', 'listening'])
    expect(opened).toHaveBeenCalledTimes(1)
    expect(session.snapshot().state).toBe('listening')
  })

  it('keeps the engine between sessions rather than forking one each time', async () => {
    const { session, states, opened } = harness()

    await session.start()
    await session.stop()
    await session.start()

    expect(opened).toHaveBeenCalledTimes(1)
    expect(states()).toEqual(['loadingEngine', 'listening', 'ready', 'listening'])
  })

  it('stops at the permission, and says which refusal it was', async () => {
    const { session, states, events, opened } = harness({
      requestMicrophone: () => Promise.resolve('denied'),
    })

    await session.start()

    expect(states()).toEqual(['permissionRequired'])
    expect(opened).not.toHaveBeenCalled()
    expect(events).toContainEqual({
      type: 'error',
      failure: { code: 'permissionDenied', message: expect.any(String) },
    })
  })

  it('says the model is missing without waiting to be started', async () => {
    const { states, settled } = harness({ modelIsReady: () => Promise.resolve(false) })

    await settled()

    expect(states()).toEqual(['modelMissing'])
  })

  it('takes back the missing model once something else has installed it', async () => {
    let onDisk = false
    const { session, states, settled } = harness({ modelIsReady: () => Promise.resolve(onDisk) })
    await settled()

    onDisk = true
    await session.probeModel()

    expect(states()).toEqual(['modelMissing', 'idle'])
  })

  it('leaves a live session alone when the manager stirs', async () => {
    const { session, states } = harness()
    await session.start()

    await session.probeModel()

    expect(states()).toEqual(['loadingEngine', 'listening'])
  })

  it('asks for the model rather than failing when it is not there', async () => {
    let onDisk = true
    const { session, states, opened, settled } = harness({
      modelIsReady: () => Promise.resolve(onDisk),
    })
    await settled()
    onDisk = false

    await session.start()

    expect(states()).toEqual(['modelMissing'])
    expect(opened).not.toHaveBeenCalled()
  })

  it('hands the engine the paths and the settings', async () => {
    const { session, engine } = harness()
    const load = vi.spyOn(engine, 'load')

    await session.start()

    expect(load).toHaveBeenCalledWith({
      encoder: '/models/encoder.int8.onnx',
      decoder: '/models/decoder.int8.onnx',
      joiner: '/models/joiner.int8.onnx',
      tokens: '/models/tokens.txt',
      vad: '/resources/silero.onnx',
      threads: 2,
      silenceMs: 600,
      previewMs: 700,
    })
  })
})

describe('a session that goes wrong', () => {
  it('reports an engine that could not load', async () => {
    const harnessed = harness()
    harnessed.failLoad('encoder.int8.onnx is not an ONNX file')

    await harnessed.session.start()

    expect(harnessed.session.snapshot().state).toBe('error')
    expect(harnessed.session.snapshot().failure?.code).toBe('engineCrashed')
  })

  it('gives up after three failed loads in a row', async () => {
    const harnessed = harness()
    harnessed.failLoad('the addon will not load')

    for (let attempt = 0; attempt < MAX_RESTARTS + 1; attempt += 1) await harnessed.session.start()

    expect(harnessed.opened).toHaveBeenCalledTimes(MAX_RESTARTS)
    expect(harnessed.session.snapshot().state).toBe('error')
  })

  it('counts from zero again once a session has actually worked', async () => {
    const { session, opened } = harness()

    await session.start()
    await session.stop()
    await session.start()

    expect(session.snapshot().failure).toBeNull()
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('reports the engine dying mid-sentence', async () => {
    const { session, crash } = harness()

    await session.start()
    crash(new Error('exited with code 139'))

    expect(session.snapshot().state).toBe('error')
    expect(session.snapshot().failure).toEqual({
      code: 'engineCrashed',
      message: 'exited with code 139',
    })
  })

  it('forks a new engine after a crash rather than staying deaf', async () => {
    const { session, crash, opened } = harness()

    await session.start()
    crash(new Error('gone'))
    await session.start()

    expect(opened).toHaveBeenCalledTimes(2)
    expect(session.snapshot().state).toBe('listening')
  })

  it('closes the engine it is giving up on', async () => {
    const { session, engine, crash } = harness()

    await session.start()
    crash(new Error('the decoder refused a segment'))

    expect(engine.close).toHaveBeenCalled()
  })

  /**
   * The budget counts failures in a row, and a crash is one — it used to count only failures to
   * load, so an engine that died on the first chunk of every session was forked again, forever.
   * A sentence that comes back is what proves the engine works, so that is what clears it.
   */
  it('stops forking after three crashes in a row', async () => {
    const { session, crash, opened } = harness()

    for (let attempt = 0; attempt < MAX_RESTARTS; attempt += 1) {
      await session.start()
      crash(new Error('exited with code 139'))
    }
    await session.start()

    expect(opened).toHaveBeenCalledTimes(MAX_RESTARTS)
    expect(session.snapshot().state).toBe('error')
  })

  it('gives the budget back once a sentence comes through', async () => {
    const { session, crash, speak, opened } = harness()

    for (let attempt = 0; attempt < MAX_RESTARTS; attempt += 1) {
      await session.start()
      if (attempt === 1) speak('Un phare rouge.')
      crash(new Error('exited with code 139'))
    }
    await session.start()

    expect(opened).toHaveBeenCalledTimes(MAX_RESTARTS + 1)
    expect(session.snapshot().state).toBe('listening')
  })

  /**
   * Three awaits stand between the guard and the moment the engine exists, the last of them
   * seconds long. Two presses inside that window forked two workers and kept the second.
   */
  it('forks one engine when two starts overlap', async () => {
    const { session, opened } = harness()

    await Promise.all([session.start(), session.start()])

    expect(opened).toHaveBeenCalledTimes(1)
  })
})

describe('ending a session', () => {
  it('flushes on stop, so the last words are transcribed', async () => {
    const { session, engine } = harness()

    await session.start()
    await session.stop()

    expect(engine.flush).toHaveBeenCalled()
    expect(engine.cancel).not.toHaveBeenCalled()
    expect(session.snapshot().state).toBe('ready')
  })

  it('drops what was said on cancel', async () => {
    const { session, engine } = harness()

    await session.start()
    await session.cancel()

    expect(engine.cancel).toHaveBeenCalled()
    expect(engine.flush).not.toHaveBeenCalled()
  })

  it('passes audio only while listening', async () => {
    const { session, engine } = harness()

    session.push(new Int16Array([1]))
    await session.start()
    session.push(new Int16Array([2]))
    await session.stop()
    session.push(new Int16Array([3]))

    expect(engine.push).toHaveBeenCalledTimes(1)
    expect(engine.push).toHaveBeenCalledWith(new Int16Array([2]))
  })

  it('reports what was heard', async () => {
    const { session, events, speak } = harness()

    await session.start()
    speak('Un phare rouge.')

    expect(events).toContainEqual({ type: 'final', text: 'Un phare rouge.', latencyMs: 300 })
  })

  it('drops a sentence that settles after it was cancelled', async () => {
    const { session, events, speak } = harness()

    await session.start()
    await session.cancel()
    speak('Un phare rouge.')

    expect(events.filter(event => event.type === 'final')).toEqual([])
  })

  it('takes sentences again once a new session starts', async () => {
    const { session, events, speak } = harness()

    await session.start()
    await session.cancel()
    await session.start()
    speak('Un phare rouge.')

    expect(events).toContainEqual({ type: 'final', text: 'Un phare rouge.', latencyMs: 300 })
  })
})

describe('letting the model go', () => {
  it('drops the engine after a stretch of not dictating', async () => {
    const { session, engine, timers } = harness()

    await session.start()
    await session.stop()
    expect(timers).toHaveLength(1)
    expect(timers[0]!.delayMs).toBe(600_000)

    timers[0]!.run()

    expect(engine.close).toHaveBeenCalled()
    expect(session.snapshot().state).toBe('idle')
  })

  it('never drops it while someone is speaking', async () => {
    const { session, engine, timers } = harness()

    await session.start()
    await session.stop()
    const idle = timers[0]!
    await session.start()
    idle.run()

    expect(engine.close).not.toHaveBeenCalled()
  })

  it('keeps it resident when the setting says never', async () => {
    const { session, timers } = harness({
      settings: () => ({ threads: 2, silenceMs: 600, previewMs: 700, idleUnloadMinutes: 0 }),
    })

    await session.start()
    await session.stop()

    expect(timers).toEqual([])
  })
})

describe('fetching the model', () => {
  it('reports progress and lands back at idle', async () => {
    const { session, events, states } = harness({
      download: async report => {
        report({ received: 10, total: 100 })
        report({ received: 100, total: 100 })
      },
    })

    await session.downloadModel()

    expect(states()).toEqual(['downloadingModel', 'idle'])
    expect(events).toContainEqual({ type: 'download', progress: { received: 100, total: 100 } })
  })

  it('holds the progress for a window that arrives mid-download', async () => {
    let seen = { received: 0, total: 0 }
    const { session } = harness({
      download: async report => {
        report({ received: 42, total: 100 })
        seen = { received: 42, total: 100 }
        await Promise.resolve()
      },
    })

    const running = session.downloadModel()
    expect(session.snapshot().state).toBe('downloadingModel')
    await running

    expect(seen).toEqual({ received: 42, total: 100 })
  })

  /**
   * The key pressed mid-download used to answer `modelMissing` over the progress bar, and the
   * button that answer offers does nothing while a download is already running — so the 640 MB
   * looked as though they had stopped arriving.
   */
  it('leaves a running download alone when someone asks to dictate', async () => {
    const { session, states } = harness({
      download: (_report, signal) =>
        new Promise(resolve => {
          signal.addEventListener('abort', () => resolve())
        }),
    })

    const running = session.downloadModel()
    await session.start()
    session.cancelDownload()
    await running

    expect(states()).toEqual(['downloadingModel', 'idle'])
  })

  /**
   * `DownloadCancelled` and not a bare `Error`: the installer is what raises it, and the cancel
   * may have come from the manager screen rather than from this session's own signal.
   */
  it('goes back to asking when the download is cancelled', async () => {
    const { session, states, settled } = harness({
      modelIsReady: () => Promise.resolve(false),
      download: (_report, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DownloadCancelled('cancelled')))
        }),
    })
    await settled()

    const running = session.downloadModel()
    session.cancelDownload()
    await running

    expect(states()).toEqual(['modelMissing', 'downloadingModel', 'modelMissing'])
  })

  it('names a corrupted model differently from a failed network', async () => {
    const corrupted = harness({
      download: () => Promise.reject(new ChecksumMismatch('encoder.int8.onnx is damaged')),
    })
    await corrupted.session.downloadModel()
    expect(corrupted.session.snapshot().failure?.code).toBe('modelChecksumMismatch')

    const offline = harness({ download: () => Promise.reject(new Error('network is unreachable')) })
    await offline.session.downloadModel()
    expect(offline.session.snapshot().failure?.code).toBe('modelDownloadFailed')
  })

  it('ignores a second request while one is already running', async () => {
    const download = vi.fn(() => Promise.resolve())
    const { session } = harness({ download })

    const first = session.downloadModel()
    const second = session.downloadModel()
    await Promise.all([first, second])

    expect(download).toHaveBeenCalledTimes(1)
  })
})

describe('disposing', () => {
  it('closes the engine and abandons a download in flight', async () => {
    let aborted = false
    const { session, engine } = harness({
      download: (_report, signal) =>
        new Promise(resolve => {
          signal.addEventListener('abort', () => {
            aborted = true
            resolve()
          })
        }),
    })

    await session.start()
    void session.downloadModel()
    session.dispose()

    expect(engine.close).toHaveBeenCalled()
    expect(aborted).toBe(true)
  })
})
