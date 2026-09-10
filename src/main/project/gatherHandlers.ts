import { z } from 'zod'
import { isDocumentKind, type DocumentKind } from '@shared/domain/document'
import type { GatherReport } from '@shared/domain/gather'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { hashOrNull } from '@main/media/runner'
import { openCatalogThread } from './catalogThread'
import { createDocumentDependencies, EVERY_FOLDER } from './documentDependencies'
import { gatherIntoProject } from './gatherIntoProject'
import type { ProjectHandlerDeps } from './handlerTypes'
import { orWhenGone } from './store'

export type GatherHandlerDeps = {
  project: ProjectHandlerDeps['project']
  documents: ProjectHandlerDeps['documents']
  exists: ProjectHandlerDeps['exists']
}

const NOTHING: GatherReport = { files: [], rows: 0, refused: 'no-document' }

/**
 * The destination as the shelf spells it — an absolute path the person picked from their own
 * projects, never typed. Bounded here; whether it IS a project is answered by reading its
 * manifest, which is the only answer worth having before anything is written.
 */
const request = z.object({
  documentId: z.string().min(1).max(256),
  kind: z.custom<DocumentKind>(isDocumentKind),
  destination: z.string().min(1).max(4096),
})

/** The one route of F: a document, and everything it cites, into a project that is not open. */
export function registerGatherHandlers(deps: GatherHandlerDeps): void {
  const dependencies = createDocumentDependencies({
    read: (id, kind) => deps.documents.read(id, kind),
    filedAssets: () => deps.project.catalog().assetsUnder(EVERY_FOLDER),
  })

  handle(CHANNELS.projectGatherInto, (_event, value) =>
    orWhenGone(
      () =>
        gatherIntoProject(
          {
            projectPath: () => deps.project.path(),
            citedBy: dependencies.citedBy,
            exists: deps.exists,
            hash: hashOrNull,
            openCatalog: openCatalogThread,
          },
          request.parse(value),
        ),
      NOTHING,
    ),
  )
}
