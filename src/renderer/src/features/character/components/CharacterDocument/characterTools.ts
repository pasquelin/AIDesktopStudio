import { mdiBone, mdiBoneOff, mdiHumanHandsup } from '@mdi/js'
import type { DisplayMode } from '@shared/domain/scene'
import type { ToolbarItem } from '@/components/Toolbar/tools'
import {
  NAVIGATE_TOOL,
  SCENE_TOOLS,
  type SceneTool,
} from '@/features/scene/components/Scene/sceneTools'
import { displayOfPane } from '@/stores/sceneViewChrome'
import { MAIN_SCENE_PANE } from '@/stores/sceneViews'

/**
 * The scene's own tools this workshop offers, by id — the bar reads `SCENE_TOOLS`, so a rename
 * there follows here. No SCALE: a joint is a point and a length, and there is nothing about one
 * to enlarge. No selection verbs either — the workshop holds one node nobody adds to or deletes.
 */
const WORKSHOP_TOOL_IDS: readonly string[] = [
  'select',
  NAVIGATE_TOOL,
  'translate',
  'rotate',
  'display',
  'frame',
]

/** Lit from the first frame: this tab is ABOUT the bones, where a scene draws them on demand. */
const SKELETONS_TOOL: SceneTool = {
  id: 'skeletons',
  command: 'scene.skeletons',
  labelKey: 'character.showBones',
  descriptionKey: 'character.showBonesHint',
  icon: mdiBoneOff,
}

export const WORKSHOP_TOOLS: readonly SceneTool[] = [
  ...SCENE_TOOLS.filter(tool => WORKSHOP_TOOL_IDS.includes(tool.id)).map(tool =>
    // Nothing stands above `select` here: the divider under the add tools has nothing to divide.
    tool.id === 'select' ? { ...tool, separatorBefore: false } : tool,
  ),
  SKELETONS_TOOL,
]

/**
 * The STATE the window is in, and the two are exclusive: one places a skeleton on a model, the
 * other plays with the model. Drawn like the verbs above — exactly one lit — because two toggles
 * lit side by side read as two modes at once, which is what a hand saw and what it is not.
 *
 * 🛑 No padlock on the lengths any more. It was a dressing on a wound now closed: posing turns
 * the bone arriving at a joint, so no length can change there, and editing a skeleton is where
 * one shortens a bone that came out too long — holding it forbade the state's only gesture.
 */
const CHARACTER_POSE = 'poseCharacter'
export const CHARACTER_EDIT_REST = 'editSkeleton'

export const CHARACTER_STATE_TOOLS: readonly ToolbarItem[] = [
  {
    id: CHARACTER_POSE,
    labelKey: 'character.manipulate',
    descriptionKey: 'character.manipulateHint',
    icon: mdiHumanHandsup,
    separatorBefore: true,
  },
  {
    id: CHARACTER_EDIT_REST,
    labelKey: 'character.editRest',
    descriptionKey: 'character.editRestHint',
    icon: mdiBone,
  },
]

/** What the bar draws: the scene's tools wearing this view's state, then the two states. */
export function workshopBar(
  view: { displays: readonly DisplayMode[]; skeletons: boolean },
  editingRest: boolean,
): ToolbarItem[] {
  return [
    ...WORKSHOP_TOOLS.map(tool => ({
      ...tool,
      pressed: tool.id === SKELETONS_TOOL.id ? view.skeletons : undefined,
      activeMode: tool.id === 'display' ? displayOfPane(view.displays, MAIN_SCENE_PANE) : undefined,
    })),
    // Exactly one lit, like the verbs above: the two states are exclusive.
    ...CHARACTER_STATE_TOOLS.map(tool => ({
      ...tool,
      pressed: (tool.id === CHARACTER_EDIT_REST) === editingRest,
    })),
  ]
}
