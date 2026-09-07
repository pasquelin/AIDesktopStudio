import { SRGBColorSpace } from 'three'
import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import type { EnvironmentDress } from '@shared/domain/skybox'
import type { TextureCache } from '../scene/textureCache'
import type { ViewportEnvironment } from './environment'

export type SkyBinding = {
  /**
   * Shows what the document asks for, loading the sky if it is one. Safe to call on every apply.
   * `null` is the procedural studio — a scene naming a sky whose file has not landed asks for it
   * too, since the studio is what it must be lit by until then.
   */
  apply: (environment: ViewportEnvironment, wanted: EnvironmentDress | null) => Promise<void>
  /**
   * Asks again for the sky it shows, and loads it afresh if the catalogue says the file was
   * rewritten since. Nothing at all otherwise, and nothing before the first `apply`.
   */
  refresh: () => Promise<void>
  /** Whether a sky owns the background — true from the moment one is asked for, not once it decodes. */
  showsSky: () => boolean
  /** Gives the reference back. The viewport is going away, or is being shown something else. */
  release: () => void
}

/**
 * The references a viewport holds on the sky it displays, and the two-step way a sky is shown:
 * the picture at once, the prefiltered reflections when it has decoded.
 *
 * Written once for the two viewports that light themselves this way. The order of operations is
 * the whole subtlety — a sky released before its replacement is in place is disposed while still
 * bound to `scene.background`, and three.js re-uploads it on the next frame with nothing left to
 * free it. Two copies of that would be one copy too many.
 *
 * `paintBackground` is what a viewport does when no sky is shown: `setStudio` lights the scene
 * but hangs nothing behind it, so without this the backdrop stays whatever was there — black.
 */
export function createSkyBinding(cache: TextureCache, paintBackground: () => void): SkyBinding {
  /**
   * A reference the cache is holding for us: the asset AND the version it was taken under, which
   * has to be given back exactly as it was asked for — the cache keys on both, so releasing a sky
   * under a stamp that has moved since would free an entry nobody holds and leak the one we do.
   *
   * Carried for the same reason a material slot carries it: a sky and a mesh's base map can be
   * the same file, and two spellings of the same reference would decode it twice.
   */
  type Held = { assetId: string; version: string | undefined }

  /**
   * Settles the races, and does it by IDENTITY rather than by asset id: two loads of the SAME sky
   * can be in flight at once now that a rewritten file is a change — the picture and its
   * replacement — and comparing ids would let whichever decodes last win, which is the pre-edit
   * one about half the time. `texture-binding` settles its own races the same way.
   */
  let wanted: Held | null = null
  /** What the last `apply` was given, so a refresh can play it again. */
  let last: { environment: ViewportEnvironment; asked: EnvironmentDress | null } | null = null
  /** What `scene.background` holds, which is not what was last asked for while one decodes. */
  let shown: Held | null = null
  /** Every reference a decode still carries: one name could hold only the last of them. */
  const inFlight = new Map<symbol, Held>()

  const give = (held: Held): void => cache.release(held.assetId, SRGBColorSpace, held.version)

  const release = (): void => {
    if (shown) give(shown)
    // Drained here rather than left to each continuation: the viewport may be going away, and a
    // reference handed back a decode later is one held too long.
    for (const held of inFlight.values()) give(held)
    inFlight.clear()
    shown = null
    wanted = null
  }

  const showStudio = (environment: ViewportEnvironment): void => {
    release()
    environment.setTexture(null)
    environment.setStudio()
    paintBackground()
  }

  const loadSky = async (environment: ViewportEnvironment, held: Held): Promise<void> => {
    const token = Symbol(held.assetId)
    inFlight.set(token, held)
    const loaded = await cache.acquire(held.assetId, SRGBColorSpace, held.version)
    if (!inFlight.delete(token)) return
    if (!loaded) {
      if (wanted === held) wanted = null
      return
    }
    if (wanted !== held) {
      give(held)
      return
    }
    environment.setTexture(loaded)
    environment.refresh()
    paintBackground()
    const previous = shown
    shown = held
    if (previous) give(previous)
  }

  const apply = async (
    environment: ViewportEnvironment,
    asked: EnvironmentDress | null,
  ): Promise<void> => {
    last = { environment, asked }
    const assetId = asked?.assetId ?? null
    const version = assetId === null ? undefined : cache.versionOf(assetId)
    environment.setAdjustments(asked?.adjustments ?? NEUTRAL_ADJUSTMENTS)
    if (assetId === (wanted?.assetId ?? null) && version === wanted?.version) return

    if (!assetId) {
      showStudio(environment)
      return
    }

    const held: Held = { assetId, version }
    wanted = held
    await loadSky(environment, held)
  }

  return {
    // Either: a sky still decoding must not have its backdrop repainted underneath it, and one
    // already painted still owns the background even when the sky asked for after it failed.
    showsSky: () => wanted !== null || shown !== null,
    release,
    apply,
    // Played again rather than compared here: `apply` is what knows whether the version moved,
    // and a viewport that has shown nothing yet has nothing to ask for.
    refresh: () => (last ? apply(last.environment, last.asked) : Promise.resolve()),
  }
}
