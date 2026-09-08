import { localizedError } from '@shared/localizedError'
import {
  DataTexture,
  RepeatWrapping,
  Texture,
  UnsignedByteType,
  type ColorSpace,
  type Loader,
} from 'three'
import { assetUrl, versionedUrl } from '@shared/domain/asset'
import { ORA_MERGED_PATH } from '@shared/domain/openRaster'
import { decoderFor, type PictureDecoder } from '@shared/domain/pictureDecoder'
import { createRefCache } from '../core/refCache'

/**
 * Which way up a picture is decoded. `flipY` is the studio's convention; `from-image` is what glTF
 * stores its UVs for, `GLTFLoader` decoding through `ImageBitmapLoader` with no orientation set.
 *
 * Decided HERE and nowhere else: `material.flipY` has no effect at all on an `ImageBitmap`.
 */
export type PictureOrientation = 'flipY' | 'from-image'

/** A port rather than a hard-wired `TextureLoader`, like `SqliteDriver`: jsdom decodes no image. */
export type TextureSource = (url: string, orientation?: PictureOrientation) => Promise<Texture>

/**
 * What `decoderFor` reads. Past the magic numbers, because OpenRaster is told from any other ZIP
 * by the NAME of its first entry, which a local file header writes at byte 30.
 */
const SIGNATURE_BYTES = 64

/**
 * What production hands every engine that decodes a picture. Here rather than at each of them:
 * the port is declared on this line, and three spaces had grown their own identical copy of the
 * one implementation it has.
 *
 * Read once and routed by the BYTES: no browser decodes Radiance or OpenEXR, and an `<img>` handed
 * either lands as a picture of nothing — which is what a sky lit by an `.exr` used to be.
 */
export const loadTexture: TextureSource = async (url, orientation = 'flipY') => {
  const answer = await fetch(url)
  if (!answer.ok) throw localizedError('httpStatus', { url: url, status: answer.status })

  // The BLOB rather than the bytes, and the HEAD of it rather than the whole. Two things ride on
  // that: the served type stays on it — a blob with none renders no SVG at all, `<img>` reading
  // the vector case by the MIME — and an ordinary 4K picture, which is nearly all of them, no
  // longer has a 32 MiB copy of itself made in JavaScript to read sixteen bytes.
  const blob = await answer.blob()
  const decoder = decoderFor(new Uint8Array(await blob.slice(0, SIGNATURE_BYTES).arrayBuffer()))

  // A container rather than a picture: `utif` hands back plain RGBA, which no `<img>` is needed
  // for and no three loader reads. The one path that does need every byte asks for them here.
  if (decoder === 'tiff') return tiffTexture(new Uint8Array(await blob.arrayBuffer()), orientation)

  // A container too, and the picture is INSIDE it — the flatten the standard requires every
  // writer to put there, which is exactly what any other application draws of the file.
  if (decoder === 'openraster') {
    return await bitmapTexture(
      await oraFlatten(new Uint8Array(await blob.arrayBuffer())),
      orientation,
    )
  }

  // HDR/EXR have no `<img>` decoder. PNG/JPEG/WebP go through `createImageBitmap`, which Chromium
  // decodes on a thread that is not this one — `TextureLoader` would decode on the UI thread.
  if (decoder === 'radiance' || decoder === 'openexr') {
    const object = URL.createObjectURL(blob)
    try {
      const texture = await (await loaderFor(decoder)).loadAsync(object)
      // TURNED OVER, never set: each loader answers the flag its own decoder needs — HDR writes
      // its scanlines bottom-up and asks for `true`, EXR has already flipped them and asks for
      // `false`. Written flat, every `.exr` sky came back mirrored.
      if (orientation === 'from-image') texture.flipY = !texture.flipY
      return texture
    } finally {
      URL.revokeObjectURL(object)
    }
  }

  // Flipped HERE, at the decode, because `material.flipY` cannot reach it: `WebGLTextures` skips
  // `UNPACK_FLIP_Y_WEBGL` entirely when the source is an `ImageBitmap`, so the `true` a `Texture`
  // carries by default is a wish nothing grants. Every other decoder of this module lands upright
  // — an equirectangular sky is simply the first picture legible enough to show it.
  return await bitmapTexture(blob, orientation)
}

async function bitmapTexture(source: Blob, orientation: PictureOrientation): Promise<Texture> {
  const texture = new Texture(await createImageBitmap(source, { imageOrientation: orientation }))
  texture.needsUpdate = true
  return texture
}

/**
 * The flatten an OpenRaster carries, as a blob a decoder can read.
 *
 * `mergedimage.png` is REQUIRED by the standard, so its absence is a broken container rather than
 * a picture with none — said out loud, since the slot beside it would otherwise just read empty.
 */
async function oraFlatten(bytes: Uint8Array): Promise<Blob> {
  const merged = (await import('fflate')).unzipSync(bytes, {
    filter: file => file.name === ORA_MERGED_PATH,
  })[ORA_MERGED_PATH]
  if (!merged) throw localizedError('openRasterImageMissing', { path: ORA_MERGED_PATH })

  return new Blob([merged], { type: 'image/png' })
}

/**
 * `loadAsync` rather than `parse` for the two of them: `parse` answers raw texture DATA, and it is
 * `load` that turns it into the `DataTexture` — flags, wrapping and all — that a material can wear.
 * Each parser is imported only when a file actually is one; together they are some 90 Ko.
 */
async function loaderFor(decoder: PictureDecoder | null): Promise<Loader<Texture>> {
  // `HDRLoader`, not the `RGBELoader` every example written before r180 names: that one is a
  // deprecated alias, and constructing it warns on the console at every picture.
  if (decoder === 'radiance') {
    return new (await import('three/addons/loaders/HDRLoader.js')).HDRLoader()
  }
  if (decoder === 'openexr') {
    return new (await import('three/addons/loaders/EXRLoader.js')).EXRLoader()
  }
  throw localizedError('imageDecoderMissing', { format: decoder ?? '' })
}

/**
 * The FIRST image of the container, which is the picture — the ones after it are a scan's further
 * pages or a texture's mip levels, and showing page two for page one would be the wrong answer.
 */
async function tiffTexture(bytes: Uint8Array, orientation: PictureOrientation): Promise<Texture> {
  const { decode, decodeImage, toRGBA8 } = await import('utif')

  const pages = decode(bytes)
  const [first] = pages
  if (!first) throw localizedError('tiffImageMissing')

  decodeImage(bytes, first, pages)
  const texture = new DataTexture(toRGBA8(first), first.width, first.height)
  // A picture, not a table of numbers: `DataTexture` defaults to `RGBAFormat` and `UnsignedByte`,
  // which is what `toRGBA8` answers — only the flip and the update are left to say.
  texture.flipY = orientation === 'flipY'
  texture.needsUpdate = true
  return texture
}

export type TextureCache = {
  /**
   * Takes a reference on an asset read in a given colour space, loading it if nobody holds it
   * yet. Resolves to `null` when the last holder let go before it arrived: a texture nobody
   * wants any more must not come back to life, and the loaded image is freed on the spot.
   */
  acquire: (
    assetId: string,
    colorSpace: ColorSpace,
    version?: string,
    orientation?: PictureOrientation,
  ) => Promise<Texture | null>
  /** Gives a reference back. The texture is freed once the last one goes. */
  release: (
    assetId: string,
    colorSpace: ColorSpace,
    version?: string,
    orientation?: PictureOrientation,
  ) => void
  /**
   * When the file behind this asset was last written, as far as the catalogue knows.
   *
   * Asked HERE rather than passed in by every slot: what holds a reference is a slot pointing at
   * an id, and the id does not move when ⌘S overwrites the picture — see `TextureBinding`, which
   * is what compares one call to the next.
   */
  versionOf: (assetId: string) => string | undefined
  /** Frees everything, whoever still holds it — the engine is going away. */
  dispose: () => void
}

const SEPARATOR = ':'

/**
 * One texture per asset, colour space AND orientation, however many materials point at it. Both
 * belong to the key rather than to the holder: the same picture can dress one mesh as a base map,
 * read as sRGB, and another as roughness, read as data — and they are two different textures on
 * the GPU. Setting either on a shared instance would silently spoil the other holder, and for the
 * orientation it could not even be set, `flipY` being inert on an `ImageBitmap`.
 */
export function createTextureCache(
  load: TextureSource,
  onFailure: (assetId: string, error: unknown) => void,
  /**
   * When each asset was last written. Absent leaves every URL bare, which is what a workspace
   * with no catalogue behind it — and every test — wants.
   */
  versionOf: (assetId: string) => string | undefined = () => undefined,
  /**
   * What an open editor is showing of an asset, ahead of its file. Absent leaves every slot on
   * the disk, which is what a workspace with no editor — and every test — wants.
   */
  previewOf: (assetId: string) => ImageBitmap | null = () => null,
): TextureCache {
  const cache = createRefCache<Texture>({
    load: async key => {
      const { colorSpace, assetId, version, orientation } = splitKey(key)
      // What an editor is DRAWING wins over what its file holds — the whole of the live link, and
      // the reason a stroke reaches a model before anything is saved. The bitmap is the store's
      // to free, so this never closes it.
      const shown = previewOf(assetId)
      // Stamped, or a picture the studio has just overwritten would come back from the browser's
      // own cache under an id that never moved — the ⌘S would look like it did nothing.
      const texture = shown
        ? new Texture(await createImageBitmap(shown, { imageOrientation: orientation }))
        : await load(versionedUrl(assetUrl(assetId), version), orientation)
      texture.needsUpdate = true
      // NOT over a float decode: a `.hdr` or an `.exr` comes back linear already, and stamping
      // sRGB over it has the shader decode a second time — a sky visibly darker than its file.
      if (texture.type === UnsignedByteType) texture.colorSpace = colorSpace
      // Repeating rather than clamped: a mesh tiles its maps through its UVs, and against the
      // default those go past 1 by stretching the last texel across the whole floor.
      //
      // In this fabric, so it holds for the THREE engines that build a cache from it — checked
      // rather than assumed: the material editor already sets the same pair on its own map, and
      // the sky turns by a node rather than by its UVs, so neither leaves 0..1 behind.
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      return texture
    },
    free: texture => texture.dispose(),
    // The asset, not the key: which colour space it was read in says nothing to a reader.
    onFailure: (key, error) => onFailure(splitKey(key).assetId, error),
  })

  // The version is escaped, and that is not decoration: it is an ISO stamp, so it holds the very
  // separator this key is cut on — unescaped, the cut landed inside `10:00:00` and the loader was
  // handed an asset id made of half a date.
  const keyOf = (
    assetId: string,
    colorSpace: ColorSpace,
    version = '',
    orientation: PictureOrientation = 'flipY',
  ): string =>
    `${colorSpace}${SEPARATOR}${orientation}${SEPARATOR}${encodeURIComponent(version)}${SEPARATOR}${assetId}`

  return {
    acquire: (assetId, colorSpace, version, orientation) =>
      cache.acquire(keyOf(assetId, colorSpace, version, orientation)),
    release: (assetId, colorSpace, version, orientation) =>
      cache.release(keyOf(assetId, colorSpace, version, orientation)),
    versionOf,
    dispose: cache.dispose,
  }
}

/** Only the asset id may hold a separator, and it comes last — so the rest of the split IS it. */
function splitKey(key: string): {
  colorSpace: ColorSpace
  orientation: PictureOrientation
  version: string
  assetId: string
} {
  const [colorSpace, orientation, version, ...id] = key.split(SEPARATOR)
  return {
    // `as` twice: the key was built by `keyOf`, and nothing else reaches this.
    colorSpace: colorSpace as ColorSpace,
    orientation: orientation as PictureOrientation,
    version: decodeURIComponent(version ?? ''),
    assetId: id.join(SEPARATOR),
  }
}
