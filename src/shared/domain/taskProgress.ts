/**
 * What a long task in flight says, on both sides of the boundary.
 *
 * Invariant 6 asks two things of every one of them, not one: it reports how far along it is, and
 * it can be stopped. Only the video render answered either, and it had nowhere to say so.
 *
 * A TASK, not an export: the same table carries the video render, the three writes, and reading a
 * bundle back in — a name saying « export » would lie about two of the five.
 */

/**
 * Handed to whatever does the work, wherever its loop lives — a face at a time in the window, a
 * chunk at a time in the bundle's own process. Both optional: a caller with nobody watching would
 * otherwise have to invent one.
 */
export type TaskWatch = {
  /** Called as each unit lands. `total` is whatever the loop counts — faces, pictures, bytes. */
  onStep?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * What the main process pushes back while it works. Only the needle: the window minted the row
 * and already holds its name, and echoing it would let the two disagree.
 */
export type TaskProgress = { id: string; ratio: number; phase?: string }

/**
 * A share of the work, with nothing to divide by answered as nothing done — a bundle whose media
 * are all empty files, or a target that resolved to no picture. `0/0` is `NaN`, which a progress
 * bar draws as an empty track and a percentage prints as `NaN %`.
 */
export function taskRatio(done: number, total: number): number {
  return total > 0 ? done / total : 0
}

/** The floor under a report, for the task small enough that a hundredth of it is a few bytes. */
export const PROGRESS_STEP = 4 * 1024 * 1024

/**
 * A reporter that speaks every four mebibytes at most, and always for the last byte. A rush
 * arrives a mebibyte at a time, and a gigabyte would push a thousand reports through two process
 * boundaries to move a bar that shows a hundred states.
 */
export function steppedProgress(
  total: number,
  onStep: TaskWatch['onStep'],
): (bytes: number) => void {
  const step = Math.max(PROGRESS_STEP, Math.floor(total / 100))
  let done = 0
  let told = 0

  return bytes => {
    done += bytes
    if (done - told < step && done < total) return
    told = done
    onStep?.(done, total)
  }
}
