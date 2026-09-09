/**
 * Which editor holds which document's live state, for the code that only has an id.
 *
 * `saveDocument` is called with a document id and nothing else: it has no way to reach into the
 * `useRef` a component keeps its engine in, and the pixels of a canvas never leave the side of
 * the line the GPU context is on. Each space registers a GETTER, read at call time — a save can
 * land long after the engine that was open when the tab mounted has been replaced, and it is the
 * current one that holds the state.
 *
 * Written once because the second space to need it copied the first: the guard below is the part
 * worth having in one place, and it is exactly the part a copy gets wrong.
 */
export type HostRegistry<H> = {
  /**
   * Registers a document's host. Returns the undo, which answers whether the entry was DROPPED:
   * a surface with more than the host to let go of — a wait on it, say — has no other way to
   * tell a real teardown from an effect cleaning up after its own replacement.
   */
  hold: (documentId: string, host: () => H | null) => () => boolean
  /** `null` when no document of this kind by that id is open — every other kind, and a closed tab. */
  get: (documentId: string) => H | null
}

export function createHostRegistry<H>(): HostRegistry<H> {
  const hosts = new Map<string, () => H | null>()

  return {
    hold: (documentId, host) => {
      hosts.set(documentId, host)
      return () => {
        // Only if it is still ours: a remount registers the new host before the old effect
        // cleans up, and dropping the entry then would leave the live document unreachable.
        if (hosts.get(documentId) !== host) return false

        hosts.delete(documentId)
        return true
      }
    },
    get: documentId => hosts.get(documentId)?.() ?? null,
  }
}

/**
 * The same arrangement for the thing a window only ever has ONE of.
 *
 * The assistant's confirmer, the generator's form, the place a settled sentence goes: each is
 * mounted by one component, read by code that has no way to reach into it, and taken back down
 * when that component goes. No key, because there is nothing to tell apart — a window has one of
 * each or none, and a module registry is per renderer process, so two windows never collide.
 *
 * Here rather than in a file of its own, because the guard in `hold` is the same guard, for the
 * same reason: three of these were written in one batch, in three spellings, and the third had
 * lost the identity check.
 */
export type MountedHost<H> = {
  /** Declares the host. Returns the way to take it back down. */
  hold: (host: H) => () => void
  /** The host, or `null` when nothing is mounted. `null` is an answer, not a failure. */
  get: () => H | null
}

export function createMountedHost<H>(): MountedHost<H> {
  let mounted: H | null = null

  return {
    hold: host => {
      mounted = host
      return () => {
        // Only if it is still ours, for the reason above: a component torn down after its
        // replacement mounted would otherwise unregister the live one.
        if (mounted === host) mounted = null
      }
    },
    get: () => mounted,
  }
}
