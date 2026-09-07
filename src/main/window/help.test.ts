import { describe, expect, it, vi } from 'vitest'
import { WINDOW_PAGES } from '@shared/domain/window'
import { CHANNELS } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, ...args: never[]) => Promise<unknown>>(),
)
const opened = vi.hoisted(() => [] as string[])

vi.mock('@main/ipc/handle', () => ({
  handle: (channel: string, handler: (event: unknown, ...args: never[]) => Promise<unknown>) => {
    handlers.set(channel, handler)
  },
}))

vi.mock('./windows', () => ({
  openManualWindow: () => void opened.push('manual'),
  openLicencesWindow: () => void opened.push('licences'),
  openUsageWindow: () => void opened.push('usage'),
  openJournalWindow: () => void opened.push('journal'),
}))

vi.mock('./welcomeWindow', () => ({
  openWelcomeWindow: () => void opened.push('welcome'),
}))

const { registerHelpWindows } = await import('./help')

describe('the windows a renderer may raise', () => {
  /**
   * One name, one window. A table read by key rather than a chain of `if`, so a page joining the
   * union fails to compile — but nothing would catch two names crossed, which is what this walks
   * the whole union for.
   */
  it('opens the window each page names, and no other', async () => {
    registerHelpWindows()
    const open = handlers.get(CHANNELS.helpOpen)

    for (const page of WINDOW_PAGES) await open?.(null, ...([page] as never[]))

    expect(opened).toEqual([...WINDOW_PAGES])
  })
})
