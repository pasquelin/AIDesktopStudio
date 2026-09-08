import { describe, expect, it } from 'vitest'
import { holderOf, laneOf, lockPathIn, workerArgsFor, NARROW_WORKERS } from './vitestLock'

describe('the lock every checkout of one machine shares', () => {
  it('names one file under the machine temp directory, whichever checkout asks', () => {
    expect(lockPathIn('/var/folders/x/T')).toBe('/var/folders/x/T/ia-studio-vitest.lock')
  })

  it('reads no holder out of a file being written, so a waiter does not steal a fresh lock', () => {
    expect(holderOf('4821')).toBe(4821)
    expect(holderOf('')).toBeUndefined()
  })

  it('sends a run that names files to the lane that never waits', () => {
    expect(laneOf('whole', ['run'])).toBe('whole')
    expect(laneOf('whole', ['run', '--project', 'node'])).toBe('whole')
    expect(laneOf('whole', ['run', 'src/main/vitestLock.test.ts'])).toBe('narrow')
  })

  it('caps a selection only while another checkout holds the machine', () => {
    expect(workerArgsFor('narrow', true)).toEqual([`--maxWorkers=${NARROW_WORKERS}`])
    expect(workerArgsFor('narrow', false)).toEqual([])
    expect(workerArgsFor('whole', true)).toEqual([])
  })
})
