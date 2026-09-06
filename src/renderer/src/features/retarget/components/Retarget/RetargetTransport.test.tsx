import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RetargetTransport } from './RetargetTransport'
import { AnimationClip, VectorKeyframeTrack } from 'three'
import { motionClip, motionView } from '../../retarget-fixtures'
import { wireClipOf } from '@/engines/scene/retarget'

function offsetClip(from: number, to: number): AnimationClip {
  return new AnimationClip('same', 1, [
    new VectorKeyframeTrack('Hips.position', [0, 1], [from, 0, 0, to, 0, 0]),
  ])
}

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
      result={{ key: 'result', clip, generation: 1 }}
      rootMotion="travel"
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
  const loop = screen.getByRole('button', { name: /boucle/i })
  expect(loop).toHaveAttribute('aria-pressed', 'true')
  act(() => {
    const callback = frames.values().next().value
    frames.clear()
    callback?.(now + 1250)
  })
  expect(source.engine.inspectMotion('model')?.bones[0]?.position[0]).toBeCloseTo(0.5)
  fireEvent.click(loop)
  act(() => {
    const callback = frames.values().next().value
    frames.clear()
    callback?.(now + 10_000)
  })
  expect(screen.getByRole('button', { name: 'Lire' })).toBeEnabled()
  expect(frames.size).toBe(0)
  unmount()
  expect(frames.size).toBe(0)
  expect(Object.keys(source.engine.clipLengthsOf('model'))).toEqual(['same'])
  source.engine.dispose()
  target.engine.dispose()
})

it('does not reset a replacement posed before React adopts its motion view', async () => {
  const source = await motionView([motionClip(2)])
  const frames: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.push(callback)
    return frames.length
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  const now = performance.now()
  const view = render(
    <RetargetTransport
      source={source}
      target={null}
      clipIndex={0}
      result={null}
      rootMotion="travel"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Lire' }))
  const oldKey = Object.keys(source.engine.clipLengthsOf('model')).find(key =>
    key.startsWith('retarget-source:'),
  )
  expect(oldKey).toBeDefined()
  source.engine.removeMotion('model', oldKey ?? '')
  source.engine.installMotion('model', 'replacement', wireClipOf(motionClip(4)))
  source.engine.poseNode('model', [
    { key: 'replacement', time: 0.5, weight: 1, part: 'all', rootMotion: 'travel' },
  ])
  act(() => frames.shift()?.(now + 250))
  expect(source.engine.inspectMotion('model')?.bones[0]?.position[0]).toBeCloseTo(2)
  view.unmount()
  expect(source.engine.inspectMotion('model')?.bones[0]?.position[0]).toBeCloseTo(2)
  source.engine.dispose()
})

it('does not rest the source while the chosen clip index changes', async () => {
  const source = await motionView([offsetClip(3, 4), offsetClip(5, 6)])
  const view = render(
    <RetargetTransport
      source={source}
      target={null}
      clipIndex={0}
      result={null}
      rootMotion="travel"
    />,
  )
  expect(source.engine.inspectMotion('model')?.bones[0]?.position[0]).toBeCloseTo(3)
  view.rerender(
    <RetargetTransport
      source={source}
      target={null}
      clipIndex={1}
      result={null}
      rootMotion="travel"
    />,
  )
  expect(source.engine.inspectMotion('model')?.bones[0]?.position[0]).toBeCloseTo(5)
  view.unmount()
  source.engine.dispose()
})
