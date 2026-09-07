import { isRecord } from '../guards'
import { DEFAULT_SETTINGS, type PartialSettings, type Settings } from './settings'

/** A value one control can edit. Anything else is a branch, or a screen of its own. */
export type SettingValue = string | number | boolean

/**
 * Branches whose editor is a screen rather than a control per leaf — the default model of a
 * family is picked from a catalogue fetched at runtime, a keyboard binding is captured by
 * pressing it, the home's sections are ordered on the home itself, the spaces are dragged into
 * order on the bar that shows them, the models the person supplied are added by pointing at a
 * file, the model each cloud answers with is typed beside that cloud, and the recent projects and
 * documents — like the account each project works under — are written by OPENING one. None of
 * which is a list anyone can write down.
 *
 * Named by full path, not by key: excluding `'overrides'` wherever it appears would also swallow
 * a future `appearance.overrides`, and a leaf missing from `SettingPath` is a leaf the coverage
 * check can no longer notice.
 */
type DedicatedPath =
  | 'shortcuts.overrides'
  | 'home.sections'
  | 'storage.recentProjects'
  | 'storage.recentDocuments'
  | 'storage.projectAccounts'
  | 'ai.roles'
  | 'ai.projectRoles'
  | 'ai.ownModels'
  | 'assistant.cloudModels'
  | 'workspaces.order'

/**
 * Dotted paths to the leaves of `Settings`, derived rather than listed: a setting added to the
 * type and forgotten in the registry then fails the coverage check instead of quietly having no
 * screen, and a path with a typo stops compiling.
 */
type LeafPaths<T> = {
  [K in keyof T & string]: NonNullable<T[K]> extends SettingValue
    ? K
    : `${K}.${LeafPaths<NonNullable<T[K]>>}`
}[keyof T & string]

export type SettingPath = Exclude<LeafPaths<Settings>, `${DedicatedPath}${string}`>

type Descend<T, P extends string> = P extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? Descend<NonNullable<T[Key]>, Rest>
    : never
  : P extends keyof T
    ? NonNullable<T[P]>
    : never

/** What a given path holds — so a descriptor cannot offer `3` as a choice of theme. */
export type ValueAt<P extends SettingPath> = Descend<Settings, P>

function isSettingValue(value: unknown): value is SettingValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/**
 * Reads one leaf. Absent means the setting is unset, which for an optional path is normal —
 * and, over a partial, means the write simply says nothing about it.
 */
export function valueAt(
  settings: Settings | PartialSettings,
  path: SettingPath,
): SettingValue | undefined {
  let current: unknown = settings

  for (const key of path.split('.')) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }

  return isSettingValue(current) ? current : undefined
}

/** What a setting starts at. Read through the path, so no default is ever written twice. */
export function defaultAt(path: SettingPath): SettingValue | undefined {
  return valueAt(DEFAULT_SETTINGS, path)
}

/**
 * A one-leaf write, in the shape the boundary takes. The single place a path becomes a nested
 * object, so the one cast it needs is written once — and what it produces is validated against
 * zod in the main process before anything is stored.
 */
export function partialFor(path: SettingPath, value: SettingValue | undefined): PartialSettings {
  const nested = path.split('.').reduceRight<unknown>((inner, key) => ({ [key]: inner }), value)

  // A runtime string cannot be spelled as a key of `PartialSettings`; `parsePartialSettings`
  // is what actually decides whether this is acceptable.
  return nested as PartialSettings
}
