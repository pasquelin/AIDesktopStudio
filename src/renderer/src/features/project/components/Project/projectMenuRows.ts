import { localizedError } from '@shared/localizedError'
import { mdiFolderOpenOutline, mdiPlaylistRemove, mdiRenameOutline } from '@mdi/js'
import type { TFunction } from 'i18next'
import type { MenuRowSpec } from '@/components/menuRows'
import { HINT_RIGHT } from '@/helpers/tooltip'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useProject } from '@/stores/project'

/** The menu is gone by the time an answer comes, so a failure travels to the journal. */
async function revealFolder(path: string): Promise<void> {
  try {
    const shown = await getBridge()?.project.revealFolder(path)
    if (shown === false) reportFailure('project.reveal', path, localizedError('folderMissing'))
  } catch (error) {
    reportFailure('project.reveal', path, error)
  }
}

async function forgetProject(path: string): Promise<void> {
  try {
    await useProject.getState().forget(path)
  } catch (error) {
    reportFailure('project.forget', path, error)
  }
}

/**
 * What can be done to a recent project without opening it, as rows.
 *
 * Three, and **none of them deletes anything**: one shows the folder in the system's file manager,
 * one RENAMES it — a project is named by its folder — and one drops it from the shelf. Reopening
 * the project puts a forgotten row back, which is what makes the last row safe with no
 * confirmation behind it.
 *
 * `onRename` is optional so the menu can be offered where no field can open; the rename is the one
 * row that reports nothing here, since what its field commits is answered where the row owns it.
 */
export function projectMenuRows(t: TFunction, path: string, onRename?: () => void): MenuRowSpec[] {
  return [
    {
      key: 'reveal',
      label: t('home.projects.reveal'),
      icon: mdiFolderOpenOutline,
      tip: HINT_RIGHT(t('home.projects.revealHint')),
      onSelect: close => {
        void revealFolder(path)
        close()
      },
    },
    {
      key: 'rename',
      label: t('home.projects.rename'),
      icon: mdiRenameOutline,
      // Absent rather than dead when no field can open, as the rail drops the generator it cannot
      // offer: a row that explains nothing and does nothing is the worst outcome.
      disabled: onRename === undefined,
      tip: HINT_RIGHT(t('home.projects.renameHint')),
      onSelect: close => {
        close()
        onRename?.()
      },
    },
    {
      key: 'forget',
      label: t('home.projects.forget'),
      icon: mdiPlaylistRemove,
      tip: HINT_RIGHT(t('home.projects.forgetHint')),
      onSelect: close => {
        void forgetProject(path)
        close()
      },
    },
  ]
}
