/**
 * Where an ingest is in the pipeline the spec lays out: probe → hash → proxy → peaks. `queued`
 * comes first because the pool is bounded — a file waiting its turn must still be visible, and
 * cancellable, rather than absent from the screen until a slot frees up.
 */
export type IngestStage =
  | 'queued'
  | 'probe'
  | 'hash'
  | 'proxy'
  | 'peaks'
  | 'done'
  | 'cancelled'
  | 'failed'
  /**
   * The same bytes are already in the catalogue. The row is KEPT — importing into a folder puts
   * the file there whatever else the project holds — and this says so, rather than the studio
   * deciding which of two identical files was the redundant one.
   */
  | 'duplicate'
  /** ffprobe read the file and refused it — it is not media, whatever its extension says. */
  | 'unreadable'

/** All of them, in pipeline order. The import list names each one from a bundle. */
export const INGEST_STAGES: readonly IngestStage[] = [
  'queued',
  'probe',
  'hash',
  'proxy',
  'peaks',
  'done',
  'cancelled',
  'failed',
  'duplicate',
  'unreadable',
]

/**
 * Nothing more will happen to this file. Every one of these left the catalogue different from
 * how it found it — a length and a waveform filled in, or the row dropped outright.
 */
const TERMINAL_STAGES: readonly IngestStage[] = [
  'done',
  'cancelled',
  'failed',
  'duplicate',
  'unreadable',
]

export function isTerminal(stage: IngestStage): boolean {
  return TERMINAL_STAGES.includes(stage)
}

/** Ended badly. Shown in red, and there is no retry — re-picking the file makes another row. */
const FAILED_STAGES: readonly IngestStage[] = ['failed', 'unreadable']

export function hasFailed(stage: IngestStage): boolean {
  return FAILED_STAGES.includes(stage)
}

/**
 * Stays on screen until the user clears it: a failure, and a file whose bytes the project
 * already held somewhere. The second is not an error — the file is where it was asked to go —
 * and the line is what lets the user go and look.
 */
export function needsDismissing(stage: IngestStage): boolean {
  return hasFailed(stage) || stage === 'duplicate'
}

export type IngestProgress = {
  assetId: string
  stage: IngestStage
  /** 0 to 1 across the whole ingest, not within the stage. */
  ratio: number
}

/** What the interface needs to say which part of the pipeline is unavailable, and why. */
export type MediaCapabilities = {
  /** False when no ffmpeg was resolved: no proxy, no waveform — importing still works. */
  ffmpeg: boolean
}
