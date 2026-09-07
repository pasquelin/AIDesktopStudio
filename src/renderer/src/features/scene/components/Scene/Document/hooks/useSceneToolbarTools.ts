import { useMemo } from 'react'
import { bindingOf, type CommandId } from '@shared/domain/command'
import { isSnapping } from '@shared/domain/snap'
import { canInvertCarve } from '@/engines/csg/carve'
import type { sceneOf } from '@/stores/scenes'
import { displayOfPane, type sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { ADD_TOOLS, SCENE_TOOLS } from '../../sceneTools'
import { useToolbarFacts, type ToolbarFacts } from './useToolbarFacts'

function deriveSceneToolbarTools(facts: ToolbarFacts) {
  const { view } = facts
  const pressed: Partial<Record<CommandId, boolean>> = {
    'scene.snap': isSnapping(view.snapping),
    'scene.space': view.localFrame,
    'scene.projection': view.projection === 'orthographic',
    'scene.skeletons': view.skeletons,
    'scene.poseMode': view.poseMode,
    'scene.quad': view.quad,
    'scene.quadEdges': view.quadEdges,
    'scene.isolate': facts.isolated,
    'scene.negate': facts.allMarked,
  }
  const unavailable: Partial<Record<CommandId, boolean>> = {
    'scene.delete': facts.nothingSelected,
    'scene.duplicate': facts.nothingSelected,
    'scene.group': facts.nothingSelected,
    'scene.copy': facts.nothingSelected,
    'scene.cut': facts.nothingSelected,
    'scene.paste': facts.nothingHeld,
    'scene.frame': facts.nothingSelected,
    'scene.frameFollow': facts.nothingSelected,
    'scene.isolate': facts.nothingSelected && !facts.isolated,
    'scene.hide': facts.nothingSelected,
    'scene.showAll': !facts.isolated,
    'scene.negate': facts.cannotNegate,
    'scene.carve': facts.cannotCarve,
    'scene.weld': facts.cannotCarve,
    'scene.intersect': facts.cannotCarve,
    'scene.separate': facts.cannotSeparate,
    'scene.invertCarve': !canInvertCarve(facts.foldable),
  }
  return sceneTools(facts, pressed, unavailable)
}

function sceneTools(
  facts: ToolbarFacts,
  pressed: Partial<Record<CommandId, boolean>>,
  unavailable: Partial<Record<CommandId, boolean>>,
) {
  return [
    ...ADD_TOOLS,
    ...SCENE_TOOLS.map(tool => ({
      ...tool,
      shortcut: facts.label(bindingOf(tool.command, facts.bindings)),
      activeMode: tool.id === 'display' ? displayOfPane(facts.view.displays, 0) : undefined,
      unavailable: unavailable[tool.command],
      pressed: pressed[tool.command],
      ...(tool.command === 'scene.carve' && facts.matterName
        ? {
            descriptionKey: 'sceneTools.carveOnHint',
            descriptionValues: { name: facts.matterName },
          }
        : {}),
      ...(tool.id === 'isolate' && facts.isolated
        ? { labelKey: 'sceneTools.leaveIsolation', descriptionKey: 'sceneTools.leaveIsolationHint' }
        : {}),
    })),
  ]
}

/** Derives the toolbar once from the small pieces of scene/view state its buttons display. */
export function useSceneToolbarTools(
  scene: ReturnType<typeof sceneOf>,
  view: ReturnType<typeof sceneViewChromeOf>,
) {
  const facts = useToolbarFacts(scene, view)
  return useMemo(() => deriveSceneToolbarTools(facts), [facts])
}
