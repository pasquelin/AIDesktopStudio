import { openRetargetWindow } from './retargetWindow'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { parseAssetId } from '@main/assets/validation'
import { openPlayerModuleWindow, showMainWindow } from './windows'

/** Opening the module window — all this side owns, as `gameWindow.ts` explains for its own. */
export function registerPlayerModuleWindow(): void {
  handle(CHANNELS.retargetWindowFocusOrigin, () => {
    showMainWindow()
    return Promise.resolve()
  })
  handle(CHANNELS.retargetWindowOpen, (_event, sessionId) => {
    openRetargetWindow(parseAssetId(sessionId))
    return Promise.resolve()
  })
  handle(CHANNELS.playerModuleWindowOpen, (_event, assetId) => {
    openPlayerModuleWindow(parseAssetId(assetId))
    return Promise.resolve()
  })
}
