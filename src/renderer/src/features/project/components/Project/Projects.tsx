import { localizedError } from '@shared/localizedError'
import { mdiFolderOpenOutline } from '@mdi/js'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { projectName, projectsByCreation, type RecentProject } from '@shared/domain/project'
import { Collection } from '@/components/Collection/Collection'
import { EmptyState } from '@/components/EmptyState'
import { reportFailure } from '@/services/diagnostics'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { ProjectRow } from './ProjectRow'

/** A recent project needs an `id` to be listed; its folder is already one. */
type Card = RecentProject & { id: string }

/**
 * Ordered by CREATION, never by the stored most-recently-opened: that order moved the row out from
 * under the pointer that had just aimed at it. The double-click is deliberately not `Collection`'s
 * `onActivate` — Enter fires that slot, and would rename a row where every other list opens it.
 */
export function Projects() {
  const { t } = useTranslation()
  const recent = useSettings(state => state.settings.storage.recentProjects)
  const open = useProject(state => state.project?.path)
  const [renaming, setRenaming] = useState<string | null>(null)

  // Held, or every render of the home hands each row a project of a new identity and `ProjectRow`
  // is memoised against nothing.
  const items: Card[] = useMemo(
    () => projectsByCreation(recent).map(entry => ({ ...entry, id: entry.path })),
    [recent],
  )

  /**
   * The field is closed first, whatever comes back: `InlineRename` commits the ORIGINAL name when
   * the edit was abandoned, and a write fired for that would stamp the manifest for a gesture that
   * said no. The failure goes to the journal — the field is gone by the time an answer arrives.
   *
   * Both of these take the row they act on rather than closing over it, and are held for the
   * panel's lifetime: `renderRow` runs on every render of the collection, so a handler built there
   * hands each row a prop of a new identity and memoises `ProjectRow` against nothing — the very
   * trap the note above `items` was written for, entered by the other door.
   */
  const startRename = useCallback((path: string) => setRenaming(path), [])

  /**
   * A REFUSAL, not a rejection: the store answers WHY rather than throwing, so what is reported
   * here is the reason it gave — a rename that did nothing used to pass in silence.
   */
  const renameProject = async (project: RecentProject, name: string): Promise<void> => {
    const renamed = await useProject.getState().rename(project.path, name)
    if (renamed.ok) return

    reportFailure(
      'project.rename',
      project.path,
      renamed.why ? new Error(renamed.why) : localizedError('renameRefused'),
    )
  }

  const commitRename = useCallback((project: RecentProject, name: string): void => {
    setRenaming(null)
    if (name !== projectName(project.path)) void renameProject(project, name)
  }, [])

  return (
    <Collection
      label={t('panels.projects')}
      items={items}
      // Two steps of text on every line, which is what asks for the room — not the fill.
      rowHeight="filled"
      // The open project, which is at most one — an array because that is the shape a collection
      // takes, not because two could ever be in it. Here selecting IS opening: there is no state
      // beside it for a second colour to stand for.
      selectedIds={open === undefined ? [] : [open]}
      // A folder gone from the disk drops out on its own: the store forgets it wherever an
      // opening fails, not only where it was clicked.
      onOpen={project => void useProject.getState().open(project.path)}
      renderRow={project => (
        // The commit handler goes to the row being renamed and to no other: its presence is what
        // opens the field, which is how the explorer says the same thing.
        <ProjectRow
          project={project}
          onRenameStart={startRename}
          onRenameCommit={renaming === project.path ? commitRename : undefined}
        />
      )}
      // The one screen a first launch actually shows. It says what to do rather than that there
      // is nothing: a studio with no project yet is a studio about to have one.
      empty={
        <EmptyState
          icon={mdiFolderOpenOutline}
          message={t('home.projects.none')}
          action={{
            label: t('project.create'),
            hint: t('project.createHint'),
            onClick: () => void useProject.getState().createPicked(),
          }}
          secondary={{
            label: t('project.open'),
            hint: t('project.openHint'),
            onClick: () => void useProject.getState().openPicked(),
          }}
        />
      }
    />
  )
}
