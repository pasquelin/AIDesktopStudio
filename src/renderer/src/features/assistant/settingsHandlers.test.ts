import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSummary } from '@shared/domain/account'
import { commitmentOfCall } from '@shared/domain/assistant'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { installFakeBridge } from '@/services/fakeBridge'
import { runAction } from './executor'

const ACCOUNTS: AccountSummary[] = [
  { id: 'acc-1', name: 'Studio', active: true },
  { id: 'acc-2', name: 'Perso', active: false },
]

const ENABLED_MCP_SETTINGS = {
  ...DEFAULT_SETTINGS,
  mcp: { ...DEFAULT_SETTINGS.mcp, enabled: true },
}

beforeEach(() => {
  installFakeBridge()
})

describe('the settings', () => {
  it('answers them whole, with what each choice setting accepts', async () => {
    expect(await runAction('settings.read', {})).toEqual({
      ok: true,
      data: {
        settings: DEFAULT_SETTINGS,
        choices: expect.objectContaining({
          'three.shadowQuality': {
            title: 'Shadow softness',
            help: expect.any(String),
            values: ['hard', 'soft'],
          },
        }),
      },
    })
  })

  it('writes one section without restating the others', async () => {
    const write = vi.fn(async () => ENABLED_MCP_SETTINGS)
    installFakeBridge({ settings: { write } })

    await runAction('settings.write', { settings: { mcp: { enabled: true } } })
    expect(write).toHaveBeenCalledWith({ mcp: { enabled: true } })
  })

  /**
   * `write` merges branch by branch, so a branch the studio does not know is carried through
   * unread. Refusing a change that moves nothing is what keeps a misspelt section from being
   * reported as done.
   *
   * The section names now live on the `record` field of the registry and are checked by
   * `validatesInput`, not by the handler: these two cases are the only thing tying the two ends.
   */
  it('refuses a change that names nothing the studio knows', async () => {
    const write = vi.fn(async () => DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })

    expect(
      await runAction('settings.write', { settings: { colours: { accent: 'red' } } }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses a nested setting field the studio did not apply', async () => {
    const write = vi.fn(async () => DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })

    expect(
      await runAction('settings.write', {
        settings: { workspaces: { scene: { grid: { visible: true } } } },
      }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  /**
   * `Object.keys` rather than a membership test, in `fits`: `Object.prototype` answers to these
   * names, and `JSON.parse` hands `__proto__` over as an OWN key — so they reached the merge,
   * vanished in it, and were answered `ok`.
   */
  it('refuses a section that only the prototype answers to', async () => {
    const write = vi.fn(async () => DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })

    for (const section of ['__proto__', 'toString', 'constructor', 'valueOf']) {
      expect(
        await runAction('settings.write', { settings: { [section]: { a: 1 } } }),
      ).toMatchObject({
        ok: false,
        refusal: 'badInput',
      })
    }
    expect(write).not.toHaveBeenCalled()
  })

  /**
   * The refusal the whole delegation rests on. `settings.write` is itself an MCP action, so a
   * client able to write this branch would be granting itself the right not to be asked — which
   * is no delegation at all. Only the settings window arms it.
   */
  it('refuses to let a client arm its own delegation', async () => {
    const write = vi.fn(async () => DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })

    for (const change of [
      { delegateBudget: 500 },
      { delegateFiles: true },
      { delegateRemote: true },
    ]) {
      expect(await runAction('settings.write', { settings: { mcp: change } })).toMatchObject({
        ok: false,
        refusal: 'notAllowed',
      })
    }
    expect(write).not.toHaveBeenCalled()
  })

  // Its neighbour in the same section is ordinary, which is what makes the refusal above narrow.
  it('still lets the entry point itself be switched', async () => {
    const write = vi.fn(async () => ENABLED_MCP_SETTINGS)
    installFakeBridge({ settings: { write } })

    expect(
      await runAction('settings.write', { settings: { mcp: { enabled: true } } }),
    ).toMatchObject({ ok: true })
    expect(write).toHaveBeenCalledWith({ mcp: { enabled: true } })
  })

  // Writing a value that is already set is a legitimate call — a client settling a state it did
  // not read first — and refusing it would make idempotence a failure.
  it('lets a value be written to what it already is', async () => {
    const write = vi.fn(async () => DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })

    expect(
      await runAction('settings.write', { settings: { mcp: { enabled: false } } }),
    ).toMatchObject({ ok: true })
    expect(write).toHaveBeenCalledWith({ mcp: { enabled: false } })
  })
})

describe('the accounts', () => {
  it('lists them, and never a key', async () => {
    installFakeBridge({ accounts: { list: vi.fn(async () => ACCOUNTS) } })

    expect(await runAction('accounts.list', {})).toEqual({ ok: true, data: ACCOUNTS })
  })

  it('switches to one it holds, and refuses an id it does not', async () => {
    const activate = vi.fn(async () => ({ accounts: ACCOUNTS }))
    installFakeBridge({ accounts: { list: vi.fn(async () => ACCOUNTS), activate } })

    expect(await runAction('accounts.activate', { accountId: 'acc-2' })).toMatchObject({ ok: true })
    expect(activate).toHaveBeenCalledWith('acc-2')

    expect(await runAction('accounts.activate', { accountId: 'acc-9' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  // The label alone: neither half of the credential crosses this boundary in either direction.
  it('renames one without either half of its credential crossing', async () => {
    const rename = vi.fn(async () => ({ accounts: ACCOUNTS }))
    installFakeBridge({ accounts: { rename } })

    expect(
      await runAction('accounts.rename', { accountId: 'acc-2', name: 'Studio' }),
    ).toMatchObject({ ok: true })
    expect(rename).toHaveBeenCalledWith('acc-2', 'Studio')
  })
})

describe('the buttons of the settings window', () => {
  it('fires one the registry declares, and refuses a name it does not', async () => {
    const runSettingAction = vi.fn(async () => {})
    installFakeBridge({ settings: { runAction: runSettingAction } })

    expect(
      await runAction('settings.triggerAction', { action: 'advanced.openLogFolder' }),
    ).toMatchObject({
      ok: true,
    })
    expect(runSettingAction).toHaveBeenCalledWith('advanced.openLogFolder')

    expect(
      await runAction('settings.triggerAction', { action: 'advanced.selfDestruct' }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * The two that leave something behind — a `.lua` in another application's folder, and every
   * setting back to its default — are asked about, and the four others are not.
   */
  it('asks first for the two nothing takes back', () => {
    expect(commitmentOfCall('settings.triggerAction', { action: 'advanced.reset' })).toBe('files')
    expect(
      commitmentOfCall('settings.triggerAction', {
        action: 'advanced.installResolveBridge',
      }),
    ).toBe('files')
    expect(commitmentOfCall('settings.triggerAction', { action: 'advanced.openDevtools' })).toBe(
      'none',
    )
  })
})
