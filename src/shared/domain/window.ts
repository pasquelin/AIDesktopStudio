/** Window state, pushed by the main process on every change. */
export type WindowState = {
  /** Window is frontmost. */
  active: boolean
  fullScreen: boolean
  maximized: boolean
}

export const INITIAL_WINDOW_STATE: WindowState = {
  active: true,
  fullScreen: false,
  maximized: false,
}

/**
 * The windows a renderer — or the assistant — may raise. Each is a window of its own rather than
 * a panel; `openManualWindow` and its neighbours say why.
 *
 * 🛑 Named for the WINDOW and no longer for the menu: most of these belong to Help, and the
 * journal is not. The channel and the action stay `help.openStudioWindow` — an action published on
 * the MCP wire is a name clients hold us to.
 */
export type WindowPage = 'manual' | 'licences' | 'usage' | 'journal' | 'welcome'

export const WINDOW_PAGES: readonly WindowPage[] = [
  'manual',
  'licences',
  'usage',
  'journal',
  'welcome',
]
