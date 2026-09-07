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

describe('searching the project folder', () => {
  const namesFound = async (root: string, term: string, hidden?: boolean): Promise<string[]> =>
    (await createFolderReader(() => root, inFrench).search(term, hidden)).map(entry => entry.path)

  /**
   * 🛑 The search a person actually types, and the one a substring could never answer: this
   * studio names a picture after the prompt that made it, so the words are in the name but
   * scattered through it. `green sailboat` found nothing in a folder holding
   * `a beautiful sailing ship, sailboat, on the open sea, green….png`.
   */
  it('finds a name by its words, wherever they sit in it and in any order', async () => {
    const root = await project()
    const named = 'a beautiful sailing ship, sailboat, on the open sea, green.png'
    await writeFile(join(root, named), '')

    expect(await namesFound(root, 'green sailboat')).toEqual([named])
    expect(await namesFound(root, 'sailboat green')).toEqual([named])
    // Every word has to be there: one that is not is a different file.
    expect(await namesFound(root, 'green submarine')).toEqual([])
  })

  /**
   * The whole reason this channel exists: the tree reads one folder at a time, so a file three
   * folds down is a file it has never seen — and a search that filtered what is loaded would
   * answer nothing for it.
   */
  it('finds a file no reader has unfolded, folders included', async () => {
    const root = await project()
    await mkdir(join(root, 'Repérages', 'Ruelles'), { recursive: true })
    await writeFile(join(root, 'Repérages', 'Ruelles', 'ruelle-bleue.png'), '')

    expect(await namesFound(root, 'ruelle')).toEqual([
      'Repérages/Ruelles',
      'Repérages/Ruelles/ruelle-bleue.png',
    ])
  })

  // The hand that types into a search box is looking, not spelling.
  it('answers a term typed without its accents', async () => {
    const root = await project()
    await writeFile(join(root, 'Forêt.png'), '')

    expect(await namesFound(root, 'foret')).toEqual(['Forêt.png'])
  })

  it('leaves out what the studio keeps for itself, unless it was asked for', async () => {
    const root = await project()
    await writeFile(join(root, '.index', 'catalog.db'), '')

    expect(await namesFound(root, 'catalog')).toEqual([])
    expect(await namesFound(root, 'catalog', true)).toEqual(['.index/catalog.db'])
  })

  /**
   * Every document is a FILE now, containers included. A folder wearing a document's extension
   * is the user's OWN material — an `.ora` unpacked by hand, a glTF delivered unzipped into
   * `Repérages.gltf/` — and walking past it drops every file in it out of the domain view, of
   * search, and of the rescan, which then counts them all as gone.
   */
  it('walks into a folder that merely wears a document spelling', async () => {
    const root = await project()
    await mkdir(join(root, 'Repérages.gltf'))
    await writeFile(join(root, 'Repérages.gltf', 'ruelle.png'), '')

    expect(await namesFound(root, 'ruelle')).toEqual(['Repérages.gltf/ruelle.png'])
  })

  it('leaves a package folder out of what it answers', async () => {
    const root = await project()
    await mkdir(join(root, 'node_modules', 'sailboat'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'sailboat', 'sailboat.js'), '')
    await writeFile(join(root, 'sailboat.png'), '')

    expect(await namesFound(root, 'sailboat')).toEqual(['sailboat.png'])
  })

  it('answers nothing at all for an empty term', async () => {
    const root = await project()

    expect(await namesFound(root, '   ')).toEqual([])
  })
})
