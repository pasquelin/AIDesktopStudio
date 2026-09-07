import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS, EVENTS } from '@shared/ipc'
import { invoke, invokeFrom, openWindow, quitApp } from '@main/ipc/testHarness'
import { armQuit, registerWindowControls } from './controls'
import { setWindowLanguage } from './language'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

// Once, not per case: `followWindowLanguage` offers no way to unsubscribe, so registering again
// would leave two followers pushing the same event — which is what the strict assertion below
// exists to catch.
beforeAll(() => {
  registerWindowControls()
})

beforeEach(() => {
  setWindowLanguage('fr')
  quitApp.mockClear()
  invoke(CHANNELS.windowResumeLeave, false)
})

describe('the language a window draws in', () => {
  /**
   * Asked instead of resolved on the other side: the setting may say `'system'`, and only this
   * process sees what the machine really prefers. A window working it out from what Chromium
   * shows it would land in a different language from the menu bar above it.
   */
  it('answers the language the native surfaces already speak', async () => {
    setWindowLanguage('en')

    await expect(invoke(CHANNELS.windowLanguage)).resolves.toBe('en')
  })

  // Every window, not the focused one: they all draw their own text. Exactly once each — a
  // second follower would rebuild every window's text for nothing.
  it('reaches every open window when it changes, once', () => {
    const first = openWindow()
    const second = openWindow()

    setWindowLanguage('en')

    for (const window of [first, second])
      expect(window.sent.filter(entry => entry.channel === EVENTS.windowLanguage)).toEqual([
        { channel: EVENTS.windowLanguage, payload: 'en' },
      ])
  })
})

describe('resuming a leave held for unsaved work', () => {
  it('closes the window when the gesture was not a quit', () => {
    const window = openWindow()

    invokeFrom(window, CHANNELS.windowResumeLeave, true)

    expect(window.close).toHaveBeenCalled()
    expect(quitApp).not.toHaveBeenCalled()
  })

  it('quits when the gesture was ⌘Q', () => {
    const window = openWindow()
    armQuit()

    invokeFrom(window, CHANNELS.windowResumeLeave, true)

    expect(quitApp).toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
  })

  it('drops a cancelled leave without closing or quitting', () => {
    const window = openWindow()
    armQuit()

    invokeFrom(window, CHANNELS.windowResumeLeave, false)

    expect(quitApp).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
  })
})
