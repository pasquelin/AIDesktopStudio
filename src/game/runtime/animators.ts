// SPDX-License-Identifier: MIT

/**
 * What a SCRIPT told the animators, and what the animators played back.
 *
 * 🛑 Unlike `intents`, a parameter WRITTEN stays written: `release` empties the asks alone.
 */
export type Animators = {
  set: (entity: string, param: string, value: number | boolean) => void
  /** What a script has written on that body, layered under the built-in readings. */
  writtenOn: (entity: string) => Readonly<Record<string, number | boolean>>
  /** Forces a state of the graph, held until `stop` or until a clip that does not loop ends. */
  play: (entity: string, state: string) => void
  stop: (entity: string) => void
  askOf: (entity: string) => { forced?: string; letGo?: boolean }
  /** What the animator ended the step on, which is what a script reads on the next one. */
  played: (entity: string, state: string, time: number) => void
  playingOn: (entity: string) => { state: string; time: number } | null
  /** Called at the top of each step's scripts: an ask nobody made again is nobody's now. */
  release: () => void
  /**
   * Everything held for that body, dropped.
   *
   * 🛑 Called when an entity DIES, not only on the way out: keyed by id, these four tables grow
   * for the life of the world, and an id given out again would inherit the dead one's parameters.
   */
  forget: (entity: string) => void
}

export function createAnimators(): Animators {
  const written = new Map<string, Record<string, number | boolean>>()
  const forced = new Map<string, string>()
  const letGo = new Set<string>()
  const playing = new Map<string, { state: string; time: number }>()

  return {
    set: (entity, param, value) => {
      const held = written.get(entity) ?? {}
      held[param] = value
      written.set(entity, held)
    },
    writtenOn: entity => written.get(entity) ?? NOTHING,

    play: (entity, state) => void forced.set(entity, state),
    stop: entity => void letGo.add(entity),
    // Shared and frozen while nobody asked for anything, which is every step but the rare one:
    // three objects were allocated per body per step to say « nothing ».
    askOf: entity => {
      const wanted = forced.get(entity)
      const given = letGo.has(entity)
      if (wanted === undefined && !given) return NO_ASK

      return {
        ...(wanted === undefined ? {} : { forced: wanted }),
        ...(given ? { letGo: true } : {}),
      }
    },

    played: (entity, state, time) => {
      // Written in place: this is the mutable half of the pair by design, and a fresh object per
      // body per step is one the script kernel copies out of anyway.
      const held = playing.get(entity)
      if (held) {
        held.state = state
        held.time = time
      } else playing.set(entity, { state, time })
    },
    playingOn: entity => playing.get(entity) ?? null,

    release: () => {
      forced.clear()
      letGo.clear()
    },

    forget: entity => {
      written.delete(entity)
      forced.delete(entity)
      letGo.delete(entity)
      playing.delete(entity)
    },
  }
}

/** Shared and empty: a body no script ever wrote to must not allocate a record per step. */
const NOTHING: Readonly<Record<string, number | boolean>> = Object.freeze({})

const NO_ASK: { forced?: string; letGo?: boolean } = Object.freeze({})
