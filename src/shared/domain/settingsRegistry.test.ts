import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
import { LANGUAGES, TRANSLATIONS } from '../i18n'
import { SETTING_ACTION_IDS } from './settingAction'
import { defaultAt } from './settingsPath'
import {
  ACTION_REGISTRY,
  boundsOf,
  childSections,
  descriptorAt,
  descriptorsIn,
  optionsOf,
  PATH_KINDS,
  rootSections,
  sectionEntry,
  sectionOfFamily,
  settingChoices,
  SETTING_REGISTRY,
  SETTING_SECTIONS,
  UNLISTED_PATHS,
  type SettingKind,
} from './settingsRegistry'

function resolve(bundle: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), bundle)
}

/** The window's own furniture. Not in the registry, and just as unusable untranslated. */
const CHROME_KEYS: readonly string[] = [
  'settings.title',
  'settings.sections',
  'settings.search',
  'settings.results',
  'settings.noResult',
  'settings.restoreDefault',
]

function keysOf(): string[] {
  return [
    ...CHROME_KEYS,
    ...SETTING_SECTIONS.flatMap(section => [
      section.labelKey,
      // A sub-section leans on its parent's description rather than inventing one.
      ...(section.descriptionKey ? [section.descriptionKey] : []),
    ]),
    ...SETTING_REGISTRY.flatMap(descriptor => [
      descriptor.titleKey,
      descriptor.helpKey,
      ...(descriptor.placeholderKey ? [descriptor.placeholderKey] : []),
      // An option naming itself literally has no key to look up — see `optionLabel`.
      ...optionsOf(descriptor).flatMap(option => (option.labelKey ? [option.labelKey] : [])),
    ]),
    // The buttons were outside this list until 19/08, and nothing else resolved their keys: an
    // action added with a key that does not exist paints the key itself onto the screen.
    ...ACTION_REGISTRY.flatMap(action => [
      action.titleKey,
      action.helpKey,
      action.buttonKey,
      ...(action.confirmKey ? [action.confirmKey] : []),
    ]),
  ]
}

/** The kinds a number stands behind, and therefore the ones zod bounds. */
const NUMERIC: ReadonlySet<SettingKind> = new Set<SettingKind>(['number', 'slider'])

describe('settings registry', () => {
  /**
   * The ids were DERIVED from the registry until the action catalogue needed them: importing this
   * module to close a field over them dragged every setting and its help text into the opening
   * chunk, which `eager-graph.test.ts` refuses. They are written out in a module of their own now,
   * so this is what stops the two lists parting company.
   */
  it('names the same buttons as the list the tool schema closes over', () => {
    expect([...SETTING_ACTION_IDS].sort()).toEqual(ACTION_REGISTRY.map(action => action.id).sort())
  })

  it('describes each setting once', () => {
    const paths = SETTING_REGISTRY.map(descriptor => descriptor.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('never lists a path as both described and deliberately unlisted', () => {
    const described = new Set<string>(SETTING_REGISTRY.map(descriptor => descriptor.path))
    expect(UNLISTED_PATHS.filter(path => described.has(path))).toEqual([])
  })

  // The point of the whole registry: a setting nobody can explain is a setting nobody can use.
  it.each(LANGUAGES.map(language => language.code))('says what every setting does in %s', code => {
    for (const key of keysOf()) {
      const text = resolve(TRANSLATIONS[code], key)
      expect(typeof text === 'string' && text.trim() !== '', `${key} is missing`).toBe(true)
    }
  })

  it('explains, and does not merely repeat the title', () => {
    for (const descriptor of SETTING_REGISTRY) {
      const help = resolve(TRANSLATIONS.fr, descriptor.helpKey)
      // Short enough to be a label rather than an explanation, which is what this guards.
      expect(
        String(help).length,
        `${descriptor.helpKey} is too short to explain anything`,
      ).toBeGreaterThan(40)
    }
  })

  it('bounds every numeric setting, so zod never falls back to infinity', () => {
    for (const descriptor of SETTING_REGISTRY) {
      if (!NUMERIC.has(descriptor.kind)) continue

      const bounds = boundsOf(descriptor.path)
      expect(Number.isFinite(bounds.min), `${descriptor.path} has no minimum`).toBe(true)
      expect(Number.isFinite(bounds.max), `${descriptor.path} has no maximum`).toBe(true)
    }
  })

  // Neither would leave the control showing a raw value — `system`, or a path fragment.
  it('gives every option a label, one way or the other', () => {
    for (const descriptor of SETTING_REGISTRY) {
      for (const option of optionsOf(descriptor)) {
        expect(
          option.label ?? option.labelKey,
          `${descriptor.path} offers ${String(option.value)} with no label`,
        ).toBeTruthy()
      }
    }
  })

  // A default outside the list leaves the control showing a blank the user cannot restore.
  it('offers the default of every choice among its options', () => {
    for (const descriptor of SETTING_REGISTRY) {
      if (descriptor.kind !== 'choice') continue

      const values = optionsOf(descriptor).map(option => option.value)
      expect(values, `${descriptor.path}`).toContain(defaultAt(descriptor.path))
    }
  })

  it('keeps a numeric default within the bounds it declares', () => {
    for (const descriptor of SETTING_REGISTRY) {
      if (!NUMERIC.has(descriptor.kind)) continue

      const value = defaultAt(descriptor.path)
      const bounds = boundsOf(descriptor.path)
      expect(typeof value === 'number' && value >= bounds.min && value <= bounds.max).toBe(true)
    }
  })

  /**
   * `SettingRow` refuses a non-integer from anything but a slider, so a `number` holding a
   * decimal is a field nobody can write: the value shown is one the write path rejects, and the
   * control reads as frozen. Two snap steps shipped that way before this was checked here.
   */
  it('keeps a whole-number field on whole numbers, defaults and steps alike', () => {
    for (const descriptor of SETTING_REGISTRY) {
      if (descriptor.kind !== 'number') continue

      const value = defaultAt(descriptor.path)
      expect({ path: descriptor.path, value }).toEqual({
        path: descriptor.path,
        value: Math.round(typeof value === 'number' ? value : 0),
      })
      if (descriptor.step !== undefined) expect(Number.isInteger(descriptor.step)).toBe(true)
    }
  })

  it('groups settings by the screen that shows them, in registry order', () => {
    const shown = descriptorsIn('appearance')

    expect(shown).toEqual(SETTING_REGISTRY.filter(entry => entry.section === 'appearance'))
    // Put together, the sections account for the whole registry: none of them renders nowhere.
    expect(SETTING_SECTIONS.flatMap(section => [...descriptorsIn(section.id)])).toHaveLength(
      SETTING_REGISTRY.length,
    )
  })

  // A descriptor pointing at a section that does not exist would render nowhere at all.
  it('files every setting under a section that exists', () => {
    const known = new Set(SETTING_SECTIONS.map(section => section.id))

    for (const descriptor of SETTING_REGISTRY) {
      expect(known, `${descriptor.path}`).toContain(descriptor.section)
    }
  })

  it('nests a sub-section under a parent that exists, and never under itself', () => {
    const ids = new Set(SETTING_SECTIONS.map(section => section.id))

    for (const section of SETTING_SECTIONS) {
      if (!section.parent) continue
      expect(ids, `${section.id} hangs off nothing`).toContain(section.parent)
      expect(section.parent, `${section.id} is its own parent`).not.toBe(section.id)
    }
  })

  // The navigation renders roots and their children; a section in neither would exist in the
  // union, be openable by `settings.open`, and appear in no list.
  it('accounts for every section as a root or as a child of one', () => {
    const rendered = [...rootSections(), ...rootSections().flatMap(root => childSections(root.id))]

    expect(rendered.map(section => section.id).sort()).toEqual(
      SETTING_SECTIONS.map(section => section.id).sort(),
    )
  })

  it('names each section once, and finds it back', () => {
    const ids = SETTING_SECTIONS.map(section => section.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(sectionEntry('media')?.labelKey).toBe('settings.media')
  })

  /**
   * One screen per family since ADR-23 removed the per-family default picker: an action that
   * cannot find a model has ONE place to send the person, and two screens claiming a family
   * would be free to send them to the one that no longer chooses anything.
   */
  it('finds the employment screen of a family, which is where a model is chosen', () => {
    expect(
      SETTING_SECTIONS.filter(section => section.family === 'image').map(one => one.id),
    ).toEqual(['ai.image'])
    expect(sectionOfFamily('image')).toBe('ai.image')
    expect(sectionOfFamily('skybox')).toBe('ai.skybox')
    // The three the canvas edits reach for had no screen of their own until they had an
    // employment: without one, Cutout and Vectorize stop on "no model set" with nowhere to go.
    expect(sectionOfFamily('vectorization')).toBe('ai.vectorization')
    expect(sectionOfFamily('other')).toBeUndefined()
  })

  it('finds a descriptor by path, and nothing for one it does not describe', () => {
    expect(descriptorAt('appearance.theme')?.kind).toBe('choice')
    expect(descriptorAt('storage.lastProject')).toBeNull()
  })

  // A slider without a step lands on the browser's default of 1, which for a 0.85 to 1.4 range
  // means three reachable values.
  it('gives every slider a step, which is the reason it is a slider at all', () => {
    for (const descriptor of SETTING_REGISTRY) {
      if (descriptor.kind !== 'slider') continue
      expect(descriptor.step, `${descriptor.path} has no step`).toBeGreaterThan(0)
    }
  })

  // Without one the control has to guess which native picker to open, and guessing wrong sends
  // someone hunting for a folder when they were asked for a binary.
  it('says what every path setting points at', () => {
    for (const descriptor of SETTING_REGISTRY) {
      if (descriptor.kind !== 'path') continue
      expect(PATH_KINDS, `${descriptor.path}`).toContain(descriptor.pathKind)
    }
  })

  it('leaves bounds open for a setting that declares none', () => {
    expect(boundsOf('media.ffmpegPath').max).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('settingChoices', () => {
  it('describes every choice setting by its English title, help and values', () => {
    const choices = settingChoices()
    const listed = SETTING_REGISTRY.filter(descriptor => descriptor.kind === 'choice')

    expect(Object.keys(choices).sort()).toEqual(listed.map(one => one.path).sort())
    for (const one of listed) {
      expect(choices[one.path]?.values).toEqual(optionsOf(one).map(option => option.value))
      expect(choices[one.path]?.title).not.toMatch(/^settings\./)
      expect(choices[one.path]?.help).not.toMatch(/^settings\./)
    }
  })
})
