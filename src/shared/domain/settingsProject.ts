import { withoutProjectDocuments, withoutRecentProject } from './project'
import type { PartialSettings, Settings } from './settings'

/**
 * Everything keyed on a project FOLDER, dropped in one partial — the shelf row, the documents
 * that would reopen it, the startup pointer, and on a real bin the account link and the roles.
 *
 * 🛑 Composed from the settings HANDED IN, and the main process is what hands them in: a window
 * building this from its replica loses every write the main process made since the last
 * broadcast. Measured 2026-09-09 — two trashings straight after an open dropped the OPEN project
 * off the shelf, with `lastProject` cleared and nothing saying why.
 *
 * `owned` is a folder that really went to the bin. `missing` is a drive that is not plugged in,
 * and pruning the account link there is the silent adoption `projectAccounts` exists to prevent.
 */
export function settingsWithoutProject(
  settings: Settings,
  path: string,
  owned: boolean,
): PartialSettings {
  const { storage, ai } = settings
  const withoutAccount = { ...storage.projectAccounts }
  const withoutRoles = { ...ai.projectRoles }
  delete withoutAccount[path]
  delete withoutRoles[path]

  return {
    storage: {
      recentProjects: withoutRecentProject(storage.recentProjects, path),
      recentDocuments: withoutProjectDocuments(storage.recentDocuments, path),
      ...(storage.lastProject === path ? { lastProject: undefined } : {}),
      ...(owned ? { projectAccounts: withoutAccount } : {}),
    },
    ...(owned ? { ai: { projectRoles: withoutRoles } } : {}),
  }
}
