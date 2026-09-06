import { expect, it } from 'vitest'
import { isRecord } from '../guards'
import { LANGUAGES, TRANSLATIONS, type Language } from './index'
import { breakableSpots } from './typography'

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

/**
 * What a block holds, with its names sorted at every depth.
 *
 * Sorted because the order is not part of what a block SAYS: the same six keys pasted back in a
 * different order are the same six keys, and a review caught this comparing raw `JSON.stringify`
 * — which would have called them different and let the copy through.
 */
function shapeOf(value: unknown): string {
  if (!isRecord(value)) return JSON.stringify(value)

  return JSON.stringify(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, held]) => [name, shapeOf(held)]),
  )
}

/** Every nested block, by what it holds — two paths under one shape is one block written twice. */
function blocksOf(
  bundle: unknown,
  prefix = '',
  into = new Map<string, string[]>(),
): Map<string, string[]> {
  if (!isRecord(bundle)) return into

  for (const [name, value] of Object.entries(bundle)) {
    if (!isRecord(value)) continue

    const key = prefix ? `${prefix}.${name}` : name
    const shape = shapeOf(value)
    into.set(shape, [...(into.get(shape) ?? []), key])
    blocksOf(value, key, into)
  }

  return into
}

function orderOf(bundle: unknown, prefix = '', into: string[] = []): string[] {
  if (!isRecord(bundle)) return into

  for (const [name, value] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${name}` : name
    into.push(key)
    if (isRecord(value)) orderOf(value, key, into)
  }

  return into
}

const CODES = LANGUAGES.map(language => language.code)

// Written out rather than mapped over `LANGUAGES`: the Record makes a new language a compile
// error here, which is the one place that must not silently skip it.
const BUNDLES: Record<Language, Map<string, string>> = {
  fr: flatten(TRANSLATIONS.fr),
  en: flatten(TRANSLATIONS.en),
}

const REFERENCE = BUNDLES.fr

// The typecheck only catches a bundle that MISSES a key: an extra one is still assignable.
it.each(CODES)('says the same things in %s as every other language', code => {
  expect([...BUNDLES[code].keys()].sort()).toEqual([...REFERENCE.keys()].sort())
})

/**
 * Same keys in the same places, so the two files can be read side by side — which is how a
 * translation is checked, and how a missing one is seen. Two features landing at once put
 * `licences` before `usage` in one bundle and after it in the other, and forty-nine keys
 * stopped lining up.
 */
it.each(CODES)('lists its keys in the same order as the others in %s', code => {
  expect(orderOf(TRANSLATIONS[code])).toEqual(orderOf(TRANSLATIONS.fr))
})

it.each(CODES)('leaves nothing blank in %s', code => {
  for (const [key, text] of BUNDLES[code]) {
    expect(text.trim(), `${key} is blank`).not.toBe('')
  }
})

/**
 * The same block, written twice under two names.
 *
 * `commands.sceneCounters` was a word-for-word copy of `sceneCounters`, both landed by ONE
 * commit, and nothing ever read the copy: the counters call `sceneCounters.*`, and every command
 * names its key in full — `titleKey: 'commands.projectNew.title'` — so no template could reach
 * it. Six keys per language, translated and proofread for nobody, and every guard here was green
 * the whole time: a copy is complete in both languages, blank nowhere, and ICU-valid.
 *
 * What it reads is what a block HOLDS, down to any depth and whatever order the names sit in —
 * see `shapeOf`. Nothing else repeats in either bundle, measured at every size down to a block
 * of one key, so this needs no floor and no exemption. A repeat meant on purpose will have to
 * argue for itself here.
 */
it.each(CODES)('writes no block twice under two names in %s', code => {
  const twinned = [...blocksOf(TRANSLATIONS[code]).values()].filter(paths => paths.length > 1)

  expect(twinned).toEqual([])
})

/**
 * i18next walks dots. A group `scene` next to a key `scene.player` hides the key: the toast
 * printed `activity.scope.scene.player` while the sentence sat unused — measured 2026-09-06.
 */
function dottedCollisions(value: unknown, prefix = ''): string[] {
  if (!isRecord(value)) return []

  const names = Object.keys(value)
  const groups = new Set(names.filter(name => isRecord(value[name])))
  return [
    ...names.flatMap(name => {
      const dot = name.indexOf('.')
      if (dot < 0) return []
      return groups.has(name.slice(0, dot)) ? [`${prefix}${name}`] : []
    }),
    ...[...groups].flatMap(group => dottedCollisions(value[group], `${prefix}${group}.`)),
  ]
}

it.each(CODES)('does not nest a group under the same name as a dotted key in %s', code => {
  expect(dottedCollisions(TRANSLATIONS[code])).toEqual([])
})

/**
 * A count is text too, and a thousand is not written the same in the two languages: `4 000`
 * against `4,000`. The usage window formatted its figures through `Intl` from the start, but
 * the counts written INSIDE a sentence went out raw, and a library of four thousand assets
 * read `4000` in both.
 *
 * `{{count, number}}` hands it to i18next's own `Intl.NumberFormat`. The exception is a
 * factor rather than a tally — `4×` repeats, it does not count, and grouping it would be
 * wrong at exactly the point where the grouping would show.
 */
it.each(CODES)('hands every count it writes to the number formatter in %s', code => {
  const factors = new Set(['material.tilingPreviewTimes'])

  const raw = [...BUNDLES[code]]
    .filter(([key]) => !factors.has(key.replace(/_(one|other|zero|two|few|many)$/, '')))
    .filter(([, text]) => /\{\{count\}\}/.test(text))
    .map(([key]) => key)

  expect(raw).toEqual([])
})

/**
 * The sentences that read the same in both bundles because nobody translates them: the brand,
 * the names of file formats and of the engines a material is exported to, two paths, a
 * copyright line, and an example someone types over.
 *
 * Anything else arriving here is an English sentence pasted into the French file — the one
 * untranslated string no other guard can see, precisely because it *is* in the bundle.
 */
it('says something of its own in French wherever it says a sentence', () => {
  // Sentences only. A single word identical in both is usually a cognate — `Position`,
  // `Rotation`, `Saturation`, ninety-four of them — and listing those would cost far more
  // than it would ever catch.
  const wordsOf = (text: string): readonly string[] =>
    text.replace(/\{\{[^}]+\}\}/g, ' ').match(/\p{Letter}{2,}/gu) ?? []

  const untranslatedOnPurpose = new Set([
    'about.copyright',
    'accounts.namePlaceholder',
    'app.name',
    'exportFormats.gltf',
    'exportFormats.usdz',
    'settings.ffmpegPath.placeholder',
    // The other binary path a user may name. A filesystem path is not a sentence in any
    // language, and translating `/usr/bin/git` would be inventing a folder nobody has.
    'settings.gitBinary.placeholder',
    // Two engines and a format. `roblox` and `raw` are one word each, which this already skips.
    'materialExportTargets.gltf',
    'materialExportTargets.unity',
    'materialExportTargets.unreal',
    // A console, and consoles keep their name. `preset_psx` reads as one word to `wordsOf`.
    'postfx.preset_gameBoy',
    // The name of a genre, and it is the same two words in French. Translating it would
    // invent a term nobody who draws sprites uses.
    'inspector.pixelArt',
    // The same genre, said on the row of a model that draws it.
    'generation.suitsPixelArt',
    // Four applications and this one. A product keeps its name in every language, and
    // `unity` and `blender` are one word each, which this already skips.
    'settings.navigationPreset.studio',
    'settings.navigationPreset.unreal',
    'settings.navigationPreset.roblox',
  ])

  const copied = [...BUNDLES.fr]
    .filter(([key, text]) => BUNDLES.en.get(key) === text)
    .filter(([, text]) => wordsOf(text).length >= 2)
    .map(([key]) => key)
    .filter(key => !untranslatedOnPurpose.has(key))

  expect(copied).toEqual([])
})

/**
 * `CLAUDE.md` calls the French bundle out by name: user-facing text, with no ASCII stand-ins.
 * A straight quote is one — French wrote `’` in a hundred and twenty-three lines and `'` in
 * thirty-four, so the same word was drawn two ways depending on where it was read. English had
 * no rule at all for a while, and it landed on the side its own quotation marks had already
 * taken: fifteen values wore `“ ”` while seven of `activity.*` wrote `"{{name}}"`, against
 * French counterparts all in `« »`.
 *
 * One check for both languages, because they ran on different strengths and the weaker one let
 * real text through. Asking for a letter on each side of the apostrophe misses a plural
 * possessive closing a sentence (`the other keys'.`) and one following an interpolation
 * (`{{name}}'s`), and it never looked at the quotation mark at all. This reads the SIGN alone:
 * in a bundle, neither ASCII mark carries a meaning its typographic form does not.
 */
it.each(CODES)('writes no ASCII quotation mark or apostrophe in %s', code => {
  for (const [key, text] of BUNDLES[code]) {
    expect(text, `${key} uses a straight apostrophe`).not.toMatch(/'/)
    expect(text, `${key} uses a straight quotation mark`).not.toMatch(/"/)
  }
})

/**
 * The other half of French typography, and the one that shows: `;` `:` `!` `?` and the closing
 * `»` take a NO-BREAK space before them, never an ordinary one. An ordinary space is a place
 * the line may break, so a narrow column — the activity journal is one — drops the colon or
 * the closing quote alone onto the next line.
 *
 * The opening `«` takes one AFTER it, and this read only the closing side for a while. The
 * bundle holds twenty-nine citations over twenty-three values — five settings hints cite more
 * than one — and their twenty-nine closing quotes all held the no-break space while
 * twenty-eight of the openers had an ordinary one. A citation breakable at one end and not
 * the other leaves `«` as the last thing on a line: the very shape the closing half prevents.
 *
 * A number binds the same way, to its unit and to its own thousands, and that half was missing:
 * `{{units}} UC` is the readout the studio draws most, and every pattern written here looked for
 * a DIGIT — which an interpolation is not. `breakableSpots` reads all five spots, and it lives
 * in `typography.ts` because `model-text.fr.json` is guarded against exactly the same ones.
 *
 * The figure half is not French — English breaks `{{units}} CU` the same way — and this read
 * `fr` alone while the English bundle held not a single no-break space. The two unit lists
 * MIRROR each other for that reason: one symbol in a list and not the other lets the bundles
 * drift apart in typography with nothing to say so.
 */
it.each(CODES)('binds what %s does not break', code => {
  const breakable = [...BUNDLES[code]].flatMap(([key, text]) =>
    breakableSpots(text, code).map(spot => `${key} — ${spot}`),
  )

  expect(breakable).toEqual([])
})
