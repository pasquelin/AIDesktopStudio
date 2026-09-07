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

describe('walking the project folder for what it holds', () => {
  const walked = async (root: string, hidden?: boolean): Promise<string[]> =>
    (await createFolderReader(() => root, inFrench).walk(hidden)).map(entry => entry.path)

  /**
   * The domain view asks what a file IS, and a folder is not a domain — except one written as a
   * document, which is an item and answers as one.
   */
  it('answers the files at every depth, and no folder of its own', async () => {
    const root = await project()
    await mkdir(join(root, 'Repérages', 'Ruelles'), { recursive: true })
    await writeFile(join(root, 'Repérages', 'Ruelles', 'ruelle.png'), '')
    await writeFile(join(root, 'planche.ora'), 'a container')

    expect((await walked(root)).sort()).toEqual([
      'Repérages/Ruelles/ruelle.png',
      'notes.txt',
      'planche.ora',
    ])
  })

  it('leaves out what the studio keeps for itself, unless it was asked for', async () => {
    const root = await project()
    await writeFile(join(root, '.index', 'catalog.db'), '')

    expect(await walked(root)).not.toContain('.index/catalog.db')
    expect(await walked(root, true)).toContain('.index/catalog.db')
  })

  /**
   * A package folder wears no dot, so nothing else would stop it: a project beside a checkout
   * answered forty thousand files nobody wrote. Refused at BOTH settings of `hidden`, which is
   * what tells a second axis from an effect of the hidden filter.
   */
  it('never goes down into a package folder', async () => {
    const root = await project()
    await mkdir(join(root, 'Scripts', 'node_modules', 'left-pad'), { recursive: true })
    await writeFile(join(root, 'Scripts', 'node_modules', 'left-pad', 'index.js'), '')
    await writeFile(join(root, 'Scripts', 'game.ts'), '')

    const files = await walked(root)
    expect(files).toContain('Scripts/game.ts')
    expect(files).not.toContain('Scripts/node_modules/left-pad/index.js')
    expect(await walked(root, true)).not.toContain('Scripts/node_modules/left-pad/index.js')
  })
})
