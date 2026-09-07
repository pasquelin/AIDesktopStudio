import type { ActionName } from '@shared/domain/assistant'
import type { Studio } from './studio'

/** One call and what the studio answered it — paired, never two lists an index has to zip. */
export type Called = {
  action: ActionName
  input: Record<string, unknown>
  /** A refusal by name, or how much came back. Absent for a call the chain never reached. */
  answer?: string
}

export type Run = {
  studio: Studio
  called: readonly Called[]
  refused: number
  /** Everything the model said to the person, every turn joined. */
  said: string
  /**
   * The questions it put to the person, in order — the `ask` half of an answer. What a scenario
   * about asking measures is that the studio STOPPED, not that a sentence carried a `?`.
   */
  asks: readonly string[]
}

export type Scenario = {
  name: string
  /**
   * One sentence per turn, the studio and the history CARRYING between them: "add a cube" then
   * "rename it" is one conversation, and a bench that reset would measure a studio nobody saw.
   */
  said: readonly string[]
  /**
   * What the studio holds before the person speaks, laid out by the BENCH — « dans la scène Test
   * MCP » is a decor, not a thing to be scored a second time. Async because the studio is.
   */
  setup?: (studio: Studio) => Promise<void>
  /**
   * 🛑 What the person answers the confirmation card — `yes` unless a scenario says otherwise.
   * Held at `yes` for every scenario before 2026-09-01, the « the person said no » path of the
   * executor was played by NOTHING: 285 actions, and a refusal reached none of them.
   */
  answers?: 'yes' | 'no'
  /**
   * What the person answers the model's QUESTIONS, in order — the mission bench alone reads it.
   * Absent, a question leaves the mission waiting, which is what a scenario about asking measures.
   */
  replies?: readonly string[]
  /**
   * Whether the request was carried out — read off what the studio HOLDS, never off the words
   * the model wrote. Every failure this bench exists for was announced as a success.
   */
  passed: (run: Run) => boolean
}
