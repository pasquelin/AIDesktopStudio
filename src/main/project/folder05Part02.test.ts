import type { FSWatcher } from 'node:fs'

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { watchProjectFolder, type WatchOpener } from './folder'

describe('following the project folder', () => {
  // `as`: a watcher these tests never listen to, and only `close` is ever called on it. Naming
  // the cast once keeps the two fake openers from each carrying their own.
  const deaf = (): FSWatcher =>
    ({ close: () => undefined, on: () => undefined }) as unknown as FSWatcher

  // An opener whose events this file decides. What the platform really emits is the first case's
  // business; everything below is about what the watcher DOES with an event.
  const driving = (): { open: WatchOpener; emit: (filename: string | null) => void } => {
    let listener: (event: string, filename: string | null) => void = () => undefined
    return {
      open: (_path, _options, given) => {
        listener = given
        return deaf()
      },
      emit: filename => listener('change', filename),
    }
  }

  const watches: { stop: () => void }[] = []

  afterEach(() => {
    for (const watch of watches) watch.stop()
    watches.length = 0
  })

  /**
   * Those two and NOT everything under a dot, which is how the explorer decides what to hide:
   * `.ai-desktop-studio/items.json` holds the prompt, model and seed of every asset, it is deliberately
   * versioned, and the studio rewrites it whenever one is generated. Skipped, the version panel
   * would not know the one file no rescan can rebuild had changed.
   */
  it('announces the hidden files a project actually versions', () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const announce = vi.fn()
    const { open, emit } = driving()
    watches.push(watchProjectFolder('/projects/demo', announce, open))

    emit('.ai-desktop-studio/items.json')
    vi.advanceTimersByTime(5000)

    expect(announce).toHaveBeenCalledTimes(1)
  })

  /**
   * `fs.watch` hands the listener a name on some platforms and `null` on others, and a network
   * volume can name nothing at all. Not knowing what moved is not a reason to stop following the
   * folder: the panel re-reads what it has open either way.
   */
  it('announces when the platform names nothing', () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const announce = vi.fn()
    const { open, emit } = driving()
    watches.push(watchProjectFolder('/projects/demo', announce, open))

    emit(null)
    vi.advanceTimersByTime(5000)

    expect(announce).toHaveBeenCalledTimes(1)
  })

  /**
   * The path a platform without a recursive watch takes — Linux emits one event per watched
   * folder, and older ones refuse `recursive` outright. It cannot be reached on the machine
   * this is written on, which is exactly why the opener is injected: written and never run is
   * the same as not written.
   */
  it('falls back to a flat watch when the platform refuses a recursive one', () => {
    const opened: { recursive?: boolean }[] = []
    const fake = (_path: string, options: { recursive?: boolean }) => {
      opened.push(options)
      if (options.recursive) throw new Error('not supported')
      return deaf()
    }

    const watch = watchProjectFolder('/projects/demo', vi.fn(), fake)
    watches.push(watch)

    expect(opened).toEqual([{ recursive: true }, {}])
  })

  // A folder that cannot be watched is not a folder that cannot be read: the panel still lists
  // it, and the read on refocus is what keeps it current.
  it('gives up quietly when even a flat watch is refused', async () => {
    const announce = vi.fn()
    const refuse = (): FSWatcher => {
      throw new Error('not supported')
    }

    const watch = watchProjectFolder('/projects/demo', announce, refuse)
    watches.push(watch)

    expect(() => watch.stop()).not.toThrow()
    expect(announce).not.toHaveBeenCalled()
  })
})
