import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewDocumentAnswer, NewDocumentAsk } from '@shared/domain/newDocument'
import { CHANNELS } from '@shared/ipc'

const handlers = vi.hoisted(
  () => new Map<string, (event: unknown, ...args: never[]) => Promise<unknown>>(),
)
const opened = vi.hoisted(() => ({ window: null as FakeWindow | null, count: 0 }))

vi.mock('@main/ipc/handle', () => ({
  handle: (channel: string, handler: (event: unknown, ...args: never[]) => Promise<unknown>) => {
    handlers.set(channel, handler)
  },
}))

vi.mock('./windows', () => ({
  openNewDocumentWindow: () => {
    opened.count += 1
    // Reveal-or-build, as `openAuxiliaryWindow` does: a destroyed window is replaced.
    if (opened.window?.isDestroyed() !== false) opened.window = fakeWindow()
    return opened.window
  },
}))

const { registerNewDocumentWindow } = await import('./newDocument')

/** A window, or the studio's own web contents: both are watched by `once` and both can go. */
type FakeEmitter = {
  once: (event: string, listener: () => void) => void
  isDestroyed: () => boolean
  /** Plays what Electron does when this goes away. */
  shut: (event: string) => void
}

type FakeWindow = FakeEmitter & { destroy: () => void; destroyed: number }

function fakeEmitter(): FakeEmitter {
  const listeners = new Map<string, (() => void)[]>()
  let gone = false

  return {
    once: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    isDestroyed: () => gone,
    shut: event => {
      gone = true
      for (const listener of listeners.get(event) ?? []) listener()
    },
  }
}

function fakeWindow(): FakeWindow {
  const emitter = fakeEmitter()
  const window: FakeWindow = {
    ...emitter,
    destroy: () => {
      window.destroyed += 1
      emitter.shut('closed')
    },
    destroyed: 0,
  }

  return window
}

const ASK: NewDocumentAsk = {
  kind: 'scene',
  surface: '3d',
  picked: 'documents',
  projectName: 'One',
  recentProjects: [],
  open: [],
}

const MADE: NewDocumentAnswer = {
  answer: 'made',
  place: { kind: 'scene', title: 'Niveau', folder: 'documents' },
}

let studio = fakeEmitter()

const ask = (): Promise<NewDocumentAnswer | null> =>
  handlers.get(CHANNELS.newDocumentAsk)?.(
    { sender: studio },
    ASK as never,
  ) as Promise<NewDocumentAnswer | null>

const answer = (given: NewDocumentAnswer | null): Promise<unknown> | undefined =>
  handlers.get(CHANNELS.newDocumentAnswer)?.(null, given as never)

const request = (): Promise<unknown> | undefined =>
  handlers.get(CHANNELS.newDocumentRequest)?.(null)

describe('registerNewDocumentWindow', () => {
  beforeEach(() => {
    handlers.clear()
    opened.window = null
    opened.count = 0
    studio = fakeEmitter()
    registerNewDocumentWindow()
  })

  it('hands the open window what it was asked', async () => {
    const asked = ask()

    await expect(request()).resolves.toEqual(ASK)

    void answer(null)
    await asked
  })

  it('answers the studio what the window answers, and takes it down', async () => {
    const asked = ask()
    void answer(MADE)

    await expect(asked).resolves.toEqual(MADE)
    expect(opened.window?.destroyed).toBe(1)
  })

  // The whole point of a window rather than a modal: closing it is cancelling.
  it('answers nothing when the window is closed with nothing filled in', async () => {
    const asked = ask()
    opened.window?.shut('closed')

    await expect(asked).resolves.toBeNull()
  })

  // ⌘W on the studio, or a reload in development: nobody is left to answer, and a question left
  // standing would refuse every later one.
  it('lets the question go with the window that asked it', async () => {
    const asked = ask()
    studio.shut('destroyed')

    await expect(asked).resolves.toBeNull()

    // And the next question is taken rather than refused, which is what a question left standing
    // would have done to every one of them.
    const next = ask()
    await expect(request()).resolves.toEqual(ASK)
    expect(opened.count).toBe(2)

    void answer(null)
    await next
  })

  it('has nothing to hand over once the question is settled', async () => {
    const asked = ask()
    void answer(null)
    await asked

    await expect(request()).resolves.toBeNull()
  })

  // One question at a time: a second would be answered by a field already carrying a caret.
  it('refuses a second question while one is up', async () => {
    const first = ask()

    await expect(ask()).resolves.toBeNull()

    void answer(null)
    await first
  })

  // A settled question takes its own window down, and that must not cancel the next one.
  it('keeps a fresh question when the window of the last one goes', async () => {
    const first = ask()
    void answer(null)
    await first

    const second = ask()
    await expect(request()).resolves.toEqual(ASK)

    void answer(MADE)
    await expect(second).resolves.toEqual(MADE)
  })
})
