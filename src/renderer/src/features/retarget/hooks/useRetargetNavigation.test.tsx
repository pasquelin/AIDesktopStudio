import { act, fireEvent, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { publishCommand } from '@/services/commandBus'
import { useRetargetNavigation } from './useRetargetNavigation'

function engine() {
  return {
    setMotion: vi.fn(),
    releaseNavigation: vi.fn(),
    setNavigating: vi.fn(),
    frameContents: vi.fn(),
    flying: true,
    flightOwnsArrows: true,
  }
}
it('routes scene navigation to one view and releases held motion on switch and unmount', () => {
  const source = engine()
  const target = engine()
  const hook = renderHook(() => useRetargetNavigation(source, target))
  expect(hook.result.current.active).toBe('target')
  act(() => hook.result.current.activate('source'))
  expect(target.releaseNavigation).toHaveBeenCalledOnce()
  act(() => {
    fireEvent.keyDown(window, { code: 'KeyW' })
  })
  expect(source.setMotion).toHaveBeenCalled()
  expect(target.setMotion).not.toHaveBeenCalled()
  act(() => {
    publishCommand('scene.frame')
  })
  expect(source.frameContents).toHaveBeenCalledOnce()
  act(() => hook.result.current.activate('target'))
  expect(source.releaseNavigation).toHaveBeenCalledOnce()
  act(() => {
    publishCommand('scene.navigate')
  })
  expect(target.setNavigating).toHaveBeenCalledWith(true)
  act(() => {
    fireEvent.keyUp(window, { code: 'KeyW' })
  })
  expect(target.setMotion).not.toHaveBeenCalled()
  hook.unmount()
  expect(target.releaseNavigation).toHaveBeenCalledTimes(2)
})
