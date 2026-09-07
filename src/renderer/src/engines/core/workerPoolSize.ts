/** The ceiling the contract sets for every worker pool: two threads left to the window. */
export function workerPoolSize(): number {
  return Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 3) - 2)
}
