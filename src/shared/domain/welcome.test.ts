import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import {
  completedOnboarding,
  grandfatherOnboarding,
  isWelcomeRoute,
  needsWelcome,
  WELCOME_CLIP_NAMES,
  WELCOME_SLIDES,
  WELCOME_VERSION,
} from './welcome'

describe('welcome route', () => {
  it('recognises the fragment the window loads', () => {
    expect(isWelcomeRoute('#welcome')).toBe(true)
    expect(isWelcomeRoute('welcome')).toBe(true)
  })

  it('rejects every other window', () => {
    expect(isWelcomeRoute('#settings')).toBe(false)
    expect(isWelcomeRoute('')).toBe(false)
  })
})

describe('whether the welcome still has to run', () => {
  it('asks a fresh install to go through it', () => {
    expect(needsWelcome(DEFAULT_SETTINGS.onboarding)).toBe(true)
  })

  it('leaves a finished install alone', () => {
    expect(needsWelcome(completedOnboarding('2026-09-05T10:00:00.000Z'))).toBe(false)
  })

  it('asks again when the slides have moved on', () => {
    expect(
      needsWelcome({ version: WELCOME_VERSION - 1, completedAt: '2026-01-01T00:00:00.000Z' }),
    ).toBe(true)
  })
})

describe('grandfathering an existing profile', () => {
  it('does not stamp an empty store, which is a first launch', () => {
    expect(grandfatherOnboarding({}, '2026-09-05T10:00:00.000Z')).toBeUndefined()
  })

  it('stamps a profile that already had settings and never saw the welcome', () => {
    expect(
      grandfatherOnboarding({ general: { language: 'fr' } }, '2026-09-05T10:00:00.000Z'),
    ).toEqual(completedOnboarding('2026-09-05T10:00:00.000Z'))
  })

  /** The reader is ON slide one: picking a language writes the whole settings back, this member
   * included, and stamping there buried the welcome under their hands. */
  it('leaves a profile that is going through the welcome right now', () => {
    expect(
      grandfatherOnboarding(
        { general: { language: 'fr' }, onboarding: { version: 0 } },
        '2026-09-05T10:00:00.000Z',
      ),
    ).toBeUndefined()
  })

  it('leaves a profile that already finished it', () => {
    const onboarding = completedOnboarding('2026-01-01T00:00:00.000Z')
    expect(grandfatherOnboarding({ onboarding }, '2026-09-05T10:00:00.000Z')).toBeUndefined()
  })
})

describe('the slides', () => {
  it('opens on language and ends on the project', () => {
    expect(WELCOME_SLIDES[0]).toBe('language')
    expect(WELCOME_SLIDES.at(-1)).toBe('project')
  })
})

describe('the walk clips', () => {
  it('names each shipped folder once, which is what the loader asks the scheme for', () => {
    expect(new Set(WELCOME_CLIP_NAMES).size).toBe(WELCOME_CLIP_NAMES.length)
  })
})
