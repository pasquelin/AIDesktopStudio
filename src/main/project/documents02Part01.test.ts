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

const MATERIALS = documentFolderOf('material')

describe('createDocumentFiles', () => {
  let root = ''

  let documents: DocumentFiles

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-documents-'))
    documents = documentFilesAt(root, NOW)
  })

  // Under the name a document written before version 3 wears, for the reason spelt out below on
  // the kind disagreement: a broken envelope cannot say which document it belongs to.
  it('reports a file it cannot parse rather than answering null', async () => {
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    await writeFile(join(root, LEGACY_DOCUMENTS_FOLDER, 'doc-1.gltf'), '{ truncated', 'utf8')

    await expect(documents.read('doc-1', 'scene')).rejects.toThrow()
  })

  /**
   * A document copied to another extension by hand would otherwise open in the wrong editor.
   *
   * Left under the name a document written before version 3 wears — its id — because that is
   * the one an unreadable file can still be reached by: an envelope that does not parse cannot
   * say which document it is, so a title-named file whose head is broken is nameless to the id
   * that used to address it, and reads as never saved rather than as broken.
   */
  it('refuses a file whose kind disagrees with its extension', async () => {
    await documents.write('doc-1', 'material', { title: 'Untitled', content: '{}' })
    const source = await readFile(join(root, MATERIALS, 'Untitled.mtlx'), 'utf8')
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    await writeFile(join(root, LEGACY_DOCUMENTS_FOLDER, 'doc-1.gltf'), source, 'utf8')

    await expect(documents.read('doc-1', 'scene')).rejects.toThrow(/material/)
  })

  /**
   * Two kinds wear `.gltf`, so the FILE says which — but only within what the extension could
   * name. Trusting the head outright would open a material in the scene editor, and the listing
   * is where that starts: a descriptor is built before anything asks `read` for a kind.
   */
  it('lets the file pick between the kinds its extension names, and no further', async () => {
    await mkdir(join(root, 'documents'), { recursive: true })
    const head = (kind: string): string =>
      `${JSON.stringify({ version: DOCUMENT_VERSION, kind, title: kind, updatedAt: NOW })}\n{}`
    await writeFile(join(root, 'documents', 'Dusk.gltf'), head('skybox'), 'utf8')
    await writeFile(join(root, 'documents', 'Rock.gltf'), head('material'), 'utf8')

    expect((await documents.list()).map(one => one.kind)).toEqual(['skybox'])
  })

  it('refuses a file written by a later build instead of flattening it', async () => {
    await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
    const later = { version: 99, kind: 'scene', title: 'Ahead', updatedAt: NOW }
    await writeFile(
      join(root, LEGACY_DOCUMENTS_FOLDER, 'doc-1.gltf'),
      `${JSON.stringify(later)}\n{}`,
      'utf8',
    )

    await expect(documents.read('doc-1', 'scene')).rejects.toThrow()
  })
})
