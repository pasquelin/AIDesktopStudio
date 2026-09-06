import type { CommandDescriptor } from './commandTypes'
import { command } from './commandTypes'

export const OTHER_COMMANDS: readonly CommandDescriptor[] = [
  command({
    id: 'skybox.view',
    scope: 'skybox',
    titleKey: 'commands.skyboxView.title',
    helpKey: 'commands.skyboxView.help',
    defaultBinding: 'KeyV',
  }),
  command({
    id: 'skybox.probes',
    scope: 'skybox',
    titleKey: 'commands.skyboxProbes.title',
    helpKey: 'commands.skyboxProbes.help',
    defaultBinding: 'KeyP',
  }),
  command({
    id: 'skybox.undo',
    scope: 'skybox',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'skybox.redo',
    scope: 'skybox',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),
  // The skeleton window keeps a history like every editor here, and it is the only one whose
  // subject is a file: without this pair ⌘Z fills the stack and nothing can ever pop it.
  command({
    id: 'character.undo',
    scope: 'character',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'character.redo',
    scope: 'character',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),
  // The take editor was one of two surfaces whose history had no key and no menu row: its two
  // buttons were the whole of it, so the bar could not be relieved of them without this pair.
  command({
    id: 'audio.undo',
    scope: 'audio',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'audio.redo',
    scope: 'audio',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),

  // The other one, and worse: the manual already promised ⌘Z on a style applied to a material
  // (`docs/fr/manuel/12-espace-matieres.md`) while nothing at all could reach that history.
  command({
    id: 'material.undo',
    scope: 'material',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'material.redo',
    scope: 'material',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),

  // The 3D space holds two kinds, so ⌘Z has to follow the DOCUMENT in front rather than the
  // space — `scopeOfDocument` below is what tells a scene's history from an interface's.
  command({
    id: 'gui.undo',
    scope: 'gui',
    titleKey: 'commands.undo.title',
    helpKey: 'commands.undo.help',
    defaultBinding: 'Meta+KeyZ',
  }),
  command({
    id: 'gui.redo',
    scope: 'gui',
    titleKey: 'commands.redo.title',
    helpKey: 'commands.redo.help',
    defaultBinding: 'Shift+Meta+KeyZ',
  }),
]
