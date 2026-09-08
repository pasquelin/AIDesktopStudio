import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AccountsResult, AccountSummary } from '@shared/domain/account'
import type { AuthState } from '@shared/domain/settings'
import { installFakeBridge } from '@/services/fakeBridge'
import { accountsByProvider, activeAccount, useAccounts } from './accounts'
import { useSettings } from './settings'

const studio: AccountSummary = { id: 'a', name: 'Studio', active: true }
const client: AccountSummary = { id: 'b', name: 'Client X', active: false }

const result = (accounts: AccountSummary[]): Promise<AccountsResult> =>
  Promise.resolve({ accounts })

/**
 * The switch groups by cloud, one active key per group. A summary with no `providerId` is a key
 * stored before clouds became a list, and it reads as Scenario — the same default the main
 * process gives its own absence.
 */
describe('accountsByProvider', () => {
  const google: AccountSummary = { id: 'g', name: 'Perso', providerId: 'google', active: true }

  it('keeps one group while one cloud is held', () => {
    expect(accountsByProvider([studio, client])).toEqual([
      { providerId: 'scenario', accounts: [studio, client] },
    ])
  })

  it('splits the keys by the cloud each one opens', () => {
    const groups = accountsByProvider([studio, google, client])

    expect(groups.map(group => group.providerId)).toEqual(['scenario', 'google'])
    expect(groups[0]?.accounts).toEqual([studio, client])
    expect(groups[1]?.accounts).toEqual([google])
  })

  it('answers nothing for a book that holds nothing', () => {
    expect(accountsByProvider([])).toEqual([])
  })
})

describe('useAccounts', () => {
  beforeEach(() => {
    useAccounts.setState({ accounts: [] })
    useSettings.setState({
      auth: { authenticated: false, reason: 'missing' },
      refreshAuth: useSettings.getInitialState().refreshAuth,
    })
    vi.restoreAllMocks()
  })

  describe('connect', () => {
    it('publishes what the main process holds', async () => {
      installFakeBridge({ accounts: { list: () => Promise.resolve([studio]) } })

      await useAccounts.getState().connect()
      expect(useAccounts.getState().accounts).toEqual([studio])
    })

    /**
     * 🛑 The flag has to travel WITH the list, never a beat later. A watcher woken by the accounts
     * alone reads a baseline that is not yet marked known, calls the first list a switch, and
     * throws the whole query cache away at every launch.
     */
    it('marks the list read in the same breath as it publishes it', async () => {
      installFakeBridge({ accounts: { list: () => Promise.resolve([studio]) } })
      const seen: boolean[] = []
      const stop = useAccounts.subscribe(state => {
        if (state.accounts.length > 0) seen.push(state.accountsLoaded)
      })

      await useAccounts.getState().connect()
      stop()

      expect(seen).not.toContain(false)
    })

    // A switch landing while the read is in flight is newer than what the read answers.
    it('keeps a switch that landed while the read was in flight', async () => {
      let push: ((accounts: AccountSummary[]) => void) | null = null
      installFakeBridge({
        accounts: {
          onChange: callback => {
            push = callback
            return () => {}
          },
          list: () => {
            push?.([studio, client])
            return Promise.resolve([studio])
          },
        },
      })

      await useAccounts.getState().connect()
      expect(useAccounts.getState().accounts).toHaveLength(2)
    })

    it('refreshes authentication when another window adds or removes the active account', async () => {
      const listeners: ((accounts: AccountSummary[]) => void)[] = []
      const probe = vi.fn(async (): Promise<AuthState> => ({ authenticated: true }))
      installFakeBridge({
        settings: { authState: probe },
        accounts: {
          list: async () => [],
          onChange: callback => {
            listeners.push(callback)
            return () => {}
          },
        },
      })
      const stop = await useAccounts.getState().connect()
      listeners[0]?.([studio])
      await vi.waitFor(() => expect(useSettings.getState().auth.authenticated).toBe(true))
      listeners[0]?.([{ ...studio, name: 'Renamed' }])
      expect(probe).toHaveBeenCalledTimes(1)
      probe.mockResolvedValue({ authenticated: false, reason: 'missing' })
      listeners[0]?.([])
      await vi.waitFor(() => expect(useSettings.getState().auth.authenticated).toBe(false))
      expect(probe).toHaveBeenCalledTimes(2)
      stop()
    })

    it('still hands back the unsubscribe when the read fails', async () => {
      const stop = vi.fn()
      installFakeBridge({
        accounts: { list: () => Promise.reject(new Error('no bridge')), onChange: () => stop },
      })

      // Throwing here would strand the listener with nobody holding the way to remove it.
      const unsubscribe = await useAccounts.getState().connect()
      unsubscribe()

      expect(stop).toHaveBeenCalledOnce()
    })
  })

  describe('mutations', () => {
    it('answers null and republishes the list on success', async () => {
      installFakeBridge({ accounts: { add: () => result([studio]) } })

      expect(await useAccounts.getState().add('Studio', 'k', 's')).toBeNull()
      expect(useAccounts.getState().accounts).toEqual([studio])
    })

    it('answers the code when the main process refuses', async () => {
      installFakeBridge({
        accounts: { add: () => Promise.resolve({ accounts: [], failure: 'duplicate' }) },
      })

      expect(await useAccounts.getState().add('Studio', 'k', 's')).toBe('duplicate')
    })

    // A locked keychain rejects the call. Every caller must be able to say so.
    it('turns a rejected call into a failure rather than letting it escape', async () => {
      installFakeBridge({ accounts: { remove: () => Promise.reject(new Error('no keychain')) } })
      useAccounts.setState({ accounts: [studio] })

      await expect(useAccounts.getState().remove('a')).resolves.toBe('unexpected')
    })

    it('leaves the list alone when the call was rejected', async () => {
      installFakeBridge({ accounts: { rename: () => Promise.reject(new Error('no keychain')) } })
      useAccounts.setState({ accounts: [studio] })

      await useAccounts.getState().rename('a', 'Other')
      expect(useAccounts.getState().accounts).toEqual([studio])
    })
  })

  describe('re-probing the authentication', () => {
    /** Replaced in the store rather than spied on: the probe is what we are counting. */
    const watchProbe = (): Mock<() => Promise<AuthState>> => {
      const probe = vi.fn((): Promise<AuthState> => Promise.resolve({ authenticated: true }))
      useSettings.setState({ refreshAuth: probe })
      return probe
    }

    it('probes once the active account has moved', async () => {
      const probe = watchProbe()
      installFakeBridge({
        accounts: {
          activate: () =>
            result([
              { ...studio, active: false },
              { ...client, active: true },
            ]),
        },
      })
      useAccounts.setState({ accounts: [studio, client] })

      await useAccounts.getState().activate('b')
      expect(probe).toHaveBeenCalledOnce()
    })

    // Saving a second key is configuring, not switching: the probe is a real round trip the
    // user waits on, and the answer would be arithmetically identical.
    it('probes only once when its own mutation is broadcast before answering', async () => {
      const probe = watchProbe()
      const listeners: ((accounts: AccountSummary[]) => void)[] = []
      installFakeBridge({
        accounts: {
          list: async () => [],
          onChange: callback => {
            listeners.push(callback)
            return () => {}
          },
          add: async () => {
            listeners[0]?.([studio])
            return { accounts: [studio] }
          },
        },
      })
      const stop = await useAccounts.getState().connect()
      await useAccounts.getState().add('Studio', 'k', 's')
      expect(probe).toHaveBeenCalledOnce()
      stop()
    })

    it('does not probe when the active account stayed put', async () => {
      const probe = watchProbe()
      installFakeBridge({ accounts: { add: () => result([studio, client]) } })
      useAccounts.setState({ accounts: [studio] })

      await useAccounts.getState().add('Client X', 'k', 's')
      expect(probe).not.toHaveBeenCalled()
    })

    it('does not probe on a rename', async () => {
      const probe = watchProbe()
      installFakeBridge({ accounts: { rename: () => result([{ ...studio, name: 'Other' }]) } })
      useAccounts.setState({ accounts: [studio] })

      await useAccounts.getState().rename('a', 'Other')
      expect(probe).not.toHaveBeenCalled()
    })

    it('does not probe when a refusal came back', async () => {
      const probe = watchProbe()
      installFakeBridge({
        accounts: { activate: () => Promise.resolve({ accounts: [], failure: 'unknown-account' }) },
      })
      useAccounts.setState({ accounts: [studio, client] })

      await useAccounts.getState().activate('b')
      expect(probe).not.toHaveBeenCalled()
    })
  })

  describe('activate', () => {
    it('does nothing when the account is already the active one', async () => {
      const activate = vi.fn(() => result([studio]))
      installFakeBridge({ accounts: { activate } })
      useAccounts.setState({ accounts: [studio] })

      expect(await useAccounts.getState().activate('a')).toBeNull()
      expect(activate).not.toHaveBeenCalled()
    })
  })
})

describe('activeAccount', () => {
  it('answers the account in use', () => {
    expect(activeAccount([studio, client])).toEqual(studio)
  })

  it('answers null when none is', () => {
    expect(activeAccount([{ ...studio, active: false }])).toBeNull()
  })

  it('prefers the Scenario key when another cloud is also in use', () => {
    expect(
      activeAccount([{ id: 'o', name: 'GPT', providerId: 'openai', active: true }, studio]),
    ).toEqual(studio)
  })
})
