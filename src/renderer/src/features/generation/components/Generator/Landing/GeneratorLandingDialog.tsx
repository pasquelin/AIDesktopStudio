import { useState } from 'react'
import { WindowButton } from '@/components/WindowButton'
import { useTranslation } from 'react-i18next'
import type { LandingTarget } from '@shared/domain/landingTarget'
import { Dialog } from '@/features/shell/components/Dialog'
import { fieldHandle } from '@/components/scHandle'

export type GeneratorLandingDialogProps = {
  /** Answered with where the result goes, and whether that answer becomes the rule. */
  onAnswer: (target: LandingTarget, remember: boolean) => void
  onCancel: () => void
}

/**
 * Asked once a document is open and the preference is still the question: a result can join what
 * is on screen or stand on its own, and only the person knows which.
 */
export function GeneratorLandingDialog({ onAnswer, onCancel }: GeneratorLandingDialogProps) {
  const { t } = useTranslation()
  const [remember, setRemember] = useState(false)

  return (
    <Dialog
      title={t('generation.landingTitle')}
      actions={
        <>
          <WindowButton size="dialog" variant="secondary" onClick={onCancel}>
            {t('actions.cancel')}
          </WindowButton>
          <WindowButton
            size="dialog"
            variant="secondary"
            onClick={() => onAnswer('newTab', remember)}
          >
            {t('settings.landing.newTab')}
          </WindowButton>
          <WindowButton size="dialog" onClick={() => onAnswer('document', remember)}>
            {t('settings.landing.document')}
          </WindowButton>
        </>
      }
    >
      <p>{t('generation.landingHint')}</p>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          data-sc={fieldHandle('generation.landingRemember')}
          checked={remember}
          onChange={event => setRemember(event.target.checked)}
        />
        {t('generation.landingRemember')}
      </label>
    </Dialog>
  )
}
