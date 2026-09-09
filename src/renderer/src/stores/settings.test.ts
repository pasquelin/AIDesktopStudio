import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings, type AuthState } from '@shared/domain/settings'
import { installFakeBridge } from '@/services/fakeBridge'
import { useSettings } from './settings'

const COMPACT: Settings = {
  ...DEFAULT_SETTINGS,
  appearance: { ...DEFAULT_SETTINGS.appearance, density: 'compact' },
}

describe('settings store', () => {
  beforeEach(() => {
    useSettings.setState({ settings: DEFAULT_SETTINGS, loaded: false, authKnown: false })
  })

  it('loads what the main process holds', async () => {
    installFakeBridge({ settings: { read: () => Promise.resolve(COMPACT) } })

    await useSettings.getState().connect()

    expect(useSettings.getState().settings.appearance.density).toBe('compact')
    expect(useSettings.getState().loaded).toBe(true)
  })

  /**
   * The reason the event exists: settings live in the main process, and a window that only
   * refreshed on its own writes would show a theme the settings window changed an hour ago.
   */
  it('follows a change another window made', async () => {
    const listeners: ((settings: Settings) => void)[] = []
    installFakeBridge({
      settings: {
        onChange: callback => {
          listeners.push(callback)
          return () => {}
        },
      },
    })

    await useSettings.getState().connect()
    listeners[0]?.(COMPACT)

    expect(useSettings.getState().settings.appearance.density).toBe('compact')
  })

  it('stops listening when the window it belongs to goes away', async () => {
    const stop = vi.fn()
    installFakeBridge({ settings: { onChange: () => stop } })

    const unsubscribe = await useSettings.getState().connect()
    unsubscribe()

    expect(stop).toHaveBeenCalledOnce()
  })

  /**
   * The auth probe inside `connect` reaches the API, so the wait is a network round trip. A
   * theme changed from the settings window during it must not be undone by the older snapshot.
   */
  it('keeps a change that landed while it was still loading', async () => {
    const listeners: ((settings: Settings) => void)[] = []
    installFakeBridge({
      settings: {
        onChange: callback => {
          listeners.push(callback)
          return () => {}
        },
        read: () => {
          listeners[0]?.(COMPACT)
          return Promise.resolve(DEFAULT_SETTINGS)
        },
      },
    })

    await useSettings.getState().connect()

    expect(useSettings.getState().settings.appearance.density).toBe('compact')
  })

  // Throwing before handing back the unsubscribe would strand the listener for good.
  it('still hands back the way to unsubscribe when the read fails', async () => {
    const stop = vi.fn()
    installFakeBridge({
      settings: {
        onChange: () => stop,
        read: () => Promise.reject(new Error('no settings')),
      },
    })

    const unsubscribe = await useSettings.getState().connect()
    unsubscribe()

    expect(stop).toHaveBeenCalledOnce()
    expect(useSettings.getState().settings).toEqual(DEFAULT_SETTINGS)
  })

  // Subscribing after the read would miss a change landing between the two.
  it('listens before it asks, so nothing slips through the gap', async () => {
    const order: string[] = []
    installFakeBridge({
      settings: {
        onChange: () => {
          order.push('subscribe')
          return () => {}
        },
        read: () => {
          order.push('read')
          return Promise.resolve(DEFAULT_SETTINGS)
        },
      },
    })

    await useSettings.getState().connect()

    expect(order).toEqual(['subscribe', 'read'])
  })

  it('writes one leaf without disturbing the rest', async () => {
    const write = vi.fn(() => Promise.resolve(COMPACT))
    installFakeBridge({ settings: { write } })

    await useSettings.getState().setValue('appearance.density', 'compact')

    expect(write).toHaveBeenCalledWith({ appearance: { density: 'compact' } })
  })

  /**
   * The two waits are not the same wait: the settings come off a file, the key is tried against
   * the API. Applied together, the whole window used to sit on the slower of the two — and every
   * surface reading `auth` in the meantime was reading "no key" as though it were an answer.
   */
  it('applies the settings without waiting for the key to be tried', async () => {
    let answerAuth = (): void => {}
    installFakeBridge({
      settings: {
        read: () => Promise.resolve(COMPACT),
        authState: () =>
          new Promise(resolve => {
            answerAuth = () => resolve({ authenticated: true })
          }),
      },
    })

    const connected = useSettings.getState().connect()
    await vi.waitFor(() => expect(useSettings.getState().loaded).toBe(true))

    expect(useSettings.getState().settings.appearance.density).toBe('compact')
    expect(useSettings.getState().authKnown).toBe(false)

    answerAuth()
    await connected

    expect(useSettings.getState().authKnown).toBe(true)
    expect(useSettings.getState().auth.authenticated).toBe(true)
  })

  it('ignores a startup authentication answer overtaken by an account change', async () => {
    let finish = (): void => {}
    const probe = vi.fn(
      () =>
        new Promise<AuthState>(resolve => {
          finish = () => resolve({ authenticated: false, reason: 'missing' })
        }),
    )
    installFakeBridge({ settings: { authState: probe } })
    const connected = useSettings.getState().connect()
    probe.mockResolvedValue({ authenticated: true })
    await useSettings.getState().refreshAuth()
    finish()
    await connected
    expect(useSettings.getState().auth.authenticated).toBe(true)
  })

  it('leaves the previous answer standing while a new probe is in flight', async () => {
    useSettings.setState({ auth: { authenticated: true }, authKnown: true })
    let finish = (): void => {}
    installFakeBridge({
      settings: {
        authState: () =>
          new Promise<AuthState>(resolve => {
            finish = () => resolve({ authenticated: false, reason: 'missing' })
          }),
      },
    })

    const answered = useSettings.getState().refreshAuth()
    expect(useSettings.getState().authKnown).toBe(true)
    expect(useSettings.getState().auth.authenticated).toBe(true)

    finish()
    await answered
    expect(useSettings.getState().auth.authenticated).toBe(false)
  })

  it('clears the previous authentication when a new probe fails to reach the main process', async () => {
    useSettings.setState({ auth: { authenticated: true }, authKnown: true })
    installFakeBridge({
      settings: {
        authState: async () => {
          throw new Error('IPC unavailable')
        },
      },
    })
    await useSettings.getState().refreshAuth()
    expect(useSettings.getState().auth.authenticated).toBe(false)
    expect(useSettings.getState().authKnown).toBe(true)
  })

  it('survives having no bridge at all, as a plain browser has none', async () => {
    vi.unstubAllGlobals()

    const unsubscribe = await useSettings.getState().connect()

    expect(unsubscribe).toBeTypeOf('function')
    expect(useSettings.getState().loaded).toBe(false)
  })
})
