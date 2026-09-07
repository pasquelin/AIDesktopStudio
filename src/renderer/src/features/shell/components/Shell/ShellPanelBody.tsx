import { memo, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { toolIcon } from '@/helpers/toolRegistry'
import type { ToolId } from '@shared/domain/tool'
import { toolDefinition } from '../toolComponents'

/**
 * A panel's own content, loaded on demand.
 *
 * Keyed by the tool: the rail swaps one for another on the same element, and a boundary left
 * standing would hand its failure to the tool that replaced it.
 *
 * 🛑 Memoised. The chassis rebuilds its panel content map on every render of the shell — a
 * document opened, a project named — and without this each of those redrew every panel on
 * screen. Measured at 4 of 4; the drag path was already safe.
 */
export const ShellPanelBody = memo(function ShellPanelBody({ tool }: { tool: ToolId }) {
  const { t } = useTranslation()
  const { Content } = toolDefinition(tool)

  return (
    <ErrorBoundary key={tool}>
      {/* Not `null`: a panel arrives through `import()`, and a dock left blank until the chunk
          lands reads as a bug — `EmptyState` says as much of itself. */}
      <Suspense fallback={<EmptyState icon={toolIcon(tool)} message={t('collection.loading')} />}>
        <Content />
      </Suspense>
    </ErrorBoundary>
  )
})
