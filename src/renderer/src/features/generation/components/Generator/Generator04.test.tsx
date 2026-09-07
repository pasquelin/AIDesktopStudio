import { render, screen } from '@testing-library/react'

import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'

import { LOCAL_RUNTIME } from '@shared/domain/model'

import { aiRoleId } from '@shared/domain/aiRole'

import { localModel } from '@shared/domain/localModel-fixtures'

import type { AiOverview } from '@shared/domain/aiOverview'

import { useAiModels } from '@/stores/aiModels'

import userEvent from '@testing-library/user-event'

import { beforeEach, describe, expect, it } from 'vitest'

import type { FieldDescriptor, ModelDescriptor } from '@shared/domain/model'

import { withQueries } from '@/features/shell/components/query-fixtures'

import { installFakeBridge } from '@/services/fakeBridge'

import { installCanvas } from '@/stores/canvas-fixtures'

import { useLayouts } from '@/stores/layouts'

import { useGeneration } from '@/stores/generation'

import { useModels } from '@/stores/models'

import { useProject } from '@/stores/project'

import { useSettings } from '@/stores/settings'

import { chassisFor } from '@/stores/panels-fixtures'

import { Generator } from './Generator'

export const DOCUMENT = 'doc-1'

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

describe('the generator on this machine', () => {
  beforeEach(() => {
    installCanvas(DOCUMENT)
    useSettings.setState({ auth: { authenticated: false, reason: 'missing' } })
    useProject.setState({ project: PROJECT, known: true })
    useModels.setState({
      selected: { [aiRoleId('image', 'txt2img')]: 'ssd-1b' },
      preset: {},
    })
    chassisFor('image')
    useLayouts.setState({ activeWorkspace: 'image' })
    // Forced, because a canvas is open above and the panel would otherwise read that as working
    // FROM its picture. What this case is about is an account, not the detection.
    useGeneration.setState({ forcedCapability: aiRoleId('image', 'txt2img') })
  })

  beforeEach(() => {
    const overview: AiOverview = {
      roles: [
        {
          role: aiRoleId('image', 'txt2img'),
          provider: { kind: 'local', modelId: 'ssd-1b' },
          chosen: { app: { kind: 'local', modelId: 'ssd-1b' }, project: null },
          candidates: [
            {
              model: localModel({ id: 'ssd-1b', name: 'SSD-1B', family: 'image' }),
              installed: true,
              loaded: false,
              holdable: true,
              unverified: false,
              supplied: false,
              serves: 1,
              fit: 'compatible',
              obstacle: null,
            },
          ],
          clouds: [],
        },
      ],
      machine: {
        physicalBytes: 1,
        availableBytes: 1,
        diskFreeBytes: 1,
        gpu: null,
        vram: null,
      },
      projectPath: PROJECT.path,
      installing: null,
      loading: null,
      loadFailure: null,
      installFailure: null,
      ollama: { ready: false, installed: false, names: [], progress: null, failed: false },
      engine: { known: false, missing: [], progress: null, failed: false },
    }
    useAiModels.setState({ overview })
    installFakeBridge({
      provider: {
        describeModel: (modelId: string) =>
          DESCRIPTORS[modelId]
            ? Promise.resolve(DESCRIPTORS[modelId])
            : Promise.reject(new Error('no model')),
      },
    })
  })

  it('draws the form without an account', async () => {
    renderPanel()

    expect(await screen.findByText('SSD-1B')).toBeInTheDocument()
    expect(screen.queryByText(/identifiants/i)).toBeNull()
  })

  /**
   * 🛑 Seen on screen: clicking the word « Modèle » made the picker flicker and never stay open.
   * A `<label>` FORWARDS its click — the panel opened on the forwarded one, and the original,
   * landing outside it, closed it again. A disclosure takes no label of its own.
   */
  it('leaves the model picker shut when its name is clicked', async () => {
    renderPanel()

    await userEvent.click(await screen.findByText('Modèle'))

    expect(screen.queryByPlaceholderText(/Chercher un modèle/i)).toBeNull()
  })

  /**
   * 🛑 The Scenario key, asked for where Scenario can serve and nowhere else: a person holding an
   * Anthropic key alone was shown the Scenario form in Code, with no way past it.
   */
  it('asks for no Scenario key in a space its catalogue does not serve', () => {
    useLayouts.setState({ activeWorkspace: 'code' })
    useGeneration.setState({ forcedCapability: aiRoleId('code', 'txt2code') })
    useAiModels.setState({ overview: null })

    renderPanel()

    expect(screen.queryByText(/identifiants/i)).toBeNull()
  })
})
