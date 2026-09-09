import { mdiPlaylistPlus, mdiRhombus, mdiVideoPlusOutline } from '@mdi/js'
import type { ToolbarItem } from '@/components/Toolbar/tools'
import { addCameraShot, keySubject, putOnAnimationSheet } from '@/engines/scene/animationCommands'
import { newShotAt } from '@/engines/scene/cameraShots'
import { selectedNodes, type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { newId } from '@/helpers/ids'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { TIP_BOTTOM } from '@/helpers/tooltip'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'

/**
 * What the bar reads to draw itself. Narrow on purpose, as the material bar's is: the panel
 * subscribes to three slices, and handing it the whole scene would repaint it on every frame.
 */
export type AnimationToolsInput = Pick<SceneState, 'nodes' | 'selectedIds'> & {
  animation: Pick<SceneState['animation'], 'sheet' | 'tracks'>
}

/** The last thing selected, when it is a camera — the only anchor a shot can be opened for. */
function shotCameraOf(input: Pick<AnimationToolsInput, 'nodes' | 'selectedIds'>): SceneNode | null {
  const anchor = selectedNodes(input.nodes, input.selectedIds).at(-1) ?? null
  return anchor?.type === 'camera' ? anchor : null
}

/** Their host is a panel's title bar, not a floating bar: its gauge, and its tips hang below it. */
const onHeader = (tool: ToolbarItem): ToolbarItem => ({
  ...tool,
  variant: 'header',
  tip: TIP_BOTTOM,
})

/**
 * The animation bar's registry — the bar itself is `design/Toolbar`, and nothing is drawn here.
 *
 * All three ACT rather than arm, so none of them announces a pressed state.
 */
export function animationTools(input: AnimationToolsInput): ToolbarItem[] {
  // One `Set` for the whole selection: `includes` per id is quadratic, and a marquee over
  // thousands of objects is the very case the first of these buttons exists for.
  const onBand = new Set(input.animation.sheet)
  const camera = shotCameraOf(input)

  const tools: ToolbarItem[] = [
    {
      id: 'sheet',
      labelKey: 'animation.addToSheet',
      descriptionKey: 'animation.addToSheetHint',
      icon: mdiPlaylistPlus,
      acts: true,
      // `[].every()` is true, so an empty selection is already refused by the same test.
      disabled: input.selectedIds.every(id => onBand.has(id)),
    },
    {
      id: 'key',
      labelKey: 'animation.keyAll',
      descriptionKey: 'animation.keyAllHint',
      icon: mdiRhombus,
      acts: true,
      disabled: input.animation.tracks.length === 0,
    },
    {
      id: 'shot',
      labelKey: 'animation.addShot',
      descriptionKey: camera ? 'animation.addShotHint' : 'animation.addShotNeedsCamera',
      icon: mdiVideoPlusOutline,
      acts: true,
      disabled: camera === null,
    },
  ]

  return tools.map(onHeader)
}

/**
 * What a click does. Everything is READ from the stores here rather than subscribed to: none of
 * these three glyphs draws anything from the head, and subscribing repainted them every frame.
 */
export function runAnimationTool(documentId: string, id: string): void {
  const store = useScenes.getState()
  const scene = sceneOf(store, documentId)

  if (id === 'sheet') {
    const command = putOnAnimationSheet(scene, scene.selectedIds)
    if (command) store.runCommand(documentId, command)
    return
  }

  if (id === 'key') {
    const { state, at } = sceneKeyingAt(documentId)
    const command = keySubject(
      state,
      state.animation.tracks.map(track => track.id),
      at,
    )
    if (command) store.runCommand(documentId, command)
    return
  }

  const camera = shotCameraOf(scene)
  if (!camera) return

  const { playhead } = sceneViewOf(useSceneViews.getState(), documentId)
  store.runCommand(
    documentId,
    addCameraShot(newShotAt(scene.animation, camera.id, newId(), playhead)),
  )
}
