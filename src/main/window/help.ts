import { CHANNELS } from '@shared/ipc'
import type { WindowPage } from '@shared/domain/window'
import { handle } from '@main/ipc/handle'
import { openJournalWindow, openLicencesWindow, openManualWindow, openUsageWindow } from './windows'
import { openWelcomeWindow } from './welcomeWindow'

/**
 * The windows a renderer may raise, opened from anywhere rather than from a menu alone.
 *
 * Its own module for the reason `mirror.ts` gives: `windows.ts` already imports `controls.ts`,
 * and putting a handler there closes a cycle the main process reads at load time.
 */
const OPENERS: Record<WindowPage, () => void> = {
  manual: () => void openManualWindow(),
  licences: () => void openLicencesWindow(),
  usage: () => void openUsageWindow(),
  journal: () => void openJournalWindow(),
  welcome: () => void openWelcomeWindow(),
}

export function registerHelpWindows(): void {
  handle(CHANNELS.helpOpen, (_event, page) => {
    OPENERS[page]()
    return Promise.resolve()
  })
}
