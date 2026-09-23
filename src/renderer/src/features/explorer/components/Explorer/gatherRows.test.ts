import { describe, expect, it } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { RecentProject } from '@shared/domain/project'
import { gatherRows } from './gatherRows'

const t = ((key: string) => key) as unknown as Parameters<typeof gatherRows>[0]['t']

const document: DocumentDescriptor = {
  id: 'doc',
  kind: 'scene',
  title: 'Niveau',
  path: 'documents/doc.gltf',
  workspace: '3d',
}

const recent: RecentProject[] = [
  {
    path: '/projects/Summer',
    createdAt: '2026-08-01T10:00:00.000Z',
    openedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    path: '/projects/Winter',
    createdAt: '2026-09-01T10:00:00.000Z',
    openedAt: '2026-09-02T10:00:00.000Z',
  },
]

describe('gathering into another project', () => {
  it('offers every project of the shelf but the open one', () => {
    const rows = gatherRows({ document, recent, openProject: '/projects/Summer', t })
    const group = rows.find(row => 'rows' in row)

    expect(group && 'rows' in group ? group.rows.map(one => one.label) : []).toEqual(['Winter'])
  })

  /** « What does this cite » is a question only a document answers; for an image it is nothing. */
  it('offers nothing for an entry that is not a document', () => {
    expect(gatherRows({ document: null, recent, openProject: null, t })).toEqual([])
  })

  it('offers nothing when the shelf holds no other project', () => {
    const alone = [recent[0]!]
    expect(gatherRows({ document, recent: alone, openProject: '/projects/Summer', t })).toEqual([])
  })
})
