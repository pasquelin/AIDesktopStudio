import { localizedError } from '@shared/localizedError'
import type { Font } from 'opentype.js'
import { EMBEDDED_FONTS, fontKey, type FontRef } from '@shared/domain/font'
import { reportFailure } from '@/services/diagnostics'

/**
 * The typefaces the studio can draw with, parsed once and shared.
 *
 * Here in `core` and not under one workspace because two of them set text: the 3D one extrudes
 * these outlines, the image one draws them onto a layer. A face parsed twice is half a megabyte
 * of glyph tables twice, and two lists that drift.
 *
 * A face that cannot be produced comes back as `null` and is reported — never quietly swapped
 * for another. Swapping is how a document opens looking almost right on a machine that has not
 * got the font, which is worse than opening plainly wrong.
 */

/**
 * Where faces come from. Injected like a mesh loader, and for the same reason: an engine reaches
 * for no boundary of its own — see `services/fonts`, which wires this one to the main process.
 */
export type FontSource = {
  /** The families the machine adds to the studio's own. */
  installed: () => Promise<string[]>
  bytes: (ref: FontRef) => Promise<Uint8Array | null>
}

export type FontLibrary = {
  /** Everything on offer: the studio's own first, then whatever the machine adds. */
  families: () => Promise<FontRef[]>
  /** The outlines of a face, or `null` when nothing can produce them. */
  load: (ref: FontRef) => Promise<Font | null>
  /** Lets a face be asked for again — what a project change or a failed read deserves. */
  forget: () => void
}

export function createFontLibrary(source: FontSource): FontLibrary {
  /**
   * Keyed by source and family both: a machine that has Lato installed offers a face under the
   * same name as the one the studio ships, and they are not the same file.
   */
  const faces = new Map<string, Promise<Font | null>>()

  const parseFace = async (ref: FontRef): Promise<Font | null> => {
    try {
      const bytes = await source.bytes(ref)
      if (!bytes) throw localizedError('fontOutlinesMissing')

      // Fetched, not imported: the parser is half a megabyte, and the field that lists families
      // never parses one — a static import puts it all on the first screen for a list of names.
      const { parse } = await import('opentype.js')

      // A copy, not the view: `parse` reads the whole buffer, and a `Uint8Array` that arrived as
      // a slice of a larger one would have it read the neighbours as tables.
      return parse(bytes.slice().buffer)
    } catch (error) {
      reportFailure('font.face', ref.family, error)
      return null
    }
  }

  return {
    families: async () => {
      const embedded: FontRef[] = EMBEDDED_FONTS.map(font => ({
        source: 'embedded',
        family: font.family,
      }))
      const installed: FontRef[] = (await source.installed()).map(family => ({
        source: 'system',
        family,
      }))

      return [...embedded, ...installed]
    },

    load: ref => {
      const key = fontKey(ref)
      const held = faces.get(key)
      if (held) return held

      // The promise is cached, not its result: two nodes born in the same frame ask at once, and
      // caching only what has landed would read and parse the same face twice.
      const face = parseFace(ref)
      faces.set(key, face)
      return face
    },

    forget: () => faces.clear(),
  }
}
