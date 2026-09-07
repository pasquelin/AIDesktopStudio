import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import type { FSWatcher } from 'node:fs'

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { watchProjectFolder, type WatchOpener } from './folder'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scenario-folder-'))
  await mkdir(join(root, 'assets'))
  await mkdir(join(root, 'documents'))
  await mkdir(join(root, '.index'))
  await writeFile(join(root, '.project.json'), '{}')
  await writeFile(join(root, 'notes.txt'), 'hello')
  return root
}

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
   * What only a real watcher can prove: that the platform's events reach us, and that a real
   * stream of them still collapses into one announcement. The driven test next door picks its
   * own clock, so it can never see two events landing further apart than the debounce.
   *
   * Real timers on purpose — a fake clock advances past a debounce that was never armed, which
   * is a test that passes on a watcher doing nothing.
   *
   * The wait is wall time on a machine that may be building something else: four seconds of it
   * turned `pnpm validate` red about once in twelve. It stays BELOW `TEST_TIMEOUT`
   * (`vitest.config.ts`), or vitest kills the test first and the failure loses the one line that
   * names what went wrong — which is how this defect stayed anonymous for four rounds.
   */
  it('announces what lands in the folder', async () => {
    const root = await project()
    const announce = vi.fn()
    watches.push(watchProjectFolder(root, announce))

    /**
     * The folder was made moments ago and its own creation is still in flight. Drained and
     * forgotten here, because otherwise an announcement `project()` caused would answer for one
     * this case never made: starved of its two writes, the case still passed 8 runs out of 10.
     *
     * 500 ms is measured, not the debounce plus a margin. What bounds it is the LAST leftover
     * arriving, plus the debounce it arms: leftovers land at 3–52 ms, so the cliff sits near
     * 352 ms. Starved, 200 ms still passed 4 times in 6; 350 ms, 500 ms and 1500 ms passed none.
     */
    await new Promise(done => setTimeout(done, 500))
    announce.mockClear()

    await writeFile(join(root, 'one.txt'), '')
    await writeFile(join(root, 'two.txt'), '')
    await vi.waitFor(() => expect(announce).toHaveBeenCalled(), { timeout: 10_000 })

    expect(announce).toHaveBeenCalledTimes(1)
  })

  /**
   * The debounce itself, with no operating system in the loop. Two events inside the window make
   * one announcement, and the second is what clears the first one's timer.
   *
   * Driven rather than provoked, because whether two writes arrive as two events or as one is
   * the platform's decision: when it coalesced them, `clearTimeout` was never reached and two
   * identical runs took different paths through this file.
   */
  it('collapses a burst into one announcement', () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const announce = vi.fn()
    const { open, emit } = driving()
    watches.push(watchProjectFolder('/projects/demo', announce, open))

    emit('one.txt')
    emit('two.txt')
    // Well past the debounce, whatever it is set to: what is asserted is the collapse, not its
    // duration — a test that pinned the delay would fail on every tuning of it.
    vi.advanceTimersByTime(5000)

    expect(announce).toHaveBeenCalledTimes(1)
  })

  /**
   * The reason this filter exists: every git command writes half a dozen files into `.git/`, and
   * the studio rewrites `.index/` on its own account. Announced, each of them makes the panel
   * re-read the folder — and the git panel run git again, which writes into `.git/`.
   */
  it('says nothing about the git folder or the index the studio rebuilds', () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const announce = vi.fn()
    const { open, emit } = driving()
    watches.push(watchProjectFolder('/projects/demo', announce, open))

    emit('.git/index')
    emit('.index/catalog.db')
    vi.advanceTimersByTime(5000)

    expect(announce).not.toHaveBeenCalled()
  })

  /**
   * `.git/HEAD` is the exception, and a commit made in a terminal is why: it moves no file the
   * studio can see, so with `.git/` skipped whole the panel went on offering to record what had
   * just been recorded. HEAD changes on a commit, a checkout and a merge — and on nothing a
   * `git status` does, which is what keeps this from reopening the loop.
   */
  it('announces the one file inside it that says what is checked out', () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const announce = vi.fn()
    const { open, emit } = driving()
    watches.push(watchProjectFolder('/projects/demo', announce, open))

    emit('.git/HEAD')
    vi.advanceTimersByTime(5000)

    expect(announce).toHaveBeenCalledTimes(1)
  })
})
