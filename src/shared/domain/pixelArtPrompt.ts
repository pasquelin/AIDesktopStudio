/**
 * What a model is told when the studio is on a pixel grid. English and literal, OUTSIDE the i18n
 * bundles on purpose — the same arbitration as `composedContext`: a prompt is code, and putting
 * it in a bundle invites somebody to translate the one thing that must not move.
 *
 * `x` is ASCII and not `×`: a non-ASCII character in a JSON body and in a CLIP tokenizer.
 */
export function pixelArtWords(columns: number, rows: number): string {
  return `pixel art, ${columns}x${rows} sprite, hard edges, no anti-aliasing`
}

/**
 * Bounded by construction — the two counts are the only variables, and a side is capped at the
 * document's own. It does not travel through `composedContext`, so it does not eat the 600
 * characters that one is held to; it does share the 77-token window those exist to protect.
 */
export const PIXEL_ART_PROMPT_MAX = 90

/**
 * 🛑 The WORD, never the substring: « no pixel artifacts » and « a pixel artist » both carry
 * « pixel art ». One reader for the whole studio — `suitsPixelArt` asked the same question and
 * answered it differently, which is two truths about one genre in one folder.
 */
const SAID = /pixel[\s-]?art(?![a-z])/i

export const saysPixelArt = (text: string): boolean => SAID.test(text)

/**
 * The clause the studio itself appends, comma and all. 🛑 Anchored on that comma: read as bare
 * digits it ate the person's own words — « a 64x64 sprite of a knight » came back « a of a knight ».
 */
const OWN_CLAUSE = /, \d+x\d+ sprite/gi

/**
 * The written prompt with the grid said after it. 🛑 What settles idempotence is the GRID, not
 * the genre: measured on the bench of 2026-09-02, a model asked for a sprite writes « pixel art »
 * itself, and on the genre alone the studio's own grid never travelled — 68.8 failed on it.
 *
 * Blank in, blank out — the same arbitration as `bodyWithContext`: a style is a modifier, not a
 * subject, and « pixel art, 64x64 sprite » alone is a prompt nobody wrote.
 */
export function withPixelArtPrompt(written: string, columns: number, rows: number): string {
  const subject = written.trim()
  if (subject.length === 0) return written

  // The CLAUSE and not the digits: « a 32x32 chessboard » names a grid it does not draw on, and
  // on the digits alone it went out with no pixel-art words at all.
  const clause = `, ${columns}x${rows} sprite`
  if (subject.includes(clause)) return written

  // Replaced and never stacked: a regeneration of a document resized since would otherwise carry
  // two grids, and the reader cannot tell which one the studio means.
  const said = subject.replace(OWN_CLAUSE, '')
  return saysPixelArt(said) ? `${said}${clause}` : `${said}, ${pixelArtWords(columns, rows)}`
}
