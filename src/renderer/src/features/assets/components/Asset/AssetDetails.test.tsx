import { aiRoleId } from '@shared/domain/aiRole'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { CloudAsset } from '@shared/domain/cloudAsset'
import type { Job } from '@shared/domain/job'
import { job as jobOf } from '@/stores/job-fixtures'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useJobs } from '@/stores/jobs'
import { useModels } from '@/stores/models'
import { useLayouts } from '@/stores/layouts'
import { useSelection } from '@/stores/selection'
import { chassisFor } from '@/stores/panels-fixtures'
import { shownIn } from '@pasquelin/panels'
import { panelsStore } from '@/stores/panels'
import type { AssetRowModel } from './rows'
import { AssetDetails } from './AssetDetails'

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  name: 'pad.wav',
  type: 'audio',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...overrides,
})

const job: Job = jobOf({
  id: 'job-1',
  targetId: 'eleven-music-v2',
  label: 'ElevenLabs Music v2',
  status: 'succeeded',
  assetIds: ['asset-1'],
})

const cloud = (overrides: Partial<CloudAsset> = {}): CloudAsset => ({
  id: 'asset-1',
  name: 'pad.wav',
  type: 'audio',
  remoteType: 'txt2audio',
  ownerId: 'proj_1',
  createdAt: '2026-08-07T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z',
  privacy: 'private',
  tags: [],
  collectionIds: [],
  ...overrides,
})

const line = (one: CloudAsset = cloud()): AssetRowModel => ({
  id: `remote:${one.id}`,
  from: 'remote',
  asset: one,
})

describe('what a row of the remote browser opens onto', () => {
  beforeEach(() => {
    useLayouts.setState({ activeWorkspace: 'image', home: false })
    useSelection.getState().selectFiles([])
    useAssets.setState({ items: [asset()] })
    useJobs.setState({ jobs: [], bodies: {} })
    useDocuments.setState({ documents: {}, activeId: null })
  })

  /** A running generation has no asset yet: the chevron is drawn on nothing rather than on a blank. */
  it('draws nothing at all for a generation still under way', () => {
    const { container } = render(
      <AssetDetails row={{ id: 'job:1', from: 'job', job, type: null }} twin={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('reads the catalogue row out where the project holds a twin', () => {
    render(<AssetDetails row={line()} twin={asset()} />)

    expect(screen.getByText('pad.wav')).toBeInTheDocument()
    expect(screen.getByText('Audio')).toBeInTheDocument()
  })

  /**
   * What a store is FOR: the prompt is the field someone weighs before spending a download, and
   * the library carries it on the asset rather than on a job of this machine.
   */
  it('shows what a line one does not hold was made from', () => {
    render(
      <AssetDetails
        row={line(
          cloud({
            generation: {
              modelId: 'eleven-music-v2',
              modelLabel: 'ElevenLabs Music v2',
              prompt: 'a very soft pad',
              params: {},
            },
          }),
        )}
        twin={null}
      />,
    )

    expect(screen.getByText('a very soft pad')).toBeInTheDocument()
    expect(screen.getByText('ElevenLabs Music v2')).toBeInTheDocument()
  })

  // Nothing of the catalogue's: no path to reveal, no role to correct, no name to change.
  it('offers none of the catalogue’s own gestures on a line with no file here', () => {
    render(<AssetDetails row={line()} twin={null} />)

    expect(screen.queryByText('Synchronisation')).not.toBeInTheDocument()
  })

  it('shows the prompt behind a generated asset, whole', () => {
    useJobs.setState({ jobs: [job], bodies: { 'job-1': { prompt: 'a very soft pad' } } })
    render(<AssetDetails row={line()} twin={asset({ jobId: 'job-1' })} />)

    expect(screen.getByText('a very soft pad')).toBeInTheDocument()
    expect(screen.getByText('ElevenLabs Music v2')).toBeInTheDocument()
  })

  it('shows no generation block for an imported file', () => {
    render(<AssetDetails row={line()} twin={asset()} />)

    expect(screen.queryByText('Génération')).not.toBeInTheDocument()
  })

  it('arms the generator with the parameters behind the asset, and brings it up', async () => {
    useJobs.setState({ jobs: [job], bodies: { 'job-1': { prompt: 'x', guidance: 7 } } })
    chassisFor('image')
    render(<AssetDetails row={line()} twin={asset({ jobId: 'job-1' })} />)

    await userEvent.click(screen.getByRole('button', { name: /Régénérer/ }))

    const models = useModels.getState()
    expect(models.selected[aiRoleId('image', 'txt2img')]).toBe('eleven-music-v2')
    expect(models.preset[aiRoleId('image', 'txt2img')]).toEqual({ prompt: 'x', guidance: 7 })
    expect(shownIn(panelsStore.getState(), 'left').primary).toBe('generator')
  })
})
