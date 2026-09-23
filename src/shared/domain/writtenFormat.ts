import { extensionOf } from './fileName'

/**
 * The three extensions the studio's own writers put on disk, held here rather than beside each
 * writer: the renderer decides whether a save would change a file's format, and the main process
 * refuses it again — two answers built from two copies of `'.png'` are two answers free to drift.
 */
export const ORA_EXTENSION = '.ora'
export const PNG_EXTENSION = '.png'
export const WAV_EXTENSION = '.wav'

/**
 * The two spellings that are one encoding. Everything else differing by a letter is a different
 * format — `.png` and `.ppm` are not aliases, and a table of guesses would make them one.
 */
const ALIASES: Record<string, string> = {
  '.jpeg': '.jpg',
  '.tiff': '.tif',
}

function foldExtension(extension: string): string {
  const lowered = extension.toLowerCase()
  return ALIASES[lowered] ?? lowered
}

/** The format a file name claims, folded to one spelling per encoding. */
function writtenFormatOf(fileName: string): string {
  return foldExtension(extensionOf(fileName))
}

/**
 * Whether writing `extension` over `fileName` leaves the file the format it already was.
 *
 * The question a save asks before it hands bytes to the one writer that swaps a file's extension
 * and deletes what it replaced: a `.jpg` painted on and saved came back a `.png`, the `.jpg`
 * removed and nothing said.
 *
 * A file the studio holds no path for — a linked row — has no format to change and answers `true`:
 * editing one lands INSIDE the project by design, and refusing it here would block an edit that
 * touches nothing of the user's.
 */
export function keepsWrittenFormat(fileName: string | undefined, extension: string): boolean {
  if (!fileName) return true
  const held = writtenFormatOf(fileName)
  return held === '' || held === foldExtension(extension)
}
