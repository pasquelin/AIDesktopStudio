import { describe, expect, it, vi } from 'vitest'
import { createStartupRollback, failStartup } from './startupRollback'

describe('exported game startup rollback', () => {
  it('disposes each acquired resource once in reverse order', () => {
    const order: string[] = []
    const rollback = createStartupRollback()
    rollback.add(() => order.push('assets'))
    rollback.add(() => order.push('render'))
    rollback.add(() => order.push('physics'))

    rollback.dispose()
    rollback.dispose()

    expect(order).toEqual(['physics', 'render', 'assets'])
  })

  it('immediately disposes a resource acquired after failure', () => {
    const dispose = vi.fn()
    const rollback = createStartupRollback()
    rollback.dispose()

    rollback.add(dispose)

    expect(dispose).toHaveBeenCalledOnce()
  })

  it('continues disposing older resources after one disposer fails', () => {
    const disposeAssets = vi.fn()
    const rollback = createStartupRollback()
    rollback.add(disposeAssets)
    rollback.add(() => {
      throw new Error('world failed to dispose')
    })

    expect(() => rollback.dispose()).toThrow(AggregateError)
    expect(disposeAssets).toHaveBeenCalledOnce()
  })

  it('keeps the startup error when rollback also fails', () => {
    const startupError = new Error('scene is invalid')
    const rollback = createStartupRollback()
    rollback.add(() => {
      throw new Error('render failed to dispose')
    })

    try {
      failStartup(rollback, startupError)
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError)
      expect(error).toHaveProperty('cause', startupError)
    }
  })
})
