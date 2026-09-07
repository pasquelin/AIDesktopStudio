import { memo } from 'react'
import { WindowButton, type WindowButtonProps } from '@/components/WindowButton'
import { useTranslation } from 'react-i18next'
import type { ModelCandidate } from '@shared/domain/aiOverview'
import type { DownloadProgress } from '@shared/domain/localModel'
import { taskRatio } from '@shared/domain/taskProgress'
import { HINT_LEFT } from '@/helpers/tooltip'
import { useBytes } from '@/hooks/useBytes'
import { useAiModels } from '@/stores/aiModels'
import { AiFlightRow } from './AiFlightRow'

export type AiModelActionsProps = {
  candidate: ModelCandidate
  /** The download in flight, when it is this model's. */
  progress: DownloadProgress | null
  /** How far this model's load has got, from 0 to 1 — `null` when it is not the one loading. */
  loading: number | null
  /** Whether some install already holds the disk — a second would compete with it. */
  busy: boolean
  /** Smaller where a whole list wears them, one per line — the flight row follows, or it jumps. */
  size?: WindowButtonProps['size']
}

/**
 * What can be DONE to one model from this screen: fetch it or drop it. Holding it in memory is
 * the studio's, at generation time — offering it here drowned the choice in a second gesture.
 */
export const AiModelActions = memo(function AiModelActions({
  candidate,
  progress,
  loading,
  busy,
  size,
}: AiModelActionsProps) {
  const { t } = useTranslation()
  const bytes = useBytes()
  const installAiModel = useAiModels(state => state.installAiModel)
  const cancelAiInstall = useAiModels(state => state.cancelAiInstall)
  const removeAiModel = useAiModels(state => state.removeAiModel)
  const cancelAiLoad = useAiModels(state => state.cancelAiLoad)

  if (progress) {
    return (
      <AiFlightRow
        ratio={taskRatio(progress.received, progress.total)}
        label={t('aiModels.installing')}
        size={size}
        stop={t('aiModels.cancelInstall')}
        stopHint={t('aiModels.cancelInstallHint')}
        onStop={() => void cancelAiInstall()}
      />
    )
  }

  if (loading !== null) {
    return (
      <AiFlightRow
        ratio={loading}
        label={t('aiModels.loading')}
        size={size}
        stop={t('aiModels.cancelLoad')}
        stopHint={t('aiModels.cancelLoadHint')}
        onStop={() => void cancelAiLoad()}
      />
    )
  }

  if (!candidate.installed) {
    // Nothing to fetch — a listed card, not a download.
    if (candidate.model.files.length === 0) return null

    return (
      // Offered whatever the machine thinks of it: hiding the button decided for the person, and
      // a download that will not fit says so when it fails rather than never being offered.
      <WindowButton
        size={size}
        {...HINT_LEFT(t('aiModels.installHint', { size: bytes(candidate.model.diskBytes) }))}
        disabled={busy}
        onClick={() => void installAiModel(candidate.model.id)}
      >
        {t('aiModels.install')}
      </WindowButton>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <WindowButton
        size={size}
        // Dropping weights is not the same gesture as fetching them, and a list where both wore
        // the accent said they were (Alban).
        variant="danger"
        // The WORD follows the EFFECT, both off `supplied`: their file stays where they put it,
        // and the studio only ever drops the entry that pointed at it.
        {...HINT_LEFT(candidate.supplied ? t('aiModels.forgetHint') : t('aiModels.removeHint'))}
        onClick={() => void removeAiModel(candidate.model.id)}
      >
        {candidate.supplied ? t('aiModels.forget') : t('aiModels.remove')}
      </WindowButton>
    </span>
  )
})
