import { mdiInformationOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { OllamaOffer } from '@shared/domain/aiOverview'
import { UiIcon } from '@/components/UiIcon'
import { WINDOW_HELP } from '@/components/windowStyles'
import { WindowButton } from '@/components/WindowButton'
import { HINT_LEFT } from '@/helpers/tooltip'
import { useAiModels } from '@/stores/aiModels'
import { AiFlightRow } from './AiFlightRow'

function needsInstall(offer: OllamaOffer): boolean {
  return !offer.installed && !offer.ready
}

function lineOf(
  offer: OllamaOffer,
  t: (key: string, options?: { count: number }) => string,
): string {
  if (offer.failed) return t('aiModels.ollamaHelpFailed')
  if (needsInstall(offer)) return t('aiModels.ollamaHelpMissing')
  if (!offer.ready) return t('aiModels.ollamaHelpDown')
  if (offer.names.length === 0) return t('aiModels.ollamaHelpEmpty')
  return t('aiModels.ollamaReady', { count: offer.names.length })
}

export type AiOllamaOfferProps = {
  offer: OllamaOffer
  /** Whether some other install already holds the disk. */
  busy: boolean
}

/** Ollama as a whole: missing, down, empty, or there — once per screen, never per employment. */
export function AiOllamaOffer({ offer, busy }: AiOllamaOfferProps) {
  const { t } = useTranslation()
  const installOllama = useAiModels(state => state.installOllama)
  const cancelInstallOllama = useAiModels(state => state.cancelInstallOllama)
  const line = lineOf(offer, t)

  if (offer.progress !== null) {
    return (
      <AiFlightRow
        ratio={offer.progress}
        label={t('aiModels.installingOllama')}
        stop={t('aiModels.cancelInstall')}
        stopHint={t('aiModels.cancelInstallHint')}
        onStop={() => void cancelInstallOllama()}
      />
    )
  }

  if (needsInstall(offer) || offer.failed) {
    return (
      <div className="flex flex-col items-start gap-2">
        <span className="alert alert-info alert-soft">
          <UiIcon path={mdiInformationOutline} />
          {line}
        </span>
        <WindowButton
          disabled={busy}
          {...HINT_LEFT(t('aiModels.installOllamaHint'))}
          onClick={() => void installOllama()}
        >
          {t('aiModels.installOllama')}
        </WindowButton>
      </div>
    )
  }

  return <p className={WINDOW_HELP}>{line}</p>
}
