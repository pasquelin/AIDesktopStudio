import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  type AuthState,
  type PartialSettings,
  type Settings,
  type SettingsSectionId,
} from '@shared/domain/settings'
import { partialFor, type SettingPath, type SettingValue } from '@shared/domain/settingsPath'
import { connectThroughBridge, getBridge } from '@/services/bridge'

let authRequest = 0

const UNKNOWN_AUTH: AuthState = { authenticated: false, reason: 'missing' }

type SettingsState = {
  settings: Settings
  auth: AuthState
  /** False until the main process has answered once — the defaults are a placeholder. */
  loaded: boolean
  /**
   * False until the key has been tried. Separate from `loaded` because it is a separate wait:
   * reading the settings touches a file, while deciding whether a key works asks the API. A
   * surface that took the initial `false` of `auth` for an answer would announce a missing key
   * to someone who has one, then take it back a second later.
   */
  authKnown: boolean

  /** Loads the settings and follows the changes other windows make. Returns the unsubscribe. */
  connect: () => Promise<() => void>
  write: (partial: PartialSettings) => Promise<void>
  /** Writes one leaf. Nothing outside this store has to know how a path becomes a partial. */
  setValue: (path: SettingPath, value: SettingValue | undefined) => Promise<void>
  refreshAuth: () => Promise<AuthState>
  /** Opens the settings window on a section — how a panel leads to what it says is missing. */
  openSection: (section: SettingsSectionId) => void
}

/**
 * Renderer-side replica of the settings held by the main process. Credentials are absent by
 * construction: the only thing the renderer learns about them is whether they work.
 */
export const useSettings = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  auth: UNKNOWN_AUTH,
  loaded: false,
  authKnown: false,

  connect: connectThroughBridge(async bridge => {
    let pushed = false
    const stop = bridge.settings.onChange(settings => {
      pushed = true
      set({ settings })
    })

    // Settings must remain available while authentication waits on the network.
    const readSettings = async (): Promise<void> => {
      try {
        const settings = await bridge.settings.read()
        set({ loaded: true, ...(pushed ? {} : { settings }) })
      } catch {
        // Keep the subscription and defaults available after a failed initial read.
        set({ loaded: true })
      }
    }

    await Promise.all([readSettings(), get().refreshAuth()])

    return stop
  }),

  write: async partial => {
    const bridge = getBridge()
    if (!bridge) return
    set({ settings: await bridge.settings.write(partial) })
  },

  setValue: async (path, value) => get().write(partialFor(path, value)),

  refreshAuth: async () => {
    const bridge = getBridge()
    if (!bridge) return get().auth

    const request = ++authRequest
    set({ auth: UNKNOWN_AUTH, authKnown: false })
    try {
      const auth = await bridge.settings.authState()
      if (request === authRequest) set({ auth, authKnown: true })
    } catch {
      // An IPC failure must not keep the previous account authenticated or reject an event listener.
      if (request === authRequest) set({ authKnown: true })
    }
    return get().auth
  },

  openSection: section => {
    void getBridge()?.settings.open(section)
  },
}))

/**
 * The project the active key opens onto, or `null` while nothing has said which.
 *
 * Derived rather than stored: it comes from the library's own answers, and a badge that read a
 * copy would keep judging ownership against the previous key for as long as it went unrefreshed.
 */
export function activeOwnerId(state: Pick<SettingsState, 'auth'>): string | null {
  return state.auth.authenticated ? (state.auth.ownerId ?? null) : null
}

/**
 * Whether a key has been TRIED and answered yes. It says nothing about the other two readings —
 * a key still being checked and a machine with none both read false, and a surface that must
 * tell them apart reads `authKnown` itself.
 */
export function hasApi(state: Pick<SettingsState, 'auth' | 'authKnown'>): boolean {
  return state.authKnown && state.auth.authenticated
}
