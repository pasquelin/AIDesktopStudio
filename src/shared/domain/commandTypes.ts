import type { DisplayMode, ViewDirection } from './scene'
import type { Signature } from './shortcut'

/**
 * Which surface a command belongs to. Two spaces legitimately want the same key — `Delete`
 * removes a node in the scene and a clip on the timeline — and only one of them is listening
 * at a time. Without a scope the second binding would be unreachable rather than contextual.
 *
 * `global` is the application itself: reachable from any window, and what the native menu
 * offers. Its bindings are the only ones that may clash with everything else, so they are the
 * only ones a conflict check treats as competing with every scope.
 */
export type CommandScope =
  | 'global'
  | 'spaces'
  /**
   * The project folder. Its own scope, and not `global`, for the reason the whole undo stack
   * lives in the main process: a file gesture belongs to no document, so ⌘Z in the canvas must
   * not reach it and ⌘Z here must not reach the canvas. `commandFor` filters by scope, and the
   * panel arms this one only while the focus is inside it.
   */
  | 'explorer'
  | 'scene'
  /**
   * The skeleton window. Its own scope and not `scene`'s, because it edits a FILE rather than a
   * document: ⌘Z there must not reach the scene a studio window is showing beside it.
   */
  | 'character'
  | 'sequence'
  | 'canvas'
  | 'skybox'
  | 'audio'
  | 'material'
  | 'gui'

export type CommandId =
  | 'app.new'
  | 'project.new'
  | 'project.open'
  | 'document.save'
  | 'document.saveAs'
  | 'document.saveCopy'
  | 'document.close'
  | 'layout.reset'
  | 'app.settings'
  | 'app.assistant'
  | 'app.dictate'
  | 'window.fullScreen'
  | 'spaces.moveLeft'
  | 'spaces.moveRight'
  | 'explorer.newFolder'
  | 'explorer.duplicate'
  | 'explorer.cut'
  | 'explorer.copy'
  | 'explorer.paste'
  | 'explorer.trash'
  | 'explorer.undo'
  | 'explorer.redo'
  | 'scene.navigate'
  | 'scene.select'
  | 'scene.translate'
  | 'scene.rotate'
  | 'scene.scale'
  | 'scene.play'
  | 'scene.frame'
  | 'scene.isolate'
  | 'scene.hide'
  | 'scene.showAll'
  | 'scene.add'
  | 'scene.addToSheet'
  | 'scene.removeFromSheet'
  | 'scene.negate'
  | 'scene.carve'
  | 'scene.weld'
  | 'scene.intersect'
  | 'scene.separate'
  | 'scene.invertCarve'
  | 'scene.group'
  | 'scene.duplicate'
  | 'scene.optimizeSelection'
  | 'scene.worldPerformance'
  | 'scene.exportGame'
  | 'scene.copy'
  | 'scene.cut'
  | 'scene.paste'
  | 'scene.snap'
  | 'scene.space'
  | 'scene.projection'
  | 'scene.viewFront'
  | 'scene.viewBack'
  | 'scene.viewRight'
  | 'scene.viewLeft'
  | 'scene.viewTop'
  | 'scene.viewBottom'
  | 'scene.viewCamera'
  | 'scene.frameFollow'
  | 'scene.quad'
  | 'scene.quadEdges'
  | 'scene.display'
  | 'scene.capture'
  | 'scene.skeletons'
  | 'scene.poseMode'
  | 'scene.delete'
  | 'scene.undo'
  | 'scene.redo'
  | 'sequence.playPause'
  | 'sequence.export'
  | 'sequence.exportCut'
  | 'sequence.exportBundle'
  | 'sequence.exportEdl'
  | 'sequence.exportFcpxml'
  | 'sequence.exportStems'
  | 'montage.import'
  | 'sequence.mirror'
  | 'sequence.split'
  | 'sequence.delete'
  | 'sequence.unlink'
  | 'sequence.zoomIn'
  | 'sequence.zoomOut'
  | 'sequence.fit'
  | 'sequence.start'
  | 'sequence.end'
  | 'sequence.undo'
  | 'sequence.redo'
  | 'canvas.zoomIn'
  | 'canvas.zoomOut'
  | 'canvas.zoomFit'
  | 'canvas.zoomActual'
  | 'canvas.rulers'
  | 'canvas.guides'
  | 'canvas.grid'
  | 'canvas.clearGuides'
  | 'canvas.selectAll'
  | 'canvas.deselect'
  | 'canvas.cropApply'
  | 'canvas.cropCancel'
  | 'canvas.maskFromSelection'
  | 'canvas.regenerate'
  | 'canvas.cutout'
  | 'canvas.enlarge'
  | 'canvas.vectorize'
  | 'canvas.extend'
  | 'canvas.export'
  | 'canvas.exportLayered'
  | 'canvas.mergeDown'
  | 'canvas.flatten'
  | 'canvas.flipHorizontal'
  | 'canvas.flipVertical'
  | 'canvas.rotateCw'
  | 'canvas.rotateCcw'
  | 'canvas.snap'
  | 'canvas.toolMove'
  | 'canvas.toolHand'
  | 'canvas.toolCrop'
  | 'canvas.toolSelectRectangle'
  | 'canvas.toolSelectEllipse'
  | 'canvas.toolSelectLasso'
  | 'canvas.toolSmartSelect'
  | 'canvas.toolShapeRectangle'
  | 'canvas.toolShapeLine'
  | 'canvas.toolShapeArrow'
  | 'canvas.toolShapeEllipse'
  | 'canvas.toolShapePolygon'
  | 'canvas.toolShapeStar'
  | 'canvas.toolBrush'
  | 'canvas.toolPencil'
  | 'canvas.toolText'
  | 'canvas.toolEraser'
  | 'canvas.toolFill'
  | 'canvas.toolPicker'
  | 'canvas.brushSmaller'
  | 'canvas.brushLarger'
  | 'canvas.undo'
  | 'canvas.redo'
  | 'skybox.view'
  | 'skybox.probes'
  | 'skybox.undo'
  | 'skybox.redo'
  | 'audio.undo'
  | 'audio.redo'
  | 'material.undo'
  | 'material.redo'
  | 'gui.undo'
  | 'gui.redo'
  | 'character.undo'
  | 'character.redo'

/**
 * A menu row that draws a state: a command that toggles, or one mode of a command that cycles.
 *
 * The renderer publishes the ones that are ON and the main process ticks exactly those. A string
 * rather than a structure because it crosses the bridge and is only ever compared.
 *
 * BOTH halves are typed, and the second one is the point: `${CommandId}:${string}` would have
 * accepted `scene.display:mattcap` without a word, and a radio row silently never ticked is the
 * hardest kind of wrong to see. The union of modes widens the day a second command cycles
 * through something — which is the moment to look at this line, not a cost to avoid.
 *
 * Kept out of the row itself: whether a scene is drawn in wireframe is not a fact of the command
 * registry, it is a fact of the document in front, which only the renderer holds.
 */
export type MenuCheck = CommandId | `scene.display:${DisplayMode}`

/**
 * What the focused window can do RIGHT NOW, for the rows that are greyed out without it.
 *
 * Told apart from `MenuCheck`, which draws a tick: this decides whether a row answers at all.
 * `Export ▸ Selection` is why — with nothing picked it wrote a glTF holding no node, after a save
 * dialog that gave every sign of being about to write a scene.
 *
 * A fact of the document in front, so only the renderer holds it. Named after the ROW it opens
 * rather than after the state behind it: the template reads this beside the item it enables.
 */
export type MenuAbility =
  /**
   * The three Save rows. They share one condition — a document in front — and stay three
   * abilities so that the day one of them refuses on its own, the row it greys is already named.
   */
  | 'document.save'
  | 'document.saveAs'
  | 'document.saveCopy'
  /**
   * ⌘W. Greyed rather than falling back to the window: closing a tab and closing the studio are
   * two gestures, and the row promised the first while doing the second.
   */
  | 'document.close'
  | 'scene.exportSelection'
  // Both refuse in silence from the menu, and both are correctly greyed in the Layers panel —
  // the native row was the one path that said nothing: a mask needs a selection to cut from,
  // and a merge needs a layer underneath at the same level.
  | 'canvas.maskFromSelection'
  | 'canvas.mergeDown'

/**
 * What a command is: where it applies, what it is called, what it does in plain words, and the
 * key it ships with.
 *
 * One table, read by three surfaces that used to disagree: the native menu, which wrote its own
 * accelerators by hand; the keyboard, which read a table of its own; and the settings screen,
 * which had nothing to read at all. A command remapped in one place now moves in all three.
 */
export type CommandDescriptor = {
  id: CommandId
  scope: CommandScope
  titleKey: string
  /** Never optional, for the same reason a setting's help is not: see `SETTING_REGISTRY`. */
  helpKey: string
  /**
   * What it ships with. `null` is legitimate — a command listed, searchable, and waiting for a
   * key someone chooses to give it.
   */
  defaultBinding: Signature | null
  /**
   * 🛑 It raises a dialogue only a PERSON can fill — a native picker, or a window of the studio's
   * own that asks a question. `command.runStudioCommand` refuses it: the assistant cannot fill
   * one, cannot read what was chosen in it, and re-ran the command on its next round — a second
   * Finder over the first. The action taking a path is what does this deliberately.
   */
  raisesDialog?: true
  /**
   * Held rather than tapped: it reports pressed and released instead of firing once.
   *
   * A held command is heard by the window even when its scope is `global`, which is the one
   * exception to the rule below — a native accelerator has no release to report, so the menu
   * cannot serve one, and no menu row is declared for it.
   *
   * It is also heard while the focus sits in a text field, where every other shortcut is
   * silent: dictation exists to write into the field one is already in. A held command
   * therefore has to carry a modifier, or it would swallow a letter.
   */
  held?: boolean
}

/** The six that name a side, which is what makes both tables total rather than partial. */
export type SideViewCommand = Extract<
  CommandId,
  `scene.view${'Front' | 'Back' | 'Right' | 'Left' | 'Top' | 'Bottom'}`
>

/**
 * The command each side of the scene is reached by. One table for the two readers: the native
 * menu builds its rows from it, and the scene reads the side back off the command it was given.
 */
export const SIDE_VIEW_COMMAND: Record<ViewDirection, SideViewCommand> = {
  front: 'scene.viewFront',
  back: 'scene.viewBack',
  right: 'scene.viewRight',
  left: 'scene.viewLeft',
  top: 'scene.viewTop',
  bottom: 'scene.viewBottom',
}

/** The same pairing read the other way, for whoever holds the command and wants the side. */
export const VIEW_SIDE_OF: Record<SideViewCommand, ViewDirection> = {
  'scene.viewFront': 'front',
  'scene.viewBack': 'back',
  'scene.viewRight': 'right',
  'scene.viewLeft': 'left',
  'scene.viewTop': 'top',
  'scene.viewBottom': 'bottom',
}

export function command(descriptor: CommandDescriptor): CommandDescriptor {
  return descriptor
}
