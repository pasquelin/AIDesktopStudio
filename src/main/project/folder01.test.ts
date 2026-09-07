import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createFolderReader } from './folder'

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

describe('reading the project folder', () => {
  it('lists one level, folders first and then by name', async () => {
    const root = await project()

    const entries = await createFolderReader(() => root, inFrench).list('')

    expect(entries.map(entry => `${entry.kind}:${entry.name}`)).toEqual([
      'folder:assets',
      'folder:documents',
      'file:notes.txt',
    ])
  })

  /**
   * The case injecting the language exists to make writable, and it could not be written while the
   * reader took it off a module global.
   *
   * `Ä` files with `A` for both of the studio's languages and after `Z` for a Swedish reader, so a
   * listing sorted in whatever locale the machine was installed in is a listing in an order nobody
   * asked for — which is what a bare `localeCompare` did here.
   */
  it('sorts for the language it is handed, not the one the machine runs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-folder-'))
    await writeFile(join(root, 'Ärger.txt'), '')
    await writeFile(join(root, 'Zoo.txt'), '')

    const namesIn = async (language: string): Promise<string[]> =>
      (
        await createFolderReader(
          () => root,
          () => language,
        ).list('')
      ).map(entry => entry.name)

    expect(await namesIn('fr')).toEqual(['Ärger.txt', 'Zoo.txt'])
    expect(await namesIn('sv')).toEqual(['Zoo.txt', 'Ärger.txt'])
  })

  /**
   * The two the studio puts there and can rebuild. Hidden by the platforms' own rule — a
   * leading dot — rather than by a list, so a third one does not have to be remembered.
   */
  it('leaves out what the studio keeps for itself', async () => {
    const root = await project()

    const entries = await createFolderReader(() => root, inFrench).list('')

    expect(entries.map(entry => entry.name)).not.toContain('.index')
    expect(entries.map(entry => entry.name)).not.toContain('.project.json')
  })

  it('shows them to a reader who asked for them', async () => {
    const root = await project()

    const entries = await createFolderReader(() => root, inFrench).list('', true)

    expect(entries.map(entry => entry.name)).toContain('.index')
    expect(entries.map(entry => entry.name)).toContain('.project.json')
  })

  // The path is the tree's id as well as the path, and it is what the next read is asked for.
  it('shows a package folder, which the walks refuse to cross', async () => {
    const root = await project()
    await mkdir(join(root, 'node_modules'), { recursive: true })

    const entries = await createFolderReader(() => root, inFrench).list('')

    expect(entries.map(entry => entry.name)).toContain('node_modules')
  })

  it('names each entry relative to the project root', async () => {
    const root = await project()
    await writeFile(join(root, 'documents', 'a3f1.gltf'), '{}')

    const entries = await createFolderReader(() => root, inFrench).list('documents')

    expect(entries[0]?.path).toBe('documents/a3f1.gltf')
  })

  it('reads the folder of whatever project is open at call time', async () => {
    const first = await project()
    const second = await project()
    await writeFile(join(second, 'only-here.txt'), '')
    let open = first

    const reader = createFolderReader(() => open, inFrench)
    open = second

    expect((await reader.list('')).map(entry => entry.name)).toContain('only-here.txt')
  })

  /**
   * `Été` is six characters on screen and two different strings underneath — composed, as a
   * keyboard sends it, or decomposed, as a volume that stores it that way hands it back. Left as
   * they come, the catalogue holds one form and the folder answers the other, and every
   * comparison of the two says no: the row the explorer joins to this file, the path a rescan
   * recognises, the asset an inspector finds.
   *
   * Composed here and in `safeFileName`, which are the two places the studio meets the question:
   * where the disk speaks, and where a name is made.
   */
  it('answers a decomposed name in the form a name made here takes', async () => {
    const root = await project()
    const named = 'Été.png'
    const decomposed = named.normalize('NFD')
    await writeFile(join(root, decomposed), 'bytes', 'utf8')

    const found = await createFolderReader(() => root, inFrench).list('')
    const names = found.map(entry => entry.name)

    expect(names).toContain('Été'.normalize('NFC') + '.png')
    expect(names).not.toContain(decomposed)
    expect(found.find(entry => entry.name.startsWith('É'))?.path).toBe('Été.png'.normalize('NFC'))
  })
})
