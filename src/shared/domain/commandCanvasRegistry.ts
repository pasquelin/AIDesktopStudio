import type { CommandDescriptor } from './commandTypes'
import { command } from './commandTypes'

export const CANVAS_COMMANDS: readonly CommandDescriptor[] = [
  // Navigating an image. Same keys as the timeline's own zoom, and for the same reason they may
  // be: only the surface in front is listening.
  command({
    id: 'canvas.zoomIn',
    scope: 'canvas',
    titleKey: 'commands.canvasZoomIn.title',
    helpKey: 'commands.canvasZoomIn.help',
    defaultBinding: 'Meta+Equal',
  }),
  command({
    id: 'canvas.zoomOut',
    scope: 'canvas',
    titleKey: 'commands.canvasZoomOut.title',
    helpKey: 'commands.canvasZoomOut.help',
    defaultBinding: 'Meta+Minus',
  }),
  command({
    id: 'canvas.zoomFit',
    scope: 'canvas',
    titleKey: 'commands.canvasZoomFit.title',
    helpKey: 'commands.canvasZoomFit.help',
    defaultBinding: 'Meta+Digit0',
  }),
  command({
    id: 'canvas.zoomActual',
    scope: 'canvas',
    titleKey: 'commands.canvasZoomActual.title',
    helpKey: 'commands.canvasZoomActual.help',
    defaultBinding: 'Meta+Digit1',
  }),
  command({
    id: 'canvas.mergeDown',
    scope: 'canvas',
    titleKey: 'commands.canvasMergeDown.title',
    helpKey: 'commands.canvasMergeDown.help',
    defaultBinding: 'Meta+KeyE',
  }),
  command({
    id: 'canvas.flatten',
    scope: 'canvas',
    titleKey: 'commands.canvasFlatten.title',
    helpKey: 'commands.canvasFlatten.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.flipHorizontal',
    scope: 'canvas',
    titleKey: 'commands.canvasFlipHorizontal.title',
    helpKey: 'commands.canvasFlipHorizontal.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.flipVertical',
    scope: 'canvas',
    titleKey: 'commands.canvasFlipVertical.title',
    helpKey: 'commands.canvasFlipVertical.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.rotateCw',
    scope: 'canvas',
    titleKey: 'commands.canvasRotateCw.title',
    helpKey: 'commands.canvasRotateCw.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.rotateCcw',
    scope: 'canvas',
    titleKey: 'commands.canvasRotateCcw.title',
    helpKey: 'commands.canvasRotateCcw.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.rulers',
    scope: 'canvas',
    titleKey: 'commands.canvasRulers.title',
    helpKey: 'commands.canvasRulers.help',
    defaultBinding: 'Meta+KeyR',
  }),
  command({
    id: 'canvas.guides',
    scope: 'canvas',
    titleKey: 'commands.canvasGuides.title',
    helpKey: 'commands.canvasGuides.help',
    defaultBinding: 'Meta+Semicolon',
  }),
  command({
    id: 'canvas.grid',
    scope: 'canvas',
    titleKey: 'commands.canvasGrid.title',
    helpKey: 'commands.canvasGrid.help',
    defaultBinding: 'Meta+Quote',
  }),
  command({
    id: 'canvas.clearGuides',
    scope: 'canvas',
    titleKey: 'commands.canvasClearGuides.title',
    helpKey: 'commands.canvasClearGuides.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.selectAll',
    scope: 'canvas',
    titleKey: 'commands.canvasSelectAll.title',
    helpKey: 'commands.canvasSelectAll.help',
    defaultBinding: 'Meta+KeyA',
  }),
  command({
    id: 'canvas.deselect',
    scope: 'canvas',
    titleKey: 'commands.canvasDeselect.title',
    helpKey: 'commands.canvasDeselect.help',
    defaultBinding: 'Meta+KeyD',
  }),
  /**
   * Both mean nothing without a crop frame on screen, exactly as `deselect` means nothing without
   * a selection: the handler answers that, not the table. Being commands is what gates them on the
   * document in front — a frame left up on a background tab would otherwise eat the key.
   */
  command({
    id: 'canvas.cropApply',
    scope: 'canvas',
    titleKey: 'commands.canvasCropApply.title',
    helpKey: 'commands.canvasCropApply.help',
    defaultBinding: 'Enter',
  }),
  command({
    id: 'canvas.cropCancel',
    scope: 'canvas',
    titleKey: 'commands.canvasCropCancel.title',
    helpKey: 'commands.canvasCropCancel.help',
    defaultBinding: 'Escape',
  }),
  command({
    id: 'canvas.maskFromSelection',
    scope: 'canvas',
    titleKey: 'commands.canvasMaskFromSelection.title',
    helpKey: 'commands.canvasMaskFromSelection.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.regenerate',
    scope: 'canvas',
    titleKey: 'commands.canvasRegenerate.title',
    helpKey: 'commands.canvasRegenerate.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.cutout',
    scope: 'canvas',
    titleKey: 'commands.canvasCutout.title',
    helpKey: 'commands.canvasCutout.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.enlarge',
    scope: 'canvas',
    titleKey: 'commands.canvasEnlarge.title',
    helpKey: 'commands.canvasEnlarge.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.vectorize',
    scope: 'canvas',
    titleKey: 'commands.canvasVectorize.title',
    helpKey: 'commands.canvasVectorize.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.extend',
    scope: 'canvas',
    titleKey: 'commands.canvasExtend.title',
    helpKey: 'commands.canvasExtend.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.export',
    scope: 'canvas',
    raisesDialog: true,
    titleKey: 'commands.canvasExport.title',
    helpKey: 'commands.canvasExport.help',
    defaultBinding: 'Shift+Meta+KeyE',
  }),
  command({
    /** The stack rather than the flatten — no default binding, ⇧⌘E being the flatten's. */
    id: 'canvas.exportLayered',
    scope: 'canvas',
    raisesDialog: true,
    titleKey: 'commands.canvasExportLayered.title',
    helpKey: 'commands.canvasExportLayered.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.snap',
    scope: 'canvas',
    titleKey: 'commands.canvasSnap.title',
    helpKey: 'commands.canvasSnap.help',
    defaultBinding: 'Shift+Meta+Semicolon',
  }),
  /*
   * Arming a tool. Declared here rather than as strings on the bar, so a key can be remapped
   * in the settings and the button follows — and so the shortcuts screen lists them at all.
   *
   * `L` goes to the lasso, as it does in every editor that has one; the line takes `Shift+R`
   * from the rectangle it belongs beside. They both claimed `L` while nothing listened, and
   * a registry is where that stops being possible.
   *
   * A tool the engine drops every event of gets no command: an unbuilt gesture with a key is
   * a key that does nothing.
   */
  command({
    id: 'canvas.toolMove',
    scope: 'canvas',
    titleKey: 'commands.canvasToolMove.title',
    helpKey: 'commands.canvasToolMove.help',
    defaultBinding: 'KeyV',
  }),
  command({
    id: 'canvas.toolHand',
    scope: 'canvas',
    titleKey: 'commands.canvasToolHand.title',
    helpKey: 'commands.canvasToolHand.help',
    defaultBinding: 'KeyH',
  }),
  command({
    id: 'canvas.toolCrop',
    scope: 'canvas',
    titleKey: 'commands.canvasToolCrop.title',
    helpKey: 'commands.canvasToolCrop.help',
    defaultBinding: 'KeyC',
  }),
  command({
    id: 'canvas.toolSelectRectangle',
    scope: 'canvas',
    titleKey: 'commands.canvasToolSelectRectangle.title',
    helpKey: 'commands.canvasToolSelectRectangle.help',
    defaultBinding: 'KeyM',
  }),
  command({
    id: 'canvas.toolSelectEllipse',
    scope: 'canvas',
    titleKey: 'commands.canvasToolSelectEllipse.title',
    helpKey: 'commands.canvasToolSelectEllipse.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.toolSelectLasso',
    scope: 'canvas',
    titleKey: 'commands.canvasToolSelectLasso.title',
    helpKey: 'commands.canvasToolSelectLasso.help',
    defaultBinding: 'KeyL',
  }),
  command({
    id: 'canvas.toolSmartSelect',
    scope: 'canvas',
    titleKey: 'commands.canvasToolSmartSelect.title',
    helpKey: 'commands.canvasToolSmartSelect.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.toolShapeRectangle',
    scope: 'canvas',
    titleKey: 'commands.canvasToolShapeRectangle.title',
    helpKey: 'commands.canvasToolShapeRectangle.help',
    defaultBinding: 'KeyU',
  }),
  command({
    id: 'canvas.toolShapeLine',
    scope: 'canvas',
    titleKey: 'commands.canvasToolShapeLine.title',
    helpKey: 'commands.canvasToolShapeLine.help',
    defaultBinding: 'Shift+KeyU',
  }),
  command({
    id: 'canvas.toolShapeArrow',
    scope: 'canvas',
    titleKey: 'commands.canvasToolShapeArrow.title',
    helpKey: 'commands.canvasToolShapeArrow.help',
    defaultBinding: 'KeyA',
  }),
  command({
    id: 'canvas.toolShapeEllipse',
    scope: 'canvas',
    titleKey: 'commands.canvasToolShapeEllipse.title',
    helpKey: 'commands.canvasToolShapeEllipse.help',
    defaultBinding: 'KeyO',
  }),
  command({
    id: 'canvas.toolShapePolygon',
    scope: 'canvas',
    titleKey: 'commands.canvasToolShapePolygon.title',
    helpKey: 'commands.canvasToolShapePolygon.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.toolShapeStar',
    scope: 'canvas',
    titleKey: 'commands.canvasToolShapeStar.title',
    helpKey: 'commands.canvasToolShapeStar.help',
    defaultBinding: null,
  }),
  command({
    id: 'canvas.toolBrush',
    scope: 'canvas',
    titleKey: 'commands.canvasToolBrush.title',
    helpKey: 'commands.canvasToolBrush.help',
    defaultBinding: 'KeyB',
  }),
  command({
    id: 'canvas.toolPencil',
    scope: 'canvas',
    titleKey: 'commands.canvasToolPencil.title',
    helpKey: 'commands.canvasToolPencil.help',
    defaultBinding: 'Shift+KeyB',
  }),
  command({
    id: 'canvas.toolText',
    scope: 'canvas',
    titleKey: 'commands.canvasToolText.title',
    helpKey: 'commands.canvasToolText.help',
    defaultBinding: 'KeyT',
  }),
  command({
    id: 'canvas.toolEraser',
    scope: 'canvas',
    titleKey: 'commands.canvasToolEraser.title',
    helpKey: 'commands.canvasToolEraser.help',
    defaultBinding: 'KeyE',
  }),
  command({
    id: 'canvas.toolFill',
    scope: 'canvas',
    titleKey: 'commands.canvasToolFill.title',
    helpKey: 'commands.canvasToolFill.help',
    defaultBinding: 'KeyG',
  }),
  command({
    id: 'canvas.toolPicker',
    scope: 'canvas',
    titleKey: 'commands.canvasToolPicker.title',
    helpKey: 'commands.canvasToolPicker.help',
    defaultBinding: 'KeyI',
  }),
  // The two bracket keys, as every editor binds them. Physical codes: on AZERTY the same two
  // positions carry ")" and "^", and a signature written from the letter would miss them.
  command({
    id: 'canvas.brushSmaller',
    scope: 'canvas',
    titleKey: 'commands.canvasBrushSmaller.title',
    helpKey: 'commands.canvasBrushSmaller.help',
    defaultBinding: 'BracketLeft',
  }),
  command({
    id: 'canvas.brushLarger',
    scope: 'canvas',
    titleKey: 'commands.canvasBrushLarger.title',
    helpKey: 'commands.canvasBrushLarger.help',
    defaultBinding: 'BracketRight',
  }),
  command({
    id: 'canvas.undo',
    scope: 'canvas',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'canvas.redo',
    scope: 'canvas',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),
]
