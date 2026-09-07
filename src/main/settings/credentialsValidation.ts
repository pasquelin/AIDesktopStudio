import { z } from 'zod'
import { ACCOUNT_NAME_MAX_LENGTH } from '@shared/domain/account'
import {
  isCloudProviderId,
  SCENARIO_CLOUD,
  type CloudAuth,
  type CloudProviderId,
} from '@shared/domain/aiCloud'
import type { AccountBook, Credentials } from './accounts'

const credential = z.string().trim().min(1)

export function parseCredentials(
  key: unknown,
  secret: unknown,
  auth: CloudAuth = 'key-secret',
): Credentials {
  return auth === 'key'
    ? { key: credential.parse(key), secret: '' }
    : { key: credential.parse(key), secret: credential.parse(secret) }
}

export function parseCloudProviderId(value: unknown): CloudProviderId {
  if (value === undefined || value === null || value === '') return SCENARIO_CLOUD
  if (!isCloudProviderId(value)) throw new Error(`unknown cloud: ${String(value)}`)
  return value
}

const storedCredentials = z.object({ key: credential, secret: z.string().trim() })

export function parseStoredCredentials(plain: string): Credentials | null {
  const parsed = storedCredentials.safeParse(JSON.parse(plain))
  return parsed.success ? parsed.data : null
}

const accountName = z.string().trim().min(1).max(ACCOUNT_NAME_MAX_LENGTH)
const accountId = z.string().trim().min(1)

export function parseAccountName(value: unknown): string {
  return z.string().parse(value)
}

export function parseAccountId(value: unknown): string {
  return accountId.parse(value)
}

const storedAccount = z.object({
  id: accountId,
  name: accountName,
  credentials: storedCredentials,
  providerId: z.string().min(1).optional(),
})

const storedBook = z.object({
  accounts: z.array(storedAccount.nullable().catch(null)),
  activeByProvider: z.record(z.string().min(1), z.string().min(1)).catch({}).optional(),
  activeId: z.string().min(1).nullable().catch(null).optional(),
})

export function parseStoredAccounts(plain: string): AccountBook | null {
  const parsed = storedBook.safeParse(JSON.parse(plain))
  if (!parsed.success) return null
  const migrated = parsed.data.activeId ? { [SCENARIO_CLOUD]: parsed.data.activeId } : {}
  return {
    accounts: parsed.data.accounts.filter(entry => entry !== null),
    activeByProvider: parsed.data.activeByProvider ?? migrated,
  }
}
