import type { MenuItemConstructorOptions } from 'electron'
import { commandIn } from '@shared/domain/command'
import type { MenuContext } from './templateContext'

function sceneEditItems(context: MenuContext): MenuItemConstructorOptions[] {
  if (context.options.scope !== 'scene') return []
  const { commandItem } = context
  return [
    { type: 'separator' },
    commandItem('scene.duplicate', context.t.commands.sceneDuplicate.title),
    commandItem('scene.group', context.t.commands.sceneGroup.title),
    commandItem('scene.optimizeSelection', context.t.commands.sceneOptimizeSelection.title),
    commandItem('scene.worldPerformance', context.t.commands.sceneWorldPerformance.title),
    commandItem('scene.exportGame', context.t.commands.sceneExportGame.title),
    { type: 'separator' },
    commandItem('scene.negate', context.t.commands.sceneNegate.title),
    commandItem('scene.carve', context.t.commands.sceneCarve.title),
    commandItem('scene.weld', context.t.commands.sceneWeld.title),
    commandItem('scene.intersect', context.t.commands.sceneIntersect.title),
    commandItem('scene.separate', context.t.commands.sceneSeparate.title),
    commandItem('scene.invertCarve', context.t.commands.sceneInvertCarve.title),
    { type: 'separator' },
    commandItem('scene.addToSheet', context.t.commands.sceneAddToSheet.title),
    commandItem('scene.removeFromSheet', context.t.commands.sceneRemoveFromSheet.title),
    commandItem('scene.delete', context.t.commands.sceneDelete.title),
  ]
}

function historyItems(context: MenuContext): MenuItemConstructorOptions[] {
  const undo = context.options.scope && commandIn(context.options.scope, 'undo')
  const redo = context.options.scope && commandIn(context.options.scope, 'redo')
  if (undo && redo) {
    return [
      context.commandItem(undo, context.t.commands.undo.title, false),
      context.commandItem(redo, context.t.commands.redo.title, false),
    ]
  }
  return [
    { role: 'undo', label: context.t.commands.undo.title },
    { role: 'redo', label: context.t.commands.redo.title },
  ]
}

export function editMenu(context: MenuContext): MenuItemConstructorOptions {
  return {
    label: context.t.menu.edit,
    submenu: [
      ...historyItems(context),
      { type: 'separator' },
      { ...context.roleItem('cut'), registerAccelerator: false },
      { ...context.roleItem('copy'), registerAccelerator: false },
      { ...context.roleItem('paste'), registerAccelerator: false },
      { ...context.roleItem('selectAll'), registerAccelerator: false },
      ...sceneEditItems(context),
    ],
  }
}
