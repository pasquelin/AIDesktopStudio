import { describe, expect, it } from 'vitest'
import { holderOf, isRunning, waitsForTheMachine, workersFor } from './vitestLock'

describe('the machine several checkouts share', () => {
  it('gives a lone run the width vitest would have taken, and divides it beyond', () => {
    expect(workersFor(12, 1)).toBe(11)
    expect(workersFor(12, 3)).toBe(3)
    expect(workersFor(2, 8)).toBe(1)
  })

  it('reads no holder out of a file being written, so a waiter does not steal a fresh lock', () => {
    expect(holderOf('4821')).toBe(4821)
    expect(holderOf('')).toBeUndefined()
  })

  /** Only a pid git can prove gone is gone: an unanswerable errno must not free the machine. */
  it('calls this very process running, and a pid nothing can own gone', () => {
    expect(isRunning(process.pid)).toBe(true)
    expect(isRunning(2_147_483_646)).toBe(false)
  })

  it('never makes a run that names files wait for the machine', () => {
    expect(waitsForTheMachine(['run'])).toBe(true)
    expect(waitsForTheMachine(['run', '--project', 'node'])).toBe(true)
    expect(waitsForTheMachine(['run', 'src/main/vitestLock.test.ts'])).toBe(false)
  })
})
