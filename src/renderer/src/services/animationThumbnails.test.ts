import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { generateAnimationThumbnails } from './animationThumbnails'

const state = vi.hoisted(() => ({
  send: vi.fn(),
  save: vi.fn(),
  model: vi.fn(),
  dispose: vi.fn(),
  report: vi.fn(),
  notice: vi.fn(),
  refresh: vi.fn(),
  controller: new AbortController(),
}))
vi.mock('./bridge', () => ({
  getBridge: () => ({
    assets: { animationThumbnailModel: state.model, saveAnimationThumbnail: state.save },
  }),
}))
vi.mock('./diagnostics', () => ({ reportFailure: state.report, reportNotice: state.notice }))
vi.mock('@/stores/assets', () => ({
  useAssets: { getState: () => ({ refresh: state.refresh }) },
}))
vi.mock('@/stores/project', () => ({
  useProject: { getState: () => ({ project: { path: '/project' } }) },
}))
vi.mock('@/stores/tasks', () => ({
  runTask: async (_label: string, work: (id: string, watch: object) => Promise<void>) =>
    work('task', { signal: state.controller.signal }),
}))
vi.mock('@/engines/core/workerSession', () => ({
  createWorkerSession: () => ({ nextId: () => 1, send: state.send, dispose: state.dispose }),
}))
const motion = (id: string): Asset => ({
  id,
  name: id + '.glb',
  path: 'Animations/' + id + '.glb',
  type: 'animation',
  location: 'local',
  tags: [],
  createdAt: '',
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('document', { baseURI: 'file:///app/renderer/index.html' })
  state.controller = new AbortController()
  state.model.mockResolvedValue(new Uint8Array([1]))
  state.send.mockResolvedValue({ ok: true, png: new Uint8Array([2]) })
  state.save.mockResolvedValue(undefined)
  state.refresh.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())
it('reuses one character for a batch and saves each missing poster next to its animation', async () => {
  await generateAnimationThumbnails([
    motion('Walk'),
    { ...motion('Ready'), posterPath: 'ready.png' },
    motion('Jump'),
  ])
  expect(state.model).toHaveBeenCalledOnce()
  expect(state.send).toHaveBeenCalledTimes(2)
  expect(state.send.mock.calls[0]?.[0].decoderRoot).toBe('file:///app/renderer/decoders/')
  expect(state.send.mock.calls[0]?.[0].model).toBeInstanceOf(ArrayBuffer)
  expect(state.send.mock.calls[1]?.[0].model).toBeUndefined()
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({
      assetId: 'Jump',
      sourcePath: 'Animations/Jump.glb',
      projectPath: '/project',
    }),
  )
  expect(state.dispose).toHaveBeenCalledOnce()
})
/**
 * 🛑 One line for the pass, not one per clip. `assets.save` is a GESTURE scope, which
 * `diagnostics` never deduplicates — that is written for ⌘S, « asked again because the first
 * press said nothing ». Thirty unreadable clips were thirty errors about work nobody asked for.
 */
it('keeps processing after unreadable clips and says so once, counted', async () => {
  state.send
    .mockResolvedValueOnce({ ok: false, error: 'invalid clip' })
    .mockResolvedValueOnce({ ok: false, error: 'invalid clip' })
  await generateAnimationThumbnails([motion('Broken'), motion('AlsoBroken'), motion('Jump')])

  expect(state.report).not.toHaveBeenCalled()
  // Once for the pass, whatever the count — which the pluralised key carries and the i18n
  // guards hold. This project runs without a live i18n, so the sentence itself says nothing here.
  expect(state.notice).toHaveBeenCalledOnce()
  expect(state.notice.mock.calls[0]?.[0]).toBe('assets.save')
  expect(state.save).toHaveBeenCalledOnce()
  expect(state.dispose).toHaveBeenCalledOnce()
})

/**
 * The catalogue was written behind the window's back — `setAnimationPoster` announces nothing —
 * so the stills would stay invisible until something else happened to ask the catalogue again.
 */
it('asks the shelf to read the stills it just filed', async () => {
  await generateAnimationThumbnails([motion('Jump')])
  expect(state.refresh).toHaveBeenCalledOnce()
})

it('leaves the shelf alone when it drew nothing', async () => {
  state.send.mockResolvedValue({ ok: false, error: 'invalid clip' })
  await generateAnimationThumbnails([motion('Broken')])
  expect(state.refresh).not.toHaveBeenCalled()
})

it('does not save a render that finishes after cancellation', async () => {
  state.send.mockImplementationOnce(async () => {
    state.controller.abort()
    return { ok: true, png: new Uint8Array([2]) }
  })
  await generateAnimationThumbnails([motion('Jump')])
  expect(state.save).not.toHaveBeenCalled()
  expect(state.report).not.toHaveBeenCalled()
  expect(state.dispose).toHaveBeenCalled()
})

/**
 * The automatic pass skips a clip that already has a still — which is what makes a poor frame
 * permanent without this. Asked for, it is exactly that clip the pass is about.
 */
it('redraws a still the automatic pass would have skipped, and says so to the main process', async () => {
  const drawn = { ...motion('Jump'), posterPath: 'Animations/Jump/thumb.png' }

  await generateAnimationThumbnails([drawn])
  expect(state.save).not.toHaveBeenCalled()

  await generateAnimationThumbnails([drawn], true)
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ replace: true }))
})
