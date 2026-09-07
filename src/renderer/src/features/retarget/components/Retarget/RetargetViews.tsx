import { useRetargetNavigation } from '../../hooks/useRetargetNavigation'
import { RetargetSplit } from './RetargetSplit'
import { RetargetTransport } from './RetargetTransport'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'

export function RetargetViews(workspace: RetargetWorkspaceState) {
  const { source, target, clipIndex, preview, rootMotion } = workspace
  const navigation = useRetargetNavigation(source?.engine ?? null, target?.engine ?? null)
  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden">
      <RetargetSplit {...workspace} navigation={navigation} />
      <RetargetTransport
        source={source}
        target={target}
        clipIndex={clipIndex}
        result={preview.result}
        rootMotion={rootMotion}
      />
    </div>
  )
}
