import { basename } from 'node:path'
import {
  PEAKS_PER_SECOND,
  wantsPoster,
  type Asset,
  type AssetType,
  type MediaProbe,
} from '@shared/domain/asset'
import type { IngestProgress, IngestStage } from '@shared/domain/media'
import { PEAKS_FOLDER, POSTERS_FOLDER, PROXIES_FOLDER } from '@shared/domain/project'
import { peaksArgs, posterArgs, posterOffset, proxyArgs, PEAKS_SAMPLE_RATE } from './ffmpeg'
import type { PeaksRun } from './peaksClient'
import type { ProbeOutcome } from './probe'
import type { ActivityReport } from '@main/project/activityLog'

/**
 * What WebCodecs decodes without help. Anything else is montaged on a proxy. Both spellings of
 * each codec are listed: ffprobe reports `h264` and `av1`, the WebCodecs registry `avc1` and
 * `av01`, and a probe read through the wrong one asks for a proxy nobody needs.
 */
const DECODABLE_CODECS: readonly string[] = ['avc1', 'h264', 'vp8', 'vp9', 'av01', 'av1']

export type MediaServiceDeps = {
  /** The resolved binary, or null when there is none — see `resolveFfmpeg`. */
  ffmpeg: () => string | null
  /** The signal is aborted by `cancel`: a proxy of a twenty-minute rush must stop on demand. */
  run: (binary: string, args: string[], signal: AbortSignal) => Promise<Buffer>
  /** A missing ffprobe is not a failed import; a file ffprobe refuses is — see `ProbeOutcome`. */
  probe: (source: string, signal: AbortSignal) => Promise<ProbeOutcome>
  hash: (source: string) => Promise<string>
  /** Reduces a source to a waveform off this process entirely — see `peaksProcess`. */
  computePeaks: (run: PeaksRun) => Promise<Float32Array>
  /** Whether the catalogue already holds another row with the same bytes. */
  duplicateExists: (assetId: string, hash: string) => Promise<boolean>
  /** Drops the row this pick minted. What the catalogue must not keep, it must not show. */
  discard: (assetId: string) => Promise<void>
  /** Awaited by `derive`, whose caller reads the row back — see its `finally`. */
  save: (assetId: string, fields: Partial<Asset>) => void | Promise<void>
  writeFile: (path: string, data: Uint8Array) => Promise<void>
  onProgress: (progress: IngestProgress) => void
  /** Where an import says what became of it, once the bar that showed it is gone. */
  record: (report: ActivityReport) => void
  projectPath: () => string | null
  /** How many ingests may run at once — `hardwareConcurrency - 2`, per CLAUDE.md § 6. */
  concurrency: () => number
}

/**
 * A file that is already inside the project and needs what `ingest` derives — a generation
 * brought down from the API, which no picker ever handed over.
 */
export type DeriveRequest = {
  assetId: string
  /** Absolute path of the file. It sits inside the project, so nothing here records it. */
  path: string
  kind: AssetType
  /** Read when the bytes were written — see `LocalBackendDeps.probeFile`. */
  probe: MediaProbe
  /** False when the library sent a still down beside the bytes: ours would overwrite a better one. */
  poster: boolean
  /**
   * Whether this shows up in the import panel.
   *
   * True for a generation, whose take the user is waiting on. False for the maintenance a
   * project does on opening: those rows read as "importing" files nobody picked, and a failed
   * one leaves a notice to dismiss for a file the user never chose.
   */
  announce: boolean
}

export type MediaService = {
  /** `kind` decides what the pipeline runs: a still needs neither a proxy nor a waveform. */
  ingest: (assetId: string, sourcePath: string, kind: AssetType) => Promise<void>
  /**
   * The same derived files for an asset that arrived already probed and already in the project.
   *
   * Without the two halves that only a picked file needs: no `sourcePath` — there is no
   * original anywhere else — and no duplicate check, since the row was minted by the collector
   * for an output the account genuinely produced twice if it produced it twice.
   */
  derive: (request: DeriveRequest) => Promise<void>
  cancel: (assetId: string) => void
}

export function webCodecsReads(codec: string | undefined): boolean {
  return codec !== undefined && DECODABLE_CODECS.includes(codec)
}

export function needsProxy(probe: MediaProbe): boolean {
  // An audio-only file has no picture to stand in for.
  if (probe.height === undefined) return false
  return !webCodecsReads(probe.codec) || probe.height > 1080
}

const isTimed = (kind: AssetType): boolean => ['video', 'audio'].includes(kind)

const hasWaveform = (probe: MediaProbe): boolean => Boolean(probe.sampleRate) && probe.duration > 0

/** How far along the whole ingest each stage is — announced when the stage starts. */
const STAGE_RATIO: Record<IngestStage, number> = {
  queued: 0,
  probe: 0.1,
  hash: 0.3,
  proxy: 0.5,
  peaks: 0.8,
  done: 1,
  cancelled: 1,
  failed: 1,
  duplicate: 1,
  unreadable: 1,
}

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const running = new Map<string, AbortController>()
  const waiting: (() => void)[] = []
  let active = 0
  /**
   * Hashes being ingested right now. The catalogue cannot answer for them: a row only gains its
   * hash once its ingest ends, so two picks of the same bytes in one batch would both find
   * nothing — and then write the same proxy file from two ffmpeg processes at once.
   */
  const claimed = new Set<string>()
  const hashWaiters = new Map<string, Array<() => void>>()

  const occupyHash = (hash: string): boolean => {
    if (claimed.has(hash)) return false
    claimed.add(hash)
    return true
  }

  const waitForHash = (hash: string): Promise<void> =>
    new Promise(resolve => {
      const waitingOn = hashWaiters.get(hash) ?? []
      waitingOn.push(resolve)
      hashWaiters.set(hash, waitingOn)
    })

  const freeHash = (hash: string): void => {
    claimed.delete(hash)
    const waitingOn = hashWaiters.get(hash)
    hashWaiters.delete(hash)
    waitingOn?.forEach(resume => resume())
  }

  // A pool, not a burst: forty rushes picked at once would be forty ffmpeg processes.
  const acquire = async (): Promise<void> => {
    if (active >= deps.concurrency()) await new Promise<void>(resolve => waiting.push(resolve))
    active += 1
  }

  const release = (): void => {
    active -= 1
    waiting.shift()?.()
  }

  /**
   * What an import leaves behind once its progress row is gone.
   *
   * The file name only, never its path: what a source sits on the disk is this process's
   * business, the same rule `withoutSourcePath` states for an asset crossing the boundary.
   *
   * Silent on a cancellation and on a duplicate: the user did the first, and the second is not
   * a problem — the bytes are already in the project.
   */
  const journal = (sourcePath: string, outcome: IngestStage): void => {
    const name = basename(sourcePath)

    if (outcome === 'done') {
      deps.record({
        level: 'info',
        topic: 'import',
        messageKey: 'activity.imported',
        params: { name },
      })
      return
    }

    if (outcome === 'unreadable' || outcome === 'failed') {
      deps.record({
        level: 'error',
        topic: 'import',
        messageKey:
          outcome === 'unreadable' ? 'activity.importUnreadable' : 'activity.importFailed',
        params: { name },
      })
    }
  }

  const derivePoster = async (
    assetId: string,
    source: string,
    kind: AssetType,
    probe: MediaProbe,
    fields: Partial<Asset>,
    binary: string,
    project: string,
    signal: AbortSignal,
  ): Promise<void> => {
    if (!wantsPoster(kind)) return
    const relative = `${POSTERS_FOLDER}/${assetId}.jpg`
    try {
      await deps.run(
        binary,
        posterArgs(source, `${project}/${relative}`, posterOffset(probe.duration)),
        signal,
      )
      fields.posterPath = relative
    } catch {
      // A grid falls back to the kind's own glyph, which is what it showed before.
    }
  }

  const deriveProxy = async (
    source: string,
    probe: MediaProbe,
    key: string,
    fields: Partial<Asset>,
    binary: string,
    project: string,
    signal: AbortSignal,
  ): Promise<void> => {
    if (!needsProxy(probe)) return
    const relative = `${PROXIES_FOLDER}/${key}.mp4`
    await deps.run(binary, proxyArgs(source, `${project}/${relative}`), signal)
    fields.proxyPath = relative
  }

  const derivePeaks = async (
    source: string,
    probe: MediaProbe,
    key: string,
    fields: Partial<Asset>,
    binary: string,
    project: string,
    signal: AbortSignal,
  ): Promise<void> => {
    if (!probe.sampleRate || probe.duration <= 0) return
    const peaks = await deps.computePeaks({
      binary,
      args: peaksArgs(source),
      buckets: Math.max(1, Math.round((probe.duration / 1_000_000) * PEAKS_PER_SECOND)),
      samplesPerBucket: PEAKS_SAMPLE_RATE / PEAKS_PER_SECOND,
      signal,
    })
    if (signal.aborted) return
    const relative = `${PEAKS_FOLDER}/${key}.bin`
    await deps.writeFile(`${project}/${relative}`, new Uint8Array(peaks.buffer))
    fields.peaksPath = relative
  }

  /**
   * What a timed media gets beside it once its length is known: a still, a proxy when nothing
   * can decode it as it is, and a waveform. Shared by both ways in — a file picked off a disk
   * and a generation brought down from the API derive exactly the same things.
   *
   * `key` names the files that CAN be shared between rows holding the same bytes: the hash for
   * both callers, so a rush imported twice writes one proxy.
   */
  const deriveFiles = async (
    request: {
      assetId: string
      source: string
      kind: AssetType
      probe: MediaProbe
      key: string
      poster: boolean
    },
    fields: Partial<Asset>,
    signal: AbortSignal,
    advance: (stage: IngestStage) => void,
  ): Promise<void> => {
    const { assetId, source, kind, probe, key, poster } = request
    const binary = deps.ffmpeg()
    const project = deps.projectPath()
    if (!isTimed(kind) || !binary || !project) return

    if (poster) {
      await derivePoster(assetId, source, kind, probe, fields, binary, project, signal)
      if (signal.aborted) return
    }
    if (needsProxy(probe)) {
      advance('proxy')
      await deriveProxy(source, probe, key, fields, binary, project, signal)
      if (signal.aborted) return
    }
    if (hasWaveform(probe)) {
      advance('peaks')
      await derivePeaks(source, probe, key, fields, binary, project, signal)
    }
  }

  return {
    ingest: async (assetId, sourcePath, kind) => {
      const controller = new AbortController()
      // Registered before queuing, so a file still waiting its turn can be cancelled too.
      running.set(assetId, controller)
      const cancelled = (): boolean => controller.signal.aborted
      const fields: Partial<Asset> = { sourcePath }
      let stage: IngestStage = 'queued'
      /** The hash this ingest claimed, to be released whatever happens to it. */
      let mine: string | null = null

      const advance = (next: IngestStage): void => {
        stage = next
        deps.onProgress({ assetId, stage, ratio: STAGE_RATIO[stage] })
      }

      const probeSource = async (): Promise<boolean> => {
        if (kind === 'mesh') return true
        advance('probe')
        const outcome = await deps.probe(sourcePath, controller.signal)
        if (cancelled()) return false
        if (outcome.kind === 'unreadable') {
          stage = 'unreadable'
          return false
        }
        if (outcome.kind === 'probed') fields.probe = outcome.probe
        return true
      }

      const hashSource = async (): Promise<string | null> => {
        advance('hash')
        const hash = await deps.hash(sourcePath)
        fields.hash = hash
        if (cancelled()) return null
        if (!occupyHash(hash)) {
          stage = 'duplicate'
          return null
        }
        mine = hash
        if (await deps.duplicateExists(assetId, hash)) {
          stage = 'duplicate'
          return null
        }
        return cancelled() ? null : hash
      }

      const deriveSource = async (hash: string): Promise<void> => {
        if (!fields.probe) return
        await deriveFiles(
          { assetId, source: sourcePath, kind, probe: fields.probe, key: hash, poster: true },
          fields,
          controller.signal,
          advance,
        )
      }

      const finishIngest = async (): Promise<void> => {
        release()
        running.delete(assetId)
        if (mine) freeHash(mine)
        if (stage === 'duplicate' || stage === 'unreadable') {
          try {
            await deps.discard(assetId)
          } catch {
            // The project may have closed while the file was read.
          }
        } else if (stage !== 'queued') {
          deps.save(assetId, fields)
        }
        const outcome = cancelled() ? 'cancelled' : stage
        advance(outcome)
        journal(sourcePath, outcome)
      }

      advance('queued')
      await acquire()

      try {
        if (cancelled()) return
        if (!(await probeSource())) return
        const hash = await hashSource()
        if (!hash) return
        await deriveSource(hash)
        if (cancelled()) return
        stage = 'done'
      } catch {
        stage = 'failed'
      } finally {
        await finishIngest()
      }
    },

    derive: async ({ assetId, path, kind, probe, poster, announce }) => {
      // Nothing to derive AND nothing to remember: a row stamped here would be read as one the
      // pipeline has been through, and the catch-up that runs once the tool IS resolved would
      // skip it for good. A studio whose ffmpeg is configured later must still catch up.
      if (!deps.ffmpeg() || !deps.projectPath()) return

      const controller = new AbortController()
      // A second derivation of the same asset REPLACES the first, which two rapid "apply" do:
      // both would write the same proxy and the same peaks from two ffmpeg processes, over one
      // another. Unlike an ingest, whose id is minted per pick, this one names a row that
      // already exists — so the collision is the ordinary case rather than the odd one.
      running.get(assetId)?.abort()
      running.set(assetId, controller)
      const cancelled = (): boolean => controller.signal.aborted
      const fields: Partial<Asset> = {}
      let stage: IngestStage = 'queued'
      let mine: string | null = null

      const advance = (next: IngestStage): void => {
        stage = next
        if (announce) deps.onProgress({ assetId, stage, ratio: STAGE_RATIO[stage] })
      }

      const runDerive = async (): Promise<void> => {
        if (cancelled()) return
        advance('hash')
        fields.hash = await deps.hash(path)
        if (cancelled()) return
        while (!occupyHash(fields.hash)) await waitForHash(fields.hash)
        mine = fields.hash
        await deriveFiles(
          { assetId, source: path, kind, probe, key: fields.hash, poster },
          fields,
          controller.signal,
          advance,
        )
        stage = 'done'
      }

      const finishDerive = async (): Promise<void> => {
        release()
        if (running.get(assetId) === controller) running.delete(assetId)
        if (mine) freeHash(mine)
        if (stage !== 'queued') await deps.save(assetId, fields)
        advance(cancelled() ? 'cancelled' : stage)
      }

      advance('queued')
      // The same bounded pool as a picked file, per CLAUDE.md § 6: four videos generated at once
      // are four ffmpeg processes otherwise, on top of whatever is being imported beside them.
      await acquire()

      try {
        await runDerive()
      } catch {
        stage = 'failed'
      } finally {
        await finishDerive()
      }
    },

    cancel: assetId => {
      running.get(assetId)?.abort()
    },
  }
}
