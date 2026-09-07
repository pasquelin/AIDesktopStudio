import type { Mission } from '@shared/domain/mission'
import type { Ref } from '@shared/domain/ref'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import type { MissionRevisionReader } from './scheduler'
import { refToString } from '@shared/domain/ref'

function documentIdOf(ref: Ref): string | null {
  if (ref.kind === 'document') return ref.id
  if ('document' in ref) return ref.document
  return null
}

export function createMissionRevisionReader(
  snapshot: () => Promise<StudioSnapshot | null>,
): MissionRevisionReader {
  return {
    read: async (mission: Mission) => {
      const current = await snapshot()
      if (!current?.documentRevisions) throw new Error('document revisions are unavailable')
      const states = current.documentRevisions
      const revisions = mission.resourceRefs.flatMap(resource =>
        states.flatMap(state =>
          documentIdOf(resource) === state.documentId
            ? [{ resource, incarnation: state.incarnation, revision: state.revision }]
            : [],
        ),
      )
      const available = new Set(revisions.map(revision => refToString(revision.resource)))
      const wanted = new Set(mission.resourceRefs.map(refToString))
      const unavailable = mission.revisionSnapshots.filter(
        revision =>
          wanted.has(refToString(revision.resource)) &&
          documentIdOf(revision.resource) !== null &&
          !available.has(refToString(revision.resource)),
      )
      return { current: revisions, unavailable }
    },
  }
}
