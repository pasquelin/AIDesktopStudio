import { useMemo } from 'react'
import {
  allNegative,
  canCarve,
  canNegate,
  canSeparate,
  carvePlan,
  carveScene,
} from '@/engines/csg/carve'
import { selectedNodes } from '@/engines/scene/sceneState'
import { isolating } from '@/engines/scene/isolation'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { useBindingOverrides } from '@/stores/bindings'
import { useSceneClipboard } from '@/stores/sceneClipboard'
import type { sceneOf } from '@/stores/scenes'
import type { sceneViewChromeOf } from '@/stores/sceneViewChrome'

export type ToolbarFacts = {
  bindings: ReturnType<typeof useBindingOverrides>
  label: ReturnType<typeof useShortcutLabel>
  nothingHeld: boolean
  nothingSelected: boolean
  cannotCarve: boolean
  cannotNegate: boolean
  allMarked: boolean
  matterName?: string
  foldable: ReturnType<typeof selectedNodes>
  cannotSeparate: boolean
  isolated: boolean
  view: ReturnType<typeof sceneViewChromeOf>
}

export function useToolbarFacts(
  scene: ReturnType<typeof sceneOf>,
  view: ReturnType<typeof sceneViewChromeOf>,
): ToolbarFacts {
  const bindings = useBindingOverrides()
  const label = useShortcutLabel()
  const nothingHeld = useSceneClipboard(state => state.nodes.length === 0)
  const nothingSelected = scene.selectedIds.length === 0
  const foldable = useMemo(
    () => selectedNodes(scene.nodes, scene.selectedIds),
    [scene.nodes, scene.selectedIds],
  )
  const matterName = useMemo(
    () =>
      canCarve(foldable)
        ? carvePlan(carveScene(foldable, scene.nodes), 'subtract')?.matter.name
        : undefined,
    [foldable, scene.nodes],
  )
  return useMemo(
    () => ({
      bindings,
      label,
      nothingHeld,
      nothingSelected,
      cannotCarve: !canCarve(foldable),
      cannotNegate: !canNegate(foldable),
      allMarked: allNegative(foldable),
      matterName,
      foldable,
      cannotSeparate: !canSeparate(foldable),
      isolated: isolating(view.isolation),
      view,
    }),
    [bindings, label, nothingHeld, nothingSelected, foldable, matterName, view],
  )
}
