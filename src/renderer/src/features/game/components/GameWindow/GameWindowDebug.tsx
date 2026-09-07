import { mdiBugOutline } from '@mdi/js'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { faultsOf, type RuntimeReport } from '@shared/domain/gameRuntime'
import { VIEWPORT_READOUT } from '@/components/styles'
import { ToolButton } from '@/components/ToolButton'
import { cn } from '@/helpers/cn'
import { formatDecimal } from '@/helpers/format'
import { TIP_TOP } from '@/helpers/tooltip'

/**
 * What the game says about itself, behind a button. 🛑 A drawer and not a readout laid over the
 * picture: these figures sit exactly where a game draws its own interface.
 */
export function GameWindowDebug({ report }: { report: RuntimeReport }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)

  const faults = faultsOf(report)

  return (
    <div className="absolute bottom-2 left-2 flex flex-col items-start gap-2">
      {open && (
        <div className={cn(VIEWPORT_READOUT, 'static max-w-96 space-y-2 tabular-nums')}>
          <div>
            {t('game.play.objects', { count: report.entities })}
            {' · '}
            {t('game.play.readout', {
              fps: formatDecimal(report.fps, i18n.language, { digits: 0 }),
              tick: report.tick,
            })}
          </div>
          <div>
            {t('game.window.framePerformance', {
              cpu: formatDecimal(report.performance.cpuFrameMs, i18n.language, { digits: 2 }),
              render: formatDecimal(report.performance.renderMs, i18n.language, { digits: 2 }),
            })}
          </div>
          <div>
            {t('game.window.renderPerformance', {
              calls: report.performance.drawCalls,
              triangles: report.performance.triangles,
            })}
          </div>
          <div className={faults.length > 0 ? 'text-warning' : undefined}>
            {faults.length > 0
              ? t('game.play.faults', { count: faults.length })
              : t('game.window.noFaults')}
          </div>
          {/* The last one in full: a count alone sends a reader back to the studio to learn what
              broke, which is the trip this drawer exists to save. */}
          {faults.length > 0 && <div className="text-muted break-words">{faults.at(-1)}</div>}
        </div>
      )}

      <ToolButton
        icon={mdiBugOutline}
        label={t('game.window.debug')}
        description={t('game.window.debugHint')}
        tooltip={TIP_TOP}
        tone={faults.length > 0 ? 'warning' : undefined}
        active={open}
        onClick={() => setOpen(shown => !shown)}
      />
    </div>
  )
}
