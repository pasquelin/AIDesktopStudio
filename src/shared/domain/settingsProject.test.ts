import { describe, expect, it } from 'vitest'
import type { RecentDocument } from './projectRecent'
import { DEFAULT_SETTINGS } from './settings'
import { settingsWithoutProject } from './settingsProject'

describe('dropping what is keyed on a project folder', () => {
  const shelved = (path: string) => ({ path, openedAt: '2026-09-09' })
  const opened = (project: string): RecentDocument => ({
    project,
    path: 'doc.png',
    kind: 'image',
    openedAt: '2026-09-09',
  })
  const stored = (lastProject: string | undefined) => ({
    ...DEFAULT_SETTINGS,
    storage: {
      ...DEFAULT_SETTINGS.storage,
      recentProjects: [shelved('/a'), shelved('/b')],
      recentDocuments: [opened('/a'), opened('/b')],
      lastProject,
    },
  })

  /**
   * 🛑 `startup: 'lastProject'` is the default, so a removal that left the pointer behind was
   * undone by the next launch: the project reopened, `withRecentProject` put the row back at the
   * top, and nothing anywhere said why.
   */
  it('clears the startup pointer when it named that folder, and leaves another alone', () => {
    expect(settingsWithoutProject(stored('/a'), '/a', false).storage).toMatchObject({
      recentProjects: [shelved('/b')],
      // Its documents go with it: each row would otherwise reopen the project just dropped.
      recentDocuments: [opened('/b')],
      lastProject: undefined,
    })
    // Naming another project, the key is not written at all: the merge leaves it standing.
    expect(settingsWithoutProject(stored('/b'), '/a', false).storage).not.toHaveProperty(
      'lastProject',
    )
  })
})
