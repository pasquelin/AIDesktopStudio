import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandId } from '@shared/domain/command'
import { installFakeBridge } from '@/services/fakeBridge'
import { useMenuScope } from './useMenuScope'

describe('a window that shows no space, before the native menu', () => {
  const setWorkspace = vi.fn(() => Promise.resolve())
  let fire: ((command: CommandId) => void) | null = null
  const stop = vi.fn()

  beforeEach(() => {
    setWorkspace.mockClear()
    stop.mockClear()
    fire = null
    installFakeBridge({
      window: { setWorkspace },
      menu: {
        onCommand: listener => {
          fire = listener
          return stop
        },
      },
    })
  })

  it('announces its history and no docks, so the menu binds undo to it', () => {
    renderHook(() => useMenuScope('character', () => {}))

    expect(setWorkspace).toHaveBeenCalledWith(null, [], [], [], 'character')
  })

  it('hands a row of the menu to the window, the latest handler included', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ onCommand }) => useMenuScope('character', onCommand), {
      initialProps: { onCommand: first },
    })
    rerender({ onCommand: second })

    fire?.('document.save')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('document.save')
  })

  it('stops listening with the window', () => {
    const { unmount } = renderHook(() => useMenuScope('character', () => {}))

    unmount()

    expect(stop).toHaveBeenCalledTimes(1)
  })
})
