import { describe, expect, it, vi } from 'vitest'

import { isCatalogueGone, NoProjectError, orWhenGone } from './store'

import { CATALOGUE_CLOSED } from './catalogClient'

type ExecDone = (error: Error | null, stdout: string, stderr: string) => void

/** Hoisted: `hideFromExplorer.ts` promisifies `execFile` as it loads, before a `beforeEach` runs. */
const execFileMock = vi.hoisted(() =>
  vi.fn((_command: string, _args: string[], done: ExecDone) => {
    done(null, '', '')
  }),
)

vi.mock('node:child_process', () => ({ execFile: execFileMock }))

describe('telling a project that has gone from something that broke', () => {
  it('recognises no project open, and a catalogue closed under a request in flight', () => {
    expect(isCatalogueGone(new NoProjectError())).toBe(true)
    expect(isCatalogueGone(new Error(CATALOGUE_CLOSED))).toBe(true)
  })

  // The whole point: a resolver that throws for its own reasons must keep travelling, so that
  // `servedPath` journals it as the defect it is instead of serving it as a quiet 404.
  it('does not recognise a defect, however it is spelled', () => {
    expect(isCatalogueGone(new TypeError('find is not a function'))).toBe(false)
    expect(isCatalogueGone(new Error('catalogue thread failed: out of memory'))).toBe(false)
    expect(isCatalogueGone('catalogue is closed')).toBe(false)
  })

  /**
   * The shape, and the reason this takes a thunk: `project.catalog()` throws BEFORE any promise
   * exists, so a `.catch()` hung off the call is never attached and the throw leaves by the
   * stack — reaching the scheme as a defect on a path that is merely a project being left.
   */
  it('answers for a read that throws before it ever returns a promise', async () => {
    await expect(
      orWhenGone(() => {
        throw new NoProjectError()
      }, null),
    ).resolves.toBeNull()

    await expect(
      orWhenGone<readonly string[]>(() => {
        throw new Error(CATALOGUE_CLOSED)
      }, []),
    ).resolves.toEqual([])
  })

  it('hands back what the read answered, and lets a defect travel', async () => {
    await expect(orWhenGone(() => Promise.resolve('a file'), null)).resolves.toBe('a file')
    await expect(orWhenGone(() => Promise.reject(new TypeError('broke')), null)).rejects.toThrow(
      TypeError,
    )
  })
})
