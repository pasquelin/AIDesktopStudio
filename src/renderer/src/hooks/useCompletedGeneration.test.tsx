import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { job } from '@/stores/job-fixtures'
import { useCompletedGeneration } from './useCompletedGeneration'

it('delivers only successful jobs once, including when the callback changes', () => {
  const onCompleted = vi.fn()
  const running = job()
  const { rerender } = renderHook(
    ({ current, callback }) => useCompletedGeneration(current, callback),
    { initialProps: { current: running, callback: onCompleted } },
  )
  expect(onCompleted).not.toHaveBeenCalled()
  rerender({ current: job({ status: 'failed' }), callback: onCompleted })
  expect(onCompleted).not.toHaveBeenCalled()
  const completed = job({ status: 'succeeded', assetIds: ['animation'] })
  rerender({ current: completed, callback: onCompleted })
  expect(onCompleted).toHaveBeenCalledExactlyOnceWith(completed)
  const next = vi.fn()
  rerender({ current: completed, callback: next })
  expect(next).not.toHaveBeenCalled()
  const second = job({ id: 'job_2', status: 'succeeded', assetIds: ['animation2'] })
  rerender({ current: second, callback: next })
  expect(next).toHaveBeenCalledExactlyOnceWith(second)
})
