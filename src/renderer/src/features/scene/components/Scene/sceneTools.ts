import type { CommandId } from '@shared/domain/command'
import {
  mdiArrowAll,
  mdiArrowDown,
  mdiArrowDownBold,
  mdiArrowLeft,
  mdiArrowRight,
  mdiArrowUp,
  mdiArrowUpBold,
  mdiAxisArrow,
  mdiAxisArrowLock,
  mdiBone,
  mdiCircleHalfFull,
  mdiCircleOpacity,
  mdiContentCopy,
  mdiCropFree,
  mdiCubeOutline,
  mdiCubeUnfolded,
  mdiCursorDefaultOutline,
  mdiEyeCheckOutline,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiFolderPlusOutline,
  mdiGrid,
  mdiHexagonOutline,
  mdiLightbulbOn70,
  mdiMagnet,
  mdiResize,
  mdiSelectionEllipseRemove,
  mdiSphere,
  mdiSquareOpacity,
  mdiThermometer,
  mdiTrashCanOutline,
  mdiVideo3d,
  mdiVectorDifference,
  mdiVectorDifferenceAb,
  mdiVectorIntersection,
  mdiVectorSquare,
  mdiVectorUnion,
} from '@mdi/js'
import type { ToolbarItem, ToolMode } from '@/components/Toolbar/tools'
import { ADD_FAMILIES, labelKeyOf } from '@/engines/scene/nodeKinds'
import { DISPLAY_MODES, type DisplayMode, type ViewDirection } from '@shared/domain/scene'

/** Arrows read as the direction the camera looks from, which is what the row promises. */
const VIEW_ICONS: Record<ViewDirection, string> = {
  front: mdiArrowDown,
  back: mdiArrowUp,
  left: mdiArrowRight,
  right: mdiArrowLeft,
  top: mdiArrowDownBold,
  bottom: mdiArrowUpBold,
}

/** What a view of the quad layout wears in its own menu. The free one is the studio's cube. */
export const PANE_VIEW_ICONS: Record<'free' | ViewDirection, string> = {
  free: mdiCubeOutline,
  ...VIEW_ICONS,
}

const DISPLAY_ICONS: Record<DisplayMode, string> = {
  shaded: mdiHexagonOutline,
  wireframe: mdiVectorSquare,
  both: mdiCubeUnfolded,
  solid: mdiCircleOpacity,
  material: mdiSphere,
  studio: mdiLightbulbOn70,
  matcap: mdiCircleHalfFull,
  density: mdiThermometer,
  ghost: mdiSquareOpacity,
  skeleton: mdiBone,
}

/** Named, because the space reads it back to draw the bar: a rename must not silently unlight it. */
export const NAVIGATE_TOOL = 'navigate'

/** Every tool of this bar carries one now: the two groups that acted through rows have left. */
export type SceneTool = ToolbarItem & { command: CommandId }

/** One row per way of drawing, as the bar's flyout and the workshop's menu both list them. */
export const DISPLAY_TOOL_MODES: readonly ToolMode[] = DISPLAY_MODES.map(mode => ({
  id: mode,
  labelKey: `sceneDisplay.${mode}`,
  descriptionKey: `sceneDisplay.${mode}Hint`,
  icon: DISPLAY_ICONS[mode],
}))

/**
 * What a scene GAINS, one button per family. Three rather than one because a flyout is a FLAT
 * list: a single button would hold twenty-four rows of three different natures.
 *
 * `descriptionKey` is narrowed to required: the right-click menu reads these same rows and every
 * one of ITS rows has to explain itself — see `openSceneAddMenu`.
 */
export const ADD_TOOLS: readonly (ToolbarItem & { descriptionKey: string })[] = ADD_FAMILIES.map(
  family => ({
    id: `add:${family.namespace}`,
    labelKey: `${family.namespace}.add`,
    descriptionKey: `${family.namespace}.addHint`,
    icon: family.icon,
    modes: family.entries.map(entry => ({
      id: entry.kind,
      labelKey: labelKeyOf(family.namespace, entry),
      descriptionKey: `${labelKeyOf(family.namespace, entry)}Hint`,
      icon: entry.icon,
      disabled: entry.disabled,
    })),
  }),
)

/**
 * The kind a row of those menus adds, or `null` for a row of any other group. The dispatch on
 * the TOOL is what carries the meaning: a display mode reaching `addNodeTo` is only impossible
 * as long as no `DisplayMode` ever shares a name with a kind, which nothing guarantees.
 */
export function addedKind(toolId: string, modeId: string): string | null {
  const tool = ADD_TOOLS.find(candidate => candidate.id === toolId)
  return tool?.modes?.some(mode => mode.id === modeId) ? modeId : null
}

/**
 * The bar's registry. The bar itself is `design/Toolbar` — nothing is drawn here.
 *
 * What a hand reaches for WHILE manipulating; the settings stay in the native menu. The three
 * transform modes are three buttons and not one flyout: one switches between them by the minute.
 */
export const SCENE_TOOLS: readonly SceneTool[] = [
  {
    id: 'select',
    command: 'scene.select',
    labelKey: 'sceneTools.select',
    descriptionKey: 'sceneTools.selectHint',
    icon: mdiCursorDefaultOutline,
    // What a scene GAINS stands above, and this is the rule under it — see `ADD_TOOLS`.
    separatorBefore: true,
  },
  // Under `select` rather than over it: the bar opens on the tool that grabs nothing, and moving
  // the camera is what one reaches for next — before any handle.
  {
    id: NAVIGATE_TOOL,
    command: 'scene.navigate',
    labelKey: 'sceneTools.navigate',
    descriptionKey: 'sceneTools.navigateHint',
    icon: mdiVideo3d,
  },
  {
    id: 'translate',
    command: 'scene.translate',
    labelKey: 'sceneTools.translate',
    descriptionKey: 'sceneTools.translateHint',
    icon: mdiArrowAll,
  },
  {
    id: 'rotate',
    command: 'scene.rotate',
    labelKey: 'sceneTools.rotate',
    descriptionKey: 'sceneTools.rotateHint',
    icon: mdiAxisArrow,
  },
  {
    id: 'scale',
    command: 'scene.scale',
    labelKey: 'sceneTools.scale',
    descriptionKey: 'sceneTools.scaleHint',
    icon: mdiResize,
  },
  // Toggles, not armed tools: neither replaces the transform mode, both qualify it.
  {
    id: 'snap',
    command: 'scene.snap',
    labelKey: 'sceneTools.snap',
    descriptionKey: 'sceneTools.snapHint',
    icon: mdiMagnet,
    separatorBefore: true,
  },
  {
    id: 'space',
    command: 'scene.space',
    labelKey: 'sceneTools.space',
    descriptionKey: 'sceneTools.spaceHint',
    icon: mdiAxisArrowLock,
  },
  // The three verbs of a selection, which every modeller reaches for by the minute — Blender,
  // Maya and Unity all draw them. They were left to the Édition menu alone.
  {
    id: 'duplicate',
    command: 'scene.duplicate',
    labelKey: 'commands.sceneDuplicate.title',
    descriptionKey: 'sceneTools.duplicateHint',
    icon: mdiContentCopy,
    separatorBefore: true,
    acts: true,
  },
  {
    id: 'group',
    command: 'scene.group',
    labelKey: 'commands.sceneGroup.title',
    descriptionKey: 'sceneTools.groupHint',
    icon: mdiFolderPlusOutline,
    acts: true,
  },
  {
    id: 'delete',
    command: 'scene.delete',
    labelKey: 'commands.sceneDelete.title',
    descriptionKey: 'sceneTools.deleteHint',
    icon: mdiTrashCanOutline,
    acts: true,
  },
  // What a selection becomes. Their own group, under the three verbs that act on it: these do
  // not edit what is selected, they REPLACE it with one solid — and the fourth undoes that.
  //
  // The mark comes first because it is what the three read: a shape carrying it is a TOOL
  // whatever button follows, so it is pressed before them and never after.
  {
    // A toggle, not an action: the same press takes the mark off, so it wears `aria-pressed`
    // rather than `acts` — the shape `scene.isolate` already has for the same reason.
    id: 'negate',
    command: 'scene.negate',
    labelKey: 'commands.sceneNegate.title',
    descriptionKey: 'sceneTools.negateHint',
    icon: mdiSelectionEllipseRemove,
    separatorBefore: true,
  },
  {
    id: 'carve',
    command: 'scene.carve',
    labelKey: 'commands.sceneCarve.title',
    descriptionKey: 'sceneTools.carveHint',
    icon: mdiVectorDifferenceAb,
    acts: true,
  },
  {
    id: 'weld',
    command: 'scene.weld',
    labelKey: 'commands.sceneWeld.title',
    descriptionKey: 'sceneTools.weldHint',
    icon: mdiVectorUnion,
    acts: true,
  },
  {
    id: 'intersect',
    command: 'scene.intersect',
    labelKey: 'commands.sceneIntersect.title',
    descriptionKey: 'sceneTools.intersectHint',
    icon: mdiVectorIntersection,
    acts: true,
  },
  {
    id: 'separate',
    command: 'scene.separate',
    labelKey: 'commands.sceneSeparate.title',
    descriptionKey: 'sceneTools.separateHint',
    icon: mdiVectorDifference,
    acts: true,
  },
  // The one view setting worth a button: a modeller flips between shaded and wireframe several
  // times a minute, which is what tells it from the seven rows the native View menu now carries.
  {
    id: 'display',
    command: 'scene.display',
    labelKey: 'sceneTools.display',
    descriptionKey: 'sceneTools.displayHint',
    icon: mdiHexagonOutline,
    separatorBefore: true,
    modes: DISPLAY_TOOL_MODES,
  },
  // A round trip of PLACEMENT, not a setting of the session: one goes to four views to put an
  // object down and comes straight back out. The six directions stay in the menu — the axis
  // gizmo already reaches them with the pointer.
  {
    id: 'quad',
    command: 'scene.quad',
    labelKey: 'commands.sceneQuad.title',
    descriptionKey: 'sceneTools.quadHint',
    icon: mdiGrid,
  },
  {
    id: 'frame',
    command: 'scene.frame',
    labelKey: 'sceneTools.frame',
    descriptionKey: 'sceneTools.frameHint',
    icon: mdiCropFree,
    separatorBefore: true,
    acts: true,
  },
  // Beside framing, because the four are one gesture of WORKING ON one thing: get to it, keep it
  // alone, put the rest away. None of them touches the document — see `isolation.ts`.
  {
    id: 'isolate',
    command: 'scene.isolate',
    labelKey: 'commands.sceneIsolate.title',
    descriptionKey: 'sceneTools.isolateHint',
    icon: mdiEyeCheckOutline,
  },
  {
    id: 'hide',
    command: 'scene.hide',
    labelKey: 'commands.sceneHide.title',
    descriptionKey: 'sceneTools.hideHint',
    icon: mdiEyeOffOutline,
    acts: true,
  },
  {
    id: 'showAll',
    command: 'scene.showAll',
    labelKey: 'commands.sceneShowAll.title',
    descriptionKey: 'sceneTools.showAllHint',
    icon: mdiEyeOutline,
    acts: true,
  },
]
