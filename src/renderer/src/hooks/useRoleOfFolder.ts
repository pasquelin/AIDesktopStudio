import { useMemo } from 'react'
import { FOLDER_ROLES, type FolderRole } from '@shared/domain/folderRole'
import { useFolderRoles } from '@/stores/folderRoles'

/**
 * Which role a folder SERVES, read by its path — the reverse of the map the project publishes,
 * which is stored the other way round, one folder per role.
 *
 * Written once because two surfaces ink a folder by it: the explorer's tree, and the column
 * browser a document is saved through. For DRAWING only, like the store behind it — where a
 * document is written is `project.folderFor`, and nothing here decides that.
 */
export function useRoleOfFolder(): (path: string) => FolderRole | null {
  const roles = useFolderRoles(state => state.roles)
  const byFolder = useMemo(
    () =>
      new Map<string, FolderRole>(
        FOLDER_ROLES.flatMap<[string, FolderRole]>(role => {
          const folder = roles[role]
          return folder ? [[folder, role]] : []
        }),
      ),
    [roles],
  )

  return path => byFolder.get(path) ?? null
}
