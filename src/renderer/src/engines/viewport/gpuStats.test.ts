import { describe, expect, it } from 'vitest'
import { emptyGpuStats, recordFrame, type FrameCounters } from './gpuStats'

const counters = (
  render: Partial<FrameCounters['render']> = {},
  memory: Partial<FrameCounters['memory']> = {},
): FrameCounters => ({
  render: { calls: 0, triangles: 0, points: 0, lines: 0, ...render },
  memory: { geometries: 0, textures: 0, ...memory },
})

describe('gpu stats', () => {
  /** Every field, spelled out: a viewport that never drew must not report a number it invented. */
  it('starts at zero', () => {
    expect(emptyGpuStats()).toEqual({
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
      frames: 0,
      geometries: 0,
      textures: 0,
      renderMs: 0,
      gpuFrameMs: null,
    })
  })

  it('takes what the last frame cost off the renderer', () => {
    const stats = emptyGpuStats()

    recordFrame(counters({ calls: 12, triangles: 4096, points: 3, lines: 7 }), stats)

    expect(stats).toMatchObject({ calls: 12, triangles: 4096, points: 3, lines: 7 })
  })

  it('takes what the context holds, which is a total and not a per-frame cost', () => {
    const stats = emptyGpuStats()

    recordFrame(counters({}, { geometries: 9, textures: 5 }), stats)

    expect(stats).toMatchObject({ geometries: 9, textures: 5 })
  })

  /**
   * A lot claiming a frame got cheaper needs the old one gone — while `frames`, counted here
   * rather than read off `info.render.frame`, keeps climbing.
   */
  it('replaces the previous frame rather than summing it, and counts frames upwards', () => {
    const stats = emptyGpuStats()

    recordFrame(counters({ calls: 40, triangles: 900 }), stats, 4)
    recordFrame(counters({ calls: 3, triangles: 12 }), stats, 2)

    expect(stats).toMatchObject({ calls: 3, triangles: 12, frames: 2, renderMs: 2 })
  })
})
