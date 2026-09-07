import { render, screen } from '@testing-library/react'

import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'

import { LOCAL_RUNTIME } from '@shared/domain/model'

import { aiRoleId } from '@shared/domain/aiRole'

import { useAiModels } from '@/stores/aiModels'

import userEvent from '@testing-library/user-event'

import { beforeEach, describe, expect, it } from 'vitest'

import type { FieldDescriptor, ModelDescriptor } from '@shared/domain/model'

import { withQueries } from '@/features/shell/components/query-fixtures'

import { installFakeBridge } from '@/services/fakeBridge'

import { scriptRefAt, useCode } from '@/stores/code'

import { installDocument } from '@/stores/document-fixtures'

import { useLayouts } from '@/stores/layouts'

import { useGeneration } from '@/stores/generation'

import { job } from '@/stores/job-fixtures'

import { useJobs } from '@/stores/jobs'

import { useProject } from '@/stores/project'

import { DEFAULT_SETTINGS } from '@shared/domain/settings'

import { useSettings } from '@/stores/settings'

import { chooseModels } from '@/stores/models-fixtures'

import { Generator } from './Generator'

export const PICTURE: FieldDescriptor = {
  key: 'image',
  kind: 'image',
  label: 'Image',
  required: true,
}

export const DESCRIPTORS: Record<string, ModelDescriptor> = {
  model_flux: descriptor('model_flux', 'Flux', 'image'),
  model_big: descriptor('model_big', 'Magnific Upscaler', 'upscale'),
  'ssd-1b': {
    ...descriptor('ssd-1b', 'SSD-1B', 'image'),
    runsOn: LOCAL_RUNTIME,
  },
  model_code: {
    ...descriptor('model_code', 'Sonnet', 'code'),
    capabilities: ['txt2code', 'code2code'],
    fields: [{ key: 'prompt', kind: 'text', label: 'Prompt', required: true }],
  },
}

export function descriptor(
  id: string,
  name: string,
  family: ModelDescriptor['family'],
): ModelDescriptor {
  return {
    id,
    name,
    family,
    runsOn: SCENARIO_CLOUD,
    source: 'scenario',
    origin: 'official',
    featured: false,
    capabilities: ['img2img'],
    tags: [],
    fields: [PICTURE],
  }
}

export function renderPanel() {
  return render(withQueries(<Generator />))
}

export const PROJECT = {
  path: '/projects/demo',
  manifest: { version: 1, createdAt: '', updatedAt: '' },
}

/**
 * The Code space, where a landing OVERWRITES rather than adds — the one place the destination is
 * a fact of the operation and not of a preference.
 */
describe('a generation that lands in a script', () => {
  beforeEach(() => {
    installDocument('Walk', 'code')
    useCode.getState().installed(scriptRefAt('Scripts/Walk.ts'), 'export const x = 1')
    useSettings.setState({
      auth: { authenticated: true },
      // 🛑 `ask` on purpose: the operation's own answer has to win over the preference, or the
      // question stands in front of a request that already settled it.
      settings: {
        ...DEFAULT_SETTINGS,
        generation: { ...DEFAULT_SETTINGS.generation, landing: 'ask' },
      },
    })
    useAiModels.setState({ overview: null })
    useProject.setState({ project: PROJECT, known: true })
    useLayouts.setState({ activeWorkspace: 'code' })
    useGeneration.setState({ forcedCapability: aiRoleId('code', 'code2code') })
    chooseModels({ [aiRoleId('code', 'code2code')]: 'model_code' })
    useJobs.setState({ jobs: [], bodies: {} })

    installFakeBridge({
      provider: {
        describeModel: (modelId: string) =>
          DESCRIPTORS[modelId]
            ? Promise.resolve(DESCRIPTORS[modelId])
            : Promise.reject(new Error('no model')),
        generate: () => Promise.resolve(job({ id: 'job_1', status: 'running', progress: 0.4 })),
      },
    })
  })

  /** Everywhere else a generation adds a picture; here it writes over a file being edited. */
  it('names the file it will write into, and the one that travels with the request', async () => {
    renderPanel()

    expect(await screen.findByLabelText('Destination')).toHaveValue('document')
    expect(screen.getByRole('option', { name: 'Dans Walk.ts' })).toBeInTheDocument()
    expect(screen.getByText(/Walk\.ts part avec la demande/)).toBeVisible()
  })

  /** 🛑 The operation settles it, so there is nothing left to ask — `landing: 'ask'` or not. */
  it('asks nothing, the operation having already said where it goes', async () => {
    renderPanel()

    await userEvent.type(await screen.findByLabelText(/Prompt/), 'twice as fast')
    await userEvent.click(screen.getByRole('button', { name: /Générer/ }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('En cours')).toBeVisible()
  })

  /** The control deviates it, and the deviation is held OUT of the form — invariant 5. */
  it('lets the destination be deviated to a file of its own', async () => {
    renderPanel()

    await userEvent.selectOptions(await screen.findByLabelText('Destination'), 'newTab')

    expect(screen.getByLabelText('Destination')).toHaveValue('newTab')
    // What travels is a fact of the OPERATION, and deviating where it lands does not change it.
    expect(screen.getByText(/Walk\.ts part avec la demande/)).toBeVisible()
  })
})
