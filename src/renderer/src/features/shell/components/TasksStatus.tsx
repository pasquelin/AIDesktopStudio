import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ProgressRow } from '@/components/ProgressRow'
import { StatusFlyout } from '@/components/StatusFlyout'
import { StatusProgressFace } from '@/components/StatusProgressFace'
import { formatPercent } from '@/helpers/format'
import { useTasks } from '@/stores/tasks'

/**
 * The long work the studio has in hand — writing a file out, reading one in, rendering. Readable
 * from every section, and, unlike a generation, stoppable from there too.
 */
export function TasksStatus() {
  const { t, i18n } = useTranslation()
  const running = useTasks(state => state.running)

  // Derived here rather than in a selector: `Object.values` allocates, and a store selector that
  // hands back a new array every call re-renders on every snapshot React takes.
  const rows = useMemo(() => Object.values(running), [running])

  // Silent when there is nothing to say. Nothing outlives a run either: a failure has already
  // been reported by whoever asked for the work, and it shows in the activity list.
  if (rows.length === 0) return null

  const ratio = rows.reduce((sum, row) => sum + row.ratio, 0) / rows.length
  const label = t('tasks.running', { count: rows.length })

  return (
    <StatusFlyout
      label={t('tasks.open')}
      hint={t('tasks.openHint')}
      face={<StatusProgressFace label={label} ratio={ratio} />}
      panel={
        <ul className="max-h-80 w-80 overflow-auto">
          {rows.map(row => (
            <ProgressRow
              key={row.id}
              label={
                row.phase ? t(`tasks.phases.${row.phase}`, { defaultValue: row.label }) : row.label
              }
              ratio={row.ratio}
              status={formatPercent(row.ratio, i18n.language)}
              cancel={{
                label: t('tasks.cancel'),
                // Read at the press rather than subscribed to: an action never changes, and a
                // second subscription here is re-read on every snapshot React takes.
                onClick: () => useTasks.getState().cancelTask(row.id),
              }}
            />
          ))}
        </ul>
      }
    />
  )
}
