import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION } from '@shared/domain/document'

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
   * The other half of the same rule: a file that opens like nothing of ours is turned away rather
   * than read whole at every listing. A glTF the user exported into the project is minified onto
   * one line, textures and buffers in base64 — reading it whole on the thread that owns every
   * window is a freeze per listing, not a slow listing.
   */
  it('turns away a file of an open format the studio did not write', async () => {
    await mkdir(join(root, 'documents'), { recursive: true })
    const gltf = { asset: { version: '2.0' }, scenes: [{ nodes: [0] }], padding: 'x'.repeat(9_000) }
    await writeFile(join(root, 'documents', 'Décor.gltf'), JSON.stringify(gltf), 'utf8')

    expect(await documents.list()).toEqual([])
  })

  it('stamps the envelope itself rather than trusting what it was handed', async () => {
    const draft = { title: 'Mine', content: '{}', version: 99, kind: 'image', updatedAt: 'nope' }
    await documents.write('doc-1', 'scene', draft)

    const file = await documents.read('doc-1', 'scene')
    expect(file?.version).toBe(DOCUMENT_VERSION)
    expect(file?.kind).toBe('scene')
    expect(file?.updatedAt).toBe(NOW)
  })

  // Written to first, so this exercises a missing file and not a missing folder.
  it('answers null for a document that was never saved', async () => {
    await documents.write('other', 'scene', { title: 'Other', content: '{}' })
    expect(await documents.read('never-saved', 'scene')).toBeNull()
  })

  // An editor that serializes an untouched document to nothing writes a file with no content
  // key at all, since `JSON.stringify` drops it. Reading it back must not throw.
  it('survives a document whose content serialized to nothing', async () => {
    await documents.write('empty', 'scene', { title: 'Empty', content: '' })

    const file = await documents.read('empty', 'scene')
    expect(file?.title).toBe('Empty')
    expect(file?.content).toBe('')
  })
})
