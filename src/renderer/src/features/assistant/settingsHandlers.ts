import { refused, type ActionOutcome } from '@shared/domain/assistant'
import type { PartialSettings } from '@shared/domain/settings'
import { SETTING_ACTION_IDS } from '@shared/domain/settingAction'
import { settingChoices } from '@shared/domain/settingsRegistry'
import { isRecord } from '@shared/guards'
import { getBridge } from '@/services/bridge'
import { withBridge, type ActionHandlers } from './actionHandler'
import { oneOf, recordOf, textOf } from './actionInputs'

const NO_BRIDGE = 'this window is not connected to the studio process'
function includesWrittenValues(held: unknown, asked: unknown): boolean {
  if (Array.isArray(asked))
    return Array.isArray(held) && JSON.stringify(held) === JSON.stringify(asked)
  if (!isRecord(asked)) return held === asked
  if (!isRecord(held)) return false
  return Object.entries(asked).every(([key, value]) => includesWrittenValues(held[key], value))
}

async function write(input: Record<string, unknown>): Promise<ActionOutcome> {
  const asked: PartialSettings | null = recordOf(input, 'settings')
  if (!asked)
    return refused(
      'badInput',
      '"settings" is wanted, as a record of settings sections — settings.read answers the shape it takes',
    )

  // The one branch this action may not touch, and the reason the delegation is worth anything: a
  // client that could raise its own budget or tick its own boxes would be asking itself. Only the
  // settings window arms it — `settings.open` is published, and that is the whole of the way in.
  if (Object.keys(asked.mcp ?? {}).some(key => key.startsWith('delegate'))) {
    return refused(
      'notAllowed',
      'the "delegate" switches of the mcp section are not writable from here — only the settings window arms them, and settings.open raises it',
    )
  }

  const bridge = getBridge()
  if (!bridge) return refused('noBridge', NO_BRIDGE)
  const written = await bridge.settings.write(asked)
  return includesWrittenValues(written, asked)
    ? { ok: true, data: written }
    : refused(
        'badInput',
        'one or more setting fields are unknown or were not applied — settings.read answers the accepted shape',
      )
}

async function activate(input: Record<string, unknown>): Promise<ActionOutcome> {
  const bridge = getBridge()
  if (!bridge) return refused('noBridge', NO_BRIDGE)

  const accountId = textOf(input, 'accountId') ?? ''
  const known = await bridge.accounts.list()
  if (!known.some(account => account.id === accountId))
    return refused(
      'notFound',
      `no account "${accountId}" on this machine — accounts.list answers which there are, with their ids`,
    )

  return { ok: true, data: await bridge.accounts.activate(accountId) }
}

export const SETTINGS_HANDLERS: ActionHandlers = {
  'settings.read': () =>
    withBridge(async bridge => ({
      settings: await bridge.settings.read(),
      choices: settingChoices(),
    })),
  'settings.write': write,
  'accounts.list': () => withBridge(bridge => bridge.accounts.list()),
  'accounts.activate': activate,

  /**
   * The refusal travels IN the answer — an unknown id, a name already taken, the account the
   * `.env` file holds — so `ok` here would be `ok` on a rename that never happened.
   */
  'accounts.rename': async input => {
    const bridge = getBridge()
    if (!bridge) return refused('noBridge', NO_BRIDGE)

    const result = await bridge.accounts.rename(
      textOf(input, 'accountId') ?? '',
      textOf(input, 'name') ?? '',
    )
    return result.failure
      ? refused(
          'notAllowed',
          `the account was not renamed: ${result.failure} — accounts.list answers which there are, with their ids and their names`,
        )
      : { ok: true, data: result.accounts }
  },

  'settings.triggerAction': input => {
    const id = oneOf(input, 'action', SETTING_ACTION_IDS)
    return id
      ? withBridge(bridge => bridge.settings.runAction(id))
      : Promise.resolve(
          refused('badInput', `"action" wants one of: ${SETTING_ACTION_IDS.join(', ')}`),
        )
  },
}
