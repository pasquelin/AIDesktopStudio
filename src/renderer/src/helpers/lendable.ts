/**
 * A value a suite or a headless run swaps for the length of a case, and puts back with the undo
 * it was handed — the picture measurer, the GPU export ports.
 */
export function lendable<T>(initial: T): { lend: (value: T) => () => void; current: () => T } {
  let held = initial
  return {
    lend: value => {
      const previous = held
      held = value
      return () => {
        held = previous
      }
    },
    current: () => held,
  }
}
