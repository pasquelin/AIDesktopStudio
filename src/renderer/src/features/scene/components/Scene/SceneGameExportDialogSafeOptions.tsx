import { mdiCheck } from '@mdi/js'
import { SAFE_EXPORT_STEPS } from '@shared/domain/gameExport'
import { PropertyLine } from '@/components/PropertyLine'
import { UiIcon } from '@/components/UiIcon'
import type { ExportDialogState } from '@/hooks/useExportDialogState'

export function SceneGameExportDialogSafeOptions({ state }: { state: ExportDialogState }) {
  const { t } = state
  return (
    <>
      <h4 className="font-semibold">{t('game.export.safeTitle')}</h4>
      {SAFE_EXPORT_STEPS.map(step => (
        <PropertyLine key={step} label={t(`game.export.${step}`)} root="div" actions={false}>
          <UiIcon path={mdiCheck} className="mr-auto shrink-0" />
        </PropertyLine>
      ))}
    </>
  )
}
