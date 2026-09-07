import type { CommandDescriptor } from './commandTypes'
import { command } from './commandTypes'

export const SEQUENCE_COMMANDS: readonly CommandDescriptor[] = [
  // Same keys as the scene where the gesture is the same. They only ever reach the surface
  // that is listening, which is what `CommandScope` is for.
  command({
    id: 'sequence.playPause',
    scope: 'sequence',
    titleKey: 'commands.sequencePlayPause.title',
    helpKey: 'commands.sequencePlayPause.help',
    defaultBinding: 'Space',
  }),
  command({
    id: 'sequence.export',
    scope: 'sequence',
    titleKey: 'commands.sequenceExport.title',
    helpKey: 'commands.sequenceExport.help',
    // NOT ⌘M, which Premiere uses and macOS has already spoken for: `roleItem('minimize')` puts
    // it on the Window menu, and two menu rows carrying one accelerator is a key nobody owns.
    // Shift+⌘E is taken too, so this ships without one until someone chooses it — legitimate,
    // and better than a row that quietly steals Minimise.
    defaultBinding: null,
  }),
  // Beside the one above rather than a mode of it: one writes a film, the other writes the EDIT
  // — a file another application opens to keep cutting. Nothing about them is the same gesture.
  command({
    id: 'sequence.exportCut',
    scope: 'sequence',
    titleKey: 'commands.sequenceExportCut.title',
    helpKey: 'commands.sequenceExportCut.help',
    defaultBinding: null,
  }),
  // The same edit with its media inside it. Beside the one above rather than a mode of it: this
  // is the file that travels — one settles another application's media pool, the other does not.
  command({
    id: 'sequence.exportBundle',
    scope: 'sequence',
    titleKey: 'commands.sequenceExportBundle.title',
    helpKey: 'commands.sequenceExportBundle.help',
    defaultBinding: null,
  }),
  // The oldest of the three, and beside them for the same reason: an event list carries the cuts
  // and their timecodes and nothing else, which is what an online room asks for and no more.
  command({
    id: 'sequence.exportEdl',
    scope: 'sequence',
    titleKey: 'commands.sequenceExportEdl.title',
    helpKey: 'commands.sequenceExportEdl.help',
    defaultBinding: null,
  }),
  // The richer of the two plain-text interchanges, and the one that keeps the tracks: what an EDL
  // flattens into one picture channel, this holds as a lane each.
  command({
    id: 'sequence.exportFcpxml',
    scope: 'sequence',
    titleKey: 'commands.sequenceExportFcpxml.title',
    helpKey: 'commands.sequenceExportFcpxml.help',
    defaultBinding: null,
  }),
  // The sound rather than the cut: what the other three describe, this one renders. A room that
  // will mix elsewhere asks for the tracks, not for a list of what to fetch and where to put it.
  command({
    id: 'sequence.exportStems',
    scope: 'sequence',
    titleKey: 'commands.sequenceExportStems.title',
    helpKey: 'commands.sequenceExportStems.help',
    defaultBinding: null,
  }),
  // The program monitor alone answers it: `Monitor` arms the sequence scope on the one that
  // holds the playback token, so the key opens a return on the EDIT, never on the take.
  command({
    id: 'sequence.mirror',
    scope: 'sequence',
    titleKey: 'commands.sequenceMirror.title',
    helpKey: 'commands.sequenceMirror.help',
    // Bare, as DaVinci has it: this is the one gesture taken while WATCHING rather than editing.
    // `KeyF` is spoken for in the scene and the canvas, which are other scopes and never heard
    // at the same time.
    defaultBinding: 'KeyF',
  }),
  command({
    id: 'sequence.split',
    scope: 'sequence',
    titleKey: 'commands.sequenceSplit.title',
    helpKey: 'commands.sequenceSplit.help',
    defaultBinding: 'KeyS',
  }),
  command({
    id: 'sequence.delete',
    scope: 'sequence',
    titleKey: 'commands.sequenceDelete.title',
    helpKey: 'commands.sequenceDelete.help',
    defaultBinding: 'Delete',
  }),
  command({
    id: 'sequence.unlink',
    scope: 'sequence',
    titleKey: 'commands.sequenceUnlink.title',
    helpKey: 'commands.sequenceUnlink.help',
    // What Premiere and DaVinci both bind it to, and the gesture is the same one.
    defaultBinding: 'Meta+KeyL',
  }),
  command({
    id: 'sequence.zoomIn',
    scope: 'sequence',
    titleKey: 'commands.sequenceZoomIn.title',
    helpKey: 'commands.sequenceZoomIn.help',
    defaultBinding: 'Meta+Equal',
  }),
  command({
    id: 'sequence.zoomOut',
    scope: 'sequence',
    titleKey: 'commands.sequenceZoomOut.title',
    helpKey: 'commands.sequenceZoomOut.help',
    defaultBinding: 'Meta+Minus',
  }),
  command({
    id: 'sequence.fit',
    scope: 'sequence',
    titleKey: 'commands.sequenceFit.title',
    helpKey: 'commands.sequenceFit.help',
    defaultBinding: 'Shift+KeyZ',
  }),
  command({
    id: 'sequence.start',
    scope: 'sequence',
    titleKey: 'commands.sequenceStart.title',
    helpKey: 'commands.sequenceStart.help',
    defaultBinding: 'Home',
  }),
  command({
    id: 'sequence.end',
    scope: 'sequence',
    titleKey: 'commands.sequenceEnd.title',
    helpKey: 'commands.sequenceEnd.help',
    defaultBinding: 'End',
  }),
  command({
    id: 'sequence.undo',
    scope: 'sequence',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'sequence.redo',
    scope: 'sequence',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),
]
