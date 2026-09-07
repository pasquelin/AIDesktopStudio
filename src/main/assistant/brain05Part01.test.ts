import { describe, expect, it } from 'vitest'

import { ACTION_REGISTRY, type ActionName } from '@shared/domain/assistant'

import { parseReply } from './reply'

/** Every name the catalogue shows, which is what an answer is held to — see `parseReply`. */
export const SHOWN: ReadonlySet<ActionName> = new Set(ACTION_REGISTRY.map(action => action.name))

describe('reading what came back', () => {
  it('takes a bare object', () => {
    expect(parseReply('{"say":"hello","calls":[]}', SHOWN)).toEqual({ say: 'hello', calls: [] })
  })

  /**
   * Measured behaviour of the cheapest model on the list, not pessimism: it wraps the object in
   * a fence and a sentence about as often as not. Recovering it costs four lines; refusing it
   * costs a round trip and a creative unit.
   */
  it('recovers an object the model wrapped in prose or a fence', () => {
    const wrapped = 'Here you go:\n```json\n{"say":"ok","calls":[]}\n```\nHope that helps!'

    expect(parseReply(wrapped, SHOWN)).toEqual({ say: 'ok', calls: [] })
  })

  it('reads a call the registry declares', () => {
    const text = '{"say":"","calls":[{"action":"workspace.open","input":{"workspace":"3d"}}]}'

    expect(parseReply(text, SHOWN)).toEqual({
      say: '',
      calls: [{ action: 'workspace.open', input: { workspace: '3d' } }],
    })
  })

  /**
   * 🛑 Still refused, and this is what the names did NOT loosen: what the briefing showed is now
   * the whole registry, so a call is held to a name that exists. A hallucinated `git.branch` went
   * through once on the strength of its resemblance, and `git.checkout` rewrites the working tree.
   */
  it('refuses a call naming an action the registry does not declare', () => {
    const text = '{"say":"","calls":[{"action":"git.branch","input":{"name":"main"}}]}'

    expect(parseReply(text, SHOWN)).toBeNull()
  })

  /**
   * 🛑 Defect 2, at the seam it was measured on: a name of the registry the briefing had not
   * DESCRIBED used to be refused here, taking the whole reply with it. Reading it is what lets
   * `answeredTurn` open its manual instead of losing the turn.
   */
  it('reads a call whose manual the briefing had not opened', () => {
    const text = '{"say":"","calls":[{"action":"git.checkout","input":{"name":"main"}}]}'

    expect(parseReply(text, SHOWN)?.calls).toEqual([
      { action: 'git.checkout', input: { name: 'main' } },
    ])
  })

  /**
   * Refused whole rather than filtered down to the calls that are real. Dropping the unknown one
   * silently would run the remainder of a plan its author meant to run entire — the studio would
   * do half of something nobody asked for.
   */
  it('refuses the whole reply when one call names nothing', () => {
    const text =
      '{"say":"","calls":[{"action":"workspace.open","input":{"workspace":"3d"}},' +
      '{"action":"workspace.destroy","input":{}}]}'

    expect(parseReply(text, SHOWN)).toBeNull()
  })

  it('refuses anything that is not an object', () => {
    expect(parseReply('sorry, I cannot help with that', SHOWN)).toBeNull()
    expect(parseReply('[1,2,3]', SHOWN)).toBeNull()
    expect(parseReply('', SHOWN)).toBeNull()
  })

  // Shape answered, nothing said, nothing done — which is not an answer a person can be shown.
  it('refuses a reply that neither speaks nor acts', () => {
    expect(parseReply('{"say":"","calls":[]}', SHOWN)).toBeNull()
  })

  // 🛑 The defect the `ask` key exists for, measured where the rule lives — see `parseReply`.
  it('drops the calls an answer that asks came with', () => {
    const text =
      '{"say":"","ask":{"question":"Quel nom ?","choices":[]},' +
      '"calls":[{"action":"workspace.open","input":{"workspace":"3d"}}]}'

    expect(parseReply(text, SHOWN)).toEqual({
      say: '',
      ask: { questions: [{ question: 'Quel nom ?', choices: [] }] },
      calls: [],
    })
  })

  // A question is an answer on its own: nothing was said and nothing was done, and the person
  // still has something to read.
  it('takes a question as the whole answer', () => {
    const text = '{"say":"","ask":{"question":"Lequel ?","choices":["a","b"]},"calls":[]}'

    expect(parseReply(text, SHOWN)?.ask).toEqual({
      questions: [{ question: 'Lequel ?', choices: ['a', 'b'] }],
    })
  })

  /**
   * A button with no words on it is no button, and losing the turn over one teaches nobody
   * anything: the choices are filtered where the QUESTION is what has to be there.
   */
  it('keeps a question whose choices are half empty', () => {
    const half = '{"say":"","ask":{"question":"Lequel ?","choices":["a","",3]},"calls":[]}'

    expect(parseReply(half, SHOWN)?.ask?.questions[0]?.choices).toEqual(['a'])
  })

  /** 🛑 Measured on qwen3.8: the question went out as a bare string, was thrown in silence, and
   * the calls beside it ran — the very thing asking exists to stop. */
  it('recovers a question written as a bare string', () => {
    const text = '{"say":"","ask":"Quel nom ?","calls":[{"action":"project.create","input":{}}]}'

    expect(parseReply(text, SHOWN)).toEqual({
      say: '',
      ask: { questions: [{ question: 'Quel nom ?', choices: [] }] },
      calls: [],
    })
  })

  it('takes a questionnaire, each question with its own choices and its own note', () => {
    const text =
      '{"say":"","ask":{"questions":[{"question":"Lequel ?","choices":["a"]},' +
      '{"question":"Pourquoi ?","note":true}]},"calls":[]}'

    expect(parseReply(text, SHOWN)?.ask).toEqual({
      questions: [
        { question: 'Lequel ?', choices: ['a'] },
        { question: 'Pourquoi ?', choices: [], note: true },
      ],
    })
  })
})
