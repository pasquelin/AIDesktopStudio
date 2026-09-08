import { act, render, screen, waitFor } from '@testing-library/react'

import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'

import { LOCAL_RUNTIME } from '@shared/domain/model'

import { aiRoleId } from '@shared/domain/aiRole'

import { useAiModels } from '@/stores/aiModels'

import userEvent from '@testing-library/user-event'

import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { FieldDescriptor, ModelDescriptor } from '@shared/domain/model'

import type { Job } from '@shared/domain/job'

import { withQueries } from '@/features/shell/components/query-fixtures'

import { installFakeBridge } from '@/services/fakeBridge'

import { canvasHostStub, installCanvas } from '@/stores/canvas-fixtures'
import { holdCanvas } from '@/features/image/canvasHosts'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'

import { useDocuments } from '@/stores/documents'

import { useLayouts } from '@/stores/layouts'

import { useGeneration } from '@/stores/generation'

import { job } from '@/stores/job-fixtures'

import { useJobs } from '@/stores/jobs'

import { useProject } from '@/stores/project'

import { DEFAULT_SETTINGS } from '@shared/domain/settings'

import { useSettings } from '@/stores/settings'

import { chooseModels } from '@/stores/models-fixtures'

import { Generator } from './Generator'
import { mountedGenerator } from '@/features/assistant/generatorBridge'

export const DOCUMENT = 'doc-1'

export const PICTURE: FieldDescriptor = {
  key: 'image',
  kind: 'image',
  label: 'Image',
  required: true,
}

const PROMPT: FieldDescriptor = {
  key: 'prompt',
  kind: 'longText',
  label: 'Prompt',
  required: false,
  promptSpark: true,
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

describe('a generation in flight', () => {
  beforeEach(() => {
    installCanvas(DOCUMENT)
    useSettings.setState({
      auth: { authenticated: true },
      // A canvas is open here, so the question would stand in front of every case below. The two
      // that are ABOUT the question set `ask` themselves.
      settings: {
        ...DEFAULT_SETTINGS,
        generation: { ...DEFAULT_SETTINGS.generation, landing: 'document' },
      },
    })
    useAiModels.setState({ overview: null })
    useProject.setState({ project: PROJECT, known: true })
    useLayouts.setState({ activeWorkspace: 'image' })
    useGeneration.setState({ forcedCapability: aiRoleId('image', 'txt2img') })
    chooseModels({ [aiRoleId('image', 'txt2img')]: 'model_flux' })
    useJobs.setState({ jobs: [], bodies: {} })
    useGenerationComments.setState({ comments: {} })

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

  /** The one required field of these descriptors, filled so the form will submit at all. */
  const generate = async (): Promise<void> => {
    await userEvent.type(await screen.findByLabelText(/Image/), 'asset-source')
    await userEvent.click(screen.getByRole('button', { name: /Générer/ }))
  }

  it('uses pending image comments once, then clears them after submission', async () => {
    useGenerationComments.getState().add(DOCUMENT, {
      id: 'note-1',
      at: { x: 10, y: 20 },
      text: 'Keep the subject',
    })
    const snapshot = vi.fn(async () => 'COMMENTED-IMAGE')
    const release = holdCanvas(DOCUMENT, () => canvasHostStub({ snapshot }))
    onTestFinished(release)
    installFakeBridge({
      provider: {
        describeModel: async () => ({
          ...descriptor('model_flux', 'Flux', 'image'),
          fields: [PROMPT, PICTURE],
        }),
        uploadAsset: async () => 'commented-source',
        generate: async () => job({ id: 'job_1', status: 'running', progress: 0.4 }),
      },
    })
    renderPanel()

    expect(await screen.findByLabelText(/Image/)).toHaveValue('Image ouverte')
    expect(snapshot).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Générer/ }))
    await screen.findByText('En cours')

    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toEqual([])
  })

  it('submits and consumes only the comment launched from its post-it', async () => {
    useGenerationComments.getState().add(DOCUMENT, {
      id: 'launched-note',
      at: { x: 10, y: 20 },
      text: 'Remove the reflection',
    })
    useGenerationComments.getState().add(DOCUMENT, {
      id: 'later-note',
      at: { x: 30, y: 40 },
      text: 'Keep this for later',
    })
    const release = holdCanvas(DOCUMENT, () =>
      canvasHostStub({ snapshot: async () => 'COMMENTED-IMAGE' }),
    )
    onTestFinished(release)
    let sentBody: Record<string, unknown> = {}
    const generate = vi.fn(async (_modelId: string, body: Record<string, unknown>) => {
      sentBody = body
      return job({ id: 'job_1', status: 'running', progress: 0.4 })
    })
    installFakeBridge({
      provider: {
        describeModel: async () => ({
          ...descriptor('model_flux', 'Flux', 'image'),
          fields: [PROMPT, PICTURE],
        }),
        uploadAsset: async () => 'commented-source',
        generate,
      },
    })
    renderPanel()

    await screen.findByDisplayValue('Image ouverte')
    await waitFor(() => expect(mountedGenerator()?.submitComment).toBeTypeOf('function'))
    await act(async () => {
      await mountedGenerator()?.submitComment?.(DOCUMENT, 'launched-note')
    })

    expect(generate).toHaveBeenCalledWith(
      'model_flux',
      expect.objectContaining({
        prompt: expect.stringContaining('Remove the reflection'),
      }),
      'apply',
    )
    expect(sentBody).not.toEqual(
      expect.objectContaining({ prompt: expect.stringContaining('Keep this for later') }),
    )
    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toEqual([
      expect.objectContaining({ id: 'later-note' }),
    ])
  })

  it('offers no post-it submission when the active plan blocks generation', async () => {
    useGenerationComments.getState().add(DOCUMENT, {
      id: 'note-1',
      at: { x: 10, y: 20 },
      text: 'Remove the reflection',
    })
    installFakeBridge({
      provider: {
        describeModel: async () => ({
          ...descriptor('model_flux', 'Flux', 'image'),
          fields: [PROMPT, PICTURE],
          requiredPlanLevel: 50,
        }),
        plan: async () => ({ name: 'cu-basic', level: 25 }),
      },
    })
    renderPanel()

    await screen.findByText(/cu-basic/)
    await waitFor(() => expect(mountedGenerator()?.submitComment).toBeUndefined())
  })

  it('keeps a note added while the submitted snapshot is uploading', async () => {
    useGenerationComments.getState().add(DOCUMENT, {
      id: 'submitted-note',
      at: { x: 10, y: 20 },
      text: 'Keep the subject',
    })
    const release = holdCanvas(DOCUMENT, () =>
      canvasHostStub({ snapshot: async () => 'COMMENTED-IMAGE' }),
    )
    onTestFinished(release)
    let finishUpload = (_assetId: string): void => undefined
    const upload = new Promise<string>(resolve => {
      finishUpload = resolve
    })
    const uploadAsset = vi.fn(async () => await upload)
    installFakeBridge({
      provider: {
        describeModel: async () => ({
          ...descriptor('model_flux', 'Flux', 'image'),
          fields: [PROMPT, PICTURE],
        }),
        uploadAsset,
        generate: async () => job({ id: 'job_1', status: 'running', progress: 0.4 }),
      },
    })
    renderPanel()

    expect(await screen.findByLabelText(/Image/)).toHaveValue('Image ouverte')
    await userEvent.click(screen.getByRole('button', { name: /Générer/ }))
    await waitFor(() => expect(uploadAsset).toHaveBeenCalled())
    useGenerationComments.getState().update(DOCUMENT, 'submitted-note', 'Keep the new wording')
    useGenerationComments.getState().add(DOCUMENT, {
      id: 'later-note',
      at: { x: 30, y: 40 },
      text: 'Make the sky brighter',
    })
    finishUpload('commented-source')
    await screen.findByText('En cours')

    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toEqual([
      expect.objectContaining({ id: 'submitted-note', text: 'Keep the new wording' }),
      expect.objectContaining({ id: 'later-note' }),
    ])
  })

  it('keeps comments and submits nothing when their image upload fails', async () => {
    useGenerationComments.getState().add(DOCUMENT, {
      id: 'note-1',
      at: { x: 10, y: 20 },
      text: 'Keep the subject',
    })
    const release = holdCanvas(DOCUMENT, () =>
      canvasHostStub({ snapshot: async () => 'COMMENTED-IMAGE' }),
    )
    onTestFinished(release)
    const generate = vi.fn(async () => job({ id: 'job_1', status: 'running', progress: 0.4 }))
    installFakeBridge({
      provider: {
        describeModel: async () => ({
          ...descriptor('model_flux', 'Flux', 'image'),
          fields: [PROMPT, PICTURE],
        }),
        uploadAsset: async () => {
          throw new Error('upload failed')
        },
        generate,
      },
    })
    renderPanel()

    await screen.findByDisplayValue('Image ouverte')
    await userEvent.click(screen.getByRole('button', { name: /Générer/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer/ })).toBeEnabled())

    expect(generate).not.toHaveBeenCalled()
    expect(generationCommentsOf(useGenerationComments.getState(), DOCUMENT)).toHaveLength(1)
  })

  /**
   * 🛑 Asked BEFORE the run, never after: the answer decides where minutes of compute land, and
   * a question raised when the picture arrives is one nobody is still watching for.
   */
  it('asks where the result goes before spending anything on it', async () => {
    useSettings.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        generation: { ...DEFAULT_SETTINGS.generation, landing: 'ask' },
      },
    })
    renderPanel()

    await generate()

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.queryByText('En cours')).toBeNull()
  })

  // With nothing open there is nothing to choose between, so nothing is asked.
  it('asks nothing when no document is waiting for the result', async () => {
    useDocuments.setState({ documents: {}, activeId: null })
    useSettings.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        generation: { ...DEFAULT_SETTINGS.generation, landing: 'ask' },
      },
    })
    renderPanel()

    await generate()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('En cours')).toBeVisible()
  })

  /**
   * § 30: someone who pressed Generate watches the panel they pressed it in. A run whose only
   * trace is a bar at the foot of the window reads as a click that did nothing.
   */
  it('shows how far it has got, in the panel it was launched from', async () => {
    renderPanel()
    await generate()

    expect(await screen.findByText('En cours')).toBeVisible()
  })

  // 🛑 `submit` is a round trip, and a second press before it answers pays for two generations.
  it('disarms the button while one is running', async () => {
    renderPanel()
    await generate()

    expect(await screen.findByRole('button', { name: /Générer/ })).toBeDisabled()
  })

  /**
   * 🛑 The window the guard is FOR: while `submit` is in flight the job has no id yet, so
   * following the job list cannot answer for it. Reading `running` alone left the button live
   * for the whole round trip.
   */
  it('disarms it during the round trip, before any job id exists', async () => {
    let answer: (settled: Job) => void = () => {}
    installFakeBridge({
      provider: {
        describeModel: (modelId: string) =>
          DESCRIPTORS[modelId]
            ? Promise.resolve(DESCRIPTORS[modelId])
            : Promise.reject(new Error('no model')),
        generate: () => new Promise<Job>(resolve => (answer = resolve)),
      },
    })

    renderPanel()
    await generate()

    expect(screen.getByRole('button', { name: /Générer/ })).toBeDisabled()
    await act(async () => answer(job({ id: 'job_1', status: 'running' })))
  })

  it('offers to stop it, and asks the main process to', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    useJobs.setState({ cancel })

    renderPanel()
    await generate()
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler la tâche' }))

    expect(cancel).toHaveBeenCalledWith('job_1')
  })

  // A finished job has nothing to stop, and a button that cancels one answers nothing.
  it('takes the way to stop it away once it has finished', async () => {
    renderPanel()
    await generate()
    await screen.findByText('En cours')

    act(() => {
      useJobs.setState({ jobs: [job({ id: 'job_1', status: 'succeeded', progress: 1 })] })
    })

    expect(screen.queryByRole('button', { name: 'Annuler la tâche' })).toBeNull()
  })
})
