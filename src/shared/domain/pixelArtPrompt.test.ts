import { describe, expect, it } from 'vitest'
import { PIXEL_ART_PROMPT_MAX, pixelArtWords, withPixelArtPrompt } from './pixelArtPrompt'

describe('the pixel-art prompt', () => {
  it('says the grid after the subject, so what a model truncates is the tail', () => {
    expect(withPixelArtPrompt('a knight', 32, 32)).toBe(
      'a knight, pixel art, 32x32 sprite, hard edges, no anti-aliasing',
    )
  })

  /**
   * The catalogue keeps what was WRITTEN, and by then these words are part of it: a regeneration
   * would double them, then triple them, with nothing going red. What settles it is the GRID.
   */
  it('adds nothing the second time round', () => {
    const once = withPixelArtPrompt('a knight', 32, 32)

    expect(withPixelArtPrompt(once, 32, 32)).toBe(once)
  })

  /**
   * 🛑 Measured on the bench of 2026-09-02, rank 68.8: asked for a sprite, a model writes « pixel
   * art » itself. Settled on the genre, the studio's own grid then never travelled at all.
   */
  it('still says the grid to a prompt that named the genre on its own', () => {
    expect(withPixelArtPrompt('a knight, pixel art style', 32, 32)).toBe(
      'a knight, pixel art style, 32x32 sprite',
    )
  })

  /**
   * 🛑 The clause the studio writes, never bare digits. Read as digits, the tidy-up ate the
   * person's own nouns — « a 64x64 sprite of a knight » went out as « a of a knight » — and a
   * prompt merely mentioning the numbers was sent with no pixel-art words at all.
   */
  it('leaves the words of whoever wrote them alone', () => {
    expect(withPixelArtPrompt('a 64x64 sprite of a knight', 32, 32)).toContain(
      'a 64x64 sprite of a knight',
    )
    expect(withPixelArtPrompt('a 32x32 chessboard', 32, 32)).toBe(
      'a 32x32 chessboard, pixel art, 32x32 sprite, hard edges, no anti-aliasing',
    )
  })

  /** A resize between two runs: the grid is REPLACED, never stacked — two would name neither. */
  it('replaces a grid the document no longer measures', () => {
    const sent = withPixelArtPrompt(withPixelArtPrompt('a knight', 32, 32), 64, 64)

    expect(sent).toContain('64x64 sprite')
    expect(sent).not.toContain('32x32')
  })

  /**
   * 🛑 The WORD and not the substring: both of these carry « pixel art », and on the substring
   * the grid went nowhere while the box under the tick went on showing it.
   */
  it('is not fooled by a word that merely starts with it', () => {
    expect(withPixelArtPrompt('no pixel artifacts', 32, 32)).toContain('32x32 sprite')
    expect(withPixelArtPrompt('a pixel artist at work', 32, 32)).toContain('32x32 sprite')
  })

  /** The arbitration `bodyWithContext` already made: a style is a modifier, not a subject. */
  it('leaves a prompt nobody wrote alone, and trims the one somebody did', () => {
    expect(withPixelArtPrompt('   ', 32, 32)).toBe('   ')
    expect(withPixelArtPrompt('a knight ', 32, 32)).toBe(withPixelArtPrompt('a knight', 32, 32))
  })

  it('stays inside the room it declares, at the largest grid a document can hold', () => {
    expect(pixelArtWords(8192, 8192).length).toBeLessThanOrEqual(PIXEL_ART_PROMPT_MAX)
  })
})
