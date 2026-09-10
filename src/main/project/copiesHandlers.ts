import { z } from 'zod'
import { CHANNELS } from '@shared/ipc'
import { NO_DERIVED_CACHE } from '@shared/domain/derivedCache'
import { handle } from '@main/ipc/handle'
import { spareCores } from '@main/spareCores'
import { createDerivedCache } from './derivedCache'
import type { ProjectHandlerDeps } from './handlerTypes'
import { orWhenGone } from './store'

export type CopiesHandlerDeps = {
  project: ProjectHandlerDeps['project']
  media: ProjectHandlerDeps['media']
}

/**
 * Loose on the alphabet on purpose — what a fingerprint is spelt with belongs to whoever
 * computes it. Bounded is what matters: an unbounded string reaches a `WHERE hash = ?`.
 */
const fingerprint = z.string().min(1).max(256).optional()

/**
 * Say what the project holds twice, and free what it can rebuild. Neither route deletes a file
 * of the user's: the trash stays `projectTrashFiles`, which names what would notice (E-21).
 */
export function registerCopiesHandlers({ project, media }: CopiesHandlerDeps): void {
  const derived = createDerivedCache({
    projectPath: () => project.path(),
    clearDerivedPaths: () => project.catalog().clearDerivedPaths(),
    concurrency: spareCores,
    deriving: () => media.deriving(),
  })

  // Empty rather than a failure once the project has gone: a window left open on it then says
  // « nothing is held twice », which is what an unreadable catalogue means here.
  handle(CHANNELS.projectFileCopies, (_event, hash) =>
    orWhenGone(() => project.catalog().copies(fingerprint.parse(hash)), []),
  )

  handle(CHANNELS.projectDerivedCache, () => orWhenGone(() => derived.measure(), NO_DERIVED_CACHE))
  handle(CHANNELS.projectPurgeDerivedCache, () =>
    orWhenGone(() => derived.purge(), NO_DERIVED_CACHE),
  )
}
