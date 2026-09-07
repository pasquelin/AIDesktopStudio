import { describe, expect, it } from 'vitest'
import { parentOf } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { DOCUMENT_SOURCES, PROJECT } from './project'

/**
 * 🛑 The tree the bench lays down drifted from the one `create` lays down, twice — `Videos` and
 * `Skyboxes` named no constant at all, and `Animations` was missing. Nothing rougissait: a bench
 * on a tree the studio never makes still runs, and scores gestures against a project nobody has.
 */
describe('the project the bench lays down', () => {
  it('holds every folder a real project is given', () => {
    const laid = PROJECT.filter(entry => entry.kind === 'folder').map(entry => entry.path)
    expect([...laid].sort()).toEqual(Object.values(DEFAULT_ROLE_PATHS).sort())
  })

  it('seeds no file into a folder the project does not have', () => {
    const folders = new Set(PROJECT.filter(entry => entry.kind === 'folder').map(one => one.path))
    const stray = PROJECT.filter(
      entry => entry.kind === 'file' && !folders.has(parentOf(entry.path) ?? ''),
    ).map(entry => entry.path)

    expect(stray).toEqual([])
  })
})

/**
 * 🛑 The path a document LIVES at: written elsewhere, `documents.read` looks its content up and
 * finds none. `documents/Scène 1.gltf` survived twelve failed runs with a green suite, and
 * instancing that scene as a prefab refused `notFound` every time.
 */
it('writes every document source onto a file the project seeds', () => {
  const seeded = PROJECT.filter(one => one.kind === 'file').map(one => one.path)

  expect(DOCUMENT_SOURCES.map(one => one.path).filter(path => !seeded.includes(path))).toEqual([])
})
