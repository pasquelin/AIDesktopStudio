import { describe, expect, it } from 'vitest'
import { NO_BREAK_SPACE, UNIT_SYMBOLS, breakableSpots } from './typography'

describe('the spots French would not break', () => {
  it('reads a unit parted from the number it measures', () => {
    expect(breakableSpots('700 Mo de mémoire', 'fr')).toEqual(['unit: 700 Mo'])
    expect(breakableSpots(`700${NO_BREAK_SPACE}Mo de mémoire`, 'fr')).toEqual([])
  })

  /**
   * The whole reason this file exists: `{{units}} UC` is the readout the studio draws most, and
   * every pattern written before this one looked for a DIGIT — which an interpolation is not.
   */
  it('counts the interpolation as the number it stands for', () => {
    expect(breakableSpots('{{units}} UC', 'fr')).toEqual(['unit: }} UC'])
    expect(breakableSpots(`{{units}}${NO_BREAK_SPACE}UC`, 'fr')).toEqual([])
  })

  // A word is not a unit, and French breaks that space: some fifty values rely on it.
  it('leaves a number followed by a word alone', () => {
    expect(breakableSpots('2 derniers jours', 'fr')).toEqual([])
    expect(breakableSpots('{{count}} générations', 'fr')).toEqual([])
    expect(breakableSpots('24 heures', 'fr')).toEqual([])
  })

  // `h` is a unit, `heures` is a word, and only the boundary tells them apart.
  it('does not read the start of a word as the unit it begins with', () => {
    expect(breakableSpots('24 h', 'fr')).toEqual(['unit: 24 h'])
    expect(breakableSpots('24 hectares', 'fr')).toEqual([])
  })

  /**
   * Bound on the left alone, the second number leaves the line and the sign goes with the first.
   */
  it('ties the multiplication sign to both of its numbers', () => {
    expect(breakableSpots(`{{size}}${NO_BREAK_SPACE}× {{size}}`, 'fr')).toEqual(['times: ×'])
    expect(breakableSpots(`{{size}}${NO_BREAK_SPACE}×${NO_BREAK_SPACE}{{size}}`, 'fr')).toEqual([])
  })

  /**
   * A million has two spaces, and a pattern that eats the group it just read only fixes the
   * first — which is how `1 500 000` came out half-bound the first time this was corrected.
   */
  it('reads every space of a large number, not only the first', () => {
    expect(breakableSpots('1 500 000 faces', 'fr')).toEqual(['thousands: 1', 'thousands: 0'])
    expect(breakableSpots(`1${NO_BREAK_SPACE}500${NO_BREAK_SPACE}000 faces`, 'fr')).toEqual([])
  })

  it('reads the double punctuation and the opening quote', () => {
    expect(breakableSpots('ainsi : voilà', 'fr')).toEqual(['punctuation: :'])
    expect(breakableSpots('« ainsi »', 'fr')).toEqual(['punctuation: »', 'quote: «'])
    expect(breakableSpots(`ainsi${NO_BREAK_SPACE}: « ainsi${NO_BREAK_SPACE}»`, 'fr')).toEqual([
      'quote: «',
    ])
  })

  // The list is written out, so it is worth saying what it may not hold.
  it('names symbols only, never a French word', () => {
    for (const symbol of UNIT_SYMBOLS.fr ?? []) expect(symbol).toMatch(/^[A-Za-z]{1,4}$/)
  })
})

describe('the spots English would not break', () => {
  // A line break between a figure and its unit is the same defect in either language.
  it('reads a unit parted from the number it measures', () => {
    expect(breakableSpots('around 700 MB of memory', 'en')).toEqual(['unit: 700 MB'])
    expect(breakableSpots(`around 700${NO_BREAK_SPACE}MB of memory`, 'en')).toEqual([])
    expect(breakableSpots('{{units}} CU', 'en')).toEqual(['unit: }} CU'])
    expect(breakableSpots(`{{units}}${NO_BREAK_SPACE}CU`, 'en')).toEqual([])
  })

  /**
   * The half English does NOT take: it writes `so:` and `“like this”` with no space at all, so a
   * rule asking for a no-break one would demand the fault it exists to prevent.
   */
  it('asks for nothing before a colon or inside a quotation', () => {
    expect(breakableSpots('like this: there', 'en')).toEqual([])
    expect(breakableSpots('“like this”', 'en')).toEqual([])
  })

  // French units are not English ones, and reading them here would flag correct prose.
  it('does not read a French symbol in an English value', () => {
    expect(breakableSpots('8 asset', 'en')).toEqual([])
    expect(breakableSpots('24 hours', 'en')).toEqual([])
    expect(breakableSpots('4.2 Mo', 'en')).toEqual([])
  })

  it('names symbols only, never an English word', () => {
    for (const symbol of UNIT_SYMBOLS.en ?? []) expect(symbol).toMatch(/^[A-Za-z]{1,4}$/)
  })
})
