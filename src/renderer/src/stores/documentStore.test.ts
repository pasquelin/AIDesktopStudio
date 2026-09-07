import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  forgetDocumentHistoriesForTests,
  resetDocumentStoresForTests,
} from './documentStore'
import type { Command } from '@/engines/core/history'

/**
 * The coalescing rule, which decides what one ⌘Z gives back. Dragging a field emits dozens of
 * values a second and they must collapse into one entry; two separate edits must not.
 */

type Text = { value: string }

/** A command that sets an absolute value, the way every coalescing command in the studio does. */
function set(id: string, value: string): Command<Text> {
  let before = ''
  return {
    id,
    apply: state => {
      before = state.value
      return { value }
    },
    revert: () => ({ value: before }),
  }
}

const storeOf = () => {
  const store = createDocumentStore<Text>({ value: '' })
  store.use.getState().ensure('doc', () => ({ value: '' }))
  return store
}

const entries = (store: ReturnType<typeof storeOf>): number =>
  store.use.getState().histories['doc']?.past.length ?? 0

const valueOf = (store: ReturnType<typeof storeOf>): string =>
  store.stateOf(store.use.getState(), 'doc').value

describe('document revisions', () => {
  it('advances for content changes and undo, even when dirty returns to its old value', () => {
    const store = storeOf()
    const initial = store.revisionOf(store.use.getState(), 'doc')

    store.use.getState().runCommand('doc', set('name', 'changed'))
    const changed = store.revisionOf(store.use.getState(), 'doc')
    store.use.getState().undo('doc')

    expect(changed).toBe(initial + 1)
    expect(store.revisionOf(store.use.getState(), 'doc')).toBe(changed + 1)
  })

  it('does not advance for view-only replacements or identical state', () => {
    const store = storeOf()
    const current = store.use.getState()
    const initial = store.revisionOf(current, 'doc')

    current.replaceView('doc', { value: 'cursor moved' })
    current.replace('doc', store.stateOf(store.use.getState(), 'doc'))

    expect(store.revisionOf(store.use.getState(), 'doc')).toBe(initial)
  })

  it('renews the incarnation when a document is dropped and reopened', () => {
    const store = storeOf()
    const first = store.incarnationOf(store.use.getState(), 'doc')

    store.use.getState().drop('doc')
    store.use.getState().ensure('doc', () => ({ value: '' }))

    expect(store.incarnationOf(store.use.getState(), 'doc')).not.toBe(first)
  })
})

describe('a document the store was told to forget', () => {
  it('is not put back by a command that arrives after it closed', () => {
    const store = storeOf()
    store.use.getState().drop('doc')

    store.use.getState().runCommand('doc', set('name', 'late'))

    expect(store.hasState(store.use.getState(), 'doc')).toBe(false)
  })

  it('takes commands again once it is reopened', () => {
    const store = storeOf()
    store.use.getState().drop('doc')

    store.use.getState().ensure('doc', () => ({ value: '' }))
    store.use.getState().runCommand('doc', set('name', 'after'))

    expect(valueOf(store)).toBe('after')
  })

  it('leaves a document that was never opened alone — it is created on the way in', () => {
    const store = createDocumentStore<Text>({ value: '' })

    store.use.getState().runCommand('fresh', set('name', 'first'))

    expect(store.stateOf(store.use.getState(), 'fresh').value).toBe('first')
  })
})

/**
 * What a suite starts from. The three maps were cleared by hand with `setState`, which merges —
 * so what the store keeps beside them survived the reset, and the case order decided the verdict.
 */
describe('a store put back as it was built', () => {
  it('forgets the documents it held, down to where they were written', () => {
    const store = storeOf()
    store.use.getState().runCommand('doc', set('name', 'held'))
    store.use.getState().markSaved('doc', store.markOf(store.use.getState(), 'doc'))

    store.resetForTests()

    expect(store.hasState(store.use.getState(), 'doc')).toBe(false)
    expect(entries(store)).toBe(0)
    // The save marks, which two of the five fixtures used to leave behind: a document reopened
    // under the same id would have read as written to disk when nothing of it ever was.
    expect(store.use.getState().saved).toEqual({})
  })

  it('takes commands again for a document closed before it', () => {
    const store = storeOf()
    store.use.getState().drop('doc')

    store.resetForTests()
    store.use.getState().runCommand('doc', set('name', 'after'))

    expect(valueOf(store)).toBe('after')
  })

  /**
   * What `testSetup.ts` calls between cases. The registry is the point: a list of stores written
   * by hand would fall behind the seventh one, and the defect it guards is silent by nature.
   */
  it('reaches every store the factory built, without being handed one', () => {
    const store = storeOf()
    store.use.getState().drop('doc')

    resetDocumentStoresForTests()
    store.use.getState().runCommand('doc', set('name', 'after'))

    expect(valueOf(store)).toBe('after')
  })

  it('leaves no gesture open behind it', () => {
    const store = storeOf()
    store.use.getState().beginGesture('doc')
    store.use.getState().runCommand('doc', set('slider', 'a'))

    store.resetForTests()
    store.use.getState().runCommand('doc', set('slider', 'b'))
    store.use.getState().runCommand('doc', set('slider', 'c'))

    expect(entries(store)).toBe(2)
  })
})

describe('a gesture held over a document', () => {
  it('collapses its own commands into one entry', () => {
    const store = storeOf()
    const { beginGesture, runCommand } = store.use.getState()

    beginGesture('doc')
    runCommand('doc', set('slider', 'a'))
    runCommand('doc', set('slider', 'b'))
    runCommand('doc', set('slider', 'c'))

    expect(entries(store)).toBe(1)
    expect(valueOf(store)).toBe('c')
  })

  // The first values a field emits can all be refused — a column count that lands on the cell
  // the document already has — while an entry of the same id sits just before the gesture.
  it('does not merge into an entry pushed before it once a refused command opened it', () => {
    const store = storeOf()
    const { beginGesture, runCommand } = store.use.getState()

    runCommand('doc', set('slider', 'a'))
    beginGesture('doc')
    runCommand('doc', { ...set('slider', 'a'), refuses: () => true })
    runCommand('doc', set('slider', 'b'))

    expect(entries(store)).toBe(2)
  })

  it('keeps two gestures of the same field apart', () => {
    const store = storeOf()
    const { beginGesture, endGesture, runCommand } = store.use.getState()

    beginGesture('doc')
    runCommand('doc', set('slider', 'a'))
    endGesture('doc')
    beginGesture('doc')
    runCommand('doc', set('slider', 'b'))

    expect(entries(store)).toBe(2)
  })

  /**
   * A job that lands whenever it lands, a picture dropped on a document. The store cannot tell where
   * a command came from and no rule on `command.id` can, so the caller says it.
   *
   * The workspace that made this reachable is Skyboxes: it introduced the first asynchronous writer.
   */
  describe("a command that belongs to nobody's gesture", () => {
    it('never merges two of them into each other', () => {
      const store = storeOf()
      const { beginGesture, runCommand, runOutsideGesture } = store.use.getState()

      beginGesture('doc')
      runCommand('doc', set('slider', 'a'))
      runOutsideGesture('doc', set('generate', 'first image'))
      runOutsideGesture('doc', set('generate', 'second image'))

      // Three: the drag, and one entry per generation — what they are outside a gesture too.
      expect(entries(store)).toBe(3)
    })

    // What an interrupted gesture must still do: carry on collapsing, into an entry of its own.
    it('lets the gesture go on collapsing after it', () => {
      const store = storeOf()
      const { beginGesture, runCommand, runOutsideGesture } = store.use.getState()

      beginGesture('doc')
      runCommand('doc', set('slider', 'a'))
      runOutsideGesture('doc', set('generate', 'an image'))
      runCommand('doc', set('slider', 'b'))
      runCommand('doc', set('slider', 'c'))

      expect(entries(store)).toBe(3)
      expect(valueOf(store)).toBe('c')
    })

    /**
     * A field opens its gesture on focus, before any command at all — tab into a slider, or hold the
     * thumb without moving. A landing inside that silent window used to name the gesture, and then
     * nothing the user did ever collapsed again: one entry per frame, for the whole drag.
     */
    it('does not name a gesture that has not written yet', () => {
      const store = storeOf()
      const { beginGesture, runCommand, runOutsideGesture } = store.use.getState()

      beginGesture('doc')
      runOutsideGesture('doc', set('generate', 'an image'))
      for (const value of ['a', 'b', 'c', 'd']) runCommand('doc', set('slider', value))

      expect(entries(store)).toBe(2)
    })

    it('writes on its own outside any gesture', () => {
      const store = storeOf()
      const { runOutsideGesture } = store.use.getState()

      runOutsideGesture('doc', set('generate', 'an image'))

      expect(entries(store)).toBe(1)
      expect(valueOf(store)).toBe('an image')
    })
  })

  /**
   * The last command names the gesture, not the first. A gesture can move to another field — a
   * drag that starts on one axis and continues on another — and what follows has to go on
   * collapsing into an entry of its own.
   *
   * Pinning the name on the first command instead was tried, to stop foreign commands taking the
   * gesture over. It stopped this too: everything after the first field became one entry a frame.
   */
  it('goes on collapsing when the gesture moves to another field', () => {
    const store = storeOf()
    const { beginGesture, runCommand } = store.use.getState()

    beginGesture('doc')
    runCommand('doc', set('x', 'a'))
    for (const value of ['b', 'c', 'd']) runCommand('doc', set('y', value))

    expect(entries(store)).toBe(2)
    expect(valueOf(store)).toBe('d')
  })

  it('merges nothing at all outside a gesture', () => {
    const store = storeOf()
    const { runCommand } = store.use.getState()

    runCommand('doc', set('slider', 'a'))
    runCommand('doc', set('slider', 'b'))

    expect(entries(store)).toBe(2)
  })
})

/**
 * 🛑 What a bench decor needs and `resetForTests` cannot give: the documents stay as the decor
 * left them, and nothing it did is undoable. Asked to take one change back, a model sent
 * `scene.undo` twice and the second removed the cube the decor had put there.
 */
describe('forgetting what the documents can undo', () => {
  it('empties the history and keeps what the documents hold', () => {
    const store = storeOf()
    store.use.getState().runCommand('doc', set('value', 'written'))

    forgetDocumentHistoriesForTests()

    expect(entries(store)).toBe(0)
    expect(valueOf(store)).toBe('written')
  })
})
