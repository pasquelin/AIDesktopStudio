import { describe, expect, it } from 'vitest'
import type { RecentDocument } from './projectRecent'
import { DEFAULT_SETTINGS } from './settings'
import { settingsWithMovedProject, settingsWithoutProject } from './settingsProject'

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

describe('moving what is keyed on a project folder', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    storage: {
      ...DEFAULT_SETTINGS.storage,
      recentProjects: [{ path: '/a', openedAt: '2026-09-09' }],
      lastProject: '/a',
      projectAccounts: { '/a': 'compte' },
    },
    ai: { ...DEFAULT_SETTINGS.ai, projectRoles: { '/a': {} } },
  }

  /**
   * 🛑 EVERYTHING keyed by folder moves with it, and the account link above all: orphaned at the
   * old path, `planProjectAccount` answers `adopt` and the project silently comes back on
   * whichever key is active — a destructive write nobody asked for.
   */
  it('carries the shelf row, the pointer, the account link and the roles to the new folder', () => {
    expect(settingsWithMovedProject(settings, '/a', '/b')).toEqual({
      storage: {
        recentProjects: [{ path: '/b', openedAt: '2026-09-09' }],
        projectAccounts: { '/b': 'compte' },
        lastProject: '/b',
      },
      ai: { projectRoles: { '/b': {} } },
    })
  })

  // Naming another project, the pointer is not written at all: the merge leaves it standing.
  it('leaves a startup pointer that names another project alone', () => {
    const elsewhere = { ...settings, storage: { ...settings.storage, lastProject: '/other' } }

    expect(settingsWithMovedProject(elsewhere, '/a', '/b').storage).not.toHaveProperty(
      'lastProject',
    )
  })
})
