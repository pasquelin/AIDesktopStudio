import { act, renderHook } from '@testing-library/react'
import type { AnimationClip } from 'three'
import { expect, it, vi } from 'vitest'
import type * as RetargetModule from '@/engines/scene/retarget'
import type { Retarget } from '@/engines/scene/retarget'
import { useRetargetPreview } from './useRetargetPreview'
import { motionClip, motionView } from '../retarget-fixtures'
import { motionProfile } from '../retargetDraft'

const port = vi.hoisted(() => ({
  adapt: vi.fn<Retarget['adapt']>(),
  dispose: vi.fn(),
  remember: vi.fn(),
}))
vi.mock('@/engines/scene/retarget', async original => ({
  ...(await original<typeof RetargetModule>()),
  createRetarget: () => port,
}))

it('ignores late results after source selection changes and releases the installed result on close', async () => {
  const source = await motionView([motionClip(1), motionClip(2)])
  const target = await motionView()
  const sourceProfile = motionProfile(source.bones)
  const targetProfile = motionProfile(target.bones)
  const pending: {
    signal?: AbortSignal
    resolve: (clips: AnimationClip[]) => void
    clips: readonly AnimationClip[]
  }[] = []
  port.adapt.mockImplementation(
    (_target, _source, clips, watch) =>
      new Promise(resolve => {
        pending.push({ signal: watch?.signal, resolve, clips })
      }),
  )
  const { result, rerender, unmount } = renderHook(
    ({ index }) =>
      useRetargetPreview(source, target, index, sourceProfile, targetProfile, undefined, 'travel'),
    { initialProps: { index: 0 } },
  )
  act(() => {
    void result.current.preview()
  })
  expect(result.current.busy).toBe(true)
  rerender({ index: 1 })
  expect(pending[0]?.signal?.aborted).toBe(true)
  await act(async () => {
    pending[0]?.resolve([motionClip(1)])
  })
  expect(result.current.result).toBeNull()
  act(() => {
    void result.current.preview()
  })
  expect(pending[1]?.clips[0]?.tracks[0]?.values.at(-3)).toBe(2)
  await act(async () => {
    pending[1]?.resolve([motionClip(2)])
  })
  const installed = result.current.result
  expect(installed).not.toBeNull()
  expect(Object.keys(target.engine.clipLengthsOf('model'))).toHaveLength(1)
  unmount()
  expect(Object.keys(target.engine.clipLengthsOf('model'))).toHaveLength(0)
  expect(pending[1]?.signal?.aborted).toBe(true)
  source.engine.dispose()
  target.engine.dispose()
})
