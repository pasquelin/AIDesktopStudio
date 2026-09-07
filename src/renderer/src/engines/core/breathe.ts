/** A macrotask hop, so a worker's loop sees a cancellation that arrived between two slices. */
export function breathe(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}
