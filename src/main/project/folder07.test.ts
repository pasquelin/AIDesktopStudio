import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createFolderReader, createFolderWriter } from './folder'

/**
 * The language the listing is sorted for, named rather than inherited.
 *
 * It used to be `windowLanguage()`, a module global no test could set: every ordering case below
 * rode on `DEFAULT_LANGUAGE` without saying so, and another suite's `beforeEach` could move it.
 */
const inFrench = (): string => 'fr'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scenario-folder-'))
  await mkdir(join(root, 'assets'))
  await mkdir(join(root, 'documents'))
  await mkdir(join(root, '.index'))
  await writeFile(join(root, '.project.json'), '{}')
  await writeFile(join(root, 'notes.txt'), 'hello')
  return root
}

describe('writing to the project folder', () => {
  async function withFolder(): Promise<string> {
    const root = await project()
    await mkdir(join(root, 'notes'))
    return root
  }

  // The race a plan cannot see: `rename` and `cp` overwrite without a word on POSIX, and what
  // they would take is the user's own file.
  it.each(['move', 'copy', 'createFolder'])(
    'refuses %s onto a name already there',
    async gesture => {
      const root = await withFolder()
      await writeFile(join(root, 'brief.txt'), 'keep me')
      const writer = createFolderWriter(() => root, vi.fn())

      const written =
        gesture === 'move'
          ? await writer.move('notes.txt', 'brief.txt')
          : gesture === 'copy'
            ? await writer.copy('notes.txt', 'brief.txt')
            : await writer.createFolder('brief.txt')

      expect(written).toBe(false)
      expect(await readFile(join(root, 'brief.txt'), 'utf8')).toBe('keep me')
    },
  )

  it('carries a file to the path it is given, folder and name at once', async () => {
    const root = await withFolder()
    const writer = createFolderWriter(() => root, vi.fn())

    expect(await writer.move('notes.txt', 'notes/brief.txt')).toBe(true)

    const reader = createFolderReader(() => root, inFrench)
    expect((await reader.list('notes')).map(entry => entry.path)).toEqual(['notes/brief.txt'])
    expect((await reader.list('')).map(entry => entry.name)).not.toContain('notes.txt')
  })

  it('carries a folder and everything under it', async () => {
    const root = await withFolder()
    await mkdir(join(root, 'refs'))
    await writeFile(join(root, 'notes', 'brief.txt'), 'hello')
    const writer = createFolderWriter(() => root, vi.fn())

    expect(await writer.move('notes', 'refs/notes')).toBe(true)

    const entries = await createFolderReader(() => root, inFrench).list('refs/notes')
    expect(entries.map(entry => entry.path)).toEqual(['refs/notes/brief.txt'])
  })

  it('copies a folder whole, leaving the original where it is', async () => {
    const root = await withFolder()
    await writeFile(join(root, 'notes', 'brief.txt'), 'hello')
    const writer = createFolderWriter(() => root, vi.fn())

    expect(await writer.copy('notes', 'notes 2')).toBe(true)

    const reader = createFolderReader(() => root, inFrench)
    expect((await reader.list('notes 2')).map(entry => entry.path)).toEqual(['notes 2/brief.txt'])
    expect((await reader.list('notes')).map(entry => entry.path)).toEqual(['notes/brief.txt'])
  })

  it('makes a folder where nothing stands', async () => {
    const root = await project()
    const writer = createFolderWriter(() => root, vi.fn())

    expect(await writer.createFolder('Characters')).toBe(true)

    expect(
      (await createFolderReader(() => root, inFrench).list('')).map(one => one.name),
    ).toContain('Characters')
  })

  it('says yes and does nothing when a move lands where it already is', async () => {
    const root = await project()
    const writer = createFolderWriter(() => root, vi.fn())

    expect(await writer.move('notes.txt', 'notes.txt')).toBe(true)
    expect(await readFile(join(root, 'notes.txt'), 'utf8')).toBe('hello')
  })

  it('answers no rather than throwing when there is nothing to move', async () => {
    const root = await project()
    const writer = createFolderWriter(() => root, vi.fn())

    expect(await writer.move('gone.txt', 'other.txt')).toBe(false)
    expect(await writer.copy('gone.txt', 'other.txt')).toBe(false)
  })

  it('hands a file to the system trash rather than deleting it', async () => {
    const root = await project()
    const toTrash = vi.fn(async () => undefined)
    const writer = createFolderWriter(() => root, toTrash)

    expect(await writer.trash('notes.txt')).toBe(true)

    expect(toTrash).toHaveBeenCalledWith(join(root, 'notes.txt'))
  })

  it('answers no when the system would not take it', async () => {
    const root = await project()
    const writer = createFolderWriter(
      () => root,
      vi.fn(async () => Promise.reject(new Error('no'))),
    )

    expect(await writer.trash('notes.txt')).toBe(false)
  })
})
