import type { FileOutcome } from '@shared/domain/fileOp'
import type { FileUse } from '@shared/domain/fileUse'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import type { AskUser } from './documentDialogs'
import { askTrashFiles, askTrashUsedFiles } from './projectDialogs'
import { orWhenGone } from './store'
import { parseFolderPaths } from './validation'

export type FileUseHandlerDeps = {
  dependents: { usedBy: (paths: readonly string[]) => Promise<FileUse[]> }
  trash: (paths: readonly string[]) => Promise<FileOutcome>
  settled: (outcome: FileOutcome) => FileOutcome
  ask: AskUser
}

const NOTHING_MOVED: FileOutcome = { done: [], refused: [], batch: '' }

/**
 * The route that reads « what would this deletion break? » — §9.2, and the answer nothing could
 * give before (E-21): a texture a scene draws went to the trash without a word.
 *
 * The answer is not exposed on the bridge, and that is deliberate: no surface asks it yet, and a
 * route nothing calls is a route nothing keeps honest. It comes back the day a surface wants it.
 */
export function registerFileUseHandlers({
  dependents,
  trash,
  settled,
  ask,
}: FileUseHandlerDeps): void {
  handle(CHANNELS.projectTrashFiles, async (_event, paths) => {
    const wanted = parseFolderPaths(paths)
    const uses = await orWhenGone(() => dependents.usedBy(wanted), [])
    return (await agreedToTrash(ask, wanted.length, uses))
      ? settled(await trash(wanted))
      : NOTHING_MOVED
  })
}

/**
 * The one question, in the form the files themselves decide: what a document cites is named, and
 * a plain selection of several is counted. A single unused file goes without a question — it is
 * named on the row that was clicked and lands somewhere the system offers to put back.
 */
async function agreedToTrash(
  ask: AskUser,
  count: number,
  uses: readonly FileUse[],
): Promise<boolean> {
  if (uses.length > 0) return await askTrashUsedFiles(ask, uses)
  return count > 1 ? await askTrashFiles(ask, count) : true
}
