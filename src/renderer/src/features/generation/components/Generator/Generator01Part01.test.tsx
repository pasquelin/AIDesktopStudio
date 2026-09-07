import { render, screen } from '@testing-library/react'

import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'

import { LOCAL_RUNTIME } from '@shared/domain/model'

import { aiRoleId } from '@shared/domain/aiRole'

import { useAiModels } from '@/stores/aiModels'

import userEvent from '@testing-library/user-event'

import { beforeEach, describe, expect, it } from 'vitest'

import type { FieldDescriptor, ModelDescriptor, ModelSummary } from '@shared/domain/model'

import type { StudioBridge } from '@shared/ipc'

import { withQueries } from '@/features/shell/components/query-fixtures'

import { installFakeBridge } from '@/services/fakeBridge'

import { installCanvas } from '@/stores/canvas-fixtures'

import { useLayouts } from '@/stores/layouts'

import { useGeneration } from '@/stores/generation'

import type { Asset } from '@shared/domain/asset'

import { useAssets } from '@/stores/assets'

import { useProject } from '@/stores/project'

import { selectedFilePaths, useSelection } from '@/stores/selection'

import { connectPreparation } from '@/stores/preparation'

import { DEFAULT_SETTINGS } from '@shared/domain/settings'

import { useSettings } from '@/stores/settings'

import { chooseModels } from '@/stores/models-fixtures'

import { chassisFor } from '@/stores/panels-fixtures'

import { prepareEdit } from '@/features/image/aiActions'

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

export function selectPicture(): void {
  useAssets.setState({ items: [PICKED] })
  useSelection.getState().selectFiles([PICTURE_PATH])
}

/** A row the picker can list, for the state where the catalogue holds one and none is chosen. */
export const OFFERED: ModelSummary = {
  id: 'model_offered',
  name: 'Offered',
  family: 'image',
  runsOn: SCENARIO_CLOUD,
  source: 'scenario',
  origin: 'official',
  featured: false,
  capabilities: [],
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
  it('opens on the model the detected operation is served by', async () => {
    renderPanel()

    expect(await screen.findByText('Flux')).toBeInTheDocument()
  })

  /**
   * The operation follows what is at hand, and nobody has to know the word for it is `img2img`.
   * The picture is SELECTED: what the panel can send is what the catalogue holds a row for.
   */
  it('reads a selected picture as the operation to run, and says which', async () => {
    selectPicture()
    renderPanel()

    await screen.findByText('Flux')
    expect(screen.getByLabelText('Opération')).toHaveValue('image/img2img')
  })

  /**
   * 🛑 The sources are drawn AND sent: they decide which operation runs, so drawing one the
   * request never carries would switch the model under the person and leave the picture behind.
   */
  it('opens the form on the picture it says it is working from', async () => {
    selectPicture()
    chooseModels({ [aiRoleId('image', 'img2img')]: 'model_flux' })
    renderPanel()

    expect(await screen.findByLabelText(/Image/)).toHaveValue('asset-picked')
  })

  /**
   * § 20: a model that serves no employment used to draw nothing at all — the rail dropped the
   * generator's icon and the panel returned null. The operation stays on screen, so another can
   * be picked without leaving.
   */
  it('says an operation has no model rather than drawing an empty panel', async () => {
    selectPicture()
    chooseModels({ [aiRoleId('image', 'txt2img')]: 'model_flux' })
    renderPanel()

    expect(await screen.findByText('Aucun modèle ne sert cette opération.')).toBeVisible()
    expect(screen.getByLabelText('Opération')).toBeInTheDocument()
  })

  /**
   * The two states wore ONE sentence, and it was the wrong one on the commoner of them: "no model
   * available for this operation" was painted over a picker listing a dozen, because what it
   * really meant was that none had been chosen yet.
   */
  it('tells having no model to choose from apart from having chosen none', async () => {
    selectPicture()
    chooseModels({})
    installFakeBridge({
      provider: {
        searchModels: () => Promise.resolve({ items: [OFFERED], cursor: null }),
      },
    })
    renderPanel()

    expect(await screen.findByText('Choisissez un modèle pour continuer.')).toBeVisible()
  })

  /**
   * The shelf it was picked in can be a closed panel, so the line saying what will be sent is the
   * only place the source exists — and it stayed there through a document being closed, with
   * nothing on screen to say where it came from or how to be rid of it.
   */
  it('takes a source off by deselecting it where it was picked', async () => {
    selectPicture()
    renderPanel()

    await screen.findByText('Sélectionné dans l’explorateur')
    await userEvent.click(screen.getByRole('button', { name: 'Retirer cette source' }))

    expect(selectedFilePaths(useSelection.getState())).toEqual([])
    expect(screen.queryByText('concept.png')).not.toBeInTheDocument()
  })

  /**
   * 🛑 The half a deselection does not do on its own. `defaultValues` carries what the previous
   * descriptor held, and a preset that merely stops naming the field lets the withdrawn id back
   * in as if it had been typed — the panel then drew one answer to "what is sent" and the form
   * below it drew another, which is the silent generation the sources list exists to prevent.
   */
  it('takes the withdrawn source out of the form, not only out of the list', async () => {
    selectPicture()
    renderPanel()

    expect(await screen.findByLabelText(/Image/)).toHaveValue('asset-picked')
    await userEvent.click(screen.getByRole('button', { name: 'Retirer cette source' }))

    expect(screen.getByLabelText(/Image/)).toHaveValue('')
  })

  /**
   * The whole point of the edit: Enlarge asks for an upscaler, which is another family than the
   * workspace's. Reading the workspace family alone left the panel on the image model, so the
   * form showed neither the right parameters nor the picture that had just been uploaded — and
   * Generate would have run Flux on it.
   */
  it('opens on the model an edit prepared, not on the one the workspace holds', async () => {
    await prepareEdit(DOCUMENT, 'enlarge', host, bridge.provider)
    renderPanel()

    expect(await screen.findByText('Magnific Upscaler')).toBeInTheDocument()
    expect(screen.queryByText('Flux')).not.toBeInTheDocument()
  })

  // A preparation is a parenthesis: leaving the space closes it, and the panel comes back to the
  // family of wherever the user now is. `connectPreparation` is what the application branches.
  it('comes back to the workspace family once the preparation is closed', async () => {
    const stop = connectPreparation()
    await prepareEdit(DOCUMENT, 'enlarge', host, bridge.provider)

    useLayouts.setState({ activeWorkspace: 'video' })
    renderPanel()

    expect(await screen.findByText('Flux')).toBeInTheDocument()
    stop()
  })
})
