import type { SettingsSectionId } from './settings'
import type { SettingPath, SettingValue, ValueAt } from './settingsPath'

/**
 * How a setting is edited. The control follows from the kind alone: no screen decides for
 * itself what a number looks like, so two numeric settings can never end up looking different.
 *
 * Kinds arrive with the first setting that needs one — a branch nothing reaches is a branch
 * nothing tests.
 */
export type SettingKind = 'boolean' | 'choice' | 'color' | 'number' | 'path' | 'slider' | 'text'

/** What a `path` setting points at, and therefore which native picker opens. */
export type PathKind = 'file' | 'folder'

/** The values beside the type, so zod enumerates them from here rather than retyping them. */
export const PATH_KINDS: readonly PathKind[] = ['file', 'folder']

export type SettingOption<V extends SettingValue = SettingValue> = {
  value: V
  labelKey?: string
  /**
   * A literal label, for the rare option whose text is the same in every bundle: a language
   * names itself in its own language, so `Français` reads `Français` on an English screen too.
   * Exactly one of the two is set — `settingsRegistry.test.ts` refuses an option with neither.
   */
  label?: string
}

/** The one place an option's two ways of being named are reconciled. */
export function optionLabel(option: SettingOption, translate: (key: string) => string): string {
  return option.label ?? (option.labelKey ? translate(option.labelKey) : String(option.value))
}

type Descriptor<P extends SettingPath> = {
  path: P
  kind: SettingKind
  section: SettingsSectionId
  titleKey: string
  /**
   * Never optional. A setting whose effect cannot be stated in a sentence is one nobody can
   * use, and `settingsRegistry.test.ts` refuses a key missing from either bundle.
   */
  helpKey: string
  min?: number
  max?: number
  step?: number
  options?: readonly SettingOption<ValueAt<P>>[]
  placeholderKey?: string
  /**
   * Which native picker a `path` setting opens. Optional on the type and required in practice:
   * `settingsRegistry.test.ts` refuses a `path` without one, the same way it refuses a numeric
   * setting without bounds. Spelling it in the type would split `Descriptor` into a union and
   * cost every reader a narrowing to get at `min` or `options`.
   */
  pathKind?: PathKind
  /**
   * Greyed out, with the reason shown, while the condition is false. Declarative rather than a
   * predicate: it stays testable, and `shared/` takes on no logic.
   */
  dependsOn?: { path: SettingPath; equals: SettingValue }
}

/**
 * The union over every path, so `options` is checked against what the path actually holds:
 * offering `'purple'` as a theme stops compiling here rather than being refused by the IPC.
 */
export type SettingDescriptor = { [P in SettingPath]: Descriptor<P> }[SettingPath]

/**
 * Identity, but generic over the path: it is what keeps `'appearance.theme'` a literal through
 * inference instead of widening to `string`, which is what lets the coverage check see which
 * settings the registry actually describes.
 */
export function setting<P extends SettingPath>(descriptor: Descriptor<P>): Descriptor<P> {
  return descriptor
}
