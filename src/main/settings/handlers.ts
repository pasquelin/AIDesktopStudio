import type { AccountsResult, AccountSummary } from '@shared/domain/account'
import { cloudAuth } from '@shared/domain/aiCloud'
import type { AuthState, SettingsSectionId } from '@shared/domain/settings'
import { settingsWithoutProject } from '@shared/domain/settingsProject'
import { CHANNELS, type McpState } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import type { CreditsReader } from '@main/provider/credits'
import { parseProjectPath } from '@main/project/validation'
import { AccountError } from './accounts'
import type { AccountChange, SettingsStore } from './store'
import type { SettingActionId } from '@shared/domain/settingsRegistry'
import {
  parseAccountId,
  parseAccountName,
  parseCloudProviderId,
  parseCredentials,
  parsePartialSettings,
  parseSettingAction,
  parseSettingsSection,
} from './validation'

export type SettingsHandlerDeps = {
  settings: SettingsStore
  /** Called whenever the active credentials change, so a cached API client can be dropped. */
  onCredentialsChanged: () => void
  authState: () => Promise<AuthState>
  /** Where the MCP server is listening, or `null` while it is off — the port alone. */
  mcpState: () => McpState
  /** Pushes the account list to every window: the active account is owned by this process. */
  broadcastAccounts: (accounts: AccountSummary[]) => void
  /** Opens the settings window on a section — a panel saying the key is missing leads here. */
  openSettings: (section: SettingsSectionId) => void
  /** Runs one of the settings window's buttons. Injected: each one touches Electron directly. */
  runAction: (id: SettingActionId) => void
  /** Told the window is holding changes nobody applied, so closing it can ask first. */
  setPending: (pending: boolean) => void
  /** What every stored key has left to spend, for the clouds that publish such a thing. */
  credits: CreditsReader
}

export function registerSettingsHandlers({
  settings,
  onCredentialsChanged,
  authState,
  mcpState,
  broadcastAccounts,
  openSettings,
  runAction,
  setPending,
  credits,
}: SettingsHandlerDeps): void {
  handle(CHANNELS.settingsRead, () => settings.read())

  // The channel is typed `PartialSettings`, but TypeScript is gone at runtime and the sender
  // is a renderer: what arrives here is `unknown` until zod says otherwise.
  handle(CHANNELS.settingsWrite, (_event, partial) => settings.write(parsePartialSettings(partial)))

  // 🛑 Read HERE and written here: composing the new lists in a window meant composing them from
  // a replica, and everything this process had written since the last broadcast went with them.
  handle(CHANNELS.settingsForgetProject, (_event, path, owned) =>
    settings.write(settingsWithoutProject(settings.read(), parseProjectPath(path), owned === true)),
  )

  handle(CHANNELS.settingsAuthState, () => authState())

  handle(CHANNELS.mcpState, () => mcpState())

  /**
   * Runs one change to the account list. A refusal comes back as a code rather than a rejected
   * call: a duplicate name is an answer the screen shows in place, not a failure.
   */
  const mutate = (change: () => AccountChange): AccountsResult => {
    let result: AccountChange

    try {
      result = change()
    } catch (error) {
      if (error instanceof AccountError)
        return { accounts: settings.accounts(), failure: error.failure }
      // Keychain unavailable, disk full: nothing was stored, and the screen must not be told
      // the list changed.
      throw error
    }

    if (result.credentialsChanged) onCredentialsChanged()
    // Every mutation, not just one that moved the active key: a balance belongs to a key, and
    // `credentialsChanged` only ever speaks for the Scenario one.
    credits.forget()
    broadcastAccounts(result.accounts)
    return { accounts: result.accounts }
  }

  handle(CHANNELS.accountsList, () => settings.accounts())

  handle(CHANNELS.accountsAdd, (_event, name, key, secret, providerId) => {
    const provider = parseCloudProviderId(providerId)
    const credentials = parseCredentials(key, secret, cloudAuth(provider))
    return mutate(() => settings.addAccount(parseAccountName(name), credentials, provider))
  })

  handle(CHANNELS.accountsRename, (_event, id, name) =>
    mutate(() => settings.renameAccount(parseAccountId(id), parseAccountName(name))),
  )

  handle(CHANNELS.accountsRemove, (_event, id) =>
    mutate(() => settings.removeAccount(parseAccountId(id))),
  )

  handle(CHANNELS.accountsActivate, (_event, id) =>
    mutate(() => settings.activateAccount(parseAccountId(id))),
  )

  handle(CHANNELS.accountsCredits, () => credits.balances())

  // A block, not an expression: `openSettingsWindow` answers with the `BrowserWindow` it
  // opened, and returning that from a handler hands an unclonable object to the IPC
  // serializer — the window would open and the call would still reject.
  handle(CHANNELS.settingsOpen, (_event, section) => {
    openSettings(parseSettingsSection(section))
  })

  handle(CHANNELS.settingsRunAction, (_event, id) => {
    runAction(parseSettingAction(id))
  })

  handle(CHANNELS.settingsPending, (_event, pending) => {
    setPending(pending === true)
  })
}
