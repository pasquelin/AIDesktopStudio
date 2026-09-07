import type { CommandDescriptor } from './commandTypes'
import { command } from './commandTypes'

export const GENERAL_COMMANDS: readonly CommandDescriptor[] = [
  /**
   * ⌘N makes a FILE, as it does in every other application — a project moved off it on 2026-09-02.
   *
   * `raisesDialog` like the two pickers: the window it opens asks a person what to make and what
   * to call it, and a model that fired this would leave one standing on someone's screen and run
   * it again next round. `workspace.open { createDocument }` is what an outside client uses.
   */
  command({
    id: 'app.new',
    scope: 'global',
    raisesDialog: true,
    titleKey: 'commands.appNew.title',
    helpKey: 'commands.appNew.help',
    defaultBinding: 'Meta+KeyN',
  }),
  command({
    id: 'project.new',
    scope: 'global',
    raisesDialog: true,
    titleKey: 'commands.projectNew.title',
    helpKey: 'commands.projectNew.help',
    // ⌥⌘N and not ⇧⌘N: the Explorer's New folder holds that one, as every Finder-shaped app does.
    defaultBinding: 'Alt+Meta+KeyN',
  }),
  command({
    id: 'project.open',
    scope: 'global',
    raisesDialog: true,
    titleKey: 'commands.projectOpen.title',
    helpKey: 'commands.projectOpen.help',
    defaultBinding: 'Meta+KeyO',
  }),
  command({
    id: 'document.save',
    scope: 'global',
    titleKey: 'commands.documentSave.title',
    helpKey: 'commands.documentSave.help',
    defaultBinding: 'Meta+KeyS',
  }),
  command({
    id: 'document.saveAs',
    scope: 'global',
    titleKey: 'commands.documentSaveAs.title',
    helpKey: 'commands.documentSaveAs.help',
    defaultBinding: 'Shift+Meta+KeyS',
  }),
  /**
   * ⌘W closes the TAB, as it does in every document editor. The native `close` role would take
   * the window instead, so this command owns the chord — see `reservedByPlatform`.
   */
  command({
    id: 'document.close',
    scope: 'global',
    titleKey: 'commands.documentClose.title',
    helpKey: 'commands.documentClose.help',
    defaultBinding: 'Meta+KeyW',
  }),
  // `global` rather than `sequence`, unlike the two exports it mirrors: an import has no montage
  // in front to belong to — it is what MAKES one.
  command({
    id: 'montage.import',
    scope: 'global',
    raisesDialog: true,
    titleKey: 'commands.montageImport.title',
    helpKey: 'commands.montageImport.help',
    defaultBinding: null,
  }),
  command({
    id: 'layout.reset',
    scope: 'global',
    titleKey: 'commands.layoutReset.title',
    helpKey: 'commands.layoutReset.help',
    defaultBinding: null,
  }),
  command({
    id: 'app.settings',
    scope: 'global',
    titleKey: 'commands.appSettings.title',
    helpKey: 'commands.appSettings.help',
    defaultBinding: 'Meta+Comma',
  }),
  command({
    id: 'app.assistant',
    scope: 'global',
    titleKey: 'commands.appAssistant.title',
    helpKey: 'commands.appAssistant.help',
    // Free in the registry, and checked: ⌘K was taken by nothing, and the bare `K` the image
    // space binds to its scale tool is a different signature entirely.
    defaultBinding: 'Meta+KeyK',
  }),
  command({
    id: 'app.dictate',
    scope: 'global',
    titleKey: 'commands.appDictate.title',
    helpKey: 'commands.appDictate.help',
    defaultBinding: 'Alt+KeyD',
    held: true,
  }),
  command({
    id: 'window.fullScreen',
    scope: 'global',
    titleKey: 'commands.windowFullScreen.title',
    helpKey: 'commands.windowFullScreen.help',
    defaultBinding: 'Ctrl+Meta+KeyF',
  }),

  // Alt and not the bare arrows: those belong to whoever walks the bar, and taking them would
  // trade one gesture for another. Its own scope because it is heard by the focused pill alone,
  // where a `global` binding would fire from anywhere and move a space nobody was pointing at.
  command({
    id: 'spaces.moveLeft',
    scope: 'spaces',
    titleKey: 'commands.spacesMoveLeft.title',
    helpKey: 'commands.spacesMoveLeft.help',
    defaultBinding: 'Alt+Meta+ArrowLeft',
  }),
  command({
    id: 'spaces.moveRight',
    scope: 'spaces',
    titleKey: 'commands.spacesMoveRight.title',
    helpKey: 'commands.spacesMoveRight.help',
    defaultBinding: 'Alt+Meta+ArrowRight',
  }),

  /**
   * The file browser's own eight. The keys are the ones every file browser on the platform
   * answers to, and none of them clashes with a `global` one — which is the only clash that
   * would matter, since the native menu fires those wherever the focus sits.
   *
   * ⌘⌫ rather than ⌫ alone: this is the one gesture here that cannot be undone, and a bare
   * delete key is too close to what a hand does while reading a list.
   */
  command({
    id: 'explorer.newFolder',
    scope: 'explorer',
    titleKey: 'commands.explorerNewFolder.title',
    helpKey: 'commands.explorerNewFolder.help',
    defaultBinding: 'Shift+Meta+KeyN',
  }),
  command({
    id: 'explorer.duplicate',
    scope: 'explorer',
    titleKey: 'commands.explorerDuplicate.title',
    helpKey: 'commands.explorerDuplicate.help',
    defaultBinding: 'Meta+KeyD',
  }),
  command({
    id: 'explorer.cut',
    scope: 'explorer',
    titleKey: 'commands.explorerCut.title',
    helpKey: 'commands.explorerCut.help',
    defaultBinding: 'Meta+KeyX',
  }),
  command({
    id: 'explorer.copy',
    scope: 'explorer',
    titleKey: 'commands.explorerCopy.title',
    helpKey: 'commands.explorerCopy.help',
    defaultBinding: 'Meta+KeyC',
  }),
  command({
    id: 'explorer.paste',
    scope: 'explorer',
    titleKey: 'commands.explorerPaste.title',
    helpKey: 'commands.explorerPaste.help',
    defaultBinding: 'Meta+KeyV',
  }),
  command({
    id: 'explorer.trash',
    scope: 'explorer',
    titleKey: 'commands.explorerTrash.title',
    helpKey: 'commands.explorerTrash.help',
    defaultBinding: 'Meta+Backspace',
  }),
  command({
    id: 'explorer.undo',
    scope: 'explorer',
    titleKey: 'commands.explorerUndo.title',
    helpKey: 'commands.explorerUndo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'explorer.redo',
    scope: 'explorer',
    titleKey: 'commands.explorerRedo.title',
    helpKey: 'commands.explorerRedo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),
]
