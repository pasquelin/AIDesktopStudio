// `import type`, not `import { type … }`: the latter keeps an Electron runtime import.
import type { MenuItemConstructorOptions } from 'electron'
import type { MenuOptions } from './templateTypes'
import { createMenuContext } from './templateContext'
import { appMenu, fileMenu, helpMenu } from './templateFile'
import { editMenu } from './templateEdit'
import { addMenu, imageMenu, imageToolsMenu } from './templateWorkspace'
import { viewMenu, windowMenu } from './templateView'

export type { MenuActions, MenuOptions } from './templateTypes'

export function menuTemplate(options: MenuOptions): MenuItemConstructorOptions[] {
  const context = createMenuContext(options)
  return [
    ...appMenu(context),
    fileMenu(context),
    editMenu(context),
    ...imageToolsMenu(context),
    ...imageMenu(context),
    ...addMenu(context),
    viewMenu(context),
    windowMenu(context),
    helpMenu(context),
  ]
}
