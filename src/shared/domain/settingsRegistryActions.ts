import type { SettingsSectionId } from './settings'
import type { SettingActionId } from './settingAction'

/**
 * A button, not a setting. It has no path and no value, so forcing it into `Descriptor` would
 * break the coverage check that makes this registry worth having — hence a table of its own,
 * of the same shape: an id, a section, and the two texts that name and explain it.
 */
export type SettingAction = {
  id: SettingActionId
  section: SettingsSectionId
  titleKey: string
  helpKey: string
  buttonKey: string
  /**
   * What is asked before acting. Present exactly where the action cannot be taken back — no
   * Cancel button covers these, since they never pass through the editing buffer.
   */
  confirmKey?: string
}

export const ACTION_REGISTRY: readonly SettingAction[] = [
  {
    id: 'advanced.openSettingsFile',
    section: 'advanced',
    titleKey: 'settings.openSettingsFile.title',
    helpKey: 'settings.openSettingsFile.help',
    buttonKey: 'settings.reveal',
  },
  {
    id: 'advanced.openLogFolder',
    section: 'advanced',
    titleKey: 'settings.openLogFolder.title',
    helpKey: 'settings.openLogFolder.help',
    // Its own label rather than the shared `reveal`: two buttons reading the same words sit in
    // this section, and a reader listing them by name could not tell which reveals what.
    buttonKey: 'settings.openLogFolder.button',
  },
  {
    id: 'advanced.openDevtools',
    section: 'advanced',
    titleKey: 'settings.openDevtools.title',
    helpKey: 'settings.openDevtools.help',
    buttonKey: 'settings.open',
  },
  {
    // The port and the token are minted per launch, so there is nothing to write down and
    // nothing to show on this screen — only a line to paste, which is what this hands over.
    id: 'mcp.copyCommand',
    section: 'mcp',
    titleKey: 'settings.copyMcpCommand.title',
    helpKey: 'settings.copyMcpCommand.help',
    buttonKey: 'settings.copyMcpCommand.button',
  },
  {
    // The same two facts in the shape a client that reads a FILE takes them: one command line
    // covers Claude Code, and nothing covered the others.
    id: 'mcp.copyConfig',
    section: 'mcp',
    titleKey: 'settings.copyMcpConfig.title',
    helpKey: 'settings.copyMcpConfig.help',
    buttonKey: 'settings.copyMcpConfig.button',
  },
  {
    // Asked before acting, and it is the only action here that writes OUTSIDE the studio's own
    // folders: a `.lua` into another application's script folder, on somebody's machine.
    id: 'advanced.installResolveBridge',
    section: 'advanced',
    titleKey: 'settings.installResolveBridge.title',
    helpKey: 'settings.installResolveBridge.help',
    buttonKey: 'settings.installResolveBridge.button',
    confirmKey: 'settings.installResolveBridge.confirm',
  },
  {
    id: 'advanced.reset',
    section: 'advanced',
    titleKey: 'settings.resetAll.title',
    helpKey: 'settings.resetAll.help',
    buttonKey: 'settings.resetAll.button',
    confirmKey: 'settings.resetAll.confirm',
  },
]

export function actionsIn(section: SettingsSectionId): readonly SettingAction[] {
  return ACTION_REGISTRY.filter(action => action.section === section)
}
