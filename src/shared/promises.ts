/**
 * The value a promise settles on, or `fallback` where it refused — and where there was no promise
 * to begin with.
 *
 * Written because `await thing().catch(() => null)` is banned: under an `await`, a chain hides a
 * `try` nobody can see, and the repository counted 54 of them. What it replaces is an EXPRESSION,
 * so the `try/catch` it would otherwise become — four lines and a `let` — is worse in every one
 * of the 54.
 *
 * Two things it deliberately does, both visible at the call site:
 *
 * `undefined` in also answers `fallback`. Almost every caller reaches through an optional bridge
 * (`getBridge()?.…`), where a window with no bridge and a bridge that refused are the same
 * outcome — a value nobody could read. Callers that need to tell them apart have a `try/catch`.
 *
 * `fallback` is a VALUE, evaluated whether or not it is needed. A fallback expensive enough to
 * mind is a sign the caller wants a `try/catch`, not this.
 */
export async function orElse<T>(promise: Promise<T> | undefined, fallback: T): Promise<T> {
  if (!promise) return fallback

  try {
    return await promise
  } catch {
    return fallback
  }
}

/**
 * Settles when `ready` answers true — woken by the subscriptions given, never by a clock.
 *
 * Written because three sites needed the same shape: a caller told something is done before it
 * is. Each subscription hands back its own way to let go, and every one is dropped on settling.
 *
 * 🛑 No clock, and none is wanted: every wake-up here is an event of the studio — an engine
 * handed a state, a panel mounted, a viewport taken down — and each wait is written so that
 * going away is one of them. A timeout would answer "not yet" as if it were "no".
 */
export function waitUntil(
  ready: () => boolean,
  subscriptions: readonly ((wake: () => void) => () => void)[],
): Promise<void> {
  if (ready()) return Promise.resolve()

  return new Promise(resolve => {
    const dropped: (() => void)[] = []
    let settled = false
    const settle = (): void => {
      settled = true
      for (const drop of dropped) drop()
      resolve()
    }
    const wake = (): void => {
      if (ready()) settle()
    }
    for (const subscribe of subscriptions) {
      // Pushed before the next one is registered: a subscription that wakes AS it registers would
      // otherwise settle over a list holding none of the subscriptions after it.
      dropped.push(subscribe(wake))
      if (settled) return
    }
    // Asked again with everything subscribed: a condition that came true between the two would
    // otherwise wait for a wake-up that has already been and gone.
    if (!settled) wake()
  })
}
