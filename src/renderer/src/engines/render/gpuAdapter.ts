/**
 * Whether this machine has a WebGPU adapter at all.
 *
 * 🛑 `navigator.gpu?.requestAdapter()` answering is the ONE signal that decides. `adapter.info`
 * can enrich a sentence shown to a person, and must never enter the decision: the vendor and
 * device strings are not standardised in a way that holds across platforms.
 *
 * Asked once and remembered: a viewport mounts per panel, and an adapter request per mount
 * would ask the driver the same question a dozen times an opening.
 */

/** `null` before anybody asked. A viewport reads it without waiting — see `askedGpuAdapter`. */
let answered: boolean | null = null
let asking: Promise<boolean> | null = null

/** What the last probe found, or `null` while nobody has asked yet. Never waits. */
export function askedGpuAdapter(): boolean | null {
  return answered
}

/**
 * Asks the browser, once. A refusal, a throw and a browser with no `navigator.gpu` at all are
 * one answer here: none of the three can draw, and the caller has one fallback either way.
 */
export async function probeGpuAdapter(): Promise<boolean> {
  if (answered !== null) return answered
  asking ??= askAdapter()
  return await asking
}

async function askAdapter(): Promise<boolean> {
  try {
    answered = (await navigator.gpu?.requestAdapter()) != null
  } catch {
    // A browser that exposes `navigator.gpu` and refuses to answer has no adapter to give: the
    // reason belongs to the console, and the studio's answer to all of them is the same.
    answered = false
  }
  return answered
}

/** For a test that has to open on a known answer. Production never calls it. */
export function forgetGpuAdapter(): void {
  answered = null
  asking = null
}
