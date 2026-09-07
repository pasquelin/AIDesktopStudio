import { useTranslation } from 'react-i18next'
import { WindowButton } from '@/components/WindowButton'
import type { ModelSummary } from '@shared/domain/model'
import { useAiModels } from '@/stores/aiModels'
import { Dialog } from '@/features/shell/components/Dialog'
import { useBytes } from '@/hooks/useBytes'

/**
 * Asked before the weights are fetched, because the figures are the person's business: some of
 * these downloads are tens of gigabytes, and they come from the publisher rather than from us.
 */
export function ModelDownloadDialog({
  model,
  onClose,
}: {
  model: ModelSummary
  onClose: () => void
}) {
  const { t } = useTranslation()
  const bytes = useBytes()
  const installAiModel = useAiModels(state => state.installAiModel)

  return (
    <Dialog
      title={t('models.downloadThis')}
      actions={
        <>
          <WindowButton size="dialog" variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </WindowButton>
          <WindowButton
            size="dialog"
            onClick={() => {
              void installAiModel(model.id)
              onClose()
            }}
          >
            {t('models.download')}
          </WindowButton>
        </>
      }
    >
      {t('models.downloadThisHint', {
        // Data, not a word of the interface: a model is called what its publisher calls it.
        name: model.name,
        size: model.diskBytes === undefined ? '—' : bytes(model.diskBytes),
      })}
    </Dialog>
  )
}
