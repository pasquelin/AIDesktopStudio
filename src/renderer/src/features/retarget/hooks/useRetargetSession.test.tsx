import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { retargetRoute } from '@shared/domain/retargetWindow'
import { retargetMessageOf } from '../retargetChannel'
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

it('revives with the next snapshot after its owner left, instead of staying orphaned', () => {
  vi.stubGlobal('BroadcastChannel', SessionChannel)
  window.location.hash = retargetRoute('hero')
  const hook = renderHook(useRetargetSession)
  const channel = SessionChannel.current
  const snapshot = (revision: number, incarnation: string) => ({
    kind: 'snapshot',
    snapshot: { assetId: 'hero', name: 'Hero', revision, incarnation, rig: null },
  })
  act(() => {
    channel.onmessage?.(new MessageEvent('message', { data: snapshot(3, 'first') }))
    channel.onmessage?.(new MessageEvent('message', { data: { kind: 'gone' } }))
  })
  expect(hook.result.current.gone).toBe(true)
  act(() => {
    channel.onmessage?.(new MessageEvent('message', { data: snapshot(1, 'second') }))
  })
  expect(hook.result.current.gone).toBe(false)
  expect(hook.result.current.stale).toBe(false)
  expect(hook.result.current.status).toBe('idle')
  expect(hook.result.current.snapshot?.incarnation).toBe('second')
  hook.unmount()
})

it('turns stale on a light change notice and reloads the rig it already holds', () => {
  vi.stubGlobal('BroadcastChannel', SessionChannel)
  window.location.hash = retargetRoute('hero')
  const hook = renderHook(useRetargetSession)
  const channel = SessionChannel.current
  act(() => {
    channel.onmessage?.(
      new MessageEvent('message', {
        data: {
          kind: 'snapshot',
          snapshot: { assetId: 'hero', name: 'Hero', revision: 1, incarnation: 'open', rig: null },
        },
      }),
    )
    channel.onmessage?.(
      new MessageEvent('message', {
        data: { kind: 'changed', revision: 2, incarnation: 'open' },
      }),
    )
  })
  expect(hook.result.current.stale).toBe(true)
  act(() => hook.result.current.refresh())
  expect(hook.result.current.stale).toBe(false)
  expect(hook.result.current.snapshot?.revision).toBe(2)
  hook.unmount()
})

it('adopts the revision of its own apply instead of blocking the next clip', () => {
  vi.stubGlobal('BroadcastChannel', SessionChannel)
  window.location.hash = retargetRoute('hero')
  const hook = renderHook(useRetargetSession)
  const channel = SessionChannel.current
  act(() => {
    channel.onmessage?.(
      new MessageEvent('message', {
        data: {
          kind: 'snapshot',
          snapshot: { assetId: 'hero', name: 'Hero', revision: 1, incarnation: 'open', rig: null },
        },
      }),
    )
  })
  act(() => hook.result.current.apply('Walk', new Uint8Array(16)))
  const posted = retargetMessageOf(channel.postMessage.mock.calls[1]?.[0])
  if (posted?.kind !== 'apply') throw new Error('expected apply')
  const requestId = posted.requestId
  act(() => {
    channel.onmessage?.(
      new MessageEvent('message', { data: { kind: 'answer', requestId, ok: true } }),
    )
    channel.onmessage?.(
      new MessageEvent('message', { data: { kind: 'changed', revision: 2, incarnation: 'open' } }),
    )
  })
  expect(hook.result.current.status).toBe('saved')
  expect(hook.result.current.stale).toBe(false)
  expect(hook.result.current.snapshot?.revision).toBe(2)
  hook.unmount()
})
