import { orElse } from '@shared/promises'
import type {
  DownloadProgress,
  SttErrorCode,
  SttEvent,
  SttFailure,
  SttSnapshot,
  SttState,
} from '@shared/domain/dictation'
import { sttModelPaths } from '@shared/domain/dictation'
import { ChecksumMismatch, DownloadCancelled } from '../ai/modelInstall'
import type { SttClient } from './sttClient'

/**
 * What a dictation session needs from the world. Every one of these is injected: the engine
 * needs a live application to fork, the download needs a network, and the microphone needs an
 * operating system — while what is decided below needs none of the three.
 */
export type SessionHost = {
  /** Where the model is read from, which the settings may point elsewhere. */
  modelFolder: () => string
  /** The detector shipped beside the application. */
  vadPath: () => string
  settings: () => {
    threads: number
    silenceMs: number
    previewMs: number
    idleUnloadMinutes: number
  }
  /** Whether the four files are on disk. Their digests were checked before they were renamed. */
  modelIsReady: () => Promise<boolean>
  /** Fetches the model, reporting bytes across the whole set. Rejects on refusal or cancel. */
  download: (onProgress: (progress: DownloadProgress) => void, signal: AbortSignal) => Promise<void>
  /** Asks the operating system, before the renderer ever opens a capture. */
  requestMicrophone: () => Promise<'granted' | 'denied' | 'unknown'>
  /**
   * Forks the worker. One door for a process that goes away, not two: `sttProcess` fires
   * `onFailure` from the same `exit` it would have fired a second callback from.
   */
  openEngine: (listeners: EngineListeners) => SttClient
  emit: (event: SttEvent) => void
  /**
   * Where what the interface never shows is written down: the detail of a refusal, which names
   * a file path, and how long a sentence took, which nobody wants on screen.
   */
  log: (level: 'info' | 'error', message: string) => void
  join: (folder: string, name: string) => string
  /** Deferred so the idle timer can be driven by a test rather than waited on. */
  schedule: (run: () => void, delayMs: number) => () => void
}

export type EngineListeners = {
  onPartial: (text: string) => void
  onFinal: (text: string, latencyMs: number) => void
  onFailure: (error: Error) => void
}

export type DictationSession = {
  snapshot: () => SttSnapshot
  start: () => Promise<void>
  stop: () => Promise<void>
  cancel: () => Promise<void>
  push: (audio: Int16Array) => void
  downloadModel: () => Promise<void>
  cancelDownload: () => void
  /** Drops the engine and everything it holds. Called when the application is going away. */
  dispose: () => void
  /**
   * Reads the disk again. Called when the model manager has installed or deleted something: it
   * writes the very files this session needs and knows nothing about it.
   */
  probeModel: () => Promise<void>
}

/**
 * How many times a crashed engine is restarted before the studio stops trying.
 *
 * Three, and then it stays in error: a process that dies on the first chunk of audio would
 * otherwise be forked again by the next chunk, for as long as someone keeps speaking.
 */
export const MAX_RESTARTS = 3

const failureOf = (code: SttErrorCode, error: unknown): SttFailure => ({
  code,
  message: error instanceof Error ? error.message : String(error),
})

export function createSession(host: SessionHost): DictationSession {
  let state: SttState = 'idle'
  let download: DownloadProgress | null = null
  let failure: SttFailure | null = null
  let engine: SttClient | null = null,
    restarts = 0
  let downloading: AbortController | null = null
  let cancelIdle: (() => void) | null = null
  let starting: Promise<void> | null = null,
    discarding = false
  const publish = (next: SttState): void => {
    if (state === next) return
    state = next
    host.emit({ type: 'state', state })
  }

  /**
   * Whether the weights are on disk, told without a press — from a window a missing model and a
   * microphone that answers nothing look alike. Reversible in BOTH directions: the manager screen
   * installs and deletes the same files and never touches this session.
   */
  const probeModel = async (): Promise<void> => {
    if (state !== 'idle' && state !== 'modelMissing') return

    const ready = await orElse(host.modelIsReady(), null)
    // 🛑 Only ever between its OWN two verdicts. Read as "publish what the disk says", it landed
    // late on a refused microphone and answered `idle` over `permissionRequired`.
    if (ready === false && state === 'idle') publish('modelMissing')
    else if (ready === true && state === 'modelMissing') publish('idle')
  }

  void probeModel().catch(() => {})

  const refuse = (code: SttErrorCode, error: unknown): void => {
    failure = failureOf(code, error)
    // Logged as well as shown: the interface says which refusal it was, in the reader's own
    // language, and never the detail — which names a file path or an ONNX symbol, and is the
    // only thing that says what actually went wrong.
    host.log('error', `${code}: ${failure.message}`)
    host.emit({ type: 'error', failure })
    publish('error')
  }

  /**
   * Lets the engine go after a stretch of not dictating, returning around 700 MB. Rearmed on
   * every use, so the timer measures silence rather than uptime.
   */
  const armIdle = (): void => {
    cancelIdle?.()
    cancelIdle = null

    const minutes = host.settings().idleUnloadMinutes
    if (minutes <= 0) return

    cancelIdle = host.schedule(() => {
      // Never mid-sentence: the engine holds audio that has not been transcribed yet.
      if (state !== 'ready') return
      engine?.close()
      engine = null
      publish('idle')
    }, minutes * 60_000)
  }

  const listeners: EngineListeners = {
    onPartial: text => host.emit({ type: 'partial', text }),
    onFinal: (text, latencyMs) => {
      // A sentence settled after `cancel` was asked for is a sentence the user threw away: the
      // worker had already accepted the audio, and its answer arrives behind the refusal.
      if (discarding) return

      // End of speech to text on screen. Measured rather than assumed: it is what tells a
      // machine that struggles from a setting that is wrong.
      host.log('info', `${latencyMs} ms for ${text.length} characters`)
      host.emit({ type: 'final', text, latencyMs })
      // The engine answered, so it works: what the restart budget counts is failures in a row.
      restarts = 0
    },
    onFailure: error => {
      // Closed rather than merely forgotten: a worker that reported a failed segment is still
      // running, and dropping the reference would leave 700 MB resident until the studio quits.
      engine?.close()
      engine = null
      restarts += 1
      refuse('engineCrashed', error)
    },
  }

  const loadEngine = async (): Promise<boolean> => {
    if (engine) return true

    if (restarts >= MAX_RESTARTS) {
      refuse('engineCrashed', new Error(`the engine failed ${MAX_RESTARTS} times in a row`))
      return false
    }

    publish('loadingEngine')
    const folder = host.modelFolder()
    const settings = host.settings()
    const client = host.openEngine(listeners)

    try {
      await client.load({
        ...sttModelPaths(folder, host.join),
        vad: host.vadPath(),
        threads: settings.threads,
        silenceMs: settings.silenceMs,
        previewMs: settings.previewMs,
      })
    } catch (error) {
      restarts += 1
      client.close()
      refuse('engineCrashed', error)
      return false
    }

    engine = client
    return true
  }

  const begin = async (): Promise<void> => {
    if (state === 'listening') return
    if (state === 'downloadingModel') return

    const access = await host.requestMicrophone()
    if (access === 'denied') {
      failure = { code: 'permissionDenied', message: 'the operating system refused the microphone' }
      host.emit({ type: 'error', failure })
      publish('permissionRequired')
      return
    }

    if (!(await host.modelIsReady())) {
      publish('modelMissing')
      return
    }

    if (!(await loadEngine())) return

    // Cleared here rather than on every state change: what it says is why the engine is not
    // there, and it stops being true exactly when one starts.
    failure = null
    discarding = false
    cancelIdle?.()
    cancelIdle = null
    publish('listening')
  }

  /**
   * One start at a time, whatever asks.
   *
   * Three awaits stand between the guard and the moment `engine` exists, and the last of them —
   * reading 700 MB of weights — takes seconds. Two presses of the key inside that window used to
   * fork two workers, keep the second, and leave the first resident for the rest of the session.
   */
  const start = (): Promise<void> => {
    starting ??= begin().finally(() => {
      starting = null
    })
    return starting
  }

  const settle = async (drop: boolean): Promise<void> => {
    if (state !== 'listening') return

    if (drop) {
      discarding = true
      engine?.cancel()
    } else engine?.flush()

    publish('ready')
    armIdle()
  }

  return {
    snapshot: () => ({ state, download, failure }),

    start,
    stop: () => settle(false),
    cancel: () => settle(true),

    push: audio => {
      // Audio arriving after the session closed is not a failure: the capture takes a moment to
      // wind down, and its last chunk is already in flight when the key comes up.
      if (state === 'listening') engine?.push(audio)
    },

    downloadModel: async () => {
      if (downloading) return

      downloading = new AbortController()
      download = { received: 0, total: 0 }
      publish('downloadingModel')

      try {
        await host.download(progress => {
          download = progress
          host.emit({ type: 'download', progress })
        }, downloading.signal)

        download = null
        publish('idle')
      } catch (error) {
        download = null
        // A cancelled download is a decision, not a fault: it goes back to where it started.
        // Read off the error rather than off this session's own signal — the manager holds the
        // install lock, so the cancel may have come from its screen instead of from here.
        if (error instanceof DownloadCancelled) publish('modelMissing')
        // Told apart because they lead somewhere different: a network that failed is worth
        // retrying, a file that failed its digest was deleted and says so.
        else if (error instanceof ChecksumMismatch) refuse('modelChecksumMismatch', error)
        else refuse('modelDownloadFailed', error)
      } finally {
        downloading = null
      }
    },

    cancelDownload: () => downloading?.abort(),

    probeModel,

    dispose: () => {
      cancelIdle?.()
      downloading?.abort()
      engine?.close()
      engine = null
    },
  }
}
