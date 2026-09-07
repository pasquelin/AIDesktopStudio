import { render, screen } from '@testing-library/react'

import { aiRoleId } from '@shared/domain/aiRole'

import { useAiModels } from '@/stores/aiModels'

import { beforeEach, describe, expect, it } from 'vitest'

import { withQueries } from '@/features/shell/components/query-fixtures'

import { installCanvas } from '@/stores/canvas-fixtures'

import { useLayouts } from '@/stores/layouts'

import { useGeneration } from '@/stores/generation'

import { useProject } from '@/stores/project'

import { useSettings } from '@/stores/settings'

import { useAccounts } from '@/stores/accounts'

import { TRIPO_CLOUD } from '@shared/domain/tripo'

import { chassisFor } from '@/stores/panels-fixtures'

import { Generator } from './Generator'

export const DOCUMENT = 'doc-1'

export function renderPanel() {
  return render(withQueries(<Generator />))
}

export const PROJECT = {
  path: '/projects/demo',
  manifest: { version: 1, createdAt: '', updatedAt: '' },
}

/**
 * 🛑 A SECOND cloud serving the family answers for it too, and the Scenario flag alone does not.
 * Read on that flag, a Tripo key was refused the 3D and Image forms while the picker listed its
 * fifty models right beside them — measured in the app on 2026-08-31.
 */
describe('the generator on a second cloud', () => {
  beforeEach(() => {
    installCanvas(DOCUMENT)
    useSettings.setState({ auth: { authenticated: false, reason: 'missing' } })
    useProject.setState({ project: PROJECT, known: true })
    chassisFor('image')
    useLayouts.setState({ activeWorkspace: 'image' })
    useGeneration.setState({ forcedCapability: aiRoleId('image', 'txt2img') })
    // Read, and holding nothing of this machine: the guard is only reached past both.
    useAiModels.setState({
      overview: {
        roles: [],
        machine: { physicalBytes: 1, availableBytes: 1, diskFreeBytes: 1, gpu: null, vram: null },
        projectPath: PROJECT.path,
        installing: null,
        loading: null,
        loadFailure: null,
        installFailure: null,
        ollama: { ready: false, installed: false, names: [], progress: null, failed: false },
        engine: { known: false, missing: [], progress: null, failed: false },
      },
    })
    useAccounts.setState({ accounts: [], accountsLoaded: true })
  })

  it('asks for a key when no held cloud serves the family', () => {
    renderPanel()

    expect(screen.getAllByText(/identifiants/i).length).toBeGreaterThan(0)
  })

  it('draws the form when another held cloud serves it', () => {
    useAccounts.setState({
      accounts: [{ id: 'account-tripo', name: 'Studio', providerId: TRIPO_CLOUD, active: true }],
      accountsLoaded: true,
    })

    renderPanel()

    expect(screen.queryByText(/identifiants/i)).toBeNull()
  })
})
