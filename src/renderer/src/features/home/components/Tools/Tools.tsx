import { mdiCogOutline, mdiFolderOpenOutline, mdiFolderPlusOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { workspaceLabelKey } from '@/helpers/workspaces'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { getBridge } from '@/services/bridge'
import { openNewDocument } from '@/features/shell/newDocument'
import { useProject } from '@/stores/project'
import { Section } from '../Section'
import { ToolsGroup, type Entry } from './ToolsGroup'

/**
 * What the studio can do, grouped by what one is about to do rather than by where the code
 * lives. It is the one band that works on a machine with no key, no project and no history,
 * which is why it is pinned.
 *
 * It spent a day as a panel in the home's upper left and came back: ten entries in two groups
 * read ACROSS in a grid, and a 320-pixel column stacked them into a ladder taller than the
 * screen. The width is the whole point of the band.
 */
export function Tools() {
  const { t } = useTranslation()

  const create: Entry[] = useWorkspaces().map(workspace => ({
    key: workspace.id,
    icon: workspace.icon,
    label: t(workspaceLabelKey(workspace.id)),
    help: t(`home.tools.${workspace.id}`),
    onClick: () => void openNewDocument(workspace.id),
  }))

  const manage: Entry[] = [
    {
      key: 'new-project',
      icon: mdiFolderPlusOutline,
      label: t('home.tools.newProject'),
      help: t('home.tools.newProjectHelp'),
      onClick: () => void useProject.getState().createPicked(),
    },
    {
      key: 'open-project',
      icon: mdiFolderOpenOutline,
      label: t('home.tools.openProject'),
      help: t('home.tools.openProjectHelp'),
      onClick: () => void useProject.getState().openPicked(),
    },
    {
      key: 'settings',
      icon: mdiCogOutline,
      label: t('home.tools.settings'),
      help: t('home.tools.settingsHelp'),
      onClick: () => void getBridge()?.settings.open('general'),
    },
  ]

  return (
    <Section id="tools" title={t('home.sections.tools')}>
      <div className="flex flex-col gap-3">
        <ToolsGroup title={t('home.tools.createGroup')} entries={create} />
        {/* Named for what it holds, not for the state the studio is in: these three entries are
            about projects whether one is open or not. */}
        <ToolsGroup title={t('home.tools.projectGroup')} entries={manage} />
      </div>
    </Section>
  )
}
