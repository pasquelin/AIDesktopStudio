/**
 * What a running game says about itself — read by the panel that drives it, and by MCP.
 *
 * In `shared/` because three trees read it: the runtime writes it, the window draws it, and the
 * main process publishes it. Only `shared` sits below all three.
 */
export type PlayState = 'edit' | 'playing' | 'paused'

/** The values beside the type: the studio snapshot crosses a process boundary and is checked. */
export const PLAY_STATES: readonly PlayState[] = ['edit', 'playing', 'paused']

export type LogLevel = 'info' | 'warn' | 'error'

export type LogEntry = { level: LogLevel; message: string; at: number }

/**
 * What a script did wrong, ADDRESSABLE: the reference of the script and of the entity, and the
 * line an editor opens. It is the same datum a console row, a click-to-open and an MCP answer
 * all read — which is what keeps them from drifting into three descriptions of one fault.
 */
export type RuntimeError = {
  /** `refToString` of the script — `script:<path>`. */
  script: string
  /** `refToString` of the entity, when the fault happened to one. */
  entity: string | null
  message: string
  /** One-based, as an editor counts. Zero when the engine could not say. */
  line: number
  column: number
  at: number
}

export type RuntimeReport = {
  state: PlayState
  /** The unit the network counts in, and what a bug report is anchored on. */
  tick: number
  fps: number
  frameMs: number
  entities: number
  /** Bounded by whoever fills it: a game left running writes without end. */
  logs: readonly LogEntry[]
  /** Bounded the same way, and kept apart from the log: these are what a reader can OPEN. */
  errors: readonly RuntimeError[]
  /**
   * How far the picture is veiled, from 0 to 1 — what a transition of the timeline puts there.
   *
   * On the REPORT rather than in the document: a veil is how a game is being watched at this
   * instant, and one written into the scene would put an undo entry per frame of a fade.
   */
  veil: number
  performance: RuntimePerformance
}

export type RuntimePerformance = {
  cpuFrameMs: number
  renderMs: number
  gpuFrameMs: number | null
  drawCalls: number
  triangles: number
  vertices: number
  visibleObjects: number
  culledObjects: number
  instanceCount: number
  batchCount: number
  geometryBufferBytes: number
  estimatedTextureBytes: number
  compilationMs: number
}

export const EMPTY_RUNTIME_PERFORMANCE: RuntimePerformance = {
  cpuFrameMs: 0,
  renderMs: 0,
  gpuFrameMs: null,
  drawCalls: 0,
  triangles: 0,
  vertices: 0,
  visibleObjects: 0,
  culledObjects: 0,
  instanceCount: 0,
  batchCount: 0,
  geometryBufferBytes: 0,
  estimatedTextureBytes: 0,
  compilationMs: 0,
}

/** Script faults first, then log lines at error — both, never one or the other. */
export function faultsOf(report: RuntimeReport): readonly string[] {
  return [
    ...report.errors.map(one => `${one.script}:${one.line} — ${one.message}`),
    ...report.logs.filter(entry => entry.level === 'error').map(entry => entry.message),
  ]
}

export const NOT_PLAYING: RuntimeReport = {
  state: 'edit',
  tick: 0,
  fps: 0,
  frameMs: 0,
  entities: 0,
  logs: [],
  errors: [],
  veil: 0,
  performance: EMPTY_RUNTIME_PERFORMANCE,
}
