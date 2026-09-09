import { mdiInformationOutline } from '@mdi/js'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { EngineOffer, OwnModelProfile } from '@shared/domain/aiOverview'
import { useLatest } from '@/hooks/useLatest'
import { UiIcon } from '@/components/UiIcon'
import { WINDOW_HELP } from '@/components/windowStyles'
import { WindowButton } from '@/components/WindowButton'
import { HINT_LEFT } from '@/helpers/tooltip'
import { useAiModels } from '@/stores/aiModels'
import { AiFlightRow } from './AiFlightRow'

export type AiEngineOfferProps = {
  offer: EngineOffer
  /** Whether some other install already holds the disk. */
  busy: boolean
  profile?: OwnModelProfile
}

/**
 * The libraries the local engine generates with: what it lacks, and the button that installs it.
 *
 * Asked on mount rather than composed: the reading starts the engine's CORE, which imports no
 * tensor library, and doing it on every overview would fork Python for a screen nobody opened.
 */
export function AiEngineOffer({ offer, busy, profile }: AiEngineOfferProps) {
  const { t } = useTranslation()
  const readEngine = useAiModels(state => state.readEngine)
  const installEngine = useAiModels(state => state.installEngine)
  const cancelInstallEngine = useAiModels(state => state.cancelInstallEngine)

  const currentOffer = useLatest(offer)
  useEffect(() => {
    if (!currentOffer.current.known || currentOffer.current.profile !== profile)
      void readEngine(profile)
  }, [profile, readEngine, currentOffer])

  if (offer.profile !== profile)
    return (
      <WindowButton
        disabled={busy}
        onClick={() => void readEngine(profile)}
        {...HINT_LEFT(t('aiModels.readEngineHint'))}
      >
        {t('aiModels.readEngine')}
      </WindowButton>
    )

  if (offer.progress !== null) {
    return (
      <AiFlightRow
        ratio={offer.progress}
        label={t('aiModels.installingEngine')}
        stop={t('aiModels.cancelInstall')}
        stopHint={t('aiModels.cancelInstallEngineHint')}
        onStop={() => void cancelInstallEngine()}
      />
    )
  }

  if (!offer.known) return <p className={WINDOW_HELP}>{t('aiModels.engineHelpUnknown')}</p>
  // A complete door still generating on the processor keeps the button: the CUDA wheels replace
  // the ones already here, so nothing is MISSING and there is still everything to repair.
  const onProcessor = offer.cuda === 'repairable'
  if (offer.missing.length === 0 && !onProcessor)
    return <p className={WINDOW_HELP}>{t('aiModels.engineReady')}</p>

  return (
    <div className="flex flex-col items-start gap-2">
      <span className="alert alert-info alert-soft">
        <UiIcon path={mdiInformationOutline} />
        {offer.failed
          ? t('aiModels.engineHelpFailed')
          : offer.missing.length === 0
            ? t('aiModels.engineHelpCuda')
            : t('aiModels.engineHelpMissing', { names: offer.missing.join(', ') })}
      </span>
      <WindowButton
        disabled={busy}
        {...HINT_LEFT(t('aiModels.installEngineHint'))}
        onClick={() => void installEngine(profile)}
      >
        {t('aiModels.installEngine')}
      </WindowButton>
    </div>
  )
}
