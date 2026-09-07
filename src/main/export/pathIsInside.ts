import { isAbsolute, relative, sep } from 'node:path'

/** The project's own bookkeeping — a token, a catalogue, never an export folder. */
export const PROJECT_RESERVED: readonly string[] = ['.git', '.index']

/**
 * Whether `target` sits under `root` — `join` having resolved whatever `..` the name carried.
 *
 * 🛑 The first SEGMENT: `startsWith('..')` refuses a file named `..notes`, and `..${sep}` alone
 * lets the parent folder itself through.
 */
export function pathIsInside(root: string, target: string): boolean {
  const within = relative(root, target)
  return within !== '' && within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within)
}

export function isProjectReserved(within: string): boolean {
  return PROJECT_RESERVED.includes(within.split(sep)[0] ?? '')
}
