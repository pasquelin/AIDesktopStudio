import { isRecord } from '../guards'

/** Bump to replay the welcome ENTIRELY for people who finished an older one — never one slide. */
export const WELCOME_VERSION = 1

export const WELCOME_ROUTE = 'welcome'

export function isWelcomeRoute(hash: string): boolean {
  return hash.replace(/^#/, '') === WELCOME_ROUTE
}

export type WelcomeSlideId = 'language' | 'look' | 'craft' | 'ai' | 'models' | 'account' | 'project'

/**
 * A greeting slide opened this list until Alban dropped it: the masthead spells the product's name
 * above every step, so a screen whose whole content was that name again said nothing.
 */
export const WELCOME_SLIDES: readonly WelcomeSlideId[] = [
  'language',
  'look',
  'craft',
  'ai',
  'models',
  'account',
  'project',
]

export type OnboardingSettings = {
  version: number
  /** ISO 8601. Absent means the welcome has never been finished or skipped. */
  completedAt?: string
}

export const DEFAULT_ONBOARDING: OnboardingSettings = { version: 0 }

export function needsWelcome(onboarding: OnboardingSettings): boolean {
  if (!onboarding.completedAt) return true
  return onboarding.version < WELCOME_VERSION
}

export function completedOnboarding(now: string): OnboardingSettings {
  return { version: WELCOME_VERSION, completedAt: now }
}

/**
 * An existing settings file with no onboarding stamp is a studio that already ran, not a first
 * launch. Completing it here is what keeps the welcome from ambushing everyone on the day it ships.
 */
export function grandfatherOnboarding(stored: object, now: string): OnboardingSettings | undefined {
  if (Object.keys(stored).length === 0) return undefined
  // The KEY, not its `completedAt`: a reader on slide one writes the whole settings back, this
  // member included, and reading the date alone stamped the welcome done under their hands.
  if (isRecord(stored) && 'onboarding' in stored) return undefined
  return completedOnboarding(now)
}

/**
 * The shipped clips the welcome walk plays. Named here so a main test can check the folders.
 *
 * The two jumps are shipped and deliberately LEFT OUT (Alban): the welcome is a stroll, and a
 * character who leaps behind a sheet of text reads as a glitch rather than as a flourish.
 */
export type WelcomeClipName =
  | 'Walk'
  | 'WalkStart'
  | 'WalkStop'
  | 'TurnLeft'
  | 'TurnRight'
  | 'TurnAround'
  | 'StrafeLeft'
  | 'StrafeRight'

/** The eight the welcome plays, in the order it loads them. */
export const WELCOME_CLIP_NAMES: readonly WelcomeClipName[] = [
  'Walk',
  'WalkStart',
  'WalkStop',
  'TurnLeft',
  'TurnRight',
  'TurnAround',
  'StrafeLeft',
  'StrafeRight',
]
