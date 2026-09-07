import { describe, expect, it } from 'vitest'
import {
  CAPABILITIES_BY_FAMILY,
  MODEL_FAMILIES,
  MODEL_PERIODS,
  PERIOD_DAYS,
  TAG_LABEL_KEY_LIST,
} from '../domain/model'
import { WORKSPACE_IDS } from '../domain/workspace'
import { isRecord } from '../guards'
import { LANGUAGES, TRANSLATIONS, type Language } from './index'
import { asRead, screenLabels, settingsTree, unquotedMenuSegments } from './menuPath-fixtures'

const flatten = (bundle: unknown, prefix = '', into = new Map<string, string>()) => {
  if (!isRecord(bundle)) return into
  for (const [name, value] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (isRecord(value)) flatten(value, key, into)
    else into.set(key, String(value))
  }
  return into
}

const CODES = LANGUAGES.map(language => language.code)
const BUNDLES: Record<Language, Map<string, string>> = {
  fr: flatten(TRANSLATIONS.fr),
  en: flatten(TRANSLATIONS.en),
}
const REFERENCE = BUNDLES.fr

/** Every key, nested ones included, in the order the file writes them. */
describe('the tag names the bundles carry', () => {
  it.each(CODES)('are all claimed by the table, in %s', code => {
    const orphans = [...BUNDLES[code].keys()]
      .filter(key => key.startsWith('modelTags.'))
      .filter(key => !TAG_LABEL_KEY_LIST.includes(key))

    expect(orphans).toEqual([])
  })
})

/**
 * Tag and Capability are two menus of the same bar, filtering on two different things — one the
 * API matches as a tag, the other the registry applies. A `<select>` shows the chosen OPTION once
 * it closes, never the facet it belongs to (`CollectionBar.tsx` says so where it draws one), so
 * two menus wearing the same words leave a picked filter unreadable.
 *
 * The first translation of the tags walked straight into it: `Text to Image` became "Texte vers
 * image", which is what `capabilities.txt2img` had said all along. Until then the tags were in
 * English, and that — not any design — was the only thing telling the two menus apart.
 */
describe('two facet menus of the same bar', () => {
  it.each(CODES)('never puts the same words in both, in %s', code => {
    const capabilities = new Set(
      MODEL_FAMILIES.flatMap(family =>
        CAPABILITIES_BY_FAMILY[family].map(capability =>
          BUNDLES[code].get(`capabilities.${capability}`),
        ),
      ),
    )
    const collisions = TAG_LABEL_KEY_LIST.filter(key => capabilities.has(BUNDLES[code].get(key)))

    expect(collisions).toEqual([])
  })
})

describe('the symbol of a creative unit', () => {
  /**
   * It never stands alone in a bundle. `usage.units` did — it held `UC` and `CU`, and four sites
   * glued it to a number with a space written in the component, which left neither the order of
   * the two halves nor what separates them to a translator. A symbol a caller has to assemble is
   * an invitation to assemble it differently each time.
   *
   * Unlike the byte units next door (`units.kibibyte`), which a caller passes to `formatBytes`
   * rather than concatenates: there the composing happens in one place, and that place is tested.
   */
  it.each(LANGUAGES.map(language => language.code))('never stands alone in %s', code => {
    const alone = [...BUNDLES[code]].filter(([, value]) => /^(UC|CU)$/.test(value.trim()))

    expect(alone.map(([key]) => key)).toEqual([])
  })

  // And the sentence that carries it holds its number, so the two arrive together or not at all.
  it.each(LANGUAGES.map(language => language.code))('travels with its number in %s', code => {
    const carrying = [...BUNDLES[code]].filter(([, value]) => /\b(UC|CU)\b/.test(value))

    expect(carrying.length).toBeGreaterThan(0)
    for (const [key, value] of carrying) expect(value, key).toContain('{{units}}')
  })
})

/**
 * Hours rather than days, so every span below is a whole number: a day counted as `1 / 24` of
 * anything multiplies back to `0.9999…`, and the comparison would turn on floating point.
 *
 * A month is the thirty-day month `PERIOD_DAYS` counts, not a calendar one. That IS a second
 * place to be right, and it is the price of letting a label say `3 months` at all: a span that
 * stops being a multiple of thirty days can no longer be named in months here, and what this
 * asks for then is a label written in days — not a wider table.
 */
const UNIT_HOURS: Record<string, number> = {
  h: 1,
  heures: 1,
  hour: 1,
  hours: 1,
  jour: 24,
  jours: 24,
  day: 24,
  days: 24,
  mois: 720,
  month: 720,
  months: 720,
}

/**
 * How long a label says the span is, in hours — `null` when a figure it holds names no unit this
 * knows, which is unreadable rather than wrong and is reported as its own thing.
 *
 * EVERY figure counts, each taking the first unit word after it, and the total is their sum: a
 * label that adds two pieces together — `3 months and 5 days` — has to add up to the same span.
 * The unit is not required to sit against its figure, because French slips an adjective between
 * the two: `7 derniers jours`.
 *
 * A figure meaning something other than a duration would be counted as one, and none does today.
 * Telling the two apart would mean reading intent out of prose, which is not a thing a guard can
 * do — so it says it cannot read the label rather than pretending to have measured it.
 */
function statedHours(code: Language, period: string): number | null {
  const words = (BUNDLES[code].get(`periods.${period}`) ?? '').toLowerCase().match(/\d+|\p{L}+/gu)
  let counted = 0
  let figure: number | null = null

  for (const word of words ?? []) {
    if (/^\d+$/.test(word)) {
      if (figure !== null) return null
      figure = Number(word)
    } else if (figure !== null && UNIT_HOURS[word] !== undefined) {
      counted += figure * UNIT_HOURS[word]
      figure = null
    }
  }

  return figure === null && counted > 0 ? counted : null
}

describe('how far back a listing reaches', () => {
  /**
   * Every span is ROLLING — `now` minus so many days, `PERIOD_DAYS` applied against the main
   * process's own clock — so a label states the LENGTH the query uses, in whatever unit reads
   * best. English read `Last quarter` beside `Last 30 days`, and a quarter is a piece of the
   * calendar: ninety rolling days announced themselves as the quarter that ended, which is a
   * different set of models and no way to tell from the menu.
   *
   * Read against `PERIOD_DAYS` rather than between the bundles: two translations agreeing with
   * each other and both wrong is the failure a comparison between them cannot see, and it is
   * the likelier one — a span is edited in the table, not in one language.
   *
   * `unreadable` is kept apart from `wrong` on purpose. A locale arriving with its own words for
   * hours and days lands in the first, and what it asks for is a line in `UNIT_HOURS` — reported
   * as a wrong length, it would read as an accusation against a translation that is correct.
   *
   * It carries the label rather than the key alone, because it holds two failures whose remedies
   * are opposite: a figure whose unit is missing from the table, and a label naming no length at
   * all. The words themselves are what tells the two apart, so the report shows them.
   */
  it.each(CODES)('says how long the span the query uses is, in %s', code => {
    const spans = MODEL_PERIODS.map(period => ({
      period,
      label: BUNDLES[code].get(`periods.${period}`) ?? '',
      stated: statedHours(code, period),
      queried: PERIOD_DAYS[period] * 24,
    }))

    const unreadable = spans
      .filter(span => span.stated === null)
      .map(({ period, label }) => ({ period, label }))
    const wrong = spans.filter(span => span.stated !== null && span.stated !== span.queried)

    expect({ unreadable, wrong }).toEqual({ unreadable: [], wrong: [] })
  })
})

/**
 * A space named in the middle of a sentence — `l'espace Ciels`, `the Skies space`. French puts
 * the name after the word and English before it, which is why this reads as two alternatives
 * rather than one shape.
 *
 * The capital is what carries the whole distinction, and it is why this is not case-insensitive:
 * `l'espace de travail` is ordinary French, and a rule that read `de` as a claimed name would
 * fail on the words the bar itself uses. The price is that `l'espace ciels`, in lower case,
 * walks past — a wrong name written as a common noun reads as prose, and prose is not a claim.
 */
const NAMED_SPACE =
  /l['’]espace\s+(\p{Lu}[\p{L}\d]*)|\bthe\s+(\p{Lu}[\p{L}\d]*)\s+(?:space|workspace)\b/gu

/**
 * Names that follow this shape without meaning a workspace — a colour space, `the Lab space`.
 * Empty today, and measured so: the pattern matches nothing in either bundle but the sentence
 * this batch fixed.
 *
 * It exists so the day a colour space is written that way has an answer other than widening the
 * pattern until it says nothing — a guard that refuses something true is a guard its next reader
 * disarms.
 */
const NOT_A_WORKSPACE: ReadonlySet<string> = new Set<string>()

describe('a space a sentence points at', () => {
  /**
   * `intents.skyboxSourceHint` sent the reader to `l'espace Ciels` — `the Skies space` — and no
   * space has ever been called that: the bar reads `Skyboxes` in both languages, and the name was
   * invented in the very commit that wrote the sentence. A reader following the hint looked for
   * something that is not on their screen.
   *
   * **This reads ONE phrasing, the one that claims a name**, and the test is named for that
   * rather than for the rule a reader might hope it holds. A sentence naming the same surface
   * some other way — `the edit`, `the audio editor` — says nothing this can check. Two of the
   * five siblings of that hint do exactly that, and stay unchecked here.
   */
  it.each(CODES)('never claims a space name the bar does not carry, in %s', code => {
    const named = new Set(WORKSPACE_IDS.map(id => BUNDLES[code].get(`workspaces.${id}`)))
    const invented = [...BUNDLES[code]].flatMap(([key, value]) =>
      [...value.matchAll(NAMED_SPACE)]
        // One alternative matches, the other stays undefined — `flatMap` drops it.
        .flatMap(match => match[1] ?? match[2] ?? [])
        .filter(claimed => !named.has(claimed) && !NOT_A_WORKSPACE.has(claimed))
        .map(claimed => ({ key, claimed })),
    )

    expect(invented).toEqual([])
  })
})

describe('a menu path a sentence quotes', () => {
  /**
   * `manual.i18n.test.ts` holds this for the twenty chapters, where a wrong path reads as the
   * software being broken. The bundles quote one too — `home.spotlight.connectBody` sends a
   * newcomer to `Réglages ▸ Compte` — and nothing read it: a renamed entry would have left that
   * sentence pointing at a menu nobody can find, in the one window shown before anything works.
   *
   * ONE site today, so the value is prospective; the manual's twin has gone stale three times.
   *
   * Its blind spot, and the manual's guard shares it: a segment is checked against EVERY label
   * the screen carries, not against the menu alone. A path renamed onto a word that happens to
   * be a panel title or a button elsewhere would pass — the bundles hold no menu-only index.
   */
  it.each(CODES)('quotes no menu path the screen does not carry, in %s', code => {
    const labels = screenLabels(TRANSLATIONS[code])
    const rooted = {
      root: asRead(TRANSLATIONS[code].settings.title),
      tree: settingsTree(TRANSLATIONS[code]),
    }
    const invented = [...BUNDLES[code]].flatMap(([key, value]) =>
      unquotedMenuSegments(value, labels, rooted).map(found => `${key} — ${found}`),
    )

    expect(invented).toEqual([])
  })

  /** The assertion above is a list expected EMPTY: a reading that finds nothing keeps it green. */
  it('slides from the separator onto the labels around it, and says when it cannot', () => {
    const labels = new Set(['réglages', 'compte'])

    expect(unquotedMenuSegments('Collez-les dans Réglages ▸ Compte — chiffrés.', labels)).toEqual(
      [],
    )
    expect(unquotedMenuSegments('Collez-les dans Réglages ▸ Trousseau.', labels)).toEqual([
      '"Trousseau" in Collez-les dans Réglages ▸ Trousseau',
    ])
  })

  /**
   * Three sources feed one root, and a path may name any of them. Missing the actions read
   * `Réglages ▸ Avancé ▸ Outils de développement` as invented — a true path, called false.
   */
  it('carries the screens, the settings AND the actions of a root section', () => {
    const held = settingsTree(TRANSLATIONS.fr).get(asRead(TRANSLATIONS.fr.settings.ai))

    expect(held?.has(asRead(TRANSLATIONS.fr.settings.account))).toBe(true)
    expect(
      settingsTree(TRANSLATIONS.fr)
        .get(asRead(TRANSLATIONS.fr.settings.advanced))
        ?.has(asRead(TRANSLATIONS.fr.settings.openDevtools.title)),
    ).toBe(true)
  })

  /**
   * The reading above is the whole screen; this one is the window the path opens on. Both cases
   * are green without `rooted`, which is what let `Réglages ▸ Compte` ship.
   */
  it('reads a settings path against the SECTIONS, not against every label on screen', () => {
    const labels = new Set(['réglages', 'compte', 'clés api', 'modèles d’ia'])
    const rooted = {
      root: 'réglages',
      tree: new Map([['modèles d’ia', new Set(['clés api'])]]),
    }

    expect(
      unquotedMenuSegments('Collez-les dans Réglages ▸ Modèles d’IA ▸ Compte.', labels, rooted),
    ).toEqual(['"Compte" in Collez-les dans Réglages ▸ Modèles d’IA ▸ Compte'])
    expect(unquotedMenuSegments('Collez-les dans Réglages ▸ Clés API.', labels, rooted)).toEqual([
      '"Clés API" in Collez-les dans Réglages ▸ Clés API',
    ])
    expect(
      unquotedMenuSegments('Collez-les dans Réglages ▸ Modèles d’IA ▸ Clés API.', labels, rooted),
    ).toEqual([])
  })
})

/**
 * English words one surface owns, each paired with the French it always translates. A sentence
 * that writes the English word where the French says something else has borrowed a word that
 * already names another thing on screen.
 */
const OWNED_WORDS: readonly { english: RegExp; french: RegExp; owns: string }[] = [
  {
    english: /\blayers?\b/i,
    french: /calqu/i,
    owns: 'a sheet of the image stack',
  },
]

/**
 * Keys that write an owned English word in another of its senses. Empty today, and measured so:
 * every `layer` of the English bundles pairs with a French `calque`.
 *
 * It exists so the day a MaterialX layer or a three.js layer mask reaches the screen has an
 * answer other than widening the pattern until it says nothing.
 */
const ANOTHER_SENSE: ReadonlySet<string> = new Set<string>()

const borrowedWords = (english: Map<string, string>, french: Map<string, string>) =>
  OWNED_WORDS.flatMap(word =>
    [...english]
      .filter(
        ([key, value]) =>
          word.english.test(value) &&
          !word.french.test(french.get(key) ?? '') &&
          !ANOTHER_SENSE.has(key),
      )
      .map(([key]) => `${key} — borrows the word of ${word.owns}`),
  )

describe('a word one surface owns', () => {
  /**
   * `assistant.actions.cameraAddShot.description` told an assistant which `layer` a camera shot
   * lands on, where the French said `étage` and the manual says `line` — `layer` naming a sheet
   * of the image stack everywhere else. `TWO_THINGS` cannot see it: it reads labels, and drops
   * anything ending in a full stop.
   *
   * Three blind spots. It reads the English SIDE only — a French `calque` translated some other
   * way is legitimate twice today (`Merge down`, `a layered canvas`) and stays unwatched. It
   * reads bundle values, never a word joined in code. And an entry is a pair of words, not a
   * glossary: a word the French owns alone has nothing to pair with here.
   */
  it('never lends an English word to a sentence the French says otherwise', () => {
    expect(borrowedWords(BUNDLES.en, REFERENCE)).toEqual([])
  })

  /** The assertion above is a list expected EMPTY: a reading that finds nothing keeps it green. */
  it('reads the pair rather than the English alone', () => {
    expect(
      borrowedWords(new Map([['k', 'Which layer it lands on']]), new Map([['k', 'L’étage suit']])),
    ).toEqual(['k — borrows the word of a sheet of the image stack'])
    expect(
      borrowedWords(
        new Map([['k', 'Merge the layer down']]),
        new Map([['k', 'Fusionner le calque du dessous']]),
      ),
    ).toEqual([])
  })

  /**
   * An entry whose word left the screen watches nothing, and the next reader reads it as a rule
   * still held — the failure `staleIn` exists for above, on the same file's exemptions.
   */
  it.each(OWNED_WORDS)('still reads $owns on both sides', word => {
    expect([...BUNDLES.en.values()].some(value => word.english.test(value))).toBe(true)
    expect([...REFERENCE.values()].some(value => word.french.test(value))).toBe(true)
  })
})
