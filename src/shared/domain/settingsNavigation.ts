import type { ApiFailure } from './failure'

export type AuthState =
  | {
      authenticated: true
      /**
       * The project this key opens onto, once the library has named it — there is no endpoint
       * that would simply say, so it is learned from the first assets that come back.
       *
       * Absent means "not known yet", which every reader treats as "do not judge ownership"
       * rather than as a mismatch.
       */
      ownerId?: string
    }
  | { authenticated: false; reason: ApiFailure }

/**
 * Sections of the settings window, named so any surface can ask for one of them — a panel that
 * has just said the API key is missing is expected to lead to where it is typed.
 *
 * Sub-sections are part of the union rather than made up by the screen: an id the shared type
 * does not know is refused by the IPC, so `settings.open('generation.image')` would fail on a
 * name the navigation happily displayed.
 */
export type SettingsSectionId =
  | 'general'
  | 'account'
  | 'appearance'
  | 'generation'
  | 'ai'
  | 'ai.image'
  | 'ai.video'
  | 'ai.3d'
  | 'ai.audio'
  | 'ai.material'
  | 'ai.skybox'
  | 'ai.code'
  | 'ai.upscale'
  | 'ai.background-removal'
  | 'ai.vectorization'
  | 'spaces'
  | 'spaces.three'
  | 'input'
  | 'shortcuts'
  | 'dictation'
  | 'media'
  | 'git'
  | 'mcp'
  | 'memory'
  | 'memory.graph'
  | 'storage'
  | 'advanced'

export const SETTINGS_SECTION_IDS: readonly SettingsSectionId[] = [
  'general',
  'account',
  'appearance',
  'generation',
  'ai',
  'ai.image',
  'ai.video',
  'ai.3d',
  'ai.audio',
  'ai.material',
  'ai.skybox',
  'ai.code',
  'ai.upscale',
  'ai.background-removal',
  'ai.vectorization',
  'spaces',
  'spaces.three',
  'input',
  'shortcuts',
  'dictation',
  'media',
  'git',
  'mcp',
  'memory',
  'memory.graph',
  'storage',
  'advanced',
]

/**
 * The section travels to the settings window inside the URL fragment its renderer reads, so
 * what a renderer sends is checked against the list rather than trusted — see invariant 1.
 */
export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.some(candidate => candidate === value)
}

/** URL fragment that tells the shared bundle it is rendering the settings window. */
export const SETTINGS_ROUTE = 'settings'

/**
 * The route the settings window loads, section included. Written by the main process and read
 * by the renderer, so both sides live here: a fragment built in one place and parsed in
 * another is a contract nothing checks.
 */
export function settingsRoute(section?: SettingsSectionId): string {
  return section ? `${SETTINGS_ROUTE}/${section}` : SETTINGS_ROUTE
}

export function isSettingsRoute(hash: string): boolean {
  const route = hash.replace(/^#/, '')
  return route === SETTINGS_ROUTE || route.startsWith(`${SETTINGS_ROUTE}/`)
}

/** The section named by the fragment, `null` for a route naming none or naming an unknown. */
export function sectionFromRoute(hash: string): SettingsSectionId | null {
  const section = hash.split('/')[1]
  return isSettingsSection(section) ? section : null
}

/**
 * Where the window opens when nothing names a section — its own ⌘, shortcut included. The top
 * of the list, which is what a settings window is expected to do; a panel that needs the API
 * key names `account` itself.
 */
export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'general'
