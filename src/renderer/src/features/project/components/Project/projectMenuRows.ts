import { localizedError } from '@shared/localizedError'
import { projectName } from '@shared/domain/project'
import {
  mdiFolderOpenOutline,
  mdiPlaylistRemove,
  mdiRenameOutline,
  mdiTrashCanOutline,
} from '@mdi/js'
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
 * The folder itself, and only once the person has said so in their own system's words.
 *
 * Named for the ORDER rather than the deed: `fileHandlers.ts` already holds a `trashProject`, the
 * assistant's own route, which asks nothing here — its question is the confirmation card's.
 *
 * 🛑 The question comes through `confirmTrash` rather than from here: a native dialog belongs to
 * the main process, and the studio has no dialog of its own to draw one with. `trash` is asked
 * for afterwards, never before — a refused question must leave the folder where it is.
 */
async function askThenTrash(path: string, name: string): Promise<void> {
  try {
    if ((await getBridge()?.project.confirmTrash(name)) !== true) return

    const binned = await useProject.getState().trash(path)
    // A folder the disk no longer holds, one that holds no project, a leaving the person kept:
    // three endings that are not a throw, and a row that swallowed them did nothing in silence.
    if (!binned.ok) reportFailure('project.trash', path, localizedError('folderMissing'))
  } catch (error) {
    reportFailure('project.trash', path, error)
  }
}

/**
 * What can be done to a recent project without opening it, as rows.
 *
 * Three of the four touch nothing on the disk: one shows the folder in the system's file manager,
 * one RENAMES it — a project is named by its folder — and one drops it from the shelf. Reopening
 * the project puts a forgotten row back, which is what makes that row safe with no confirmation
 * behind it.
 *
 * **The fourth reaches the folder**, and it is the only one that does. It asks first, in the
 * system's own dialog, and what it does then is the system's trash rather than an erasing — the
 * two halves of the same promise, since nothing in the studio can put a folder back.
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
    {
      key: 'trash',
      label: t('home.projects.trash'),
      icon: mdiTrashCanOutline,
      tip: HINT_RIGHT(t('home.projects.trashHint')),
      // Closed BEFORE the question: the dialog is the system's and it is modal, so a menu left
      // standing under it hangs there for as long as nobody answers.
      onSelect: close => {
        close()
        void askThenTrash(path, projectName(path))
      },
    },
  ]
}
