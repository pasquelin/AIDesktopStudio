import { create } from 'zustand'
import { taskRatio, type TaskWatch } from '@shared/domain/taskProgress'
import { newId } from '@/helpers/ids'
import { withoutKey } from '@/helpers/objects'
import { getBridge } from '@/services/bridge'

/** One long task in flight, as the status line reads it. Window state — it crosses nothing. */
export type TaskRow = {
  /** Minted here, and the name the cancel channel answers to on the other side. */
  id: string
  /** What it is working on — the document's name, or what the task is doing. */
  label: string
  /** 0 to 1 across the whole task. */
  ratio: number
  phase?: string
}

type TasksState = {
  /** What this window is running, by the id it minted for each. */
  running: Record<string, TaskRow>

  /** Follows what the main process reports. Returns the unsubscribe. */
  connect: () => () => void
  /** Stops one, on both sides of the boundary — the loop here, and the work over there. */
  cancelTask: (id: string) => void

  begin: (row: TaskRow) => void
  step: (id: string, ratio: number) => void
  end: (id: string) => void
}

/**
 * The stop of each running task, outside the state: an `AbortController` is not something a
 * component renders, and a store that held one would put it in every snapshot comparison.
 */
const stops = new Map<string, AbortController>()

/**
 * The long tasks in flight — both halves of invariant 6, which nothing but the video render had.
 * A TASK, not an export: the same row carries reading a bundle back in, and the render.
 */
export const useTasks = create<TasksState>()(set => ({
  running: {},

  connect: () =>
    getBridge()?.tasks.onProgress(({ id, ratio, phase }) =>
      set(state => {
        const row = state.running[id]
        // Nothing that has not moved: a bundle steps far more often than a percentage can change,
        // and each write here is a fresh state every subscriber of this store re-renders on.
        return row && (row.ratio !== ratio || row.phase !== phase)
          ? { running: { ...state.running, [id]: { ...row, ratio, phase } } }
          : state
      }),
    ) ?? (() => {}),

  cancelTask: id => {
    // Locally first: the abort unwinds whatever loop is drawing here, and the main process is
    // told in the same breath for the half that is working there.
    stops.get(id)?.abort()
    void getBridge()?.tasks.cancel(id)
  },

  begin: row => set(state => ({ running: { ...state.running, [row.id]: row } })),

  // An id that has ended is ignored — the last chunk of a bundle and its answer cross, and a row
  // re-created by a late step would sit at 100 % with nothing left to remove it. A ratio that has
  // not moved is ignored too: a bundle steps far more often than a percentage can change.
  step: (id, ratio) =>
    set(state => {
      const row = state.running[id]
      return row && row.ratio !== ratio
        ? { running: { ...state.running, [id]: { ...row, ratio } } }
        : state
    }),

  end: id => set(state => ({ running: withoutKey(state.running, id) })),
}))

/** Nothing, once the stop is pressed. Never rejects: a stop is a decision, not a fault. */
const stopped = (signal: AbortSignal): Promise<null> =>
  new Promise(resolve => signal.addEventListener('abort', () => resolve(null), { once: true }))

/**
 * Runs one long task under a row the status line shows and a button that stops it. Answers `null`
 * when it was stopped. `work` is handed the id because the process doing the work answers the
 * stop by that same name; the row goes whichever way it ends, including a throw.
 */
export async function runTask<T>(
  label: string,
  work: (id: string, watch: TaskWatch) => Promise<T>,
): Promise<T | null> {
  const id = newId()
  const controller = new AbortController()
  stops.set(id, controller)
  useTasks.getState().begin({ id, label, ratio: 0 })

  const running = work(id, {
    onStep: (done, total) => useTasks.getState().step(id, taskRatio(done, total)),
    signal: controller.signal,
  })
  // Observed here as well as awaited below, so a failure that arrives after a stop is not an
  // unhandled rejection. It is simply not reported: a stop the person asked for is not a fault.
  void running.catch(() => {})

  try {
    // The press wins the race, rather than the answer to it: a native dialog cannot be dismissed
    // from this side, so an import waiting on one kept its row turning at 0 % for the rest of the
    // session — pressed stop or not. The other side still tidies up when the dialog answers.
    return await Promise.race([running, stopped(controller.signal)])
  } catch (error) {
    // The signal rather than the error's own shape: a loop stopped mid-await throws whatever it
    // was in, and a stop the person asked for is not a fault to report.
    if (controller.signal.aborted) return null
    throw error
  } finally {
    stops.delete(id)
    useTasks.getState().end(id)
  }
}
