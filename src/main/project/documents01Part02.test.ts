import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  documentFolderOf,
  DOCUMENT_VERSION,
  LEGACY_DOCUMENTS_FOLDER,
} from '@shared/domain/document'

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

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-documents-'))
    documents = documentFilesAt(root, NOW)
  })

  // The envelope on the first line, the content under it: listing a project then reads a short
  // head per file instead of parsing every document in it, and the folder still reads by eye.
  it('writes the envelope on a line of its own', async () => {
    await documents.write('doc-1', 'scene', { title: 'Level', content: '{"nodes":[]}' })

    const [head, body] = (await readFile(join(root, SCENES, 'Level.gltf'), 'utf8')).split('\n')
    expect(JSON.parse(head ?? '')).toEqual({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Level',
      updatedAt: NOW,
      id: 'doc-1',
    })
    expect(body).toBe('{"nodes":[]}')
  })

  // The proof that the content is never parsed on this side: one that could not be would fail
  // the listing otherwise, and a scene of twenty thousand nodes costs the same as this.
  it('lists a document whose content it could never parse', async () => {
    await documents.write('doc-1', 'scene', { title: 'Level', content: 'not json at all' })

    expect(await documents.list()).toEqual([
      {
        id: 'doc-1',
        kind: 'scene',
        title: 'Level',
        workspace: '3d',
        path: `${SCENES}/Level.gltf`,
      },
    ])
  })

  // What the version field was for. A file written before the envelope moved onto its own line
  // holds everything in one object, content included.
  it('reads a document written by the first version of the format', async () => {
    const legacy = {
      version: 1,
      kind: 'scene',
      title: 'Older',
      updatedAt: NOW,
      content: { nodes: ['a'] },
    }
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    await writeFile(
      join(root, LEGACY_DOCUMENTS_FOLDER, 'doc-1.gltf'),
      JSON.stringify(legacy),
      'utf8',
    )

    expect(await documents.read('doc-1', 'scene')).toEqual({
      version: 1,
      kind: 'scene',
      title: 'Older',
      updatedAt: NOW,
      content: '{"nodes":["a"]}',
    })
    expect((await documents.list())[0]?.title).toBe('Older')
  })

  /**
   * A version 1 file is one object, content included, so there is no line to read short — it is
   * read WHOLE, and its size is no reason to refuse it. Refusing on size is what a first attempt
   * at keeping a foreign glTF out of the listing did, and it made every large legacy document
   * vanish: present in the folder, absent from every list, unopenable.
   */
  it('lists a document of the first version however far past a head it runs', async () => {
    const legacy = {
      version: 1,
      kind: 'scene',
      title: 'Older',
      updatedAt: NOW,
      content: { nodes: Array.from({ length: 4_000 }, (_, n) => `node-${n}`) },
    }
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    await writeFile(
      join(root, LEGACY_DOCUMENTS_FOLDER, 'doc-1.gltf'),
      JSON.stringify(legacy),
      'utf8',
    )

    expect((await documents.list())[0]).toMatchObject({ id: 'doc-1', kind: 'scene' })
  })
})
