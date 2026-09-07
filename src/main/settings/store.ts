import { randomUUID } from 'node:crypto'
import type { AccountSummary } from '@shared/domain/account'
import { SCENARIO_CLOUD, type CloudProviderId } from '@shared/domain/aiCloud'
import { DEFAULT_SETTINGS, type PartialSettings, type Settings } from '@shared/domain/settings'
import {
  AccountError,
  activateAccount,
  activeCredentials,
  addAccount,
  credentialsByFingerprint,
  credentialsFor,
  bookFromCredentials,
  EMPTY_BOOK,
  removeAccount,
  renameAccount,
  settleBook,
  summariesOf,
  type AccountBook,
  type Credentials,
} from './accounts'
import { grandfatherOnboarding } from '@shared/domain/welcome'
import { parseStoredAccounts, parseStoredCredentials, salvagePartialSettings } from './validation'
export type PersistenceAdapter = {
  read: <T>(key: string) => T | undefined
  write: (key: string, value: unknown) => void
  remove: (key: string) => void
  encrypt: (plain: string) => string
  decrypt: (encrypted: string) => string
  path: () => string
}
export type AccountChange = {
  accounts: AccountSummary[]
  credentialsChanged: boolean
}
export type KeyedAccount = {
  id: string
  name: string
  credentials: Credentials
  providerId?: CloudProviderId
}
export type SettingsStore = {
  read: () => Settings
  write: (partial: PartialSettings) => Settings
  reset: () => Settings
  accounts: () => AccountSummary[]
  keyedAccounts: () => KeyedAccount[]
  addAccount: (
    name: string,
    credentials: Credentials,
    providerId?: CloudProviderId,
  ) => AccountChange
  renameAccount: (id: string, name: string) => AccountChange
  removeAccount: (id: string) => AccountChange
  activateAccount: (id: string) => AccountChange
  hasCredentials: () => boolean
  settleAccounts: () => void
  readCredentials: () => Credentials | null
  readCredentialsFor: (provider: CloudProviderId) => Credentials | null
  credentialsOf: (fingerprint: string) => Credentials | null
  subscribe: (listener: (settings: Settings) => void) => () => void
  path: () => string
}
const SETTINGS_KEY = 'settings'
const CREDENTIALS_KEY = 'credentials'
const ACCOUNTS_KEY = 'accounts'
const MIGRATED_ACCOUNT_ID = 'account_migrated'
function movedKey(before: AccountBook, after: AccountBook): boolean {
  const from = activeCredentials(before)
  const to = activeCredentials(after)
  return from?.key !== to?.key || from?.secret !== to?.secret
}
export function mergedSettings(base: Settings, partial: PartialSettings): Settings {
  return {
    general: { ...base.general, ...partial.general },
    ai: { ...base.ai, ...partial.ai },
    home: { ...base.home, ...partial.home },
    workspaces: { ...base.workspaces, ...partial.workspaces },
    input: { ...base.input, ...partial.input },
    appearance: { ...base.appearance, ...partial.appearance },
    generation: { ...base.generation, ...partial.generation },
    storage: { ...base.storage, ...partial.storage },
    three: { ...base.three, ...partial.three },
    shortcuts: { ...base.shortcuts, ...partial.shortcuts },
    media: { ...base.media, ...partial.media },
    git: { ...base.git, ...partial.git },
    advanced: { ...base.advanced, ...partial.advanced },
    assistant: { ...base.assistant, ...partial.assistant },
    mcp: { ...base.mcp, ...partial.mcp },
    onboarding: { ...base.onboarding, ...partial.onboarding },
    dictation: { ...base.dictation, ...partial.dictation },
  }
}
export type SettingsStoreOptions = {
  onChange?: (settings: Settings) => void
  defaults?: Settings
  newAccountId?: () => string
}
export function createSettingsStore(
  adapter: PersistenceAdapter,
  {
    onChange,
    defaults = DEFAULT_SETTINGS,
    newAccountId = () => `account_${randomUUID()}`,
  }: SettingsStoreOptions = {},
): SettingsStore {
  let cached: Settings | null = null
  const frozen = (settings: Settings): Settings => {
    for (const section of Object.values(settings)) Object.freeze(section)
    return Object.freeze(settings)
  }
  const read = (): Settings => {
    if (cached) return cached
    const salvaged = salvagePartialSettings(adapter.read(SETTINGS_KEY))
    let settings = frozen(mergedSettings(defaults, salvaged))
    const stamp = grandfatherOnboarding(salvaged, new Date().toISOString())
    if (stamp) {
      settings = frozen(mergedSettings(settings, { onboarding: stamp }))
      adapter.write(SETTINGS_KEY, settings)
    }
    cached = settings
    return cached
  }
  const forgetSettings = (): void => {
    cached = null
  }
  const readRaw = (key: string): string | null => adapter.read<string>(key) ?? null
  const decrypted = (raw: string): string | null => {
    try {
      return adapter.decrypt(raw)
    } catch {
      return null
    }
  }
  const decrypt = <T>(raw: string, parse: (plain: string) => T | null): T | null => {
    const plain = decrypted(raw)
    if (plain === null) return null
    try {
      return parse(plain)
    } catch {
      return null
    }
  }
  type StoredBook =
    | {
        held: 'none'
      }
    | {
        held: 'locked'
      }
    | {
        held: 'corrupt'
      }
    | {
        held: 'book'
        book: AccountBook
      }
  const storedBook = (): StoredBook => {
    const raw = readRaw(ACCOUNTS_KEY)
    if (!raw) return { held: 'none' }
    const plain = decrypted(raw)
    if (plain === null) return { held: 'locked' }
    try {
      const book = parseStoredAccounts(plain)
      return book ? { held: 'book', book } : { held: 'corrupt' }
    } catch {
      return { held: 'corrupt' }
    }
  }
  const persistedBook = (): AccountBook => {
    const stored = storedBook()
    if (stored.held === 'book') return stored.book
    if (stored.held !== 'none') return EMPTY_BOOK
    const lone = readRaw(CREDENTIALS_KEY)
    const credentials = lone && decrypt(lone, parseStoredCredentials)
    return credentials ? bookFromCredentials(credentials, MIGRATED_ACCOUNT_ID) : EMPTY_BOOK
  }
  const readBook = (persisted = persistedBook()): AccountBook => settleBook(persisted)
  const writeBook = (book: AccountBook): void => {
    adapter.write(ACCOUNTS_KEY, adapter.encrypt(JSON.stringify(book)))
  }
  const apply = (change: (book: AccountBook) => AccountBook): AccountChange => {
    const stored = storedBook()
    if (stored.held === 'locked') throw new AccountError('store-unreadable')
    const before = readBook(stored.held === 'book' ? stored.book : undefined)
    const after = change(before)
    writeBook(after)
    return { accounts: summariesOf(after), credentialsChanged: movedKey(before, after) }
  }
  const listeners = new Set<(settings: Settings) => void>()
  const announce = (settings: Settings): void => {
    onChange?.(settings)
    for (const listener of listeners) listener(settings)
  }
  return {
    read,
    write: partial => {
      const merged = mergedSettings(read(), partial)
      adapter.write(SETTINGS_KEY, merged)
      forgetSettings()
      announce(merged)
      return merged
    },
    reset: () => {
      adapter.write(SETTINGS_KEY, defaults)
      forgetSettings()
      announce(defaults)
      return defaults
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    accounts: () => summariesOf(readBook()),
    keyedAccounts: () =>
      readBook().accounts.map(account => ({
        id: account.id,
        name: account.name,
        credentials: account.credentials,
        ...(account.providerId ? { providerId: account.providerId } : {}),
      })),
    addAccount: (name, credentials, providerId) =>
      apply(book =>
        addAccount(book, {
          id: newAccountId(),
          name,
          credentials,
          ...(providerId && providerId !== SCENARIO_CLOUD ? { providerId } : {}),
        }),
      ),
    renameAccount: (id, name) => apply(book => renameAccount(book, id, name)),
    removeAccount: id => apply(book => removeAccount(book, id)),
    activateAccount: id => apply(book => activateAccount(book, id)),
    hasCredentials: () => activeCredentials(readBook()) !== null,
    settleAccounts: () => {
      const stored = storedBook()
      if (stored.held === 'locked') return
      const lone = readRaw(CREDENTIALS_KEY)
      const credentials = lone && decrypt(lone, parseStoredCredentials)
      if (stored.held === 'book') {
        if (credentials) adapter.remove(CREDENTIALS_KEY)
        return
      }
      if (!credentials) return
      try {
        writeBook(bookFromCredentials(credentials, MIGRATED_ACCOUNT_ID))
        adapter.remove(CREDENTIALS_KEY)
      } catch {
        return
      }
    },
    readCredentials: () => activeCredentials(readBook()),
    readCredentialsFor: provider => credentialsFor(readBook(), provider),
    credentialsOf: fingerprint => credentialsByFingerprint(readBook(), fingerprint),
    path: adapter.path,
  }
}
