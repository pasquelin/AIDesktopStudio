import { describe, expect, it } from 'vitest'

import { ACTION_REGISTRY, type ActionName } from '@shared/domain/assistant'

import { jsonIn, parseReply } from './reply'

/** Every name the catalogue shows, which is what an answer is held to — see `parseReply`. */
export const SHOWN: ReadonlySet<ActionName> = new Set(ACTION_REGISTRY.map(action => action.name))

describe('reading what came back', () => {
  /**
   * 🛑 An empty PLACEHOLDER is not a question. `"ask":""` and `{}` are what a model writes for
   * « none », and refusing the whole reply over one cost two billed rounds on a shape the retry
   * cannot even name.
   */
  it('runs the calls beside an empty ask placeholder', () => {
    for (const placeholder of ['""', '{}', '[]', 'false', '{"questions":[]}']) {
      const text = `{"say":"Voici.","ask":${placeholder},"calls":[{"action":"workspace.open","input":{"workspace":"3d"}}]}`

      expect(parseReply(text, SHOWN)?.calls, placeholder).toHaveLength(1)
    }
  })

  /**
   * 🛑 An `ask` nobody can read REFUSES the whole reply rather than letting the calls beside it
   * through: a model that meant to stop and ask had its question dropped and its plan carried out.
   */
  it('refuses a reply whose question is there but unreadable', () => {
    const blank = '{"say":"ok","ask":{"question":"  "},"calls":[]}'
    expect(parseReply(blank, SHOWN)).toBeNull()

    const tooMany = `{"say":"","ask":{"questions":${JSON.stringify(
      Array.from({ length: 7 }, (_unused, at) => ({ question: `q${at}` })),
    )}},"calls":[]}`
    expect(parseReply(tooMany, SHOWN)).toBeNull()
  })

  it('takes an action with no input at all', () => {
    expect(parseReply('{"say":"","calls":[{"action":"jobs.list"}]}', SHOWN)).toEqual({
      say: '',
      calls: [{ action: 'jobs.list', input: {} }],
    })
  })

  it('finds no object where there is none', () => {
    expect(jsonIn('nothing here')).toBeNull()
  })
})
