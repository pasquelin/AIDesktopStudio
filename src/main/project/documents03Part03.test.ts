import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { basename, join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { documentFolderOf, type DocumentDescriptor } from '@shared/domain/document'

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
   * The folder is the user's, and the studio's memory of it is filled by a listing. A file that
   * landed since — copied in by hand, or left by a window that never listed — was invisible to a
   * check taken from that memory, and the first save of a fresh document wrote straight over it.
   * `filePlan` asks the folder for the same question, and now so does this.
   */
  it('suffixes around a file it was never told about', async () => {
    await mkdir(join(root, SCENES), { recursive: true })
    await writeFile(join(root, SCENES, 'Niveau.gltf'), 'theirs', 'utf8')

    await documents.write('doc-1', 'scene', { title: 'Niveau', content: 'mine' })

    expect(await readFile(join(root, SCENES, 'Niveau.gltf'), 'utf8')).toBe('theirs')
    expect((await documents.read('doc-1', 'scene'))?.content).toBe('mine')
  })

  /**
   * A title is a file name now, and a file name cannot hold a separator: `Brique 1/2` would
   * land on `Brique 1 2` and the document would answer to two names again.
   */
  it('writes a title the disk cannot hold under a name it can', async () => {
    await documents.write('doc-1', 'scene', { title: 'Brique 1/2', content: '{}' })

    expect(await held(SCENES)).toEqual(['Brique 1 2.gltf'])
  })

  /**
   * A document duplicated in the Finder carries the id of the one it was copied from. The listing
   * keeps that id for the first in path order and calls the second after its own PATH, which is
   * unique by construction — the alternative being a file plainly sitting in the folder and
   * absent from every list.
   *
   * What that leaves is a document whose id is a path: every gesture of the studio then arrives
   * with that id, and the file's own envelope still answers the OLD one.
   */
  describe('a document duplicated outside the studio', () => {
    /**
     * The one the listing did NOT give the envelope's id to — whichever of the pair that is.
     *
     * Which one wins is settled by path order and is nobody's business: `Level copie.gltf` sorts
     * before `Level.gltf`, a space being under a dot. What matters is the loser, and that it is
     * reachable at all.
     */
    const secondOfTwo = async (): Promise<DocumentDescriptor> => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{"nodes":["mine"]}' })
      await copyFile(join(root, SCENES, 'Level.gltf'), join(root, SCENES, 'Level copie.gltf'))

      const second = (await documents.list()).find(one => one.id !== 'doc-1')
      if (!second) throw new Error('expected the pair to be told apart')
      return second
    }

    it('tells the pair apart, calling one of them after its own path', async () => {
      const second = await secondOfTwo()

      expect(second.id).toBe(second.path)
      expect((await documents.list()).map(one => one.id).sort()).toEqual(
        ['doc-1', second.path].sort(),
      )
    })

    // Listed and unopenable is the worst of both: the row is there, the double-click gives an
    // empty tab, and the next ⌘S writes that emptiness under `<the shelf>/<the whole path>.gltf`.
    it('reads it back rather than answering nothing', async () => {
      const second = await secondOfTwo()

      expect((await documents.read(second.id, 'scene'))?.content).toBe('{"nodes":["mine"]}')
    })

    it('writes it back into its own file', async () => {
      const second = await secondOfTwo()

      expect(await documents.write(second.id, 'scene', { title: 'x', content: 'theirs' })).toBe(
        'written',
      )
      expect(await readFile(join(root, second.path), 'utf8')).toContain('theirs')
    })

    it('removes it rather than the other one', async () => {
      const second = await secondOfTwo()

      await documents.remove(second.id, 'scene')

      expect(await held(SCENES)).toEqual([
        basename(second.path) === 'Level.gltf' ? 'Level copie.gltf' : 'Level.gltf',
      ])
    })
  })
})
