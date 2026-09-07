import { mkdtemp, readdir, rename, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { documentFolderOf } from '@shared/domain/document'

import { isHiddenEntry } from '@shared/domain/folder'

import { type DocumentFiles } from './documents'

import { documentFilesAt } from './project-fixtures'

const NOW = '2026-08-07T10:00:00.000Z'

/**
 * Where a first save lands, per kind — four shelves here, where `documents/` was one for all.
 * Read off the domain rather than spelt out: what these cases are about is that a document lands
 * with its own section, not that the section is called what it is called today.
 */
const SCENES = documentFolderOf('scene')

describe('createDocumentFiles', () => {
  let root = ''

  let documents: DocumentFiles

  /**
   * What a folder holds as a reader SEES it — the role marker left out, exactly as the explorer
   * leaves it out. `readdir` shows it; nothing in the studio does.
   */
  const held = async (folder: string): Promise<string[]> =>
    (await readdir(join(root, folder))).filter(name => !isHiddenEntry(name))

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-documents-'))
    documents = documentFilesAt(root, NOW)
  })

  /**
   * `.gltf` names two kinds, so the address a document of either WOULD have had is the same one
   * — and closing a sky that was never saved would have deleted the scene sitting at it. Removal
   * asks the file whose it is rather than trusting where it was pointed.
   */
  it('removes nothing when the file at that address belongs to the other kind', async () => {
    await documents.write('twin', 'scene', { title: 'Twin', content: '{}' })
    await rename(join(root, SCENES, 'Twin.gltf'), join(root, SCENES, 'twin.gltf'))

    await documents.remove('twin', 'skybox')

    expect(await held(SCENES)).toEqual(['twin.gltf'])
  })

  /**
   * Written down rather than hidden, and it is `locate` that decides it: a document whose
   * envelope stopped reading cannot be FOUND — `holds` refuses the cached path and the walk no
   * longer lists it — so removal reaches the address it would have had, and the real file stays.
   * Invisible in every list and undeletable from the studio; the Finder is the way out.
   */
  it('leaves behind a document whose envelope stopped reading, having nowhere to look', async () => {
    await documents.write('doc-1', 'scene', { title: 'Level', content: '{}' })
    await writeFile(join(root, SCENES, 'Level.gltf'), '{ truncated', 'utf8')

    await documents.remove('doc-1', 'scene')

    expect(await held(SCENES)).toEqual(['Level.gltf'])
  })

  // Two windows on one document is a case the studio already lives with; a shared staging name
  // would have each overwrite the other's and rename half of one over the target.
  it('survives concurrent writes of the same document', async () => {
    await Promise.all([
      documents.write('doc-1', 'scene', { title: 'A', content: 'a'.repeat(20_000) }),
      documents.write('doc-1', 'scene', { title: 'B', content: 'b'.repeat(20_000) }),
    ])

    const file = await documents.read('doc-1', 'scene')
    expect(file?.content).toMatch(/^(a+|b+)$/)
    // One file, and it is the one the first write named: a document already on disk keeps the
    // file it is in, so a second write cannot leave a copy under another name beside it.
    expect(await held(SCENES)).toEqual(['A.gltf'])
  })

  // An autosave still staging its copy would otherwise rename it back over a document the
  // user has just deleted, and the deletion would undo itself.
  it('does not let a write in flight resurrect a removed document', async () => {
    const writing = documents.write('doc-1', 'scene', {
      title: 'Big',
      content: 'x'.repeat(200_000),
    })
    const removing = documents.remove('doc-1', 'scene')
    await Promise.all([writing, removing])

    expect(await documents.read('doc-1', 'scene')).toBeNull()
    expect(await held(SCENES)).toEqual([])
  })
})
