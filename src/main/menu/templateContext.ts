import type { MenuItemConstructorOptions } from 'electron'
import { APP_NAME } from '@shared/constants'
import { bindingOf, commandDescriptor, type CommandId } from '@shared/domain/command'
import { acceleratorOf, typesText } from '@shared/domain/shortcut'
import { fillHoles, TRANSLATIONS, type Translations } from '@shared/i18n'
import type { MenuOptions } from './templateTypes'

type LabelledRole = keyof Translations['menu'] & NonNullable<MenuItemConstructorOptions['role']>

export type MenuContext = {
  options: MenuOptions
  t: Translations
  keyOf: (
    command: CommandId,
    registerAccelerator?: boolean,
  ) => Pick<MenuItemConstructorOptions, 'accelerator' | 'registerAccelerator'>
  commandItem: (
    command: CommandId,
    label: string,
    registerAccelerator?: boolean,
  ) => MenuItemConstructorOptions
  roleItem: (role: LabelledRole) => MenuItemConstructorOptions
}

function commandKey(
  options: MenuOptions,
  command: CommandId,
  registerAccelerator: boolean,
): Pick<MenuItemConstructorOptions, 'accelerator' | 'registerAccelerator'> {
  const binding = bindingOf(command, options.overrides)
  const typed = typesText(binding) && commandDescriptor(command)?.scope !== 'global'
  return {
    accelerator: typed && options.isMac ? undefined : acceleratorOf(binding),
    registerAccelerator: registerAccelerator && !typed,
  }
}

export function createMenuContext(options: MenuOptions): MenuContext {
  const t = TRANSLATIONS[options.language]
  const keyOf = (command: CommandId, registerAccelerator = true) =>
    commandKey(options, command, registerAccelerator)
  const commandItem = (
    command: CommandId,
    label: string,
    registerAccelerator = true,
  ): MenuItemConstructorOptions => ({
    id: command,
    label,
    ...keyOf(command, registerAccelerator),
    click: () => options.actions.runCommand(command),
  })
  const roleItem = (role: LabelledRole): MenuItemConstructorOptions => ({
    role,
    label: fillHoles(t.menu[role], { name: APP_NAME }, options.language),
  })
  return { options, t, keyOf, commandItem, roleItem }
}
