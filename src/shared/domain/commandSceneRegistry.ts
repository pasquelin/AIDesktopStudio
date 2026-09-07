import type { CommandDescriptor } from './commandTypes'
import { command } from './commandTypes'

export const SCENE_COMMANDS: readonly CommandDescriptor[] = [
  command({
    id: 'scene.play',
    scope: 'scene',
    titleKey: 'commands.scenePlay.title',
    helpKey: 'commands.scenePlay.help',
    defaultBinding: 'Meta+Enter',
  }),
  // `Backquote` as in Blender's walk mode. It is the one key near the letters that no tool and
  // no direction claims, which matters here: this mode hands the letters to the camera.
  command({
    id: 'scene.navigate',
    scope: 'scene',
    titleKey: 'commands.sceneNavigate.title',
    helpKey: 'commands.sceneNavigate.help',
    defaultBinding: 'Backquote',
  }),
  // `KeyV` as in every editor that has a pointer tool. Not `KeyQ` or `KeyW`, which fly the
  // camera: `useShortcuts` reads both tables on the same keydown, so one key would do both.
  command({
    id: 'scene.select',
    scope: 'scene',
    titleKey: 'commands.sceneSelect.title',
    helpKey: 'commands.sceneSelect.help',
    defaultBinding: 'KeyV',
  }),
  command({
    id: 'scene.translate',
    scope: 'scene',
    titleKey: 'commands.sceneTranslate.title',
    helpKey: 'commands.sceneTranslate.help',
    defaultBinding: 'KeyG',
  }),
  command({
    id: 'scene.rotate',
    scope: 'scene',
    titleKey: 'commands.sceneRotate.title',
    helpKey: 'commands.sceneRotate.help',
    defaultBinding: 'KeyR',
  }),
  command({
    id: 'scene.scale',
    scope: 'scene',
    titleKey: 'commands.sceneScale.title',
    helpKey: 'commands.sceneScale.help',
    defaultBinding: 'KeyS',
  }),
  command({
    id: 'scene.frame',
    scope: 'scene',
    titleKey: 'commands.sceneFrame.title',
    helpKey: 'commands.sceneFrame.help',
    defaultBinding: 'KeyF',
  }),
  // The three that hide, and the one that gives everything back. `scene.isolate` toggles: the
  // hand that pressed it to get in is the hand that presses it to get out, which is what every
  // 3D package does with this key.
  /**
   * Unity's ⇧F. The studio had nothing of the sort: framing was a move, and what was framed then
   * walked out of the view — see `frameFollow`, which keeps the angle and the distance.
   */
  command({
    id: 'scene.frameFollow',
    scope: 'scene',
    titleKey: 'commands.sceneFrameFollow.title',
    helpKey: 'commands.sceneFrameFollow.help',
    defaultBinding: 'Shift+KeyF',
  }),
  command({
    id: 'scene.isolate',
    scope: 'scene',
    titleKey: 'commands.sceneIsolate.title',
    helpKey: 'commands.sceneIsolate.help',
    defaultBinding: 'Slash',
  }),
  command({
    id: 'scene.hide',
    scope: 'scene',
    titleKey: 'commands.sceneHide.title',
    helpKey: 'commands.sceneHide.help',
    defaultBinding: 'KeyH',
  }),
  command({
    id: 'scene.showAll',
    scope: 'scene',
    titleKey: 'commands.sceneShowAll.title',
    helpKey: 'commands.sceneShowAll.help',
    defaultBinding: 'Alt+KeyH',
  }),
  // `KeyM` and `KeyL` as in magnet and local. Neither flies the camera, which rules out most of
  // the left hand: `useShortcuts` reads both tables on the same keydown.
  command({
    id: 'scene.snap',
    scope: 'scene',
    titleKey: 'commands.sceneSnap.title',
    helpKey: 'commands.sceneSnap.help',
    defaultBinding: 'KeyM',
  }),
  command({
    id: 'scene.space',
    scope: 'scene',
    titleKey: 'commands.sceneSpace.title',
    helpKey: 'commands.sceneSpace.help',
    defaultBinding: 'KeyL',
  }),
  command({
    id: 'scene.projection',
    scope: 'scene',
    titleKey: 'commands.sceneProjection.title',
    helpKey: 'commands.sceneProjection.help',
    defaultBinding: 'KeyO',
  }),
  // `Q` as in Blender's own quad view, but shifted: bare `Q` is flight's "down", and the one
  // overlap this scope tolerates is already spent on `KeyS` — see `shortcut.test.ts`.
  // The six sides and the camera. No key of their own: they are the numbered views of the
  // keypad, which only the Blender scheme spells — every other one reaches them by a menu row.
  command({
    id: 'scene.viewFront',
    scope: 'scene',
    titleKey: 'commands.sceneViewFront.title',
    helpKey: 'commands.sceneViewFront.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.viewBack',
    scope: 'scene',
    titleKey: 'commands.sceneViewBack.title',
    helpKey: 'commands.sceneViewBack.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.viewRight',
    scope: 'scene',
    titleKey: 'commands.sceneViewRight.title',
    helpKey: 'commands.sceneViewRight.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.viewLeft',
    scope: 'scene',
    titleKey: 'commands.sceneViewLeft.title',
    helpKey: 'commands.sceneViewLeft.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.viewTop',
    scope: 'scene',
    titleKey: 'commands.sceneViewTop.title',
    helpKey: 'commands.sceneViewTop.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.viewBottom',
    scope: 'scene',
    titleKey: 'commands.sceneViewBottom.title',
    helpKey: 'commands.sceneViewBottom.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.viewCamera',
    scope: 'scene',
    titleKey: 'commands.sceneViewCamera.title',
    helpKey: 'commands.sceneViewCamera.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.quad',
    scope: 'scene',
    titleKey: 'commands.sceneQuad.title',
    helpKey: 'commands.sceneQuad.help',
    defaultBinding: 'Shift+KeyQ',
  }),
  // `Shift+W` for wires: bare `W` is flight's "forward", and this reads the same edges the
  // wireframe draws, so it sits beside it rather than beside the layout.
  command({
    id: 'scene.quadEdges',
    scope: 'scene',
    titleKey: 'commands.sceneQuadEdges.title',
    helpKey: 'commands.sceneQuadEdges.help',
    defaultBinding: 'Shift+KeyW',
  }),
  // `Z` as in Blender, where it is the key that changes what the viewport draws.
  command({
    id: 'scene.display',
    scope: 'scene',
    titleKey: 'commands.sceneDisplay.title',
    helpKey: 'commands.sceneDisplay.help',
    defaultBinding: 'KeyZ',
  }),
  // No key of its own: the menu rows carry the definitions, and this is the one a remapping
  // offers — at the view's own size, which is what a still of what one is looking at is.
  command({
    id: 'scene.capture',
    scope: 'scene',
    titleKey: 'commands.sceneCapture.title',
    helpKey: 'commands.sceneCapture.help',
    defaultBinding: null,
  }),
  // `KeyB` as in bones. Nothing in the scene scope claims it, and the fly keys are all on the
  // left hand — see the note above `scene.snap`.
  command({
    id: 'scene.skeletons',
    scope: 'scene',
    titleKey: 'commands.sceneSkeletons.title',
    helpKey: 'commands.sceneSkeletons.help',
    defaultBinding: 'KeyB',
  }),
  // `KeyP` as in pose, and next to `KeyB` for bones — the two go together at the hand.
  command({
    id: 'scene.poseMode',
    scope: 'scene',
    titleKey: 'commands.scenePoseMode.title',
    helpKey: 'commands.scenePoseMode.help',
    defaultBinding: 'KeyP',
  }),
  // `⇧A` as in Blender, whose Add menu this is. It opens rows rather than doing anything, which
  // is why it carries no verb of its own.
  command({
    id: 'scene.add',
    scope: 'scene',
    titleKey: 'commands.sceneAdd.title',
    helpKey: 'commands.sceneAdd.help',
    defaultBinding: 'Shift+KeyA',
  }),
  /*
   * Who is ON the animation band. Bound to nothing: the band shows what somebody put there, and
   * a key pressed by accident over a scene of thousands would fill it with what nobody chose.
   */
  command({
    id: 'scene.addToSheet',
    scope: 'scene',
    titleKey: 'commands.sceneAddToSheet.title',
    helpKey: 'commands.sceneAddToSheet.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.removeFromSheet',
    scope: 'scene',
    titleKey: 'commands.sceneRemoveFromSheet.title',
    helpKey: 'commands.sceneRemoveFromSheet.help',
    defaultBinding: null,
  }),
  // `⌘G` as in every editor that groups: the key is taken by nothing else in this scope.
  // The verbs of a solid. No default key: nothing in a 3D package claims one for these, and
  // reserving a letter here would take it from a tool a hand reaches for far more often.
  // `N` as in négatif and in negate, `I` as in inverser and in invert — the two the hand reaches
  // for while modelling, and the only two letters this scope had left that say what they do.
  command({
    id: 'scene.negate',
    scope: 'scene',
    titleKey: 'commands.sceneNegate.title',
    helpKey: 'commands.sceneNegate.help',
    defaultBinding: 'KeyN',
  }),
  command({
    id: 'scene.carve',
    scope: 'scene',
    titleKey: 'commands.sceneCarve.title',
    helpKey: 'commands.sceneCarve.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.weld',
    scope: 'scene',
    titleKey: 'commands.sceneWeld.title',
    helpKey: 'commands.sceneWeld.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.intersect',
    scope: 'scene',
    titleKey: 'commands.sceneIntersect.title',
    helpKey: 'commands.sceneIntersect.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.separate',
    scope: 'scene',
    titleKey: 'commands.sceneSeparate.title',
    helpKey: 'commands.sceneSeparate.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.invertCarve',
    scope: 'scene',
    titleKey: 'commands.sceneInvertCarve.title',
    helpKey: 'commands.sceneInvertCarve.help',
    defaultBinding: 'KeyI',
  }),
  command({
    id: 'scene.group',
    scope: 'scene',
    titleKey: 'commands.sceneGroup.title',
    helpKey: 'commands.sceneGroup.help',
    defaultBinding: 'Meta+KeyG',
  }),
  // The four gestures every editor shares, on the keys every editor uses. `role: 'editMenu'`
  // carries the same three for text fields; a scene tab is not one, and `isTyping` keeps them
  // apart when it is.
  command({
    id: 'scene.duplicate',
    scope: 'scene',
    titleKey: 'commands.sceneDuplicate.title',
    helpKey: 'commands.sceneDuplicate.help',
    defaultBinding: 'Meta+KeyD',
  }),
  command({
    id: 'scene.optimizeSelection',
    scope: 'scene',
    raisesDialog: true,
    titleKey: 'commands.sceneOptimizeSelection.title',
    helpKey: 'commands.sceneOptimizeSelection.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.worldPerformance',
    scope: 'scene',
    raisesDialog: true,
    titleKey: 'commands.sceneWorldPerformance.title',
    helpKey: 'commands.sceneWorldPerformance.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.exportGame',
    scope: 'scene',
    raisesDialog: true,
    titleKey: 'commands.sceneExportGame.title',
    helpKey: 'commands.sceneExportGame.help',
    defaultBinding: null,
  }),
  command({
    id: 'scene.copy',
    scope: 'scene',
    titleKey: 'commands.sceneCopy.title',
    helpKey: 'commands.sceneCopy.help',
    defaultBinding: 'Meta+KeyC',
  }),
  command({
    id: 'scene.cut',
    scope: 'scene',
    titleKey: 'commands.sceneCut.title',
    helpKey: 'commands.sceneCut.help',
    defaultBinding: 'Meta+KeyX',
  }),
  command({
    id: 'scene.paste',
    scope: 'scene',
    titleKey: 'commands.scenePaste.title',
    helpKey: 'commands.scenePaste.help',
    defaultBinding: 'Meta+KeyV',
  }),
  command({
    id: 'scene.delete',
    scope: 'scene',
    titleKey: 'commands.sceneDelete.title',
    helpKey: 'commands.sceneDelete.help',
    defaultBinding: 'Delete',
  }),
  command({
    id: 'scene.undo',
    scope: 'scene',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'scene.redo',
    scope: 'scene',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),
]
