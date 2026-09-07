import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { Job, JobStatus } from '@shared/domain/job'
import { useAssets } from './assets'
import { canvasOf, useCanvases } from './canvases'
import { installDocument } from './document-fixtures'
import { catalogueHolds, flush } from './generation-fixtures'
import { useDocuments } from './documents'
import { job as jobOf } from './job-fixtures'
import { claimImageOnSubmit, connectImageGeneration } from './imageGeneration'
import { useJobs } from './jobs'
import { groupLayer, pixelLayer } from '@/engines/canvas/canvasState'

const opened: Asset[] = []
vi.mock('@/helpers/openAsset', () => ({
  openAsset: (asset: Asset) => {
    opened.push(asset)
    return Promise.resolve()
  },
}))

const picture = (id: string, overrides: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  type: 'image',
  location: 'local',
  jobId: 'job-1',
  tags: [],
  createdAt: '2026-08-08T10:00:00.000Z',
  ...overrides,
})

/** The shared fixture, told the id this suite's assets name. */
const job = (overrides: Partial<Job> = {}): Job =>
  jobOf({ id: 'job-1', label: 'Scenario Flux.1', ...overrides })

async function finish(status: JobStatus, overrides: Partial<Job> = {}): Promise<void> {
  useJobs.setState({ jobs: [job({ status, ...overrides })] })
  await flush()
}

/** Submits from whatever tab is in front, the way the generator does — capture, then settle. */
function submitFrom(jobId: string): void {
  claimImageOnSubmit()(job({ id: jobId }))
}

const stack = (documentId: string) => canvasOf(useCanvases.getState(), documentId)

let stop = (): void => undefined

beforeEach(() => {
  useDocuments.setState({ documents: {}, activeId: null })
  useJobs.setState({ jobs: [] })
  useAssets.setState({ items: [] })
  opened.length = 0
  installDocument('doc-1', 'image')
  stop = connectImageGeneration()
})

afterEach(() => {
  stop()
})

describe('landing a generation when no canvas is waiting for it', () => {
  beforeEach(() => {
    useDocuments.setState({ documents: {}, activeId: null })
  })

  /**
   * 🛑 A workspace with nothing open used to claim NOTHING, so the picture was paid for,
   * collected, and left on the shelf where only a browse would find it. `openAsset` is the
   * studio's one rule for this — a tab of its own, in the space that edits the kind.
   */
  it('opens what it produced rather than leaving it on the shelf', async () => {
    catalogueHolds([picture('asset-1')])
    submitFrom('job-1')

    await finish('succeeded')

    expect(opened).toEqual([expect.objectContaining({ id: 'asset-1' })])
  })

  // Asked for a tab of its own with a canvas open: the answer is obeyed, the canvas untouched.
  it('obeys a tab of its own even with a canvas in front', async () => {
    installDocument('doc-1', 'image')
    catalogueHolds([picture('asset-1')])
    claimImageOnSubmit('newTab')(job({ id: 'job-1' }))

    await finish('succeeded')

    expect(opened).toEqual([expect.objectContaining({ id: 'asset-1' })])
    expect(stack('doc-1').layers.map(layer => layer.name)).toEqual(['Background'])
  })
})

describe('landing a generation in the canvas that asked for it', () => {
  it('lays what the job produced down as a layer', async () => {
    catalogueHolds([picture('asset-1')])
    submitFrom('job-1')

    await finish('succeeded')

    expect(stack('doc-1').layers.at(-1)?.name).toBe('asset-1')
  })

  // A generation answers a batch, and a skybox keeps one of them — a canvas keeps them all.
  it('gives every picture of a batch a layer of its own, in the order they were rendered', async () => {
    catalogueHolds([picture('asset-1'), picture('asset-2'), picture('asset-3')])
    submitFrom('job-1')

    await finish('succeeded')

    expect(stack('doc-1').layers.map(layer => layer.name)).toEqual([
      'Background',
      'asset-1',
      'asset-2',
      'asset-3',
    ])
  })

  it('leaves the last one armed, which is the one on top', async () => {
    catalogueHolds([picture('asset-1'), picture('asset-2')])
    submitFrom('job-1')

    await finish('succeeded')

    expect(stack('doc-1').activeLayerId).toBe(stack('doc-1').layers.at(-1)?.id)
  })

  it('places a layer-targeted result directly above that layer in its group', async () => {
    useCanvases.getState().replace('doc-1', {
      ...stack('doc-1'),
      layers: [groupLayer('group', 'Group', [pixelLayer('car', 'Car')])],
      activeLayerId: 'car',
    })
    catalogueHolds([picture('asset-1')])
    claimImageOnSubmit(undefined, null, 'car')(job())

    await finish('succeeded')

    const group = stack('doc-1').layers[0]
    expect(group?.kind === 'group' ? group.children.map(layer => layer.name) : []).toEqual([
      'Car',
      'asset-1',
    ])
  })

  it('ignores what the same job produced that is not a picture', async () => {
    catalogueHolds([picture('asset-1'), picture('clip', { type: 'video' })])
    submitFrom('job-1')

    await finish('succeeded')

    expect(stack('doc-1').layers.map(layer => layer.name)).toEqual(['Background', 'asset-1'])
  })

  it('leaves the canvas alone when the job produced nothing of its own', async () => {
    catalogueHolds([picture('asset-1', { jobId: 'job-other' })])
    submitFrom('job-1')

    await finish('succeeded')

    expect(stack('doc-1').layers).toHaveLength(1)
  })

  /** The two ways a job ends with nothing to lay down. */
  const LOST: readonly JobStatus[] = ['failed', 'cancelled']

  for (const status of LOST) {
    it(`lays nothing down for a job that ${status}`, async () => {
      catalogueHolds([picture('asset-1')])
      submitFrom('job-1')

      await finish(status)

      expect(stack('doc-1').layers).toHaveLength(1)
    })
  }

  it('lands nothing at all when no canvas was in front at the click', async () => {
    useDocuments.setState({ documents: {}, activeId: null })
    catalogueHolds([picture('asset-1')])
    submitFrom('job-1')
    installDocument('doc-1', 'image')

    await finish('succeeded')

    expect(stack('doc-1').layers).toHaveLength(1)
  })

  // The tab can be closed while the job runs; writing into it would resurrect a document
  // nothing shows, with a history nobody can reach.
  it('drops the result when the document it was claimed for is gone', async () => {
    catalogueHolds([picture('asset-1')])
    submitFrom('job-1')
    useDocuments.setState({ documents: {}, activeId: null })

    await finish('succeeded')

    expect(stack('doc-1').layers).toHaveLength(1)
  })
})
