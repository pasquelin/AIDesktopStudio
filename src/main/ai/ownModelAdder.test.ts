import { expect, it, vi } from 'vitest'
import { aiOverview } from '@shared/domain/aiOverview-fixtures'
import { localModel } from '@shared/domain/localModel-fixtures'
import { createOwnModelAdder } from './ownModelAdder'
import { ownMotionModelFrom } from './ownMotionModel'

vi.mock('./ownMotionModel', () => ({ ownMotionModelFrom: vi.fn() }))

it('serializes folder verification across callers and registers the validated model once', async () => {
  let finish: (path: string | null) => void = () => {}
  const picked = new Promise<string | null>(resolve => {
    finish = resolve
  })
  const pickWeights = vi.fn(() => picked)
  const snapshot = aiOverview()
  const model = localModel({ id: 'own-motion' })
  vi.mocked(ownMotionModelFrom).mockResolvedValue(model)
  const manager = {
    overview: vi.fn(async () => snapshot),
    addOwnModel: vi.fn(async () => snapshot),
  }
  const add = createOwnModelAdder({ language: () => 'en', pickWeights }, manager)
  const first = add('motion')
  const second = add('motion')
  expect(pickWeights).toHaveBeenCalledTimes(1)
  finish('/models/motion')
  await Promise.all([first, second])
  expect(ownMotionModelFrom).toHaveBeenCalledWith('/models/motion', true, undefined, undefined)
  expect(manager.addOwnModel).toHaveBeenCalledExactlyOnceWith(model)
})

it('never registers a model if cancellation arrives during folder verification', async () => {
  const controller = new AbortController()
  const model = localModel({ id: 'cancelled-motion' })
  const manager = {
    overview: vi.fn(async () => aiOverview()),
    addOwnModel: vi.fn(async () => aiOverview()),
  }
  vi.mocked(ownMotionModelFrom).mockImplementationOnce(async () => {
    controller.abort()
    return model
  })
  const add = createOwnModelAdder(
    {
      language: () => 'en',
      pickWeights: async () => '/models/motion',
    },
    manager,
  )
  await expect(add('motion', { signal: controller.signal })).rejects.toThrow()
  expect(manager.addOwnModel).not.toHaveBeenCalled()
})
