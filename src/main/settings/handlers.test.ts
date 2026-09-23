import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_NAME_MAX_LENGTH, type AccountSummary } from '@shared/domain/account'
import { DEFAULT_SETTINGS, type AuthState, type SettingsSectionId } from '@shared/domain/settings'
import type { SettingActionId } from '@shared/domain/settingsRegistry'
import { CHANNELS } from '@shared/ipc'
import { invoke, resetHandlers } from '@main/ipc/testHarness'
import { registerSettingsHandlers } from './handlers'
import { memoryAdapter } from './memoryAdapter'
import { createSettingsStore, type SettingsStore } from './store'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

describe('settings handlers', () => {
  let settings: SettingsStore
  let onCredentialsChanged: () => void
  let authState: () => Promise<AuthState>
  let broadcastAccounts: (accounts: AccountSummary[]) => void
  let openSettings: (section: SettingsSectionId) => void
  let runAction: (id: SettingActionId) => void
  let setPending: (pending: boolean) => void

  beforeEach(() => {
    resetHandlers()
    settings = createSettingsStore(memoryAdapter())
    onCredentialsChanged = vi.fn()
    authState = vi.fn((): Promise<AuthState> => Promise.resolve({ authenticated: true }))
    broadcastAccounts = vi.fn()
    openSettings = vi.fn()
    runAction = vi.fn()
    setPending = vi.fn()
    registerSettingsHandlers({
      settings,
      onCredentialsChanged,
      authState,
      broadcastAccounts,
      openSettings,
      runAction,
      setPending,
      credits: { balances: () => Promise.resolve({}), forget: () => {} },
      mcpState: () => ({ listening: false, port: null }),
    })
  })

  it('answers a read with the current settings', () => {
    expect(invoke(CHANNELS.settingsRead)).toEqual(DEFAULT_SETTINGS)
  })

  it('persists a valid write and answers with the merged settings', () => {
    expect(invoke(CHANNELS.settingsWrite, { appearance: { density: 'compact' } })).toMatchObject({
      appearance: { density: 'compact', theme: DEFAULT_SETTINGS.appearance.theme },
    })
    expect(settings.read().appearance.density).toBe('compact')
  })

  /**
   * 🛑 Measured 2026-09-09: a window composed the new shelf from its own replica, so everything
   * this process had written since the last broadcast went with it — two trashings straight after
   * an open dropped the OPEN project off the shelf.
   */
  it('drops one project from the shelf this process holds, and keeps the rest', () => {
    const shelved = (path: string) => ({ path, openedAt: '2026-09-09', createdAt: '2026-09-09' })
    settings.write({ storage: { recentProjects: [shelved('/a'), shelved('/b')] } })

    invoke(CHANNELS.settingsForgetProject, '/a', false)

    expect(settings.read().storage.recentProjects.map(one => one.path)).toEqual(['/b'])
  })

  /**
   * `missing` is a drive that is merely unplugged: pruning the account link there is the silent
   * adoption `projectAccounts` was split out to prevent.
   */
  it('keeps the account link of a folder that was not binned', () => {
    settings.write({ storage: { projectAccounts: { '/a': 'compte' } } })

    invoke(CHANNELS.settingsForgetProject, '/a', false)
    expect(settings.read().storage.projectAccounts).toEqual({ '/a': 'compte' })

    invoke(CHANNELS.settingsForgetProject, '/a', true)
    expect(settings.read().storage.projectAccounts).toEqual({})
  })

  // The other half of the same rule: a rename moves four tables, so a window composing them from
  // its replica loses four at once.
  it('moves one project to its new folder in the settings this process holds', () => {
    const shelved = (path: string) => ({ path, openedAt: '2026-09-09', createdAt: '2026-09-09' })
    settings.write({
      storage: { recentProjects: [shelved('/a'), shelved('/b')], projectAccounts: { '/a': 'clé' } },
    })

    invoke(CHANNELS.settingsMoveProject, '/a', '/c')

    expect(settings.read().storage.recentProjects.map(one => one.path)).toEqual(['/c', '/b'])
    expect(settings.read().storage.projectAccounts).toEqual({ '/c': 'clé' })
  })

  // The channel is typed, but the type is gone at runtime and the sender is a renderer.
  it('rejects a malformed write without persisting anything', () => {
    expect(() => invoke(CHANNELS.settingsWrite, { generation: { concurrentJobs: 999 } })).toThrow()
    expect(settings.read().generation).toEqual(DEFAULT_SETTINGS.generation)
  })

  it('answers the auth state without touching the store', async () => {
    await expect(invoke(CHANNELS.settingsAuthState)).resolves.toEqual({ authenticated: true })
  })

  it('opens the settings window on the requested section', () => {
    invoke(CHANNELS.settingsOpen, 'account')
    expect(openSettings).toHaveBeenCalledWith('account')
  })

  /**
   * `openSettingsWindow` answers with the window it opened, and a `BrowserWindow` cannot be
   * cloned across the boundary: handing it back rejected the call with "an object could not be
   * cloned" while the window itself opened fine. The harness clones nothing, so the contract is
   * pinned on the return value instead.
   */
  it('answers nothing, whatever the opener hands back', () => {
    openSettings = vi.fn(() => ({ unclonable: () => {} }))
    resetHandlers()
    registerSettingsHandlers({
      settings,
      onCredentialsChanged,
      authState,
      broadcastAccounts,
      openSettings,
      runAction,
      setPending,
      credits: { balances: () => Promise.resolve({}), forget: () => {} },
      mcpState: () => ({ listening: false, port: null }),
    })

    expect(invoke(CHANNELS.settingsOpen, 'account')).toBeUndefined()
  })

  // The section ends up in the fragment the settings window loads, so it is never trusted.
  it('refuses to open a section it does not know', () => {
    expect(() => invoke(CHANNELS.settingsOpen, '../elsewhere')).toThrow()
    expect(openSettings).not.toHaveBeenCalled()
  })

  describe('the accounts', () => {
    const add = (name: string, key = 'api_k', secret = 's3cr3t'): unknown =>
      invoke(CHANNELS.accountsAdd, name, key, secret)

    it('stores a key under its name, drops the cached client, and tells every window', () => {
      expect(add('Studio', '  api_k\n')).toEqual({
        accounts: [{ id: expect.any(String), name: 'Studio', active: true }],
      })

      expect(settings.readCredentials()).toEqual({ key: 'api_k', secret: 's3cr3t' })
      expect(onCredentialsChanged).toHaveBeenCalledOnce()
      expect(broadcastAccounts).toHaveBeenCalledOnce()
    })

    it('refuses a blank key without storing anything', () => {
      expect(() => add('Studio', '')).toThrow()

      expect(settings.hasCredentials()).toBe(false)
      expect(onCredentialsChanged).not.toHaveBeenCalled()
      expect(broadcastAccounts).not.toHaveBeenCalled()
    })

    // A name already taken is an answer the screen shows in place, not a rejected call.
    it('answers a duplicate name as a failure, leaving the list untouched', () => {
      add('Studio')
      vi.mocked(broadcastAccounts).mockClear()

      expect(add('studio', 'other_k', 'other_s')).toEqual({
        accounts: [{ id: expect.any(String), name: 'Studio', active: true }],
        failure: 'duplicate',
      })

      expect(settings.accounts()).toHaveLength(1)
      expect(broadcastAccounts).not.toHaveBeenCalled()
    })

    it('answers a failure for an account it does not hold', () => {
      expect(invoke(CHANNELS.accountsActivate, 'ghost')).toEqual({
        accounts: [],
        failure: 'unknown-account',
      })
    })

    it('lists what it holds', () => {
      add('Studio')
      expect(invoke(CHANNELS.accountsList)).toEqual([
        { id: expect.any(String), name: 'Studio', active: true },
      ])
    })

    // Renaming leaves the credentials valid: dropping the client would cost a rebuild for
    // nothing, and a round trip to the API on every keystroke's worth of correction.
    it('renames without dropping the cached client', () => {
      add('Studio')
      const id = settings.accounts()[0]?.id ?? ''
      vi.mocked(onCredentialsChanged).mockClear()

      expect(invoke(CHANNELS.accountsRename, id, 'Client X')).toEqual({
        accounts: [{ id, name: 'Client X', active: true }],
      })

      expect(onCredentialsChanged).not.toHaveBeenCalled()
      expect(broadcastAccounts).toHaveBeenCalled()
    })

    it('removes an account and drops the cached client', () => {
      add('Studio')
      const id = settings.accounts()[0]?.id ?? ''
      vi.mocked(onCredentialsChanged).mockClear()

      expect(invoke(CHANNELS.accountsRemove, id)).toEqual({ accounts: [] })
      expect(onCredentialsChanged).toHaveBeenCalledOnce()
    })

    it('switches the active account and drops the cached client', () => {
      add('Studio')
      add('Client X', 'other_k', 'other_s')
      const [, second] = settings.accounts()
      vi.mocked(onCredentialsChanged).mockClear()

      invoke(CHANNELS.accountsActivate, second?.id)

      expect(settings.readCredentials()?.key).toBe('other_k')
      expect(onCredentialsChanged).toHaveBeenCalledOnce()
    })

    // A blank name comes back as its own code, not as a rejected call: the screen has an exact
    // message for it, and a thrown IPC error would surface as "could not be saved".
    it('answers a blank name as a failure of its own', () => {
      expect(add('  ')).toEqual({ accounts: [], failure: 'empty' })
      expect(settings.accounts()).toEqual([])
    })

    it('answers an over-long name as a failure of its own', () => {
      expect(add('x'.repeat(ACCOUNT_NAME_MAX_LENGTH + 1))).toEqual({
        accounts: [],
        failure: 'too-long',
      })
    })

    // Adding a second key is configuring, not switching: throwing away the cached client and
    // the whole model catalogue for it would cost a full refetch for no change.
    it('leaves the cached client alone when the added account is not the active one', () => {
      add('Studio')
      vi.mocked(onCredentialsChanged).mockClear()

      add('Client X', 'other_k', 'other_s')

      expect(onCredentialsChanged).not.toHaveBeenCalled()
      expect(broadcastAccounts).toHaveBeenCalled()
    })

    it('leaves the cached client alone when an idle account is removed', () => {
      add('Studio')
      add('Client X', 'other_k', 'other_s')
      const [, idle] = settings.accounts()
      vi.mocked(onCredentialsChanged).mockClear()

      invoke(CHANNELS.accountsRemove, idle?.id)

      expect(onCredentialsChanged).not.toHaveBeenCalled()
    })
  })

  describe('the pending flag', () => {
    // Closing a window is the main process's decision, and nothing else tells it that the
    // settings window is holding work nobody applied.
    it('passes on what the window says it is holding', () => {
      invoke(CHANNELS.settingsPending, true)
      expect(setPending).toHaveBeenCalledWith(true)

      invoke(CHANNELS.settingsPending, false)
      expect(setPending).toHaveBeenCalledWith(false)
    })

    it('reads anything but true as nothing pending, rather than trusting the sender', () => {
      invoke(CHANNELS.settingsPending, 'yes')
      expect(setPending).toHaveBeenCalledWith(false)
    })
  })
})
