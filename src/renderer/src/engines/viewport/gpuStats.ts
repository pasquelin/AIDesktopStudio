/**
 * What one drawn frame cost the GPU, and what its context is still holding.
 *
 * Out of `ViewportEngine` for the reason `frame-clock` is out of it: that class cannot exist
 * without a WebGL context, and these numbers are what a GPU change has to prove itself with.
 */
export type GpuStats = {
  calls: number
  triangles: number
  points: number
  lines: number
  /** Frames the loop has run since construction. A viewport left alone must stop moving it. */
  frames: number
  /** Alive in the context now, not per frame: what a missing `dispose` makes climb. */
  geometries: number
  textures: number
  renderMs: number
  gpuFrameMs: number | null
}

/** Only the counters that are read. A real `WebGLRenderer.info` satisfies this by shape. */
export type FrameCounters = {
  render: { calls: number; triangles: number; points: number; lines: number }
  memory: { geometries: number; textures: number }
}

export function emptyGpuStats(): GpuStats {
  return {
    calls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
    frames: 0,
    geometries: 0,
    textures: 0,
    renderMs: 0,
    gpuFrameMs: null,
  }
}

/**
 * Folds a drawn frame into `into`, in place — a fresh object per frame is exactly the
 * allocation a render loop must not make.
 *
 * `frames` is counted here rather than read off `info.render.frame`, which counts calls to
 * `render`: a viewport that draws an overlay makes two of those per frame.
 */
export function recordFrame(
  { render, memory }: FrameCounters,
  into: GpuStats,
  renderMs: number = into.renderMs,
): void {
  into.calls = render.calls
  into.triangles = render.triangles
  into.points = render.points
  into.lines = render.lines
  into.geometries = memory.geometries
  into.textures = memory.textures
  into.renderMs = renderMs
  into.frames += 1
}
