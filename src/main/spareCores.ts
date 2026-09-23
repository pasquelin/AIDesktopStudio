import { availableParallelism } from 'node:os'

/**
 * How many cores a background walk or a pool may take — `hardwareConcurrency − 2`, CLAUDE.md § 6.
 *
 * Named once because three services now bound themselves by it, and a fourth spelling of the
 * same subtraction is how one of them ends up taking the machine while the window waits.
 */
export const spareCores = (): number => Math.max(1, availableParallelism() - 2)
