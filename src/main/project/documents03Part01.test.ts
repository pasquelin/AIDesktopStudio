import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { LEGACY_DOCUMENTS_FOLDER } from '@shared/domain/document'

import { type DocumentFiles } from './documents'

import { documentFilesAt } from './project-fixtures'

const NOW = '2026-08-07T10:00:00.000Z'

describe('createDocumentFiles', () => {
  let root = ''

  let documents: DocumentFiles

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-documents-'))
    documents = documentFilesAt(root, NOW)
  })

  /**
   * What the whole of this change is for. A document written before version 3 is named after
   * its id — a uuid — and nothing about it may move: the layout, the recent list and every open
   * tab are keyed by that id, and the studio must not rewrite a project to open it.
   */
  describe('a document written before the file carried a name', () => {
    const legacyFile = async (id: string, envelope: object, content = '{}'): Promise<void> => {
      await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
      await writeFile(
        join(root, LEGACY_DOCUMENTS_FOLDER, `${id}.gltf`),
        `${JSON.stringify(envelope)}\n${content}`,
        'utf8',
      )
    }

    const V2 = { version: 2, kind: 'scene', title: 'Niveau', updatedAt: NOW }

    it('is called what its file name says, having nothing else to say so', async () => {
      await legacyFile('6d517ff3', V2)

      expect(await documents.list()).toEqual([
        {
          id: '6d517ff3',
          kind: 'scene',
          title: 'Niveau',
          workspace: '3d',
          path: `${LEGACY_DOCUMENTS_FOLDER}/6d517ff3.gltf`,
        },
      ])
    })

    it('is left where it is, and read by the id it has always had', async () => {
      await legacyFile('6d517ff3', V2, '{"nodes":[]}')

      expect((await documents.read('6d517ff3', 'scene'))?.content).toBe('{"nodes":[]}')
      expect(await readdir(join(root, LEGACY_DOCUMENTS_FOLDER))).toEqual(['6d517ff3.gltf'])
    })

    // Opening a project must not rewrite it; saving one is where the stamp goes in.
    it('is given its id in the envelope by the next save, and keeps its file', async () => {
      await legacyFile('6d517ff3', V2)
      await documents.write('6d517ff3', 'scene', { title: 'Niveau', content: '{}' })

      expect((await documents.read('6d517ff3', 'scene'))?.id).toBe('6d517ff3')
      expect(await readdir(join(root, LEGACY_DOCUMENTS_FOLDER))).toEqual(['6d517ff3.gltf'])
    })
  })

  /**
   * A document whose extension is gone — renamed to a bare word, here or in the Finder — was a
   * document the studio stopped seeing altogether: sitting in the folder, absent from every
   * list, unopenable, and unrepairable from inside the studio since the explorer only renames
   * what it recognises. With no extension there is no claim for the envelope to contradict.
   */
  it('reads a document whose extension was lost, and names it after its envelope', async () => {
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    const envelope = {
      version: 2,
      kind: 'audio',
      title: 'ElevenLabs Sound Effects 2',
      updatedAt: NOW,
    }
    await writeFile(
      join(root, LEGACY_DOCUMENTS_FOLDER, 'demo'),
      `${JSON.stringify(envelope)}\n{}`,
      'utf8',
    )

    expect(await documents.list()).toEqual([
      {
        id: 'demo',
        kind: 'audio',
        title: 'ElevenLabs Sound Effects 2',
        workspace: 'audio',
        path: `${LEGACY_DOCUMENTS_FOLDER}/demo`,
      },
    ])
  })

  /**
   * Renaming it is what puts the extension back, so the repair is one gesture from the explorer.
   *
   * Listed again rather than merely counted on disk: the extension it GAINS decides how the
   * bytes are spelt, and writing them the way the file it is LEAVING was spelt made a rename
   * destroy the document — right name, unreadable body, gone from every list at the next walk.
   */
  it('gives the extension back to such a document when it is renamed', async () => {
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    const envelope = { version: 2, kind: 'material', title: 'Perdu', updatedAt: NOW }
    await writeFile(
      join(root, LEGACY_DOCUMENTS_FOLDER, 'demo'),
      `${JSON.stringify(envelope)}\n{}`,
      'utf8',
    )

    await documents.rename('demo', 'material', 'Retrouvé')

    expect(await readdir(join(root, LEGACY_DOCUMENTS_FOLDER))).toEqual(['Retrouvé.mtlx'])
    expect((await documents.list()).map(one => one.title)).toEqual(['Retrouvé'])
  })

  /**
   * A montage IS its OpenTimelineIO file, so a body that is not one cannot be written into that
   * name. Refused LOUDLY and before anything moves: the file the user has is left exactly as it
   * was, where a rename that went through would have left a document nothing can read again.
   */
  it('refuses to rename a document into a spelling its body cannot be written in', async () => {
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    const envelope = { version: 2, kind: 'audio', title: 'Perdu', updatedAt: NOW }
    await writeFile(
      join(root, LEGACY_DOCUMENTS_FOLDER, 'demo'),
      `${JSON.stringify(envelope)}\n{}`,
      'utf8',
    )

    await expect(documents.rename('demo', 'audio', 'Retrouvé')).rejects.toThrow()
    expect(await readdir(join(root, LEGACY_DOCUMENTS_FOLDER))).toEqual(['demo'])
  })
})
