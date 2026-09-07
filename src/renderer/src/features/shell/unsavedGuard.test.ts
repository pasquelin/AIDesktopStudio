import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloseChoice, DocumentWrite } from '@shared/domain/document'
import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { forgetReportedFailures } from '@/services/diagnostics'
import { clearScenes } from '@/stores/scene-fixtures'
import { useDocuments } from '@/stores/documents'
import { useScenes } from '@/stores/scenes'
import { unsavedDocumentIds } from './documentIo'
import { guardUnsavedWork } from './unsavedGuard'

// The real one needs a live Dockview; this file only checks what the guard asks of the document.
const fileViewEdits = { held: false }
const settleFileViews = vi.fn(() => Promise.resolve(true))
vi.mock('./components/dockviewApi', () => ({
  closePanel: vi.fn(),
  fileViewsHoldEdits: () => fileViewEdits.held,
  settleFileViews: () => settleFileViews(),
}))

const box = meshNode('box-1')

/** A document with work in it — what the guard exists to refuse to lose. */
const openDirtyScene = async (): Promise<string> => {
  const created = await useDocuments.getState().create('3d')
  if (!created) throw new Error('expected a document')
  useScenes.getState().runCommand(created.id, addNode(box))
  return created.id
}

// One jsdom window serves the whole file: a guard left armed would answer the next test's
// gesture too, and the counts would be those of every test run so far.
const armed: Array<() => void> = []

const arm = (target: Window): (() => void) => {
  const stop = guardUnsavedWork(target)
  armed.push(stop)
  return stop
}

const leave = (target: Window): Event => {
  const event = new Event('beforeunload', { cancelable: true })
  target.dispatchEvent(event)
  return event
}

const resumeLeave = vi.fn(() => Promise.resolve())
const closeWindow = vi.spyOn(window, 'close').mockImplementation(() => {})

function install(overrides: BridgeOverrides = {}): void {
  installFakeBridge({ ...overrides, window: { resumeLeave, ...overrides.window } })
}

beforeEach(() => {
  vi.clearAllMocks()
  closeWindow.mockClear()
  resumeLeave.mockClear()
  localStorage.clear()
  clearScenes()
  fileViewEdits.held = false
  forgetReportedFailures()
  useDocuments.setState({ documents: {}, activeId: null })
})

afterEach(() => {
  armed.splice(0).forEach(stop => stop())
})

describe('guardUnsavedWork', () => {
  it('lets the window go when no document holds unsaved work', () => {
    install({})
    arm(window)

    expect(leave(window).defaultPrevented).toBe(false)
  })

  // A file view keeps its edits outside the documents store, so the count of dirty documents
  // says nothing about it — and ⌘Q took the window with them, without a question.
  it('refuses to let the window go while a file view holds unsaved work', async () => {
    install({})
    arm(window)
    fileViewEdits.held = true

    expect(leave(window).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(settleFileViews).toHaveBeenCalled())
  })

  // A cancelled file view stops the leave as a cancelled document does: the window stays — with
  // its documents. Asked after them, the cancel came once they had been settled and forgotten.
  it('holds the window, and its documents, when the file view question is cancelled', async () => {
    const confirmClose = vi.fn(() => Promise.resolve<'discard'>('discard'))
    install({ documents: { confirmClose } })
    arm(window)
    const documentId = await openDirtyScene()
    fileViewEdits.held = true
    settleFileViews.mockResolvedValueOnce(false)

    leave(window)

    await vi.waitFor(() => expect(resumeLeave).toHaveBeenCalledWith(false))
    expect(confirmClose).not.toHaveBeenCalled()
    expect(useDocuments.getState().documents[documentId]).toBeDefined()
  })

  it('refuses to let the window go while a document holds unsaved work', async () => {
    install({ documents: { confirmClose: () => Promise.resolve('cancel') } })
    arm(window)
    await openDirtyScene()

    expect(leave(window).defaultPrevented).toBe(true)
  })

  it('asks about the work rather than dropping it silently', async () => {
    const confirmClose = vi.fn(() => Promise.resolve<'cancel'>('cancel'))
    install({ documents: { confirmClose } })
    arm(window)
    await openDirtyScene()

    leave(window)

    await vi.waitFor(() => expect(confirmClose).toHaveBeenCalledTimes(1))
  })

  // Answering "discard" settles the document and resumes the leave — window.close fires, and a
  // second beforeunload finds nothing at stake.
  it('leaves nothing dirty once the question is answered, so the next attempt goes through', async () => {
    install({ documents: { confirmClose: () => Promise.resolve('discard') } })
    arm(window)
    await openDirtyScene()

    leave(window)

    await vi.waitFor(() => expect(unsavedDocumentIds()).toEqual([]))
    await vi.waitFor(() => expect(resumeLeave).toHaveBeenCalledWith(true))
    expect(leave(window).defaultPrevented).toBe(false)
  })

  it('keeps the document when the question is cancelled', async () => {
    install({ documents: { confirmClose: () => Promise.resolve('cancel') } })
    arm(window)
    const documentId = await openDirtyScene()

    leave(window)

    await vi.waitFor(() => expect(resumeLeave).toHaveBeenCalledWith(false))
    expect(unsavedDocumentIds()).toEqual([documentId])
    expect(closeWindow).not.toHaveBeenCalled()
  })

  // Cancelling the last question must leave the studio as it was. Answering document by document
  // and closing as the answers came in threw away the ones answered before the cancel.
  it('keeps every document when a later question is cancelled', async () => {
    const answers: CloseChoice[] = ['discard', 'cancel']
    install({
      documents: { confirmClose: () => Promise.resolve(answers.shift() ?? 'cancel') },
    })
    arm(window)
    const first = await openDirtyScene()
    const second = await openDirtyScene()

    leave(window)

    await vi.waitFor(() => expect(answers).toEqual([]))
    expect(unsavedDocumentIds().sort()).toEqual([first, second].sort())
    await vi.waitFor(() => expect(resumeLeave).toHaveBeenCalledWith(false))
    expect(closeWindow).not.toHaveBeenCalled()
  })

  // Cancelling stops the whole gesture, so the documents behind the cancelled one are not even
  // asked about — a second dialog after "Cancel" would be the studio arguing with the answer.
  it('asks nothing further once a question is cancelled', async () => {
    const confirmClose = vi.fn(() => Promise.resolve<'cancel'>('cancel'))
    install({ documents: { confirmClose } })
    arm(window)
    await openDirtyScene()
    await openDirtyScene()

    leave(window)

    await vi.waitFor(() => expect(confirmClose).toHaveBeenCalledTimes(1))
    expect(unsavedDocumentIds()).toHaveLength(2)
  })

  it('writes the work when the answer is to save it', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    install({ documents: { confirmClose: () => Promise.resolve('save'), write } })
    arm(window)
    await openDirtyScene()

    leave(window)

    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    expect(unsavedDocumentIds()).toEqual([])
    await vi.waitFor(() => expect(resumeLeave).toHaveBeenCalledWith(true))
    expect(closeWindow).not.toHaveBeenCalled()
  })

  // A write that refuses must leave the tab where it was: closing anyway would lose the work the
  // dialog had just promised to keep.
  it('keeps the document when the save it promised refuses', async () => {
    install({
      documents: {
        confirmClose: () => Promise.resolve('save'),
        write: () => Promise.reject(new Error('read-only volume')),
      },
    })
    arm(window)
    const documentId = await openDirtyScene()

    leave(window)

    await vi.waitFor(() => expect(unsavedDocumentIds()).toEqual([documentId]))
    expect(closeWindow).not.toHaveBeenCalled()
  })

  // A dialog per keypress is the failure this guards against: the answer to the first is still
  // out when the second arrives.
  it('asks once however many times the gesture is repeated', async () => {
    const confirmClose = vi.fn(() => Promise.resolve<'cancel'>('cancel'))
    install({ documents: { confirmClose } })
    arm(window)
    await openDirtyScene()

    leave(window)
    leave(window)
    leave(window)

    await vi.waitFor(() => expect(confirmClose).toHaveBeenCalledTimes(1))
  })

  // A rejected write used to close the dialog and say nothing: no failure reported, and every
  // later attempt to leave replayed the same silent scene.
  it('reports a failed answer instead of swallowing it, and asks again next time', async () => {
    const confirmClose = vi.fn(() => Promise.reject(new Error('volume gone')))
    const report = vi.fn(() => Promise.resolve())
    install({ documents: { confirmClose }, diagnostics: { report } })
    arm(window)
    await openDirtyScene()

    leave(window)
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', scope: 'document.close' }),
      ),
    )

    await vi.waitFor(() => expect(resumeLeave).toHaveBeenCalledWith(false))

    // The flag released, so the gesture is answerable again rather than stuck on the first try.
    leave(window)
    await vi.waitFor(() => expect(confirmClose).toHaveBeenCalledTimes(2))
  })

  // No bridge means no dialog, and the answer a missing dialog gives is the one that loses
  // nothing: the work stays exactly where it was.
  it('keeps the work when there is nothing to ask with', async () => {
    install({})
    arm(window)
    const documentId = await openDirtyScene()
    Reflect.deleteProperty(globalThis, 'studio')

    leave(window)

    await vi.waitFor(() => expect(unsavedDocumentIds()).toEqual([documentId]))
  })

  it('stops refusing once it is taken off', async () => {
    install({ documents: { confirmClose: () => Promise.resolve('cancel') } })
    const stop = arm(window)
    await openDirtyScene()

    stop()

    expect(leave(window).defaultPrevented).toBe(false)
  })
})
