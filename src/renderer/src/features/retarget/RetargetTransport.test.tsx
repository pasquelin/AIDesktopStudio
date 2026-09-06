import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RetargetTransport } from './RetargetTransport'
import { motionClip, motionView } from './retarget-fixtures'
import { wireClipOf } from '@/engines/scene/retarget'

it('samples the selected homonymous source and target on the same clock and stops on unmount', async () => {
  const source = await motionView([motionClip(1), motionClip(2)])
  const target = await motionView()
  const clip = wireClipOf(motionClip(4))
  target.engine.installMotion('model', 'result', clip)
  const frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++next, callback)
    return next
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => {
    frames.delete(id)
  })
  const now = performance.now()
  vi.spyOn(performance, 'now').mockReturnValue(now)
  const { unmount } = render(
    <RetargetTransport
      source={source}
      target={target}
      clipIndex={1}
      result={{ key: 'result', clip }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Lire' }))
  act(() => {
    const callback = frames.values().next().value
    frames.clear()
    callback?.(now + 500)
  })
  expect(source.engine.inspectMotion('model')?.bones[0]?.position[0]).toBeCloseTo(1)
  expect(target.engine.inspectMotion('model')?.bones[0]?.position[0]).toBeCloseTo(2)
  unmount()
  expect(frames.size).toBe(0)
  expect(Object.keys(source.engine.clipLengthsOf('model'))).toEqual(['same'])
  source.engine.dispose()
  target.engine.dispose()
})
