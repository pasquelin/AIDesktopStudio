import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ACCOUNT_NAME } from '@shared/domain/account'
import { DEFAULT_SETTINGS, type Settings } from '@shared/domain/settings'
import { WELCOME_VERSION } from '@shared/domain/welcome'
import { memoryAdapter, type MemoryAdapter } from './memoryAdapter'
import { createSettingsStore, type SettingsStore } from './store'

function countingIds(): () => string {
  let next = 0
  return () => `id-${++next}`
}

describe('settings store', () => {
  let adapter: MemoryAdapter

  beforeEach(() => {
    adapter = memoryAdapter()
  })

  const storeWithAccount = (): SettingsStore => {
    const store = createSettingsStore(adapter, { newAccountId: countingIds() })
    store.addAccount('Studio', { key: 'api_k', secret: 's3cr3t' })
    return store
  }

  it('returns the defaults when nothing is stored', () => {
    expect(createSettingsStore(adapter).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('stamps a stored profile that never saw the welcome, so it is not shown again', () => {
    adapter.raw.set('settings', { general: { language: 'en' } })
    const stored = createSettingsStore(adapter).read()

    expect(stored.general.language).toBe('en')
    expect(stored.onboarding.version).toBe(WELCOME_VERSION)
    expect(stored.onboarding.completedAt).toEqual(expect.any(String))
  })

  it('falls back to the defaults when the stored settings are unusable', () => {
    adapter.raw.set('settings', { appearance: { theme: 'purple' } })
    expect(createSettingsStore(adapter).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('reads the stored settings once, and again after a write', () => {
    const store = createSettingsStore(adapter)
    const reads = vi.spyOn(adapter, 'read')

    store.read()
    store.read()
    expect(reads.mock.calls.filter(([key]) => key === 'settings')).toHaveLength(1)

    store.write({ appearance: { density: 'compact' } })
    expect(store.read().appearance.density).toBe('compact')
    expect(reads.mock.calls.filter(([key]) => key === 'settings').length).toBeGreaterThan(1)
  })

  it('hands back settings nobody can write into', () => {
    const settings = createSettingsStore(adapter).read()

    expect(() => {
      settings.appearance.density = 'compact'
    }).toThrow()
  })

  it('merges a partial write section by section', () => {
    const store = createSettingsStore(adapter)
    store.write({ appearance: { density: 'compact' } })

    const settings = store.read()
    expect(settings.appearance.density).toBe('compact')
    expect(settings.appearance.theme).toBe(DEFAULT_SETTINGS.appearance.theme)
    expect(settings.generation).toEqual(DEFAULT_SETTINGS.generation)
  })

  it('keeps every branch the settings declare when merging a write', () => {
    const store = createSettingsStore(adapter)
    store.write({ appearance: { density: 'compact' } })

    expect(Object.keys(store.read()).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
  })

  it('carries the bar order across a write to another section', () => {
    const store = createSettingsStore(adapter)
    store.write({ workspaces: { order: ['audio', 'image'] } })
    store.write({ appearance: { density: 'compact' } })

    expect(store.read().workspaces.order).toEqual(['audio', 'image'])
  })

  it('reads a config file written before the media section existed', () => {
    // Every release adds settings; a file from the previous one must not lose the rest.
    adapter.write('settings', { appearance: { density: 'compact' } })

    const settings = createSettingsStore(adapter).read()
    expect(settings.media).toEqual({})
    expect(settings.appearance.density).toBe('compact')
  })

  it('keeps the ffmpeg path across another section being written', () => {
    const store = createSettingsStore(adapter)
    store.write({ media: { ffmpegPath: '/opt/homebrew/bin/ffmpeg' } })
    store.write({ appearance: { theme: 'light' } })

    expect(store.read().media.ffmpegPath).toBe('/opt/homebrew/bin/ffmpeg')
  })

  // Without this, a theme changed in the settings window reaches the studio on next launch.
  it('reports every write, so the other windows can follow', () => {
    const changes: Settings[] = []
    const store = createSettingsStore(adapter, { onChange: current => changes.push(current) })

    store.write({ appearance: { density: 'compact' } })

    expect(changes).toHaveLength(1)
    expect(changes[0]?.appearance.density).toBe('compact')
    // The whole state, not the partial: a window replicates settings, it does not patch them.
    expect(changes[0]?.generation).toEqual(DEFAULT_SETTINGS.generation)
  })

  it('reports a write nobody asked for through the IPC, like the project it just opened', () => {
    const changes: Settings[] = []
    const store = createSettingsStore(adapter, { onChange: current => changes.push(current) })

    store.write({ storage: { lastProject: '/tmp/demo' } })

    expect(changes.at(-1)?.storage.lastProject).toBe('/tmp/demo')
  })

  it('says nothing on a read', () => {
    const changes: Settings[] = []
    createSettingsStore(adapter, { onChange: current => changes.push(current) }).read()

    expect(changes).toEqual([])
  })

  it('never exposes credentials through the settings it returns', () => {
    const store = storeWithAccount()
    expect(JSON.stringify(store.read())).not.toContain('s3cr3t')
  })

  it('stores the whole book encrypted, never in clear', () => {
    storeWithAccount()
    expect(String(adapter.raw.get('accounts'))).toBe(
      'enc:{"accounts":[{"id":"id-1","name":"Studio","credentials":{"key":"api_k","secret":"s3cr3t"}}],"activeByProvider":{"scenario":"id-1"}}',
    )
  })

  it('reads back the credentials of the active account', () => {
    const store = storeWithAccount()
    expect(store.readCredentials()).toEqual({ key: 'api_k', secret: 's3cr3t' })
    expect(store.hasCredentials()).toBe(true)
  })

  it('follows a switch to another account', () => {
    const store = storeWithAccount()
    store.addAccount('Client X', { key: 'other_k', secret: 'other_s' })

    // Adding does not switch: the user was configuring, not moving.
    expect(store.readCredentials()?.key).toBe('api_k')

    store.activateAccount('id-2')
    expect(store.readCredentials()?.key).toBe('other_k')
  })

  it('reports an unreadable book without deleting it', () => {
    adapter.raw.set('accounts', 'garbage')
    const store = createSettingsStore(adapter)

    expect(store.hasCredentials()).toBe(false)
    expect(store.accounts()).toEqual([])
    // A transient keychain failure must not cost the user every key they hold.
    expect(adapter.raw.has('accounts')).toBe(true)
  })

  /*
   * A keychain can be locked, or resolve to another backend for one launch. `settleAccounts`
   * runs before the first window, so erasing there is permanent and silent: the user comes
   * back with every key gone. Reading empty is enough to make the screens ask for one.
   */
  it('never erases an unreadable book, however it is read', () => {
    adapter.raw.set('accounts', 'garbage')
    const store = createSettingsStore(adapter)

    store.settleAccounts()
    void store.accounts()
    void store.hasCredentials()

    expect(adapter.raw.get('accounts')).toBe('garbage')
  })

  it('refuses to write over a book the keychain would not hand back', () => {
    adapter.raw.set('accounts', 'garbage')
    const store = createSettingsStore(adapter)

    // The screen says "no account yet", so adding one is exactly what the user does next.
    expect(() => store.addAccount('Studio', { key: 'k', secret: 's' })).toThrow('store-unreadable')
    expect(adapter.raw.get('accounts')).toBe('garbage')
  })

  /*
   * Decrypted fine, holds no book — a truncated write, a hand edit, a shape from another
   * version. The keychain is healthy and the content is unrecoverable whatever we do, so
   * refusing here would lock the user out of their own accounts for good, on every launch,
   * while blaming a keychain that is working.
   */
  it('lets the user write over content that decrypted but holds no book', () => {
    adapter.raw.set('accounts', 'enc:{"accounts":"nope"}')
    const store = createSettingsStore(adapter, { newAccountId: countingIds() })

    expect(() => store.addAccount('Studio', { key: 'k', secret: 's' })).not.toThrow()
    expect(store.accounts()).toEqual([{ id: 'id-1', name: 'Studio', active: true }])
  })

  it('lets the user write over a blob whose JSON never parsed', () => {
    adapter.raw.set('accounts', 'enc:{"accounts":[')
    const store = createSettingsStore(adapter, { newAccountId: countingIds() })

    expect(() => store.addAccount('Studio', { key: 'k', secret: 's' })).not.toThrow()
    expect(store.hasCredentials()).toBe(true)
  })

  it('survives an activeId that names nothing, keeping the accounts', () => {
    adapter.raw.set(
      'accounts',
      'enc:{"accounts":[{"id":"a","name":"Studio","credentials":{"key":"k","secret":"s"}}],"activeId":42}',
    )

    expect(createSettingsStore(adapter).accounts()).toEqual([
      { id: 'a', name: 'Studio', active: true },
    ])
  })

  it('keeps the accounts that still parse when one entry is broken', () => {
    adapter.raw.set(
      'accounts',
      'enc:{"accounts":[{"id":"a","name":"Studio","credentials":{"key":"k","secret":"s"}},{"id":"b"}],"activeId":"a"}',
    )

    expect(createSettingsStore(adapter).accounts()).toEqual([
      { id: 'a', name: 'Studio', active: true },
    ])
  })

  it('reads a blank pair as unconfigured', () => {
    adapter.raw.set(
      'accounts',
      'enc:{"accounts":[{"id":"a","name":"Studio","credentials":{"key":"","secret":""}}],"activeId":"a"}',
    )
    const store = createSettingsStore(adapter)

    expect(store.readCredentials()).toBeNull()
    expect(store.hasCredentials()).toBe(false)
  })

  it('trims a stored pair, as the input path does', () => {
    adapter.raw.set(
      'accounts',
      'enc:{"accounts":[{"id":"a","name":"Studio","credentials":{"key":"api_k\\n","secret":" s3cr3t "}}],"activeId":"a"}',
    )

    expect(createSettingsStore(adapter).readCredentials()).toEqual({
      key: 'api_k',
      secret: 's3cr3t',
    })
  })

  it('forgets an account on demand', () => {
    const store = storeWithAccount()
    store.removeAccount('id-1')

    expect(store.hasCredentials()).toBe(false)
    expect(store.accounts()).toEqual([])
  })
})

describe('carrying a single-credential install over', () => {
  let adapter: MemoryAdapter

  beforeEach(() => {
    adapter = memoryAdapter()
  })

  // The pair stored by every release before accounts existed. Losing it would sign the user
  // out on upgrade, with no way to get the key back.
  it('reads a lone stored pair as one active account, before any write', () => {
    adapter.raw.set('credentials', 'enc:{"key":"api_k","secret":"s3cr3t"}')
    const store = createSettingsStore(adapter)

    expect(store.readCredentials()).toEqual({ key: 'api_k', secret: 's3cr3t' })
    expect(store.accounts()).toEqual([
      { id: 'account_migrated', name: DEFAULT_ACCOUNT_NAME, active: true },
    ])
  })

  it('names the same account on every read, so callers agree on its id', () => {
    adapter.raw.set('credentials', 'enc:{"key":"api_k","secret":"s3cr3t"}')
    const store = createSettingsStore(adapter)

    expect(store.accounts()[0]?.id).toBe(store.accounts()[0]?.id)
  })

  it('writes the book and drops the old pair when settled', () => {
    adapter.raw.set('credentials', 'enc:{"key":"api_k","secret":"s3cr3t"}')
    const store = createSettingsStore(adapter)
    store.settleAccounts()

    expect(adapter.raw.has('credentials')).toBe(false)
    expect(String(adapter.raw.get('accounts'))).toContain(`"name":"${DEFAULT_ACCOUNT_NAME}"`)
    expect(store.readCredentials()).toEqual({ key: 'api_k', secret: 's3cr3t' })
  })

  // The pair is the only copy of the key. Dropping it before it is safely inside a book means
  // the upgrade this whole migration exists for is what destroys it.
  it('keeps a pair it could not decrypt, rather than dropping it unmigrated', () => {
    adapter.raw.set('credentials', 'garbage')
    const store = createSettingsStore(adapter)

    store.settleAccounts()

    expect(adapter.raw.get('credentials')).toBe('garbage')
    expect(adapter.raw.has('accounts')).toBe(false)
  })

  it('keeps the pair when the keychain cannot encrypt the book it would write', () => {
    adapter.raw.set('credentials', 'enc:{"key":"api_k","secret":"s3cr3t"}')
    const store = createSettingsStore({
      ...adapter,
      encrypt: () => {
        throw new Error('no keychain on this machine')
      },
    })

    // Refusing to launch over a migration that can wait would be worse than postponing it.
    expect(() => store.settleAccounts()).not.toThrow()
    expect(adapter.raw.has('credentials')).toBe(true)
    expect(store.readCredentials()).toEqual({ key: 'api_k', secret: 's3cr3t' })
  })

  /*
   * The pair is the only copy of that key. Erasing it because a book happens to sit beside it
   * destroys a key nothing ever read — the exact loss this migration exists to avoid.
   */
  it('keeps a pair it could not read, even once a book stands beside it', () => {
    adapter.raw.set(
      'accounts',
      'enc:{"accounts":[{"id":"a","name":"Studio","credentials":{"key":"k","secret":"s"}}],"activeId":"a"}',
    )
    adapter.raw.set('credentials', 'garbage')

    createSettingsStore(adapter).settleAccounts()

    expect(adapter.raw.get('credentials')).toBe('garbage')
  })

  it('leaves an existing book alone, and drops the stale pair beside it', () => {
    adapter.raw.set(
      'accounts',
      'enc:{"accounts":[{"id":"a","name":"Studio","credentials":{"key":"k","secret":"s"}}],"activeId":"a"}',
    )
    adapter.raw.set('credentials', 'enc:{"key":"old_k","secret":"old_s"}')

    const store = createSettingsStore(adapter)
    store.settleAccounts()

    expect(store.readCredentials()).toEqual({ key: 'k', secret: 's' })
    expect(store.accounts()).toHaveLength(1)
    // Left behind, it would outlive "remove every account" — a secret nothing erases any more.
    expect(adapter.raw.has('credentials')).toBe(false)
  })

  it('writes nothing when there is nothing at all to carry over', () => {
    const store = createSettingsStore(adapter)
    store.settleAccounts()

    // Runs before the first paint at every launch: it must not touch the disk for nothing.
    expect(adapter.raw.size).toBe(0)
  })
})

describe('resetting', () => {
  /*
   * A write MERGES, and the settings with no default — an accent, an ffmpeg path, a projects
   * folder — have nothing in the defaults to overwrite them. Resetting with a write therefore
   * left exactly the settings it promised to remove.
   */
  it('removes the settings that have no default to fall back on', () => {
    const settings = createSettingsStore(memoryAdapter())
    settings.write({ appearance: { accent: '#ff0000' }, media: { ffmpegPath: '/opt/ffmpeg' } })

    expect(settings.reset()).toEqual(DEFAULT_SETTINGS)
    expect(settings.read().appearance.accent).toBeUndefined()
    expect(settings.read().media.ffmpegPath).toBeUndefined()
  })

  it('tells every window, like any other change', () => {
    const seen: Settings[] = []
    const settings = createSettingsStore(memoryAdapter(), {
      onChange: next => void seen.push(next),
    })

    settings.reset()

    expect(seen).toEqual([DEFAULT_SETTINGS])
  })

  // Accounts live behind their own channels and are not settings; removing one is its own act.
  it('leaves the stored accounts alone', () => {
    const settings = createSettingsStore(memoryAdapter())
    settings.addAccount('Studio', { key: 'k', secret: 's' })

    settings.reset()

    expect(settings.hasCredentials()).toBe(true)
    expect(settings.accounts()).toHaveLength(1)
  })
})
