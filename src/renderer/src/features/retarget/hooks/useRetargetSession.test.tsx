import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { retargetRoute } from '@shared/domain/retargetWindow'
import { useRetargetSession } from './useRetargetSession'

class SessionChannel {
  static current: SessionChannel
  onmessage: ((event: MessageEvent) => unknown) | null = null
  postMessage = vi.fn()
  close = vi.fn()
  constructor() {
    SessionChannel.current = this
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

it('rejects invalid payload before pending, and permits a corrected retry', () => {
  vi.stubGlobal('BroadcastChannel', SessionChannel)
  window.location.hash = retargetRoute('test')
  const hook = renderHook(useRetargetSession)
  const channel = SessionChannel.current
  act(() => {
    channel.onmessage?.(
      new MessageEvent('message', {
        data: {
          kind: 'snapshot',
          snapshot: {
            assetId: 'hero',
            name: 'Hero',
            revision: 1,
            incarnation: 'open',
            rig: null,
          },
        },
      }),
    )
  })
  channel.postMessage.mockClear()
  act(() => hook.result.current.apply('x'.repeat(257), new Uint8Array(16)))
  expect(hook.result.current.status).toBe('failed')
  expect(channel.postMessage).not.toHaveBeenCalled()
  act(() => hook.result.current.apply('Walk', new Uint8Array(16)))
  expect(hook.result.current.status).toBe('saving')
  expect(channel.postMessage).toHaveBeenCalledOnce()
  hook.unmount()
})
