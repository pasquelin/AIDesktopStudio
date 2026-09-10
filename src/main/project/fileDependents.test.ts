import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_VERSION,
  type DocumentDescriptor,
  type DocumentFile,
} from '@shared/domain/document'
import { createFileDependents } from './fileDependents'

const SCENE: DocumentDescriptor = {
  id: 'doc-scene',
  kind: 'scene',
  title: 'Repérage',
  workspace: '3d',
  path: 'Scenes/Repérage.gltf',
}

const MONTAGE: DocumentDescriptor = {
  id: 'doc-cut',
  kind: 'sequence',
  title: 'Bande annonce',
  workspace: 'video',
  path: 'Video/Bande annonce.otio',
}

const fileOf = (content: string, kind: DocumentDescriptor['kind']): DocumentFile => ({
  version: DOCUMENT_VERSION,
  kind,
  title: '',
  updatedAt: '2026-09-10T09:00:00.000Z',
  content,
})

/**
 * The question a deletion asks before it takes anything away — §9.2. Its blind spot is written
 * on the module: it over-reports on homonyms, and never under-reports.
 */
describe('which documents cite a file', () => {
  const dependents = (bodies: Record<string, string>, ids: Record<string, string[]> = {}) =>
    createFileDependents({
      list: () => Promise.resolve([SCENE, MONTAGE]),
      read: id => Promise.resolve(bodies[id] ? fileOf(bodies[id], 'scene') : null),
      idsOf: () => Promise.resolve(new Map(Object.entries(ids))),
    })

  it('names the document that mentions the file', async () => {
    const found = await dependents({ 'doc-scene': '{"uri":"../Images/mur.png"}' }).usedBy([
      'Images/mur.png',
    ])

    expect(found).toEqual([
      { title: 'Repérage', path: 'Scenes/Repérage.gltf', kind: 'scene', used: ['Images/mur.png'] },
    ])
  })

  /** A scene writes its links as URIs: a space travels as `%20` and must still be found. */
  it('finds a name the document wrote as a URI', async () => {
    const found = await dependents({ 'doc-scene': '{"uri":"../Images/mur%20nord.png"}' }).usedBy([
      'Images/mur nord.png',
    ])

    expect(found).toHaveLength(1)
  })

  /** The other half a document may cite by: the catalogue id, which travels in the metadata. */
  it('finds a file cited by its catalogue id', async () => {
    const found = await dependents(
      { 'doc-cut': '{"assetId":"asset-77"}' },
      { 'Video/rush.mp4': ['asset-77'] },
    ).usedBy(['Video/rush.mp4'])

    expect(found.map(use => use.title)).toEqual(['Bande annonce'])
  })

  it('answers nothing for a file no document mentions', async () => {
    const found = await dependents({ 'doc-scene': '{"nodes":[]}' }).usedBy(['Images/seul.png'])

    expect(found).toEqual([])
  })

  /** One document that will not read must not cost the warning every other document holds. */
  it('skips a document it cannot read', async () => {
    const found = await createFileDependents({
      list: () => Promise.resolve([SCENE, MONTAGE]),
      read: id =>
        id === 'doc-scene'
          ? Promise.reject(new Error('unreadable'))
          : Promise.resolve(fileOf('{"uri":"mur.png"}', 'sequence')),
      idsOf: () => Promise.resolve(new Map()),
    }).usedBy(['Images/mur.png'])

    expect(found.map(use => use.title)).toEqual(['Bande annonce'])
  })
})
