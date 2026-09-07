import { mdiAlertCircleOutline, mdiPlay, mdiStop } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { faultsOf } from '@shared/domain/gameRuntime'
import { ToolButton } from '@/components/ToolButton'
import { tipFor } from '@/helpers/tooltip'
import { openScriptAt } from '@/helpers/openScript'
import { playReportOf, startOrResumePlay, usePlay } from '@/stores/play'

/** Enough to read the cause and what it caused; the button's label carries the true count. */
const FAULTS_SHOWN = 6

export type SceneSnapPlayProps = { documentId: string }

/**
 * The transport that starts a game, on the viewport's own bar rather than in a box of its own —
 * 🛑 that box sat at the toolbars' own coordinates, covered whole, and no click reached Play.
 */
export function SceneSnapPlay({ documentId }: SceneSnapPlayProps) {
  const { t } = useTranslation()
  const report = usePlay(state => playReportOf(state, documentId))
  const faults = faultsOf(report)
  // The last one an editor can OPEN. A log line names no line, so it opens nothing.
  const addressable = report.errors.findLast(one => one.line > 0) ?? null

  return (
    <>
      <ToolButton
        icon={mdiPlay}
        tone="success"
        label={t('game.play.start')}
        description={t('game.play.startHint')}
        tooltip={tipFor('horizontal')}
        disabled={report.state === 'playing'}
        onClick={() => startOrResumePlay(documentId)}
      />

      <ToolButton
        icon={mdiStop}
        tone="danger"
        label={t('game.play.stop')}
        description={t('game.play.stopHint')}
        tooltip={tipFor('horizontal')}
        disabled={report.state === 'edit'}
        onClick={() => usePlay.getState().stop(documentId)}
      />

      {/* A system or a handler that threw is reported and the tick carries on, so without a sign
          here the game would simply appear to do nothing. Warning rather than danger: the red of
          this bar is Stop, and a second red beside it would read as a second way to end the game. */}
      {faults.length > 0 && (
        <ToolButton
          icon={mdiAlertCircleOutline}
          tone="warning"
          label={t('game.play.faults', { count: faults.length })}
          // 🛑 The FIRST ones, in order: showing only the last read out `script never loaded`
          // while the duplicate map id that CAUSED it, reported first, was never on screen — and
          // the log ring keeps two hundred, which a system throwing every step fills.
          description={faults.slice(0, FAULTS_SHOWN).join('\n')}
          tooltip={tipFor('horizontal')}
          disabled={!addressable}
          onClick={() => {
            if (!addressable) return
            // Paused first: a game still running scrolls its own errors past the reader.
            void usePlay.getState().pause(documentId)
            // Opens the script's own tab, which is what brings the Code space up with it: the
            // section follows the document in front — see `DocumentArea.followFront`.
            openScriptAt(addressable.script, addressable.line, addressable.column || 1)
          }}
        />
      )}
    </>
  )
}
