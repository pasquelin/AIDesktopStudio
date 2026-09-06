import { useTranslation } from 'react-i18next'
import { Surface, PanelHeader } from '@pasquelin/panels'
import { InspectorActions } from '@/features/inspector/components/Inspector/InspectorActions'
import { WindowShell } from '@/components/WindowShell'
import { QuietNote } from '@/components/QuietNote'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useConnections } from '@/hooks/useConnections'
import { useJobs } from '@/stores/jobs'
import { useAiModels } from '@/stores/aiModels'
import { useAssets } from '@/stores/assets'
import { useSettings } from '@/stores/settings'
import { useAccounts } from '@/stores/accounts'
import { useProject } from '@/stores/project'
import { RetargetControls } from './RetargetControls'
import { useRetargetWorkspace } from '../../hooks/useRetargetWorkspace'
import '@pasquelin/panels/styles.css'
import { RetargetViews } from './RetargetViews'
export function RetargetWorkspace() {
  const { t } = useTranslation()
  useAppliedSettings()
  useConnections([
    useSettings.getState().connect,
    useAccounts.getState().connect,
    useAiModels.getState().connect,
    useJobs.getState().connect,
    useAssets.getState().connect,
    useProject.getState().connect,
  ])
  const workspace = useRetargetWorkspace()
  const { session } = workspace
  if (!session.snapshot || session.gone)
    return (
      <WindowShell title={t('character.retarget.title')}>
        <QuietNote standalone>
          {t(session.gone ? 'character.retarget.gone' : 'character.retarget.waiting')}
        </QuietNote>
      </WindowShell>
    )
  return (
    <WindowShell title={t('character.retarget.title')} content="panels">
      <div className="flex h-full min-h-0 gap-(--sc-gutter) p-(--sc-gutter)">
        <Surface className="min-w-0 flex-1">
          <RetargetViews {...workspace} />
        </Surface>
        <Surface aria-label={t('character.retarget.inspector')} className="w-96 shrink-0">
          <PanelHeader title={t('character.retarget.inspector')}>
            <InspectorActions />
          </PanelHeader>
          <RetargetControls {...workspace} />
        </Surface>
      </div>
    </WindowShell>
  )
}
