import { describe, expect, it, vi } from 'vitest'
import { materialStore } from '@/stores/materials'
import { runHistoryCommand } from './historyCommand'

describe('undo and redo sent to a document store', () => {
  it('says it did nothing on an empty stack, rather than answering ok', () => {
    const undo = vi.spyOn(materialStore.use.getState(), 'undo')

    expect(runHistoryCommand(materialStore, 'material', 'doc-1', 'material.undo')).toBe(false)

    expect(undo).not.toHaveBeenCalled()
  })

  it('leaves a command of another scope unanswered', () => {
    expect(runHistoryCommand(materialStore, 'material', 'doc-1', 'canvas.undo')).toBeNull()
  })
})
