import { z } from 'zod'
import { CHANNELS } from '@shared/ipc'
import type { DerivedCacheReport } from '@shared/domain/derivedCache'
import { handle } from '@main/ipc/handle'
import { spareCores } from '@main/spareCores'
import { createDerivedCache } from './derivedCache'
import type { ProjectHandlerDeps } from './handlerTypes'
import { orWhenGone } from './store'

export type CopiesHandlerDeps = {
  project: ProjectHandlerDeps['project']
}

const NOTHING: DerivedCacheReport = { stores: [], bytes: 0, clearedRows: 0 }

/**
 * A fingerprint as the catalogue writes it, or nothing — the whole diagnosis.
 *
 * Loose on the alphabet on purpose: what a fingerprint is spelt with belongs to whoever computes
 * it, and a route that pinned it to hexadecimal would refuse the day that changed. Bounded, and
 * that is what matters here: an unbounded string reaches a `WHERE hash = ?` from a window.
 */
const fingerprint = z.string().min(1).max(256).optional()

/**
 * The two routes of §16: SAY what the project holds twice, and free what it can rebuild.
 *
 * Neither deletes a file of the user's, and no route here takes a list — a diagnosis is read,
 * and a cleanup is one named command at a time. What sends a candidate to the trash is the
 * ordinary `projectTrashFiles`, which already names the documents that would notice (E-21).
 */
export function registerCopiesHandlers({ project }: CopiesHandlerDeps): void {
  const derived = createDerivedCache({
    projectPath: () => project.path(),
    clearDerivedPaths: () => project.catalog().clearDerivedPaths(),
    concurrency: spareCores,
  })

  // Empty rather than a failure when the project has gone: a window left open on a project that
  // closed says « nothing is held twice », which is what an unreadable catalogue means here.
  handle(CHANNELS.projectFileCopies, (_event, hash) =>
    orWhenGone(() => project.catalog().copies(fingerprint.parse(hash)), []),
  )

  handle(CHANNELS.projectDerivedCache, () => orWhenGone(() => derived.measure(), NOTHING))
  handle(CHANNELS.projectPurgeDerivedCache, () => orWhenGone(() => derived.purge(), NOTHING))
}
