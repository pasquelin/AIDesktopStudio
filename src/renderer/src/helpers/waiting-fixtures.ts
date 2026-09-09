/**
 * Whether a wait is still standing — read by draining the microtasks, never by a clock: a promise
 * that settles on its own settles within them, and one waiting on a render does not.
 */
export async function stillWaiting(waiting: Promise<unknown>): Promise<boolean> {
  const landed: true[] = []
  void waiting.then(() => landed.push(true))
  for (let turn = 0; turn < 3; turn += 1) await Promise.resolve()
  return landed.length === 0
}
