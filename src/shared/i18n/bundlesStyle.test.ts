import { describe, expect, it } from 'vitest'
import { PBR_CHANNELS, type PbrChannel } from '../domain/material'
import { isRecord } from '../guards'
import { foldForSearch } from '../text'
import { LANGUAGES, TRANSLATIONS, type Language } from './index'
import { americanVerbs, americanWords, frenchWords } from './spelling-fixtures'

/** Every key, nested ones included, in the order the file writes them. */
function flatten(
  bundle: unknown,
  prefix = '',
  into = new Map<string, string>(),
): Map<string, string> {
  if (!isRecord(bundle)) return into

  for (const [name, value] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (isRecord(value)) flatten(value, key, into)
    else into.set(key, String(value))
  }

  return into
}

/** `{{count}}`, and every other hole a caller has to fill. */
function holes(text: string): readonly string[] {
  return [...text.matchAll(/\{\{[^}]+\}\}/g)].map(match => match[0]).sort()
}

const CODES = LANGUAGES.map(language => language.code)

// Written out rather than mapped over `LANGUAGES`: the Record makes a new language a compile
// error here, which is the one place that must not silently skip it.
const BUNDLES: Record<Language, Map<string, string>> = {
  fr: flatten(TRANSLATIONS.fr),
  en: flatten(TRANSLATIONS.en),
}

const REFERENCE = BUNDLES.fr

/**
 * The words a reader would notice twice: folded the way the search box folds them, holes dropped
 * — a `{{name}}` is written by the caller, not by the label — and short ones left out, articles
 * and prepositions being shared by any two French sentences.
 */
const longWords = (text: string): string[] =>
  foldForSearch(text.replace(/{{[^}]*}}/g, ' '))
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter(word => word.length > 3)

/**
 * Named one key at a time rather than by its subtree: `usage.actionNames` also holds labels the
 * studio words itself, and exempting the branch would let the next one drift. What this split
 * costs the reader is written at `TWO_THINGS.vectorisation`.
 */
const NAMED_AS_THE_API_BILLS_IT: ReadonlySet<string> = new Set(['usage.actionNames.vectorization'])

/**
 * The three blend modes carrying `color`, spelled as `mix-blend-mode` spells them. Exempt from
 * the WORDS reading only — one exemption per reading, never one per key: written as a single set,
 * these three would also stop being read for `-ize`, and `usage.actionNames.vectorization` would
 * stop being read for `color`. Measured, both holes; the same trap `SETTLED_WORDS.except`
 * documents further down.
 *
 * Keys are flat, the section files being merged into one bundle: `blend.color`, never
 * `image.blend.color` — the guard is what said so, the prefixed spelling failed it.
 */
const NAMED_AS_CSS_BLENDS_THEM: ReadonlySet<string> = new Set([
  'blend.color',
  'blend.color-burn',
  'blend.color-dodge',
])

/** Keys writing a `FRENCH_FORMS` word in its own English sense. Empty, and measured so. */
const BORROWED_IN_ENGLISH: ReadonlySet<string> = new Set<string>()

const INSPECTOR_FIELD: Record<PbrChannel, string | null> = {
  baseColor: 'map',
  normal: 'normalMap',
  // The scalars, not `roughnessMap`/`metalnessMap`: those two wear `Carte de` to part the map
  // from the slider of the same name beside them, which `normalMap` and `aoMap` never needed.
  roughness: 'roughness',
  metalness: 'metalness',
  ao: 'aoMap',
  // No material field of their own in the 3D inspector — `inspector.fields.height` is the box
  // dimension, next to `Segments en hauteur`, and rhyming with it would be the false pair.
  height: null,
  emissive: null,
  edge: null,
}

/**
 * Channels the two surfaces name differently on purpose — each entry saying why, and leaving
 * the day both agree again. A channel absent here and divergent is drift, in either language.
 */
const NAMED_TWICE: Partial<Record<PbrChannel, string>> = {
  normal: 'the inspector counts them, as the trade writes the map; the tile names one channel',
  metalness: 'the trade word beside `Rugosité`, and the short one that fits a tile',
  ao: 'the full name beside the other maps, and the short one that fits a tile',
}

/** Empty for a channel the inspector has no field for: nothing to diverge, nothing to exempt. */
const namesOf = (channel: PbrChannel) => {
  const field = INSPECTOR_FIELD[channel]

  return field === null
    ? []
    : CODES.map(code => [
        BUNDLES[code].get(`material.channel.${channel}`),
        BUNDLES[code].get(`inspector.fields.${field}`),
      ])
}

describe('the style of the translation bundles', () => {
  it('names a PBR channel the same way on the tile and in the 3D inspector', () => {
    const drifted = PBR_CHANNELS.filter(channel => NAMED_TWICE[channel] === undefined).filter(
      channel => namesOf(channel).some(([tile, field]) => tile !== field),
    )

    expect(drifted).toEqual([])
  })

  it('drops a channel exemption once both surfaces say the same word', () => {
    const settled = PBR_CHANNELS.filter(channel => NAMED_TWICE[channel] !== undefined).filter(
      channel => namesOf(channel).every(([tile, field]) => tile === field),
    )

    expect(settled).toEqual([])
  })

  /**
   * The English bundle is British throughout — `colour` ×26, `centre`, `licence`, `cancelled`,
   * `grey`. Of the sixteen `blend.*` names `mix-blend-mode` spells, only the three carrying
   * `color` need an exemption; the other thirteen say nothing this reads, measured. The `-ize`
   * suffix was the one thing that had drifted, and nothing in this file could see it: the guard
   * above compares a label to its OTHER readings, so a term written once anywhere is invisible
   * to it. The manual was already spelling `vectorisation` in prose while the bundle it quotes
   * said `Vectorization`.
   *
   * It reads only `BUNDLES.en`, which used to be its blind spot: the twenty chapters the Help
   * window renders from `manual.json` pass through no bundle at all. `manual.i18n.test.ts` reads
   * them now, with the same two readings — shared through `spelling-fixtures`, so a root exempted
   * for one side is exempt for both. The key-by-key exemption stays here: it names bundle paths,
   * which the manual has none of.
   *
   * The words are asked of the bundle since the manual settled `dialogue`: the two texts quote
   * each other, and a label the manual explains in British while the bundle spells it American
   * reads as two products. Four keys are exempt in all, one reading each, measured.
   */
  it('spells its English the British way', () => {
    const american = [...BUNDLES.en].flatMap(([key, text]) =>
      [
        ...(NAMED_AS_THE_API_BILLS_IT.has(key) ? [] : americanVerbs(text)),
        ...(NAMED_AS_CSS_BLENDS_THEM.has(key) ? [] : americanWords(text)),
      ].map(word => `${key} — ${word}`),
    )

    expect(american).toEqual([])
  })

  /**
   * The reading beside the spelling one, and the same trap: `assistant.fields.easing` said `Speed
   * curve of the travelling`, the French noun for what this studio calls a camera move. Nothing
   * above could see it — the guards there compare a label to its OTHER readings, and this one was
   * written once. Shared with the manual for the reason the spelling reading is: chapter 09 wrote
   * the same borrowing, in prose that quotes this very label.
   */
  it('writes its own English word rather than a French one', () => {
    const borrowed = [...BUNDLES.en].flatMap(([key, text]) =>
      (BORROWED_IN_ENGLISH.has(key) ? [] : frenchWords(text)).map(word => `${key} — ${word}`),
    )

    expect(borrowed).toEqual([])
  })

  /**
   * The same reasoning as the `SETTLED_WORDS.except` guard above, applied to the three sets the
   * two readings above take: an exemption whose key no longer says the word — or no longer
   * exists — is one nobody would think to delete, and the next reader takes it for a rule.
   */
  it('drops a spelling exemption once its key stops needing it', () => {
    const stale = [
      ...[...NAMED_AS_THE_API_BILLS_IT].filter(
        key => americanVerbs(BUNDLES.en.get(key) ?? '').length === 0,
      ),
      ...[...NAMED_AS_CSS_BLENDS_THEM].filter(
        key => americanWords(BUNDLES.en.get(key) ?? '').length === 0,
      ),
      ...[...BORROWED_IN_ENGLISH].filter(
        key => frenchWords(BUNDLES.en.get(key) ?? '').length === 0,
      ),
    ]

    expect(stale).toEqual([])
  })
})

describe('the structure of the translation bundles', () => {
  /**
   * A tooltip on a button whose label is already visible EXPLAINS instead of repeating: read
   * aloud, a tooltip that says the label back is the same words twice.
   *
   * What it measures is that the tooltip adds almost NOTHING — the whole label, back, plus one
   * word at most. Not that it echoes: `Rectangle` / `Tracer un rectangle — Maj pour un carré`
   * repeats its label word for word and is the form this repository writes, because the words
   * AFTER the echo are the explanation. `Sélection rectangulaire` / `Tracer une sélection
   * rectangulaire` had nothing after it, and that is what was caught.
   *
   * The bar sits there because a stricter one is unusable: of the 213 label/tooltip pairs, 80
   * share a word — `Supprimer le calque` beside `Supprimer le calque actif — le dernier ne peut
   * pas l'être` among them — and nearly all of those explain something real. A guard on shared
   * words would report eighty labels and be turned off within the day.
   *
   * Its blind spots, measured, and they are wide:
   * - a label with no word over three letters is never read — `OK`, `Fit`, `Top`, `Pen`, `A/B`,
   *   nine such in English and four in French, and short labels are the likeliest to be echoed;
   * - French inflection hides an echo from it: `Fermer les autres onglets` beside `Ferme tous les
   *   autres onglets` compares `fermer` to `ferme` and finds two words, so the guard is weaker in
   *   the language this repository writes its labels in first;
   * - pairing is by name, `fooHint` beside `foo`, and 45 of the 158 tooltip keys escape it — 20
   *   `*Hint` whose label lives under another name, 25 spelled otherwise (`activity.filters.hint`
   *   is a real tooltip), 9 composed at runtime (`sceneViews.${view}Hint`).
   *
   * A concise tooltip can therefore be flagged where it was right — `Delete layer` beside
   * `Delete the active layer` would be. The fix then is to say the second useful thing, not to
   * exempt the key.
   */
  it.each(CODES)('explains a label in %s rather than saying it back', code => {
    const echoed = [...BUNDLES[code]]
      .filter(([key]) => key.endsWith('Hint') && BUNDLES[code].has(key.slice(0, -'Hint'.length)))
      .filter(([key, hint]) => {
        const label = new Set(longWords(BUNDLES[code].get(key.slice(0, -'Hint'.length)) ?? ''))
        const spoken = longWords(hint)

        return (
          label.size > 0 &&
          [...label].every(word => spoken.includes(word)) &&
          spoken.filter(word => !label.has(word)).length <= 1
        )
      })
      .map(([key]) => key)

    expect(echoed).toEqual([])
  })

  /**
   * A plural base names every form the language HAS, asked of `Intl` rather than assumed. French
   * carries three — `one`, `many`, `other` — and the third language is not where this breaks: it
   * is French, at a million, where `select` answers `many` and a bundle without it renders the
   * raw key. i18next falls back to the bare key for a missing `_one` and to nothing at all here.
   *
   * Asked of `Intl` because the list is the language's, not ours: Russian and Polish add `_few`,
   * Arabic six forms, and a hand-written list would be the thing that goes stale.
   */
  it.each(CODES)('names every plural form the language has in %s', code => {
    const forms = new Intl.PluralRules(code).resolvedOptions().pluralCategories
    const bases = [...BUNDLES[code].keys()]
      .filter(key => key.endsWith('_other'))
      .map(key => key.slice(0, -'_other'.length))

    for (const form of forms)
      expect(
        bases.filter(base => !BUNDLES[code].has(`${base}_${form}`)),
        `missing the ${form} form in ${code}`,
      ).toEqual([])
    expect(bases.filter(base => BUNDLES[code].has(base))).toEqual([])
  })

  // A hole dropped in translation renders as a sentence with a number missing from it.
  it.each(CODES)('keeps the same interpolations in %s', code => {
    for (const [key, text] of BUNDLES[code]) {
      expect(holes(text), `${key} interpolates differently`).toEqual(
        holes(REFERENCE.get(key) ?? ''),
      )
    }
  })
})
