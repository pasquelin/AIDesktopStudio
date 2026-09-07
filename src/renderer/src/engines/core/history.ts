/**
 * Generic Command history, shared by every engine. Command rather than snapshot: a stack of 4K
 * layers or a 200k-triangle mesh forbids photographing the state on every action.
 *
 * Pure functions rather than a mutable class — trivial to test, and it drops into a Zustand
 * store without a wrapper.
 */
export type Command<S> = {
  /** Identifies the kind of edit; two consecutive ones may later be merged on it. */
  id: string
  apply: (state: S) => S
  revert: (state: S) => S
  /**
   * When it answers true of the state at hand, nothing is pushed: a refusal is not a step, and
   * an entry that changed nothing is a ⌘Z the user watches do nothing.
   *
   * Asked rather than compared: a command may legitimately leave the state alone and still be a
   * step — a stroke lives in the engine's tiles, not in the document.
   */
  refuses?: (state: S) => boolean
}

export type History<S> = {
  past: Command<S>[]
  future: Command<S>[]
  /**
   * The most recent command the stack has dropped, and the reason `markOf` is not simply the
   * last of `past`.
   *
   * Past the limit the oldest commands fall off, and undoing everything left then empties
   * `past` — which used to read as "back where the file was written", the state an untouched
   * document is in. It is not: the commands that fell off are still applied. This says which
   * one the empty stack now stands on, so the two cannot compare equal.
   */
  dropped: Command<S> | null
}

/** A session's worth of undo. Unbounded, the stack keeps every closure alive with it. */
export const HISTORY_LIMIT = 100

export function emptyHistory<S>(): History<S> {
  return { past: [], future: [], dropped: null }
}

/**
 * Where the history stands, as one value: the command it ended on, or the last one it dropped
 * when nothing is left. Identity, never a count — undoing back to where the file was written
 * makes the document clean again, which a counter would keep calling modified.
 */
export function markOf<S>(history: History<S>): Command<S> | null {
  return history.past.at(-1) ?? history.dropped
}

export function canUndo<S>(history: History<S>): boolean {
  return history.past.length > 0
}

export function canRedo<S>(history: History<S>): boolean {
  return history.future.length > 0
}

export function run<S>(state: S, history: History<S>, command: Command<S>): [S, History<S>] {
  if (command.refuses?.(state)) return [state, history]

  const kept = [...history.past, command]
  const past = kept.slice(-HISTORY_LIMIT)
  // What fell off this time, or what had already fallen off before it.
  const dropped = kept.at(-HISTORY_LIMIT - 1) ?? history.dropped
  return [command.apply(state), { past, future: [], dropped }]
}

/**
 * One convention for what a history entry is called. Coalescing turns on two consecutive commands
 * sharing an id, so a format drifting by a character would break it in silence — a drag costing
 * one undo per frame. Beside `composed` because every engine names entries the same way.
 */
export function commandId(label: string, ids: readonly string[]): string {
  return `${label}:${ids.join(',')}`
}

/**
 * Several commands as ONE entry in the history: applied in order, reverted in reverse.
 *
 * What the user did in one gesture is one ⌘Z — three nodes nudged together, a take laid down as
 * a picture and a sound. Here rather than in an engine because two of them compose already and
 * a third writes the same four lines the day it needs to.
 */
export function composed<S>(id: string, parts: readonly Command<S>[]): Command<S> {
  return {
    id,
    apply: state => parts.reduce((current, part) => part.apply(current), state),
    revert: state => parts.reduceRight((current, part) => part.revert(current), state),
    // Refused only when EVERY part refuses: a gesture where one of three nodes cannot move is
    // still a gesture, and it is the whole that is pushed. Carried at all because a `composed`
    // that ignored its parts' refusals would push an entry doing nothing — the very thing
    // `refuses` was added to stop, silently defeated by the combinator of its own module.
    refuses: state => parts.every(part => part.refuses?.(state) === true),
  }
}

/**
 * One field of the state replaced, and that field alone given back: what sits beside it in the
 * state — an armed layer, a folded group — is written outside the history and must not come back
 * with ⌘Z. Captured as it is applied, so the command survives being redone.
 */
export function replaceField<S, K extends keyof S>(
  id: string,
  key: K,
  next: (previous: S[K]) => S[K],
): Command<S> {
  // A flag rather than a sentinel: `null` and `undefined` are both values a field may hold.
  let captured = false
  let before: S[K] | undefined

  return {
    id,
    apply: state => {
      before = state[key]
      captured = true
      return { ...state, [key]: next(state[key]) }
    },
    revert: state => (captured ? { ...state, [key]: before } : state),
  }
}

/**
 * Runs a command as the continuation of the one before it, when both are the same edit of the
 * same node — which is what `id` says. Dragging a field emits dozens of values a second, and a
 * stack where ⌘Z gives back one pixel of a drag is a stack nobody can use.
 *
 * Only the caller knows whether two commands belong to the same gesture, so nothing here
 * decides it: `runCommand` merges while a gesture is open and never outside one, which is what
 * keeps two successive drags of the same field two entries.
 */
export function runCoalescing<S>(
  state: S,
  history: History<S>,
  command: Command<S>,
): [S, History<S>] {
  if (command.refuses?.(state)) return [state, history]

  const last = history.past.at(-1)
  if (!last || last.id !== command.id) return run(state, history, command)

  return [
    command.apply(state),
    {
      ...history,
      past: [...history.past.slice(0, -1), coalesce(last, command)],
      future: [],
    },
  ]
}

/**
 * Applies where the gesture has got to, reverts where it began: the first command captured the
 * original value as it ran, and every command that merges into it sets an absolute value rather
 * than a step — so the last one alone describes the whole gesture forwards.
 */
function coalesce<S>(first: Command<S>, second: Command<S>): Command<S> {
  return { id: first.id, apply: second.apply, revert: first.revert }
}

export function undo<S>(state: S, history: History<S>): [S, History<S>] {
  const command = history.past.at(-1)
  if (!command) return [state, history]
  return [
    command.revert(state),
    { ...history, past: history.past.slice(0, -1), future: [command, ...history.future] },
  ]
}

/**
 * Drops an entry the caller can no longer replay, and everything the stack would have to step
 * over to reach it. Undo is sequential, so an entry left behind a missing one is unreachable
 * anyway — leaving it in place would show a ⌘Z that does nothing rather than one that has run
 * out, which is the difference between a limit and a bug.
 *
 * Here rather than in the store, so that the one rule about `dropped` — a command that leaves
 * `past` while staying applied has to be remembered — is written where the type lives.
 */
export function forget<S>(history: History<S>, commandId: string): History<S> {
  const behind = history.past.findIndex(command => command.id === commandId)
  const ahead = history.future.findIndex(command => command.id === commandId)
  if (behind < 0 && ahead < 0) return history

  return {
    past: behind < 0 ? history.past : history.past.slice(behind + 1),
    // Redo runs forwards, so a hole in the future cuts everything past it instead.
    future: ahead < 0 ? history.future : history.future.slice(0, ahead),
    dropped: behind < 0 ? history.dropped : (history.past[behind] ?? history.dropped),
  }
}

/**
 * Reverts the last command and forgets it, rather than moving it to the redo stack. For a
 * gesture that turned out to be a no-op — a guide pulled off a ruler and dropped back on it —
 * where `undo` would leave ⌘Y able to resurrect what the user just threw away.
 */
export function discardLast<S>(state: S, history: History<S>): [S, History<S>] {
  const command = history.past.at(-1)
  if (!command) return [state, history]
  return [command.revert(state), { ...history, past: history.past.slice(0, -1) }]
}

export function redo<S>(state: S, history: History<S>): [S, History<S>] {
  const [command, ...rest] = history.future
  if (!command) return [state, history]
  return [command.apply(state), { ...history, past: [...history.past, command], future: rest }]
}
