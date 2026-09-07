/** The fragment one window loads, payload encoded so slashes stay payload. */
export function hashRoute(route: string, payload: string): string {
  return `${route}/${encodeURIComponent(payload)}`
}

/**
 * The payload after `route/` in a window fragment, or nothing.
 *
 * `decodeURIComponent` throws on a malformed escape, and the fragment is the one input this side
 * does not build — a hand-edited URL must open empty rather than white.
 */
export function hashPayload(hash: string, route: string): string | null {
  const rest = hash.replace(/^#/, '')
  const prefix = `${route}/`
  if (!rest.startsWith(prefix)) return null
  const encoded = rest.slice(prefix.length)
  if (encoded === '') return null

  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}
