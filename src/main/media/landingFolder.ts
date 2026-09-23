import type { FolderRole } from '@shared/domain/folderRole'
import { resourceFolderOf } from '@shared/domain/project'

/**
 * Where a role's arrivals land — and the ONE difference an internal import makes.
 *
 * A file placed INTO a document is a durable internal resource, not a file of the project's tree
 * (§7): nothing new appears in the explorer for a picture that became a layer. It is a FLAG that
 * says so and never a folder a window names — a path reaching the main process from there would
 * write wherever its first `../` pointed.
 */
export function landingFolderFor(
  project: { folderFor: (role: FolderRole) => Promise<string> },
  role: FolderRole,
  internal: true | undefined,
): Promise<string> {
  return internal ? Promise.resolve(resourceFolderOf(role)) : project.folderFor(role)
}
