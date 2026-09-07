import { mkdir, mkdtemp, readdir, rename, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { documentFolderOf, LEGACY_DOCUMENTS_FOLDER } from '@shared/domain/document'

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

  // A stray note the user dropped in there is not a document, and must stay a plain file.
  it('leaves a file that is not a document alone', async () => {
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    await writeFile(join(root, LEGACY_DOCUMENTS_FOLDER, 'notes'), 'a note of mine', 'utf8')

    expect(await documents.list()).toEqual([])
  })

  /**
   * What the phase opens: a document lives where the user filed it, and the listing walks the
   * project to find it. the kind's own shelf is only where a first save lands.
   */
  describe('documents the user filed themselves', () => {
    it('finds one wherever in the project it sits', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{"nodes":[]}' })
      await mkdir(join(root, 'Acte 1', 'Ruelles'), { recursive: true })
      await rename(
        join(root, SCENES, 'Niveau.gltf'),
        join(root, 'Acte 1', 'Ruelles', 'Niveau.gltf'),
      )

      expect((await documents.list())[0]).toMatchObject({
        id: 'doc-1',
        path: 'Acte 1/Ruelles/Niveau.gltf',
      })
      expect((await documents.read('doc-1', 'scene'))?.content).toBe('{"nodes":[]}')
    })

    // A rename that moved the file back to its kind's shelf would tidy the project behind the user.
    it('renames one where it sits, without moving it', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{"nodes":[]}' })
      await mkdir(join(root, 'Acte 1'), { recursive: true })
      await rename(join(root, SCENES, 'Niveau.gltf'), join(root, 'Acte 1', 'Niveau.gltf'))
      await documents.list()

      expect(await documents.rename('doc-1', 'scene', 'Décor')).toMatchObject({
        path: 'Acte 1/Décor.gltf',
      })
      expect(await readdir(join(root, 'Acte 1'))).toEqual(['Décor.gltf'])
    })

    // The disk holds both, so a check taken over the whole tree would refuse a free name.
    it('lets two folders each hold a document of the same name', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: 'first' })
      await mkdir(join(root, 'Acte 1'), { recursive: true })
      await rename(join(root, SCENES, 'Niveau.gltf'), join(root, 'Acte 1', 'Niveau.gltf'))
      await documents.write('doc-2', 'scene', { title: 'Autre', content: 'second' })
      await documents.list()

      await documents.rename('doc-2', 'scene', 'Niveau')

      expect(await held(SCENES)).toEqual(['Niveau.gltf'])
      expect(await readdir(join(root, 'Acte 1'))).toEqual(['Niveau.gltf'])
    })
  })

  /**
   * The identity is the envelope's, so a file renamed in the Finder is the same document under
   * another name — which is what lets the studio rename one without it becoming a different
   * document, and what the tabs, the layout and the recent list all depend on.
   */
  it('follows a document whose file was renamed by hand', async () => {
    await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{"nodes":[]}' })
    await rename(join(root, SCENES, 'Niveau.gltf'), join(root, SCENES, 'Décor.gltf'))

    expect((await documents.read('doc-1', 'scene'))?.content).toBe('{"nodes":[]}')
    expect((await documents.list())[0]).toMatchObject({
      id: 'doc-1',
      path: `${SCENES}/Décor.gltf`,
    })
  })

  // The studio names what it engenders, and there is nobody to ask about a collision.
  it('suffixes a fresh document rather than writing over the name it wanted', async () => {
    await documents.write('doc-1', 'scene', { title: 'Niveau', content: 'first' })
    await documents.write('doc-2', 'scene', { title: 'Niveau', content: 'second' })

    expect((await documents.read('doc-1', 'scene'))?.content).toBe('first')
    expect((await documents.read('doc-2', 'scene'))?.content).toBe('second')
    expect([...(await held(SCENES))].sort()).toEqual(['Niveau 2.gltf', 'Niveau.gltf'])
  })
})
