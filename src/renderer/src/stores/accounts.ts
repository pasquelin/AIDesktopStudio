import { create } from 'zustand'
import {
  providerOf,
  scenarioAccount,
  type AccountFailure,
  type AccountsResult,
  type AccountSummary,
} from '@shared/domain/account'
import { LIBRARY_CLOUDS } from '@shared/domain/aiCloud'
import type { StudioBridge } from '@shared/ipc'
import { connectThroughBridge, getBridge } from '@/services/bridge'
import { useSettings } from './settings'

/** Why an account could not be saved, including a refusal that never reached the main process. */
export type AccountSaveFailure = AccountFailure | 'unexpected'

type AccountsState = {
  accounts: AccountSummary[]
  /**
   * Whether the list has been read once: `accounts: []` says "not read yet" and "no key at all"
   * alike, and a watcher cannot tell a first arrival from a switch without this.
   */
  accountsLoaded: boolean

  /** Loads the accounts and follows the switches other windows make. Returns the unsubscribe. */
  connect: () => Promise<() => void>
  /** Every mutation answers `null` on success, or why it was refused. */
  add: (
    name: string,
    key: string,
    secret: string,
    providerId?: string,
  ) => Promise<AccountSaveFailure | null>
  rename: (id: string, name: string) => Promise<AccountSaveFailure | null>
  remove: (id: string) => Promise<AccountSaveFailure | null>
  activate: (id: string) => Promise<AccountSaveFailure | null>
}

export function activeAccount(accounts: readonly AccountSummary[]): AccountSummary | null {
  return scenarioAccount(accounts) ?? accounts.find(account => account.active) ?? null
}

/**
 * Whether a key opening onto a remote LIBRARY is held — which cloud that is, `LIBRARY_CLOUDS` says.
 *
 * A list not read yet counts as held: the ordinary case is someone who has a key, and their rail
 * must not lose an icon and get it back a moment later.
 */
export function accountsHoldLibrary({ accounts, accountsLoaded }: AccountsHeld): boolean {
  return (
    !accountsLoaded ||
    accounts.some(account => account.active && LIBRARY_CLOUDS.includes(providerOf(account)))
  )
}

/** What `accountsHoldLibrary` reads, so a caller may pass the store or a fixture alike. */
export type AccountsHeld = { accounts: readonly AccountSummary[]; accountsLoaded: boolean }

/**
 * The keys, grouped by the cloud they open, in the order the accounts arrive. One key is active
 * per group and they are not exclusive: Scenario serves images while another cloud serves text.
 */
export function accountsByProvider(
  accounts: readonly AccountSummary[],
): readonly { providerId: string; accounts: readonly AccountSummary[] }[] {
  const groups = new Map<string, AccountSummary[]>()
  for (const account of accounts) {
    const provider = providerOf(account)
    const held = groups.get(provider)
    if (held) held.push(account)
    else groups.set(provider, [account])
  }

  return [...groups].map(([providerId, held]) => ({ providerId, accounts: held }))
}

/**
 * The stored API keys, replicated from the main process. The credentials themselves never
 * reach this side: a window learns which accounts exist and which one is in use, never what
 * they hold — see CLAUDE.md, invariant 1.
 */
export const useAccounts = create<AccountsState>()((set, get) => {
  /**
   * Runs a mutation and republishes the list. The authentication is re-probed only when the
   * active account actually moved — adding a second key or dropping an idle one leaves it
   * where it was, and probing costs a network round trip the user waits on.
   */
  const mutate = async (
    change: (accounts: StudioBridge['accounts']) => Promise<AccountsResult>,
  ): Promise<AccountSaveFailure | null> => {
    const bridge = getBridge()
    // Answering null would read as "saved", and the form would clear the key just typed.
    if (!bridge) return 'unexpected'

    let result: AccountsResult
    try {
      result = await change(bridge.accounts)
    } catch {
      // Keychain unavailable, or a credential the main process refused. Nothing was stored,
      // and every caller must be able to say so rather than fail silently.
      return 'unexpected'
    }

    const before = scenarioAccount(get().accounts)?.id ?? null
    set({ accounts: result.accounts })
    if (result.failure) return result.failure

    if ((scenarioAccount(result.accounts)?.id ?? null) !== before) {
      await useSettings.getState().refreshAuth()
    }

    return null
  }

  return {
    accounts: [],
    accountsLoaded: false,

    connect: connectThroughBridge(async bridge => {
      let pushed = false
      const stop = bridge.accounts.onChange(accounts => {
        pushed = true
        const before = scenarioAccount(get().accounts)?.id ?? null
        set({ accounts, accountsLoaded: true })
        if ((scenarioAccount(accounts)?.id ?? null) !== before) {
          void useSettings.getState().refreshAuth()
        }
      })

      try {
        const accounts = await bridge.accounts.list()
        // A switch landing while the read was in flight is newer than what the read answered.
        // 🛑 The flag travels WITH the list, never a beat later: a watcher woken by the accounts
        // alone reads a baseline that is not yet marked known, and calls the first list a switch.
        if (!pushed) set({ accounts, accountsLoaded: true })
      } catch {
        // The subscription still stands: throwing here would strand the listener with nobody
        // holding the way to remove it.
      } finally {
        // Settled either way: a read that failed still answers "this is all there is", and a
        // watcher left waiting for a baseline would sit out every switch that follows.
        set({ accountsLoaded: true })
      }

      return stop
    }),

    add: (name, key, secret, providerId) =>
      mutate(accounts => accounts.add(name, key, secret, providerId)),

    rename: (id, name) => mutate(accounts => accounts.rename(id, name)),

    remove: id => mutate(accounts => accounts.remove(id)),

    activate: async id => {
      if (get().accounts.find(account => account.id === id)?.active) return null
      return await mutate(accounts => accounts.activate(id))
    },
  }
})
