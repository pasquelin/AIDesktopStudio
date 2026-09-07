import { useTranslation } from 'react-i18next'
import { HINT_BOTTOM } from '@/helpers/tooltip'
import { WindowButton } from '@/components/WindowButton'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { WelcomeCopy } from './WelcomeCopy'

export function WelcomeSlideProject() {
  const { t } = useTranslation()
  const createPicked = useProject(state => state.createPicked)
  const openPicked = useProject(state => state.openPicked)
  // Only when there is one to open. On a first install the picker opens on an empty disk, and the
  // reader is offered a door with nothing behind it.
  const known = useSettings(state => state.settings.storage.recentProjects)

  return (
    <div>
      <WelcomeCopy title={t('welcome.project.title')} body={t('welcome.project.body')} />
      <div className="flex flex-wrap justify-center gap-2">
        <WindowButton
          variant="primary"
          onClick={() => void createPicked()}
          {...HINT_BOTTOM(t('welcome.project.createHint'))}
        >
          {t('home.tools.newProject')}
        </WindowButton>
        {known.length > 0 ? (
          <WindowButton
            variant="secondary"
            onClick={() => void openPicked()}
            {...HINT_BOTTOM(t('welcome.project.openHint'))}
          >
            {t('home.tools.openProject')}
          </WindowButton>
        ) : null}
      </div>
    </div>
  )
}
