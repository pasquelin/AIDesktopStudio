import { NoColorSpace, SRGBColorSpace, type ColorSpace, type Texture } from 'three'
import { TEXTURE_SLOTS, type TextureRef, type TextureSlot } from '@shared/domain/scene'
import type { PictureOrientation, TextureCache } from './textureCache'

/**
 * Points the slot at an asset, or at none — `null` is how a slot is emptied and its reference
 * given back. Asking for what it already holds does nothing.
 */
export type TextureBinding = (assetId: string | null) => void

/**
 * One slot of one material, holding one reference on one texture.
 *
 * Loading is asynchronous, so a slot can change its mind while what it asked for is in flight:
 * it holds exactly one reference — on the asset it wants now, loaded or not — and drops any
 * other arrival. That race is the whole reason this is a thing of its own rather than a few
 * lines at each call site.
 *
 * What it holds is the asset AND the version the catalogue gave it: an id does not move when ⌘S
 * overwrites the picture behind it, so comparing ids alone left every scene showing the image the
 * edit replaced until the engine was rebuilt.
 */
export function createTextureBinding(
  cache: TextureCache,
  colorSpace: ColorSpace,
  install: (texture: Texture | null) => void,
  /** `from-image` for the maps of an imported model — see `PictureOrientation`. */
  orientation: PictureOrientation = 'flipY',
): TextureBinding {
  type Wanted = { assetId: string; version: string | undefined }
  let held: Wanted | null = null

  const release = (given: Wanted | null): void => {
    if (given) cache.release(given.assetId, colorSpace, given.version, orientation)
  }

  const load = async (
    wanted: Wanted,
    previous: Wanted | null,
    swapping: boolean,
  ): Promise<void> => {
    const texture = await cache.acquire(wanted.assetId, colorSpace, wanted.version, orientation)
    if (swapping) release(previous)
    if (held !== wanted || !texture) return
    install(texture)
  }

  return assetId => {
    const wanted = assetId === null ? null : { assetId, version: cache.versionOf(assetId) }
    if (held?.assetId === wanted?.assetId && held?.version === wanted?.version) return

    /**
     * The catalogue says nothing about a picture this slot already holds — the shelf is scoped by
     * type, so it legitimately holds rows a slot can name without it, and it
     * is also empty until its first read lands. Kept as it is rather than reloaded: the bare URL
     * is exactly where the stale bitmap sits in the browser's cache, so re-asking would trade a
     * fresh texture for the one it replaced.
     */
    if (wanted && held?.assetId === wanted.assetId && wanted.version === undefined) return

    const previous = held
    held = wanted
    const swapping = previous !== null && wanted !== null && previous.assetId === wanted.assetId
    if (!swapping) {
      release(previous)
      install(null)
    }
    if (!wanted) return

    void load(wanted, previous, swapping)
  }
}

/**
 * The base colour map is authored in sRGB; every other map carries data, not colour, and
 * decoding it would wash out the normals and lighten the roughness.
 */
export function spaceOf(slot: TextureSlot): ColorSpace {
  return slot === 'map' ? SRGBColorSpace : NoColorSpace
}

export type SlotBindings = {
  /** Points every slot at what the maps say, and empties the ones they say nothing about. */
  apply: (maps: Partial<Record<TextureSlot, TextureRef | null>>) => void
  /** Empties them all and gives every reference back. */
  clear: () => void
}

/**
 * The slots of a standard material, each holding one reference, driven as one.
 *
 * What differs between a mesh's own material and a model's overrides is where the texture is
 * WRITTEN, which is the callback — everything around it, down to which colour space each slot
 * reads in, is the same rule twice. Written here so a sixth slot reaches both.
 */
export function createSlotBindings(
  cache: TextureCache,
  orientation: PictureOrientation,
  install: (slot: TextureSlot, texture: Texture | null) => void,
): SlotBindings {
  const slots = TEXTURE_SLOTS.map(slot => ({
    slot,
    bind: createTextureBinding(
      cache,
      spaceOf(slot),
      texture => install(slot, texture),
      orientation,
    ),
  }))

  return {
    apply: maps => {
      for (const { slot, bind } of slots) bind(maps[slot]?.assetId ?? null)
    },
    clear: () => {
      for (const { bind } of slots) bind(null)
    },
  }
}
