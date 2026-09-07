/**
 * Bytes as base64, in bounded slices. `String.fromCharCode(...bytes)` on a 4K picture spreads
 * millions of arguments onto the stack, which throws rather than answering.
 *
 * In `shared/` rather than the renderer: the save path needs it, and so does `domain/relief`,
 * which cannot import `@/` and had written a third copy of both loops.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let at = 0; at < bytes.length; at += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(at, at + 0x8000)))
  }
  return btoa(chunks.join(''))
}

/**
 * The way back — beside the way out, which is the whole point: two modules had written this,
 * under the same name, with two different loops and no test between them.
 *
 * Takes a `data:` URL or bare base64 alike: `indexOf(',')` answers −1 for the second, and
 * `slice(0)` is the whole string. `CanvasEngine.snapshot` hands back the bare form.
 */
export function bytesFromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded.slice(encoded.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
