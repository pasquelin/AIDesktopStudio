import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  composed,
  emptyHistory,
  HISTORY_LIMIT,
  redo,
  replaceField,
  run,
  discardLast,
  forget,
  markOf,
  runCoalescing,
  undo,
  type Command,
  type History,
} from './history'

const add = (amount: number): Command<number> => ({
  id: `add:${amount}`,
  apply: value => value + amount,
  revert: value => value - amount,
})

/** What a dragged field emits: an absolute value, captured as it is applied — like `editNode`. */
const set = (value: number, id = 'set'): Command<number> => {
  let previous: number | null = null

  return {
    id,
    apply: current => {
      previous = current
      return value
    },
    revert: current => previous ?? current,
  }
}

describe('history', () => {
  it('applies a command and remembers it', () => {
    const [value, history] = run(0, emptyHistory<number>(), add(5))
    expect(value).toBe(5)
    expect(canUndo(history)).toBe(true)
  })

  it('undoes back to the previous value', () => {
    const [applied, afterRun] = run(0, emptyHistory<number>(), add(5))
    const [value, history] = undo(applied, afterRun)
    expect(value).toBe(0)
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(true)
  })

  it('redoes what was undone', () => {
    const [applied, afterRun] = run(0, emptyHistory<number>(), add(5))
    const [reverted, afterUndo] = undo(applied, afterRun)
    const [value] = redo(reverted, afterUndo)
    expect(value).toBe(5)
  })

  it('drops the redo stack once a new command runs', () => {
    const [applied, afterRun] = run(0, emptyHistory<number>(), add(5))
    const [reverted, afterUndo] = undo(applied, afterRun)
    const [, history] = run(reverted, afterUndo, add(3))
    expect(canRedo(history)).toBe(false)
  })

  it('is a no-op when there is nothing to undo', () => {
    const history = emptyHistory<number>()
    expect(undo(7, history)).toEqual([7, history])
  })

  it('is a no-op when there is nothing to redo', () => {
    const history = emptyHistory<number>()
    expect(redo(7, history)).toEqual([7, history])
  })

  it('bounds the stack so a long session does not grow without end', () => {
    let value = 0
    let history = emptyHistory<number>()
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      ;[value, history] = run(value, history, add(1))
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT)
  })
})

describe('composed', () => {
  const declined = (id: string): Command<number> => ({ ...add(1), id, refuses: () => true })

  // A gesture where one of three nodes cannot move is still a gesture, and it is the WHOLE that
  // is pushed — otherwise the two that did move have no ⌘Z of their own.
  it('runs a gesture whose parts do not all refuse', () => {
    const [value, history] = run(0, emptyHistory<number>(), composed('g', [declined('a'), add(2)]))

    expect(value).toBe(3)
    expect(history.past).toHaveLength(1)
  })

  it('refuses a gesture every part of which refuses', () => {
    const [value, history] = run(
      0,
      emptyHistory<number>(),
      composed('g', [declined('a'), declined('b')]),
    )

    expect(value).toBe(0)
    expect(history.past).toEqual([])
  })

  // `addClips([])` and `multi(id, [])` both reach this: nothing to do pushes nothing, where the
  // entry it used to push was a ⌘Z that did nothing and looked like a ⌘Z that was ignored.
  it('refuses a gesture with no parts at all', () => {
    const [, history] = run(0, emptyHistory<number>(), composed('g', []))

    expect(history.past).toEqual([])
  })
})

/** What says whether a document is on disk — see `dropped` in `history.ts` for the trap. */
describe('replaceField', () => {
  it('gives back the field alone, and leaves what was written beside it', () => {
    const command = replaceField<{ a: number; b: number }, 'a'>('a', 'a', previous => previous + 1)

    const applied = command.apply({ a: 1, b: 1 })
    expect(applied).toEqual({ a: 2, b: 1 })
    expect(command.revert({ ...applied, b: 2 })).toEqual({ a: 1, b: 2 })
  })
})

describe('markOf', () => {
  const many = (count: number): History<number> => {
    let value = 0
    let history = emptyHistory<number>()
    for (let index = 0; index < count; index += 1) [value, history] = run(value, history, add(1))
    return history
  }

  const undoAll = (history: History<number>): History<number> => {
    let value = 0
    let current = history
    while (canUndo(current)) [value, current] = undo(value, current)
    return current
  }

  it('reads nothing for a history nothing has been done to', () => {
    expect(markOf(emptyHistory<number>())).toBeNull()
  })

  it('reads the command the history ended on', () => {
    const command = add(1)
    const [, history] = run(0, emptyHistory<number>(), command)
    expect(markOf(history)).toBe(command)
  })

  it('comes back to where a save was made once an undo returns there', () => {
    const [value, saved] = run(0, emptyHistory<number>(), add(1))
    const at = markOf(saved)
    const [, moved] = run(value, saved, add(2))

    expect(markOf(moved)).not.toBe(at)
    expect(markOf(undo(0, moved)[1])).toBe(at)
  })

  it('reads nothing again when every command is undone within the limit', () => {
    expect(markOf(undoAll(many(3)))).toBeNull()
  })

  // The bug: those first commands are still applied, so this is NOT an untouched document.
  it('does not read as untouched once the stack has dropped a command', () => {
    expect(markOf(undoAll(many(HISTORY_LIMIT + 1)))).not.toBeNull()
  })

  // It has to follow the stack, not freeze on the first command ever dropped: an empty stack
  // stands on whatever fell off LAST, and two saves separated by a hundred edits must differ.
  it('names the command that fell off last, not the first one that ever did', () => {
    const commands = Array.from({ length: HISTORY_LIMIT + 3 }, () => add(1))
    let value = 0
    let history = emptyHistory<number>()
    for (const command of commands) [value, history] = run(value, history, command)

    // Three fell off: the stack now stands on the third.
    expect(history.dropped).toBe(commands[2])
    expect(markOf(undoAll(history))).toBe(commands[2])
  })

  it('keeps the dropped command through a coalesced gesture', () => {
    const history = many(HISTORY_LIMIT + 1)
    const dropped = history.dropped

    const [, merged] = runCoalescing(0, history, add(1))
    expect(merged.dropped).toBe(dropped)
  })

  it('keeps it through an undo and a redo', () => {
    const history = many(HISTORY_LIMIT + 1)
    const dropped = history.dropped

    const [value, undone] = undo(0, history)
    expect(undone.dropped).toBe(dropped)
    expect(redo(value, undone)[1].dropped).toBe(dropped)
  })

  // `forget` cuts the stack from below, so the commands it removes are still applied — exactly
  // what the limit does, and it has to leave the same trace.
  it('records what a forget cut away from under the stack', () => {
    const commands = [add(1), add(2), add(3)]
    let value = 0
    let history = emptyHistory<number>()
    for (const command of commands) [value, history] = run(value, history, command)

    const cut = forget(history, commands[1]?.id ?? '')
    expect(cut.dropped).toBe(commands[1])
    expect(markOf(undoAll(cut))).toBe(commands[1])
  })

  it('leaves a history alone when it holds no command of that id', () => {
    const history = many(3)
    expect(forget(history, 'never-run')).toBe(history)
  })

  // A no-op gesture is thrown away rather than moved to the redo stack, or ⌘Y would resurrect
  // what the user just discarded.
  it('discards the last command without offering it back', () => {
    const [value, history] = run(0, emptyHistory<number>(), add(5))

    const [reverted, after] = discardLast(value, history)
    expect(reverted).toBe(0)
    expect(canUndo(after)).toBe(false)
    expect(canRedo(after)).toBe(false)
  })

  it('keeps the dropped command through a discard', () => {
    const history = many(HISTORY_LIMIT + 1)
    expect(discardLast(0, history)[1].dropped).toBe(history.dropped)
  })

  it('survives a redo: replaying the stack lands on the same mark it left', () => {
    const history = many(3)
    const at = markOf(history)
    const undone = undo(0, history)[1]

    expect(markOf(redo(0, undone)[1])).toBe(at)
  })
})

describe('runCoalescing', () => {
  it('leaves one entry for a whole drag', () => {
    let [value, history] = run(0, emptyHistory<number>(), set(1))
    ;[value, history] = runCoalescing(value, history, set(2))
    ;[value, history] = runCoalescing(value, history, set(3))

    expect(value).toBe(3)
    expect(history.past).toHaveLength(1)
  })

  // The point of the whole mechanism: ⌘Z gives back the value the gesture started from, not
  // the one it passed through a frame earlier.
  it('undoes the gesture back to where it began', () => {
    let [value, history] = run(0, emptyHistory<number>(), set(1))
    ;[value, history] = runCoalescing(value, history, set(2))
    ;[value, history] = runCoalescing(value, history, set(3))

    const [back, afterUndo] = undo(value, history)
    expect(back).toBe(0)
    expect(canUndo(afterUndo)).toBe(false)
  })

  it('redoes the gesture to where it ended', () => {
    let [value, history] = run(0, emptyHistory<number>(), set(1))
    ;[value, history] = runCoalescing(value, history, set(3))

    const [back, afterUndo] = undo(value, history)
    expect(redo(back, afterUndo)[0]).toBe(3)
  })

  it('opens a new entry when the edit is not the same one', () => {
    const [applied, afterRun] = run(0, emptyHistory<number>(), set(1))
    const [, history] = runCoalescing(applied, afterRun, set(2, 'other'))

    expect(history.past).toHaveLength(2)
  })

  it('behaves like a plain run against an empty history', () => {
    const [value, history] = runCoalescing(0, emptyHistory<number>(), set(4))

    expect(value).toBe(4)
    expect(history.past).toHaveLength(1)
  })

  it('drops the redo stack, like any other command', () => {
    const [applied, afterRun] = run(0, emptyHistory<number>(), set(1))
    const [reverted, afterUndo] = undo(applied, afterRun)
    const [, history] = runCoalescing(reverted, afterUndo, set(2))

    expect(canRedo(history)).toBe(false)
  })
})
