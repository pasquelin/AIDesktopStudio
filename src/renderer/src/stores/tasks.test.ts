import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskProgress } from '@shared/domain/taskProgress'
import { installFakeBridge } from '@/services/fakeBridge'
import { runTask, useTasks } from './tasks'

beforeEach(() => {
  useTasks.setState({ running: {} })
  installFakeBridge()
})

describe('a long task in flight', () => {
  it('shows a row for as long as it runs, and takes it away when it ends', async () => {
    let release = (): void => {}
    const running = runTask(
      'Coucher',
      () =>
        new Promise<string>(resolve => {
          release = () => resolve('Coucher')
        }),
    )

    expect(Object.values(useTasks.getState().running)).toEqual([
      expect.objectContaining({ label: 'Coucher', ratio: 0 }),
    ])

    release()
    await expect(running).resolves.toBe('Coucher')
    expect(useTasks.getState().running).toEqual({})
  })

  it('moves the needle as the work reports it', async () => {
    const seen: number[] = []

    await runTask('Coucher', (_id, watch) => {
      watch.onStep?.(3, 6)
      seen.push(Object.values(useTasks.getState().running)[0]?.ratio ?? -1)
      return Promise.resolve(null)
    })

    expect(seen).toEqual([0.5])
  })

  /** A failure is reported by whoever asked; a row left behind would be a bar nothing removes. */
  it('takes the row away when the work throws, and lets the failure through', async () => {
    await expect(runTask('Coucher', () => Promise.reject(new Error('no channel')))).rejects.toThrow(
      'no channel',
    )

    expect(useTasks.getState().running).toEqual({})
  })
})

describe('stopping one', () => {
  it('aborts the work here and tells the main process, under the same name', async () => {
    const cancel = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ tasks: { cancel } })

    const seen: AbortSignal[] = []
    const running = runTask('Bande', (_id, watch) => {
      if (watch.signal) seen.push(watch.signal)
      return new Promise<string>(() => {})
    })

    const [row] = Object.values(useTasks.getState().running)
    useTasks.getState().cancelTask(row?.id ?? '')

    expect(seen[0]?.aborted).toBe(true)
    expect(cancel).toHaveBeenCalledWith(row?.id)
    void running
  })

  /**
   * Measured on screen: a native dialog cannot be dismissed from this side, so an import waiting
   * on one kept its row turning at 0 % for the rest of the session — pressed stop or not.
   */
  it('takes the row away at the press, without waiting for the other side to answer', async () => {
    const running = runTask('Bande', () => new Promise<string>(() => {}))

    const [row] = Object.values(useTasks.getState().running)
    useTasks.getState().cancelTask(row?.id ?? '')

    await expect(running).resolves.toBeNull()
    expect(useTasks.getState().running).toEqual({})
  })

  /**
   * A stop is a decision, not a fault: answering `null` is what every caller here already
   * answers for a dismissed dialog, so nothing downstream has to learn a second shape.
   */
  it('answers nothing rather than the throw the loop unwound with', async () => {
    const running = runTask(
      'Coucher',
      (_id, watch) =>
        new Promise<string>((_resolve, reject) => {
          watch.signal?.addEventListener('abort', () => reject(new Error('aborted mid-face')))
        }),
    )

    const [row] = Object.values(useTasks.getState().running)
    useTasks.getState().cancelTask(row?.id ?? '')

    await expect(running).resolves.toBeNull()
    expect(useTasks.getState().running).toEqual({})
  })
})

describe('what the main process reports', () => {
  /**
   * The last chunk of a bundle and its answer cross: a row re-created by a late step would sit
   * at 100 % for the rest of the session with nothing left to remove it.
   */
  it('ignores a step for a task that has already ended', () => {
    let push = (_progress: TaskProgress): void => {}
    installFakeBridge({
      tasks: {
        onProgress: callback => {
          push = callback
          return () => {}
        },
      },
    })

    const stop = useTasks.getState().connect()
    push({ id: 'gone', ratio: 0.5 })

    expect(useTasks.getState().running).toEqual({})
    stop()
  })

  it('writes nothing for a step that moves neither the ratio nor the phase', () => {
    let push = (_progress: TaskProgress): void => {}
    installFakeBridge({
      tasks: {
        onProgress: callback => {
          push = callback
          return () => {}
        },
      },
    })
    const stop = useTasks.getState().connect()
    useTasks.getState().begin({ id: 'reading', label: 'Bande', ratio: 0 })

    push({ id: 'reading', ratio: 0.25 })
    const moved = useTasks.getState().running
    push({ id: 'reading', ratio: 0.25 })

    // The same object, not an equal one: a bundle steps thousands of times per visible percent,
    // and every fresh state here re-renders every subscriber of this store.
    expect(useTasks.getState().running).toBe(moved)
    useTasks.getState().end('reading')
    stop()
  })
})
