import { memo, Suspense } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { ToolId } from '@shared/domain/tool'
import { toolDefinition } from '../toolComponents'

/**
 * What a panel publishes on its own title row.
 *
 * Its own boundary, and an empty one: actions that throw must not take the close button with
 * them, and a failure notice does not fit on a header row.
 *
 * 🛑 Memoised, like `ShellPanelBody` and for the same path: the chassis rebuilds its content map
 * on every render of the shell, and each of those re-ran every open panel's action bar.
 */
export const ShellPanelActions = memo(function ShellPanelActions({ tool }: { tool: ToolId }) {
  const { Actions } = toolDefinition(tool)
  if (Actions === undefined) return null

  return (
    <ErrorBoundary key={tool} fallback={() => null}>
      {/* A chunk that never arrives is a failure like any other — React rejects rather than
          suspending forever, and the boundary above catches it either way round. */}
      <Suspense fallback={null}>
        <Actions />
      </Suspense>
    </ErrorBoundary>
  )
})
