import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY, type ActionName } from '@shared/domain/assistant'
import { jsonIn, readReply } from './reply'

const SHOWN: ReadonlySet<ActionName> = new Set(ACTION_REGISTRY.map(action => action.name))

describe('readReply', () => {
  it('reads an object the model closed twice over', () => {
    const text = '{"say":"","ask":null,"calls":[{"action":"scene.state","input":{}}]}]}'

    expect(jsonIn(text)).toEqual({
      say: '',
      ask: null,
      calls: [{ action: 'scene.state', input: {} }],
    })
    expect(readReply(text, SHOWN)).toEqual({
      reply: { say: '', calls: [{ action: 'scene.state', input: {} }] },
    })
  })

  it('names the action the catalogue does not declare rather than blaming the JSON', () => {
    const text =
      '{"say":"Creating it.","ask":null,"calls":[{"action":"scene.state","input":{}},' +
      '{"action":"scene.create","input":{"name":"Demo"}}]}'

    expect(readReply(text, SHOWN)).toEqual({
      fault: { kind: 'unknownAction', name: 'scene.create' },
    })
  })

  it('tells an empty answer from an unreadable one', () => {
    expect(readReply('{"say":"","ask":null,"calls":[]}', SHOWN)).toEqual({
      fault: { kind: 'empty' },
    })
    expect(readReply('I would love to help!', SHOWN)).toEqual({ fault: { kind: 'json' } })
  })
})
