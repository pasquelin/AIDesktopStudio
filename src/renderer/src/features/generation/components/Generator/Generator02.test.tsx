import { render, screen } from '@testing-library/react'

import { aiRoleId } from '@shared/domain/aiRole'

import { beforeEach, describe, expect, it } from 'vitest'

import { withQueries } from '@/features/shell/components/query-fixtures'

import { installFakeBridge } from '@/services/fakeBridge'

import { installCanvas } from '@/stores/canvas-fixtures'

import { useLayouts } from '@/stores/layouts'

import { useProject } from '@/stores/project'

import { useSettings } from '@/stores/settings'

import { chooseModels } from '@/stores/models-fixtures'

import { chassisFor } from '@/stores/panels-fixtures'

import { Generator } from './Generator'

export const DOCUMENT = 'doc-1'

export function renderPanel() {
  return render(withQueries(<Generator />))
}

/**
 * Decided with the user: the generator REQUIRES a project. A job collects into its own project
 * and nowhere else, so generating without one produces assets that land nowhere — the panel
 * used to draw the whole form with a dead button and one muted line to say why.
 */
describe('the generator without a project', () => {
  beforeEach(() => {
    installCanvas(DOCUMENT)
    useSettings.setState({ auth: { authenticated: true } })
    chassisFor('image')
    useLayouts.setState({ activeWorkspace: 'image' })
    chooseModels({
      [aiRoleId('image', 'txt2img')]: 'model_flux',
      [aiRoleId('image', 'img2img')]: 'model_flux',
      [aiRoleId('video', 'txt2video')]: 'model_flux',
      [aiRoleId('video', 'img2video')]: 'model_flux',
      [aiRoleId('upscale', 'upscale')]: 'model_big',
    })
    installFakeBridge({})
  })

  it('asks for one rather than drawing a form nothing can submit', async () => {
    useProject.setState({ project: null, known: true })

    renderPanel()

    expect(await screen.findByText(/Ouvrez un projet pour générer/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Générer/ })).toBeNull()
  })

  it('offers both ways to get one', () => {
    useProject.setState({ project: null, known: true })

    renderPanel()

    expect(screen.getByRole('button', { name: 'Ouvrir un projet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un projet' })).toBeInTheDocument()
  })

  // The studio reopens the last project on launch: taking the first `null` for an answer offers
  // to create a project to someone who already has one, for as long as the reopening takes.
  it('offers nothing before the main process has said whether there is one', () => {
    useProject.setState({ project: null, known: false })

    renderPanel()

    expect(screen.queryByRole('button', { name: 'Créer un projet' })).toBeNull()
  })

  // A cloud model still needs a key. A model of this machine must not.
  it('asks for the credentials before the project', () => {
    useSettings.setState({ auth: { authenticated: false, reason: 'missing' } })
    useProject.setState({ project: null, known: true })

    renderPanel()

    expect(screen.queryByRole('button', { name: 'Ouvrir un projet' })).toBeNull()
  })
})
