import { describe, expect, it } from 'vitest'
import {
  applyReliefSculpt,
  changedChunks,
  withPackedChunks,
  type ReliefSculptOperation,
} from '@shared/domain/relief'
import {
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
} from '@shared/domain/scene'

const MAP = 1024

describe('relief sculpt cost', () => {
  it('leaves the disk loop off the UI thread, and the packing with it', () => {
    const samples = { width: MAP, height: MAP, values: new Float32Array(MAP * MAP) }
    const extent = {
      origin: DEFAULT_RELIEF_ORIGIN,
      size: DEFAULT_RELIEF_SIZE,
      elevation: DEFAULT_RELIEF_ELEVATION,
    }
    const operation: ReliefSculptOperation = {
      kind: 'raiseDisk',
      disk: {
        x: extent.origin.x + extent.size.x / 2,
        z: extent.origin.z + extent.size.z / 2,
        radius: Math.hypot(extent.size.x, extent.size.z) / 2,
      },
      amount: 0.25,
    }

    // What the worker does, packing included: `applyReliefSculpt` already writes base64.
    const after = applyReliefSculpt(samples, extent, undefined, operation)
    const edits = changedChunks(undefined, after)

    // 1024² full disk, 2026-09-03: worker 177 ms, UI thread 0,5 ms. It was 94 ms while the worker
    // decoded each dirty chunk to transfer it and this side re-encoded what it had just decoded.
    expect(edits.length).toBeGreaterThan(0)
    expect(withPackedChunks(undefined, edits).chunks).toEqual(edits)
  })

  /**
   * The cost above is a wall clock, which a loaded suite distorts — measured 783 ms against 110
   * on a full run, green in isolation. What actually keeps this side cheap is that it never reads
   * a payload, so a byte no decoder would accept must travel through untouched.
   */
  it('hangs a payload no decoder would accept, because it decodes none', () => {
    const opaque = { column: 0, row: 0, payload: 'not base64 at all !!' }

    expect(withPackedChunks(undefined, [opaque]).chunks).toEqual([opaque])
  })
})
