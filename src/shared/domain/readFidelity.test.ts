import { describe, expect, it } from 'vitest'
import { mayOverwriteSource, readFidelityOf } from './readFidelity'

describe('a read fidelity', () => {
  /** The default IS the decision: a file nothing says was read whole is not one to write over. */
  it('refuses to overwrite when nothing was recorded', () => {
    expect(mayOverwriteSource(readFidelityOf(undefined))).toBe(false)
  })

  it('lets a faithful read be written back', () => {
    expect(mayOverwriteSource(readFidelityOf('faithful'))).toBe(true)
  })
})
