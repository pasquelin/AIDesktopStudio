import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ROLE_MARKER } from '@shared/domain/folderRole'

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

describe('finding every entry of one name', () => {
  it('crosses neither packages, nor git, nor the index it rebuilds', async () => {
    const root = await project()
    for (const folder of ['Images', 'node_modules', '.git', '.index']) {
      await mkdir(join(root, folder), { recursive: true })
      await writeFile(join(root, folder, ROLE_MARKER), '')
    }

    const found = await createFolderReader(() => root, inFrench).named(ROLE_MARKER)

    expect(found.map(entry => entry.path)).toEqual([`Images/${ROLE_MARKER}`])
  })
})
