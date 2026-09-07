import { render, screen } from '@testing-library/react'

import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'

import { LOCAL_RUNTIME } from '@shared/domain/model'

import { aiRoleId } from '@shared/domain/aiRole'

import { useAiModels } from '@/stores/aiModels'

import { beforeEach, describe, expect, it } from 'vitest'

import type { FieldDescriptor, ModelDescriptor } from '@shared/domain/model'

import type { StudioBridge } from '@shared/ipc'

import { withQueries } from '@/features/shell/components/query-fixtures'

import { installFakeBridge } from '@/services/fakeBridge'

import { installCanvas } from '@/stores/canvas-fixtures'

import { useLayouts } from '@/stores/layouts'

import { useGeneration } from '@/stores/generation'

import type { Asset } from '@shared/domain/asset'

import { useAssets } from '@/stores/assets'

import { useProject } from '@/stores/project'

import { useSelection } from '@/stores/selection'

import { DEFAULT_SETTINGS } from '@shared/domain/settings'

import { useSettings } from '@/stores/settings'

import { chooseModels } from '@/stores/models-fixtures'

import { chassisFor } from '@/stores/panels-fixtures'

import { prepareEdit } from '@/features/image/aiActions'

import panelSource from './Generator.tsx?raw'

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

/** The engine, reduced to what an edit asks of it: a flattened picture and no mask. */
export const host = {
  snapshot: () => Promise.resolve('FLAT'),
  maskSnapshot: () => Promise.resolve(null),
}

export function renderPanel() {
  return render(withQueries(<Generator />))
}

/** A picture picked in the explorer — the one source this panel can attach on its own. */
export const PICTURE_PATH = 'Images/concept.png'

export const PICKED: Asset = {
  id: 'asset-picked',
  name: 'concept',
  type: 'image',
  location: 'local',
  path: PICTURE_PATH,
  createdAt: '2026-08-23T00:00:00.000Z',
  tags: [],
}

export const PROJECT = {
  path: '/projects/demo',
  manifest: { version: 1, createdAt: '', updatedAt: '' },
}

describe('Generator', () => {
  let bridge: StudioBridge

  beforeEach(() => {
    installCanvas(DOCUMENT)
    useSettings.setState({
      auth: { authenticated: true },
      // A canvas is open in every case below, so the question would stand in front of the form.
      // The one case that is ABOUT the question sets `ask` itself.
      settings: {
        ...DEFAULT_SETTINGS,
        generation: { ...DEFAULT_SETTINGS.generation, landing: 'document' },
      },
    })
    useAiModels.setState({ overview: null })
    // A job collects into its own project and nowhere else, so the panel asks for one before it
    // draws a form. Every case below is about the form, and each of them needs one.
    useProject.setState({ project: PROJECT, known: true })
    chassisFor('image')
    useLayouts.setState({ activeWorkspace: 'image' })
    useGeneration.setState({ forcedCapability: null })
    useAssets.setState({ items: [] })
    useSelection.getState().selectFiles([])
    // Both image employments, because a canvas is open above: the panel reads that as working
    // FROM the picture, and only the employment it settles on decides which model runs.
    chooseModels({
      [aiRoleId('image', 'txt2img')]: 'model_flux',
      [aiRoleId('image', 'img2img')]: 'model_flux',
      [aiRoleId('video', 'txt2video')]: 'model_flux',
      [aiRoleId('video', 'img2video')]: 'model_flux',
      [aiRoleId('upscale', 'upscale')]: 'model_big',
    })

    bridge = installFakeBridge({
      // The panel resolves a picked PATH against the catalogue — see `useGenerationContext`.
      assets: { search: async () => [PICKED] },
      provider: {
        describeModel: (modelId: string) =>
          DESCRIPTORS[modelId]
            ? Promise.resolve(DESCRIPTORS[modelId])
            : Promise.reject(new Error('no model')),
        uploadAsset: (_name: string, image: string) =>
          Promise.resolve(`asset-${image.toLowerCase()}`),
      },
    })
  })
  /**
   * Picking the operation by hand is taking the generator back from whatever prepared it — the
   * gesture the Models panel used to carry, now one control away from the form it changes.
   */
  it('drops the preparation once another operation is picked', async () => {
    await prepareEdit(DOCUMENT, 'enlarge', host, bridge.provider)

    useGeneration.getState().forceCapability(aiRoleId('image', 'txt2img'))
    renderPanel()

    expect(await screen.findByText('Flux')).toBeInTheDocument()
  })

  /**
   * The form pulls zod, react-hook-form and its resolver — 219,6 kB of the opening chunk on
   * 8 August, 223 000 in its own chunk on 10 August. Nothing but a deferred import keeps them
   * out, and nothing but this says so.
   *
   * The `lazy` itself moved to `components/dynamicFormLazy`, which three panels had each written
   * for themselves; that module's only export is the `lazy`, so importing IT statically pulls
   * nothing. What must never appear here is the form's own module, under any form of import —
   * which is wider than the `^import { DynamicForm }` this line used to match.
   */
  it('never imports the form at module scope', () => {
    expect(panelSource).not.toMatch(/from '@\/components\/DynamicForm'/)
    // Both halves: an import removed without the deferred one put back would leave the panel
    // with no form at all, and the line above would still pass.
    expect(panelSource).toMatch(/from '@\/components\/dynamicFormLazy'/)
  })

  /**
   * Asserted on the source for the same reason as the import above: the note only appears after
   * a debounced dry run. Where the figure is FORMATTED moved to the hook this form reads it
   * from — `useCostEstimate.test.ts` holds that half.
   */
  it('draws whatever the cost watch says, and formats nothing itself', () => {
    expect(panelSource).toMatch(/submitNote=\{cost\.note\}/)
    expect(panelSource).not.toMatch(/formatUnits/)
  })

  /**
   * The last door before the spend. Five ways of arming a model never open the picker — a stored
   * default, "recreate", "regenerate with these parameters", a Spark idea, the canvas edits — so
   * greying the picker alone would leave every one of them to discover the 403.
   */
  describe('a model the plan does not cover', () => {
    // A project of its own: `busy` is also raised by its absence, and without one these cases
    // would pass on the wrong reason — a disabled button proving nothing about the plan.
    beforeEach(() => {
      useProject.setState({
        project: {
          path: '/projects/Summer',
          manifest: {
            version: 1,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        },
        known: true,
      })

      installFakeBridge({
        provider: {
          describeModel: () =>
            Promise.resolve({
              ...descriptor('model_flux', 'Flux', 'image'),
              requiredPlanLevel: 50,
            }),
          plan: () => Promise.resolve({ name: 'cu-basic', level: 25 }),
        },
      })
    })

    it('refuses to generate with it', async () => {
      renderPanel()

      expect(await screen.findByRole('button', { name: 'Générer' })).toBeDisabled()
    })

    it('says why, naming the plan, rather than leaving a dead button', async () => {
      renderPanel()

      expect(await screen.findByText(/cu-basic/)).toBeInTheDocument()
    })

    // Being wrong here blocks a model the user is paying for, so an unread plan refuses nothing.
    it('generates as before when the plan cannot be read', async () => {
      installFakeBridge({
        provider: {
          describeModel: () =>
            Promise.resolve({
              ...descriptor('model_flux', 'Flux', 'image'),
              requiredPlanLevel: 50,
            }),
          plan: () => Promise.resolve(null),
        },
      })
      renderPanel()

      expect(await screen.findByRole('button', { name: 'Générer' })).toBeEnabled()
    })
  })
})
