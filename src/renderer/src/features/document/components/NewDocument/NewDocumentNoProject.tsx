import { mdiFolderOpenOutline, mdiFolderOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { projectName, projectsByCreation, type RecentProject } from '@shared/domain/project'
import { UiIcon } from '@/components/UiIcon'
import { WINDOW_CAPTION, WINDOW_GROUP_LABEL, WINDOW_ROW_BUTTON } from '@/components/windowStyles'
import { cn } from '@/helpers/cn'
import { HINT_TOP } from '@/helpers/tooltip'
import { WindowButton } from '@/components/WindowButton'

export type NewDocumentNoProjectProps = {
  recent: readonly RecentProject[]
  onNewProject: () => void
  onOpenProject: () => void
  onOpenRecent: (path: string) => void
  title?: string
  body?: string
}

/**
 * The pane with no project open: why nothing can be made yet, and the shelf that gets out of it
 * without closing this window.
 *
 * None of the three acts here — they are ANSWERED to the studio, which owns leaving a project.
 */
export function NewDocumentNoProject({
  recent,
  onNewProject,
  onOpenProject,
  onOpenRecent,
  title,
  body,
}: NewDocumentNoProjectProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-base font-semibold">{title ?? t('project.none')}</h2>
        <p className={cn(WINDOW_CAPTION, 'm-0')}>{body ?? t('documents.noProjectBody')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <WindowButton {...HINT_TOP(t('project.createHint'))} onClick={onNewProject}>
          {t('project.create')}
        </WindowButton>
        <WindowButton
          variant="secondary"
          {...HINT_TOP(t('project.openHint'))}
          onClick={onOpenProject}
        >
          <UiIcon path={mdiFolderOpenOutline} size={14} className="shrink-0" />
          {t('project.open')}
        </WindowButton>
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col">
          <span className={WINDOW_GROUP_LABEL}>{t('documents.recentProjects')}</span>
          {/* Ordered by creation, the same key the home's shelf and the title bar's menu read it
              by: one list must not be read in two orders. */}
          {projectsByCreation(recent).map(entry => (
            <button
              key={entry.path}
              type="button"
              className={cn(WINDOW_ROW_BUTTON, 'items-center px-2')}
              {...HINT_TOP(t('project.useHint'))}
              onClick={() => onOpenRecent(entry.path)}
            >
              <UiIcon path={mdiFolderOutline} size={14} className="shrink-0" />
              {projectName(entry.path)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
