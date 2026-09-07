export type GpuTimer = {
  begin: () => void
  end: () => void
  read: () => number | null
}

type TimerQuery = object
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
export type GpuTimerContext = {
  QUERY_RESULT_AVAILABLE: number
  QUERY_RESULT: number
  getExtension: (name: string) => TimerExtension | null
  createQuery: () => TimerQuery | null
  beginQuery: (target: number, query: TimerQuery) => void
  endQuery: (target: number) => void
  getQueryParameter: (query: TimerQuery, field: number) => unknown
  getParameter: (field: number) => unknown
  deleteQuery: (query: TimerQuery) => void
}

export function isGpuTimerContext(value: unknown): value is GpuTimerContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createQuery' in value &&
    typeof value.createQuery === 'function'
  )
}

const NANOSECONDS_PER_MILLISECOND = 1_000_000
const MAX_PENDING_QUERIES = 4

export function createGpuTimer(gl: GpuTimerContext): GpuTimer | null {
  const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  if (!extension) return null

  const pending: TimerQuery[] = []
  let active: TimerQuery | null = null
  let latest: number | null = null

  return {
    begin: () => {
      if (active || pending.length >= MAX_PENDING_QUERIES) return
      active = gl.createQuery()
      if (active) gl.beginQuery(extension.TIME_ELAPSED_EXT, active)
    },
    end: () => {
      if (!active) return
      gl.endQuery(extension.TIME_ELAPSED_EXT)
      pending.push(active)
      active = null
    },
    read: () => {
      const query = pending[0]
      if (!query || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return latest
      pending.shift()
      const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT) === true
      const elapsed: unknown = gl.getQueryParameter(query, gl.QUERY_RESULT)
      gl.deleteQuery(query)
      if (disjoint) latest = null
      else if (typeof elapsed === 'number') latest = elapsed / NANOSECONDS_PER_MILLISECOND
      return latest
    },
  }
}
