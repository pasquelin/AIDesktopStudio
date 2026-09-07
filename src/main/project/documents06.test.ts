import { describe, expect, it } from 'vitest'

import { orphanStagingCopies } from './documents'

describe('orphanStagingCopies', () => {
  const first = 'doc-1.gltf.3f2a1c88-9d4e-4b7a-8c15-2e6f0a7b9d31.tmp'

  const second = 'doc-2.ora.7c9e0b21-4a5d-4f38-9b62-1d8e3f04a5c7.tmp'

  it('picks the staging copies nobody is holding', () => {
    expect(orphanStagingCopies([first, 'doc-1.gltf', second, 'notes.txt'], new Set())).toEqual([
      first,
      second,
    ])
  })

  // A save in flight in another window is not litter: swept, its rename would fail and the
  // document the user was saving would be lost with it.
  it('leaves alone a copy a write is holding', () => {
    expect(orphanStagingCopies([first, second], new Set([first]))).toEqual([second])
  })

  // The project folder is the user's own, and a `.tmp` they left in there is not ours to
  // delete: only what this module writes carries a uuid between the name and the suffix.
  it('never picks a temporary file the studio did not write', () => {
    const entries = ['render.tmp', 'notes.tmp', 'doc-1.gltf', 'tmp.ora', 'a.tmp.gltf']

    expect(orphanStagingCopies(entries, new Set())).toEqual([])
  })
})
