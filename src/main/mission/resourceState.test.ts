import { describe, expect, it } from 'vitest'
import { createMission, type Mission } from '@shared/domain/mission'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import { createMissionRevisionReader } from './resourceState'

const mission: Mission = {
  ...createMission('Edit both scenes', {
    now: () => '2026-09-04T10:00:00.000Z',
    newId: () => 'one',
  }),
  resourceRefs: [
    { kind: 'document', id: 'scene-a' },
    { kind: 'entity', document: 'scene-a', id: 'camera' },
    { kind: 'document', id: 'scene-b' },
  ],
}

function snapshotWith(
  documentRevisions: NonNullable<StudioSnapshot['documentRevisions']>,
): StudioSnapshot {
  return {
    project: null,
    projectKnown: true,
    workspace: '3d',
    surface: 'scene',
    commandScope: 'scene',
    documents: [],
    documentRevisions,
    selection: null,
    armedModels: {},
    play: 'edit',
    tasks: [],
    authenticated: false,
    authKnown: true,
  }
}

describe('mission resource state', () => {
  it('reads revisions only for resources held by the active document', async () => {
    const snapshot = snapshotWith([
      {
        documentId: 'scene-a',
        kind: 'scene',
        incarnation: 'window-a',
        revision: 7,
      },
      {
        documentId: 'scene-b',
        kind: 'scene',
        incarnation: 'window-b',
        revision: 3,
      },
    ])
    const reader = createMissionRevisionReader(async () => snapshot)

    expect(await reader.read(mission)).toEqual({
      current: [
        {
          resource: { kind: 'document', id: 'scene-a' },
          incarnation: 'window-a',
          revision: 7,
        },
        {
          resource: { kind: 'entity', document: 'scene-a', id: 'camera' },
          incarnation: 'window-a',
          revision: 7,
        },
        {
          resource: { kind: 'document', id: 'scene-b' },
          incarnation: 'window-b',
          revision: 3,
        },
      ],
      unavailable: [],
    })
  })

  it('treats unavailable document state as unknown instead of inventing a revision', async () => {
    const reader = createMissionRevisionReader(async () => null)
    await expect(reader.read(mission)).rejects.toThrow('document revisions are unavailable')
  })

  it('forgets a missing baseline once replanning removed its resource', async () => {
    const currentMission: Mission = {
      ...mission,
      resourceRefs: [{ kind: 'document', id: 'scene-a' }],
      revisionSnapshots: [
        {
          resource: { kind: 'document', id: 'scene-b' },
          incarnation: 'old-window',
          revision: 2,
        },
      ],
    }
    const reader = createMissionRevisionReader(async () =>
      snapshotWith([
        { documentId: 'scene-a', kind: 'scene', incarnation: 'window-a', revision: 4 },
      ]),
    )

    expect((await reader.read(currentMission)).unavailable).toEqual([])
  })
})
