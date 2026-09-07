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

describe('reading the names a folder holds', () => {
  it('counts what the listing hides, so a plan cannot claim a name that is taken', async () => {
    const root = await project()
    const reader = createFolderReader(() => root, inFrench)

    expect(await reader.names('')).toContain('.project.json')
    expect((await reader.list('')).map(entry => entry.name)).not.toContain('.project.json')
  })

  // How a destination that has gone — or that turned out to be a file — is told from an empty one.
  it('answers nothing at all for a path that is not a folder', async () => {
    const root = await project()
    const reader = createFolderReader(() => root, inFrench)

    expect(await reader.names('notes.txt')).toBeNull()
    expect(await reader.names('gone')).toBeNull()
  })
})
