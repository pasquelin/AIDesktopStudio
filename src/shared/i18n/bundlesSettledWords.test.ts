import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
import { SETTLED_WORDS } from './bundlesSettledWords.testFixtures'
import { LANGUAGES, TRANSLATIONS, type Language } from './index'

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

const CODES = LANGUAGES.map(language => language.code)

// Written out rather than mapped over `LANGUAGES`: the Record makes a new language a compile
// error here, which is the one place that must not silently skip it.
const BUNDLES: Record<Language, Map<string, string>> = {
  fr: flatten(TRANSLATIONS.fr),
  en: flatten(TRANSLATIONS.en),
}

const ENGLISH_SAMPLES = [
  'file browser',
  'preference',
  'picture',
  'log',
  'montage',
  'reveal',
  'texture',
  'node',
]

/**
 * The negative half. Each word matches its reading once the boundary is dropped, which is what
 * makes it worth asserting — a sample no reading could ever touch is green by construction.
 * `preferences?` has none: no English word carries `preference` inside a longer one.
 * `node.markAsCuttingTool` proves the other half — what rejects it is the LOOKAHEAD, not the boundary. Which is
 * the blind spot — a reading added tomorrow without a near miss of its own stays green.
 */
const ENGLISH_NEAR_MISSES = [
  'profile browser',
  'catalogue',
  'pictured',
  'remontage',
  'revealed',
  'textured',
  'anode',
  'node.markAsCuttingTool',
]

describe('the settled words in the translation bundles', () => {
  it.each(CODES)('says one thing one way in %s', code => {
    const drifted = [...BUNDLES[code]].flatMap(([key, text]) =>
      SETTLED_WORDS[code]
        .filter(({ dropped, except }) => dropped.test(text) && !except?.includes(key))
        .map(({ kept }) => `${key} — say "${kept}"`),
    )

    expect(drifted).toEqual([])
  })

  /**
   * An exempted key that stopped writing the word it was exempted for is an exemption nobody
   * would think to delete — and the next reader takes it for a rule. The same reasoning as the
   * stale `TWO_THINGS` entry below, applied to a list of keys rather than a term.
   */
  it.each(CODES)('drops a key exemption once that key stops saying the word in %s', code => {
    const covering = SETTLED_WORDS[code].flatMap(({ dropped, except }) =>
      (except ?? [])
        .filter(key => {
          const text = BUNDLES[code].get(key)
          return text === undefined || !dropped.test(text)
        })
        .map(key => `${key} — no longer says what ${dropped.source} exempts it for`),
    )

    expect(covering).toEqual([])
  })

  /**
   * `\b` is ASCII in JavaScript whatever the flags, so a boundary after `é` bounds nothing: the
   * first writing of the `rigué` reading also matched `intrigue`, `rigueur` and `garrigue`. It ran
   * GREEN, and only because no bundle value happened to say any of them — the manual says
   * `intrigue`. Hence the lookarounds on `\p{L}`, and hence this.
   *
   * French only, the English words being ASCII. That their readings are BOUNDED is not a property
   * of being ASCII and is kept by `ENGLISH_NEAR_MISSES` below — `/file browser/i` carried no
   * boundary and read `profile browser`. An accented English reading would belong here.
   */
  it('reads a settled French word whole, never inside a longer one', () => {
    const says = (word: string) => SETTLED_WORDS.fr.some(({ dropped }) => dropped.test(word))
    const samples = [
      'système de fichiers',
      'préférence',
      'champ de vision',
      'maillage',
      'matériau',
      'rigué',
      'riguées',
      'un rig',
      'des rigs',
      'plan',
      'plans',
      'texture',
      'textures',
    ]

    // The canary of an assertion on an empty list: a reading that stopped matching would pass it.
    expect(samples.filter(word => !says(word))).toEqual([])
    // `says` is a disjunction: without this, a typo'd reading passes on a neighbour's match.
    expect(
      SETTLED_WORDS.fr
        .filter(({ dropped }) => !samples.some(word => dropped.test(word)))
        .map(({ kept }) => kept),
    ).toEqual([])
    expect(
      [
        'intrigue',
        'intriguée',
        'rigueur',
        'garrigue',
        'planète',
        'plane',
        'plantage',
        'premier plan',
        'premiers plans',
        'second plan',
        'arrière-plan',
        'abonnement {{plan}}',
      ].filter(says),
    ).toEqual([])
  })

  /**
   * The same canary for the English readings, which had none: `drifted` runs against a bundle
   * that no longer says any of these, so a typo — `/\bmontagess?\b/` — would ship green.
   * `orphans` keeps a sample from outliving the entry it was written for, `swallowed` is the
   * negative half a reading needs to prove it reads its word whole.
   */
  it('reads every settled English word whole, none of the readings dead', () => {
    const dead = SETTLED_WORDS.en.filter(
      ({ dropped }) => !ENGLISH_SAMPLES.some(word => dropped.test(word)),
    )
    const orphans = ENGLISH_SAMPLES.filter(
      word => !SETTLED_WORDS.en.some(({ dropped }) => dropped.test(word)),
    )
    const swallowed = ENGLISH_NEAR_MISSES.filter(word =>
      SETTLED_WORDS.en.some(({ dropped }) => dropped.test(word)),
    )

    expect(dead.map(({ kept }) => kept)).toEqual([])
    expect(orphans).toEqual([])
    expect(swallowed).toEqual([])
  })
})
