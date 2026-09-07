import type { SettingsSectionId } from './settings'
import type { SettingPath, SettingValue } from './settingsPath'
import { type SettingDescriptor, type SettingOption } from './settingDescriptor'
import { englishText } from '../i18n'
import { SETTING_REGISTRY_FIRST } from './settingsRegistryFirst'
import { SETTING_REGISTRY_SECOND } from './settingsRegistrySecond'

export { SETTING_ACTION_IDS, type SettingActionId } from './settingAction'
export * from './settingDescriptor'
export * from './settingsSections'
export { ACTION_REGISTRY, actionsIn, type SettingAction } from './settingsRegistryActions'

export const SETTING_REGISTRY = [...SETTING_REGISTRY_FIRST, ...SETTING_REGISTRY_SECOND]

/** Same trick as `setting`, for a plain list of paths. */
function paths<P extends SettingPath[]>(...list: P): P {
  return list
}

/**
 * Leaves of `Settings` no control edits, and why. Written down so the coverage check can tell
 * a deliberate omission from a setting someone forgot to describe.
 */
export const UNLISTED_PATHS = paths(
  // Written by the main process every time a project opens: session state, not a preference.
  'storage.lastProject',
  // Picked from the microphones actually plugged in, which no table can list ahead of time —
  // `DictationDevices` renders it and `devicechange` keeps it honest.
  'dictation.inputDeviceId',
  // Waits on the cloud backend actually existing: offering a choice nothing implements would
  // be a promise the application cannot keep.
  'storage.backend',
  // Chosen from the assistant's own panel, where the wish to change it arises: one wants a
  // better model mid-sentence, and going through this screen to get there loses the sentence.
  'assistant.model',
  // The working aids of the 3D viewport, for the same reason as the line above: one turns a
  // bounding box on to answer a question about the object in front of them, and a preferences
  // window opened to get there is a window closed before the answer was read. They live in the
  // Environment panel, beside the scene they describe.
  'three.lightHelpers',
  'three.cameraHelpers',
  'three.boundingBoxes',
  'three.origins',
  'three.normals',
  'three.normalLength',
  'three.stats',
  // Written by finishing or skipping the first-launch welcome, never offered as a control.
  'onboarding.version',
  'onboarding.completedAt',
)

/**
 * Every leaf of `Settings` is either described above or listed as unlisted. A setting added to
 * the type and forgotten in both makes this collapse to something other than `never`, and the
 * alias below stops compiling — the gap surfaces at build time, not on an empty screen.
 */
type Accounted<T extends never> = T

export type UnaccountedPath = Accounted<
  Exclude<SettingPath, (typeof SETTING_REGISTRY)[number]['path'] | (typeof UNLISTED_PATHS)[number]>
>

export function descriptorAt(path: SettingPath): SettingDescriptor | null {
  return SETTING_REGISTRY.find(descriptor => descriptor.path === path) ?? null
}

export function descriptorsIn(section: SettingsSectionId): readonly SettingDescriptor[] {
  return SETTING_REGISTRY.filter(descriptor => descriptor.section === section)
}

/**
 * Widens the options of one descriptor. The registry types them per path, which makes the
 * union non-iterable at a call site; this is the single place that flattening happens.
 */
export function optionsOf(descriptor: SettingDescriptor): readonly SettingOption[] {
  return descriptor.options ?? []
}

/** What each choice setting accepts, in English, for a reader that has the VALUES but not the screen. */
export type SettingChoice = { title: string; help: string; values: readonly SettingValue[] }

/**
 * 🛑 `settings.read` answers these beside the values: shown `shadowQuality: 'hard'` alone, a model
 * asked for « the highest » read the settings three times and never learnt that `soft` is the top
 * (10.5, 2026-09-06).
 */
let choicesHeld: Record<string, SettingChoice> | null = null

export function settingChoices(): Record<string, SettingChoice> {
  return (choicesHeld ??= Object.fromEntries(
    SETTING_REGISTRY.filter(descriptor => descriptor.kind === 'choice').map(descriptor => [
      descriptor.path,
      {
        title: englishText(descriptor.titleKey),
        help: englishText(descriptor.helpKey),
        values: optionsOf(descriptor).map(option => option.value),
      },
    ]),
  ))
}

export type Bounds = {
  min: number
  max: number
}

/**
 * Bounds a numeric setting declares, for zod as much as for the control. Unbounded when the
 * path declares nothing — `settingsRegistry.test.ts` is what guarantees no numeric setting
 * ever reaches that fallback.
 */
export function boundsOf(path: SettingPath): Bounds {
  const descriptor = descriptorAt(path)
  return {
    min: descriptor?.min ?? Number.NEGATIVE_INFINITY,
    max: descriptor?.max ?? Number.POSITIVE_INFINITY,
  }
}
