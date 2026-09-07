import type { RecentOpenRequest } from '@shared/ipc'
import { openProjectFile } from '@/helpers/openProjectFile'
import { useProject } from '@/stores/project'

/**
 * One row of File ▸ Open recent — a project, or a document inside one.
 *
 * The project FIRST and the document only if it opened: one project is open at a time, so a
 * document of another is a switch, and a no to its questions leaves both where they were.
 */
export async function openRecent({ project, path }: RecentOpenRequest): Promise<void> {
  const open = useProject.getState().project

  if (open?.path !== project && !(await useProject.getState().open(project))) return
  if (path === undefined) return

  await openProjectFile(path)
}
