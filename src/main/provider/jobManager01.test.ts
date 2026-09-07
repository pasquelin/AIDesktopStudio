import { describe, expect, it } from 'vitest'

import { jobStatusOf } from './jobManager'

describe('status mapping', () => {
  it('folds the eight statuses of generation onto the five of the studio', () => {
    expect(jobStatusOf('pending')).toBe('queued')
    expect(jobStatusOf('queued')).toBe('queued')
    expect(jobStatusOf('warming-up')).toBe('running')
    expect(jobStatusOf('in-progress')).toBe('running')
    expect(jobStatusOf('finalizing')).toBe('running')
    expect(jobStatusOf('success')).toBe('succeeded')
    expect(jobStatusOf('failure')).toBe('failed')
    expect(jobStatusOf('canceled')).toBe('cancelled')
  })

  // Unrecognised, either would fold onto `running` and poll for ever holding a concurrency slot.
  it('folds the two outcomes the guide spells differently', () => {
    expect(jobStatusOf('succeeded')).toBe('succeeded')
    expect(jobStatusOf('failed')).toBe('failed')
  })

  /**
   * 🛑 A second cloud spells three outcomes Scenario never does. Unmapped, each folds onto
   * `running` and polls for ever holding its slot — and one lane's ceiling is ONE, so a single
   * banned picture would block every picture of the session.
   */
  it('folds the outcomes a second cloud spells its own way', () => {
    expect(jobStatusOf('cancelled')).toBe('cancelled')
    expect(jobStatusOf('banned')).toBe('failed')
    expect(jobStatusOf('expired')).toBe('failed')
  })

  // Declaring an outcome nobody understood is worse than polling one cycle too many.
  it('keeps polling on a status it has never seen', () => {
    expect(jobStatusOf('reticulating-splines')).toBe('running')
  })
})
