import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { watchProjectFolder } from './folder'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scenario-folder-'))
  await mkdir(join(root, 'assets'))
  await mkdir(join(root, 'documents'))
  await mkdir(join(root, '.index'))
  await writeFile(join(root, '.project.json'), '{}')
  await writeFile(join(root, 'notes.txt'), 'hello')
  return root
}

describe('following the project folder', () => {
  // `as`: a watcher these tests never listen to, and only `close` is ever called on it. Naming
  // the cast once keeps the two fake openers from each carrying their own.

  // An opener whose events this file decides. What the platform really emits is the first case's
  // business; everything below is about what the watcher DOES with an event.

  const watches: { stop: () => void }[] = []

  afterEach(() => {
    for (const watch of watches) watch.stop()
    watches.length = 0
  })

  // A folder that cannot be watched is not a folder that cannot be read: the panel still lists
  // it, it just will not follow it on its own.
  it('says nothing and breaks nothing on a folder that is not there', () => {
    const watch = watchProjectFolder(join(tmpdir(), 'scenario-missing-folder'), vi.fn())

    expect(() => watch.stop()).not.toThrow()
  })

  // Stopped between the event and the announcement, which is the window a project being closed
  // falls into: the folder of the project just left must not announce into the next one.
  it('stops announcing once it is stopped, even with an event already in flight', async () => {
    const root = await project()
    const announce = vi.fn()
    const watch = watchProjectFolder(root, announce)

    await writeFile(join(root, 'one.txt'), '')
    // Long enough for the event to have armed the debounce, short enough to be inside it: what
    // this measures is a stop that lands BETWEEN the two, which is the window a closing project
    // falls into.
    await new Promise(done => setTimeout(done, 60))
    watch.stop()
    await new Promise(done => setTimeout(done, 800))

    expect(announce).not.toHaveBeenCalled()
  })
})
