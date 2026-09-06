import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { convertArrivedModels } from './meshConversion'

const state = vi.hoisted(() => ({
  saveConverted: vi.fn(),
  convert: vi.fn(),
  bytes: vi.fn(),
  report: vi.fn(),
  notice: vi.fn(),
  refresh: vi.fn(),
  projectPath: '/project',
  runTask: vi.fn(),
}))
vi.mock('./bridge', () => ({
  getBridge: () => ({ assets: { saveConverted: state.saveConverted } }),
}))
vi.mock('./diagnostics', () => ({ reportFailure: state.report, reportNotice: state.notice }))
vi.mock('@/stores/assets', () => ({
  useAssets: { getState: () => ({ refresh: state.refresh }) },
}))
vi.mock('@/stores/project', () => ({
  useProject: { getState: () => ({ project: { path: state.projectPath } }) },
}))
vi.mock('@/stores/tasks', () => ({
  runTask: (label: string, work: (id: string, watch: object) => Promise<void>) =>
    state.runTask(label, work),
}))
vi.mock('@/helpers/assetFetch', () => ({ assetArrayBuffer: state.bytes }))
vi.mock('@/engines/scene/modelConversion', () => ({ convertModelToGlb: state.convert }))
vi.mock('i18next', () => ({
  default: { t: (key: string) => key, language: 'fr' },
}))

const row = (id: string, fields: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  type: 'mesh',
  location: 'local',
  path: `Models/${id}.fbx`,
  tags: [],
  createdAt: '',
  ...fields,
})

beforeEach(() => {
  vi.clearAllMocks()
  state.projectPath = '/project'
  state.runTask.mockImplementation(
    async (_label: string, work: (id: string, watch: object) => Promise<void>) => work('task', {}),
  )
  state.bytes.mockResolvedValue(new ArrayBuffer(8))
  state.convert.mockResolvedValue({ glb: new Uint8Array([1]), type: 'mesh', losses: [] })
  state.saveConverted.mockImplementation(async (request: { replaces: string }) =>
    row(request.replaces, { path: `Models/${request.replaces}.glb`, convertedFrom: 'kept' }),
  )
  state.refresh.mockResolvedValue(undefined)
})

describe('convertArrivedModels', () => {
  it('converts the 3D files among the arrivals, reads their neighbours under .sources, and answers the rows as they now stand', async () => {
    const arrived = [row('robot'), row('poster', { type: 'image', path: 'Images/poster.png' })]

    const after = await convertArrivedModels(arrived)

    expect(state.convert).toHaveBeenCalledOnce()
    expect(state.convert.mock.calls[0]?.[1]).toBe('ia-studio://file/robot/')
    expect(state.saveConverted).toHaveBeenCalledWith(
      expect.objectContaining({
        replaces: 'robot',
        projectPath: '/project',
        type: 'mesh',
        losses: [],
      }),
    )
    expect(after.map(asset => asset.path)).toEqual(['Models/robot.glb', 'Images/poster.png'])
    expect(state.refresh).toHaveBeenCalledOnce()
  })

  it('leaves a glb, a row already converted, and a row seen once alone', async () => {
    await convertArrivedModels([
      row('done', { path: 'Models/done.glb' }),
      row('kept', { path: 'Models/kept.obj', convertedFrom: 'Models/.sources/kept.obj' }),
    ])
    expect(state.convert).not.toHaveBeenCalled()

    await convertArrivedModels([row('twice')])
    const repeated = await convertArrivedModels([row('twice')])
    expect(state.convert).toHaveBeenCalledOnce()
    expect(repeated[0]?.path).toBe('Models/twice.glb')
  })

  it('says what a conversion lost, and what could not be converted, without stopping the pass', async () => {
    state.convert
      .mockResolvedValueOnce({ glb: new Uint8Array([1]), type: 'mesh', losses: ['textures'] })
      .mockRejectedValueOnce(new Error('unreadable'))

    const after = await convertArrivedModels([row('lossy'), row('broken')])

    expect(state.notice).toHaveBeenCalledWith('assets.copy', 'activity.meshConversionLost')
    expect(state.notice).toHaveBeenCalledWith('assets.copy', 'activity.meshConversionFailed')
    expect(after.map(asset => asset.path)).toEqual(['Models/lossy.glb', 'Models/broken.fbx'])
  })

  it('retries a file that could not be converted, once a later announcement brings it again', async () => {
    state.convert.mockRejectedValueOnce(new Error('unreadable')).mockResolvedValueOnce({
      glb: new Uint8Array([1]),
      type: 'mesh',
      losses: [],
    })

    await convertArrivedModels([row('later')])
    const after = await convertArrivedModels([row('later')])

    expect(state.convert).toHaveBeenCalledTimes(2)
    expect(after[0]?.path).toBe('Models/later.glb')
  })

  it('does not write a conversion after the project changed while its textures loaded', async () => {
    let finish: ((value: { glb: Uint8Array; type: 'mesh'; losses: [] }) => void) | undefined
    state.convert.mockReturnValue(
      new Promise(resolve => {
        finish = resolve
      }),
    )

    const converting = convertArrivedModels([row('old-project')])
    await vi.waitFor(() => expect(state.convert).toHaveBeenCalledOnce())
    state.projectPath = '/other-project'
    finish?.({ glb: new Uint8Array([1]), type: 'mesh', losses: [] })
    await converting

    expect(state.saveConverted).not.toHaveBeenCalled()
  })

  it('keeps one conversion lock until cancelled work has actually stopped', async () => {
    const controller = new AbortController()
    let finish: ((value: { glb: Uint8Array; type: 'mesh'; losses: [] }) => void) | undefined
    state.convert.mockReturnValue(
      new Promise(resolve => {
        finish = resolve
      }),
    )
    state.runTask.mockImplementation(
      async (_label: string, work: (id: string, watch: object) => Promise<void>) => {
        const running = work('task', { signal: controller.signal })
        controller.abort()
        void running.catch(() => undefined)
        return null
      },
    )

    const first = convertArrivedModels([row('cancelled')])
    await vi.waitFor(() => expect(state.convert).toHaveBeenCalledOnce())
    const second = convertArrivedModels([row('cancelled')])

    expect(state.convert).toHaveBeenCalledOnce()
    finish?.({ glb: new Uint8Array([1]), type: 'mesh', losses: [] })
    await Promise.all([first, second])
  })

  it('shares the converted row with a caller arriving while the same conversion runs', async () => {
    let finish: ((value: { glb: Uint8Array; type: 'mesh'; losses: [] }) => void) | undefined
    state.convert.mockReturnValue(
      new Promise(resolve => {
        finish = resolve
      }),
    )

    const first = convertArrivedModels([row('shared')])
    await vi.waitFor(() => expect(state.convert).toHaveBeenCalledOnce())
    const second = convertArrivedModels([row('shared')])
    finish?.({ glb: new Uint8Array([1]), type: 'mesh', losses: [] })

    const [firstRows, secondRows] = await Promise.all([first, second])
    expect(firstRows[0]?.path).toBe('Models/shared.glb')
    expect(secondRows[0]?.path).toBe('Models/shared.glb')
    expect(state.convert).toHaveBeenCalledOnce()
  })
})
