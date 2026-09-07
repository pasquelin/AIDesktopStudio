import { TreeFoldButton } from '@/components/TreeFoldButton'
import { useTreeFolds } from '@/stores/treeFolds'

export function SceneActions() {
  const expanded = useTreeFolds(state => state.scene.anyExpanded)
  const ask = useTreeFolds(state => state.ask)

  return (
    <TreeFoldButton expanded={expanded} onFold={() => ask('scene')} onUnfold={() => ask('scene')} />
  )
}
