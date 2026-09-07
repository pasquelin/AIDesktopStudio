import { describe, expect, it } from 'vitest'
import { faultsOf, NOT_PLAYING, type RuntimeReport } from './gameRuntime'

const report = (over: Partial<RuntimeReport>): RuntimeReport => ({ ...NOT_PLAYING, ...over })

describe('the faults a running game reports', () => {
  it('does not invent GPU timing before a compatible context measures one', () => {
    expect(NOT_PLAYING.performance.gpuFrameMs).toBeNull()
  })

  it('lists script errors first, then error log lines, and ignores the rest', () => {
    expect(
      faultsOf(
        report({
          errors: [
            {
              script: 'script:a.ts',
              entity: null,
              message: 'broke',
              line: 3,
              column: 1,
              at: 0,
            },
          ],
          logs: [
            { level: 'info', message: 'ok', at: 0 },
            { level: 'error', message: 'threw', at: 1 },
          ],
        }),
      ),
    ).toEqual(['script:a.ts:3 — broke', 'threw'])
  })

  it('is empty when nothing is wrong', () => {
    expect(faultsOf(NOT_PLAYING)).toEqual([])
  })
})
