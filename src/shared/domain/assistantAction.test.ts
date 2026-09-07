import { describe, expect, it } from 'vitest'
import {
  inputProblem,
  MUTE_SOLO_LOCK,
  NODE_ID,
  readInput,
  validatesInput,
  type ActionField,
} from './assistantAction'
import { RIG_ACTIONS } from './rigActions'
import { SEQUENCE_ACTIONS } from './sequenceActions'

const field = (partial: Partial<ActionField> & Pick<ActionField, 'key' | 'kind'>): ActionField => ({
  labelKey: 'assistant.fields.query',
  required: false,
  ...partial,
})

describe('the node every family that points at one names', () => {
  it('is the required nodeId field', () => {
    expect(NODE_ID).toEqual({
      key: 'nodeId',
      kind: 'text',
      labelKey: 'assistant.fields.nodeId',
      required: true,
      picks: 'node',
      reference: 'node',
    })
  })
})

describe('the flags a channel and a montage row share', () => {
  it('names muted, solo and locked, in that order', () => {
    expect(MUTE_SOLO_LOCK.map(field => field.key)).toEqual(['muted', 'solo', 'locked'])
  })

  it('is the list both families write, not a copy of it', () => {
    const channel = RIG_ACTIONS.find(one => one.name === 'channel.setMuteSoloLock')
    const track = SEQUENCE_ACTIONS.find(one => one.name === 'track.setMuteSoloLockHeight')

    expect(channel?.fields.slice(1)).toEqual(MUTE_SOLO_LOCK)
    expect(track?.fields.slice(1, 4)).toEqual(MUTE_SOLO_LOCK)
  })
})

describe('an input, checked against the fields that declare it', () => {
  it('wants every required field, and lets an optional one be absent', () => {
    const fields = [
      field({ key: 'path', kind: 'text', required: true }),
      field({ key: 'deep', kind: 'boolean' }),
    ]

    expect(validatesInput(fields, { path: 'assets' })).toBe(true)
    expect(validatesInput(fields, { path: 'assets', deep: true })).toBe(true)
    expect(validatesInput(fields, {})).toBe(false)
  })

  /**
   * The schema promises `additionalProperties: false`, and this is what keeps that a fact rather
   * than a courtesy: a client whose misspelt key was ignored in silence would believe the value
   * took, and act on a document that never changed.
   */
  it('refuses a key nothing declares rather than ignoring it', () => {
    expect(validatesInput([field({ key: 'path', kind: 'text' })], { pah: 'assets' })).toBe(false)
  })

  it('holds each kind to what it accepts', () => {
    expect(validatesInput([field({ key: 'n', kind: 'number' })], { n: 1.5 })).toBe(true)
    expect(validatesInput([field({ key: 'n', kind: 'number' })], { n: '1.5' })).toBe(false)
    expect(validatesInput([field({ key: 'n', kind: 'integer' })], { n: 1.5 })).toBe(false)
    expect(validatesInput([field({ key: 'b', kind: 'boolean' })], { b: 'yes' })).toBe(false)
    // Not a number at all, and the one a bare `typeof` lets through.
    expect(validatesInput([field({ key: 'n', kind: 'number' })], { n: Number.NaN })).toBe(false)
  })

  /**
   * Every reader of a colour falls back SILENTLY on one it cannot parse — `readColor` on the
   * value already there, `packedColour` on nothing — so an unchecked colour was answered `ok`
   * with the paint never applied.
   */
  it('holds a colour to a hex the studio can actually read', () => {
    const fields = [field({ key: 'color', kind: 'color' })]

    expect(validatesInput(fields, { color: '#1a2b3c' })).toBe(true)
    expect(validatesInput(fields, { color: 'reddish' })).toBe(false)
    expect(validatesInput(fields, { color: '#1a2' })).toBe(false)
  })

  it('holds a closed field to the values it closes over', () => {
    const text = [field({ key: 'axis', kind: 'choice', options: ['x', 'y'] })]
    const number = [field({ key: 'days', kind: 'choice', options: [7, 31, 120] })]
    const boolean = [field({ key: 'enabled', kind: 'choice', options: [true] })]

    expect(validatesInput(text, { axis: 'x' })).toBe(true)
    expect(validatesInput(text, { axis: 'z' })).toBe(false)
    expect(validatesInput(number, { days: 31 })).toBe(true)
    expect(validatesInput(number, { days: '31' })).toBe(false)
    expect(validatesInput(boolean, { enabled: true })).toBe(true)
    expect(validatesInput(boolean, { enabled: false })).toBe(false)
  })

  it('holds a bounded number to its bounds', () => {
    const fields = [field({ key: 'opacity', kind: 'number', min: 0, max: 1 })]

    expect(validatesInput(fields, { opacity: 0.5 })).toBe(true)
    expect(validatesInput(fields, { opacity: 2 })).toBe(false)
  })

  /**
   * A required field may not be present-but-empty, and that lives here rather than in the
   * handlers: it was one `=== ''` and one `length === 0` per action before, ninety times over,
   * and an action that forgot either had nothing behind it.
   */
  it('refuses a required text that is blank, and a required list that is empty', () => {
    expect(
      validatesInput([field({ key: 'name', kind: 'text', required: true })], { name: ' ' }),
    ).toBe(false)
    expect(validatesInput([field({ key: 'name', kind: 'text' })], { name: '' })).toBe(true)

    const many = [field({ key: 'paths', kind: 'text', required: true, repeated: true })]
    expect(validatesInput(many, { paths: [] })).toBe(false)
    expect(validatesInput(many, { paths: ['a'] })).toBe(true)
  })

  it('takes a list only where the field says it repeats, and checks each item', () => {
    const one = [field({ key: 'paths', kind: 'text' })]
    const many = [field({ key: 'paths', kind: 'text', repeated: true })]

    expect(validatesInput(one, { paths: ['a'] })).toBe(false)
    expect(validatesInput(many, { paths: ['a', 'b'] })).toBe(true)
    expect(validatesInput(many, { paths: ['a', 2] })).toBe(false)
    expect(validatesInput(many, { paths: 'a' })).toBe(false)
  })

  /**
   * 🛑 A `max` on a text field is a LENGTH, and it was applied by nobody: an over-long value went
   * through to the main process, zod threw there, and the client got a refusal naming no field to
   * repair — so it retried the same call. `tools.ts` publishes it as `maxLength`.
   */
  it('holds a text field to the length its registry declares', () => {
    const fields = [field({ key: 'summary', kind: 'text', required: true, max: 5 })]

    expect(validatesInput(fields, { summary: 'short' })).toBe(true)
    expect(validatesInput(fields, { summary: 'far too long' })).toBe(false)
  })

  /**
   * `raw` carries a generation model's own parameters, whose shape is only known once
   * `GET /models/{id}` has answered. Anything defined is therefore in bounds — and `null` is
   * defined, which is what a client sends to clear a value.
   */
  it('takes anything defined for a raw field', () => {
    const fields = [field({ key: 'parameters', kind: 'raw', required: true })]

    expect(validatesInput(fields, { parameters: { seed: 1 } })).toBe(true)
    expect(validatesInput(fields, { parameters: 'a string' })).toBe(true)
    expect(validatesInput(fields, { parameters: null })).toBe(true)
    expect(validatesInput(fields, { parameters: undefined })).toBe(false)
  })
})

describe('an input read for the handler that will get it', () => {
  const many = [field({ key: 'assetIds', kind: 'text', required: true, repeated: true })]

  /**
   * Measured on the bench pass of 2026-08-25: `assetIds: "asset-4"` was refused eighteen times in
   * one request. `badInput` says nothing of the shape, so the model sent the same call again.
   */
  it('lets a lone value fill a repeated field', () => {
    expect(readInput(many, { assetIds: 'asset-4' })).toEqual({ assetIds: ['asset-4'] })
    expect(readInput(many, { assetIds: ['asset-4'] })).toEqual({ assetIds: ['asset-4'] })
  })

  it('still refuses what the fields do not accept', () => {
    expect(readInput(many, { assetIds: 2 })).toBeNull()
    expect(readInput(many, { assetIsd: 'asset-4' })).toBeNull()
    expect(readInput([field({ key: 'n', kind: 'number' })], { n: '1' })).toBeNull()
  })
})

/**
 * 🛑 Measured on the bench pass of 2026-08-25: 384 calls were sent again word for word after a
 * refusal. `badInput` alone names neither the field nor what it takes, so there was nothing to
 * repair from.
 */
describe('why an input was refused', () => {
  it('names the field and what it takes', () => {
    const fields = [
      field({ key: 'workspace', kind: 'choice', required: true, options: ['3d', 'image'] }),
      field({ key: 'at', kind: 'number' }),
    ]

    expect(inputProblem(fields, { workspace: '3d' })).toBeNull()
    expect(inputProblem(fields, { workspace: 'nowhere' })).toContain('"workspace"')
    expect(inputProblem(fields, { workspace: '3d', at: 'soon' })).toContain('"at"')
    expect(inputProblem(fields, { at: 1 })).toContain('"workspace" is required')
  })

  /**
   * A search and the call reading its result, sent in one breath: 41 calls of the bench pass of
   * 2026-08-26 carried a value nobody had answered yet.
   */
  it('tells an empty value apart, and says to send it again next round', () => {
    const problem = inputProblem([field({ key: 'shotId', kind: 'text', required: true })], {
      shotId: '',
    })

    expect(problem).toContain('"shotId" was empty')
    expect(problem).toContain('NEXT round')
  })

  /**
   * The shape a caller writes when it has no value yet, and the studio used to take it as one:
   * `nodeId: "<path_id>"` reached the scene as a name — 24 refusals on the bench pass of
   * 2026-08-26, none of them saying what was wrong with it.
   */
  it('says a placeholder is not a value', () => {
    const one = [field({ key: 'nodeId', kind: 'text', required: true })]

    expect(inputProblem(one, { nodeId: '<path_id>' })).toContain('placeholder')
    expect(inputProblem(one, { nodeId: '$ASSET_ID' })).toContain('placeholder')
    expect(inputProblem(one, { nodeId: 'TODO' })).toContain('placeholder')
    expect(inputProblem(one, { nodeId: 'node-7' })).toBeNull()
  })

  /**
   * 🛑 The message above was unreachable for a year of one morning: `inputProblem` only speaks
   * once something ELSE has refused, and `fits` took any non-blank string. A placeholder reached
   * the handler and came back as `notFound`, and the case here was green on code nothing ran.
   */
  it('refuses a placeholder at the gate, not only in the message', () => {
    const one = [field({ key: 'nodeId', kind: 'text', required: true })]

    expect(readInput(one, { nodeId: '<path_id>' })).toBeNull()
    expect(readInput(one, { nodeId: 'node-7' })).toEqual({ nodeId: 'node-7' })
  })

  it('names a field nothing declares, and what the action does take', () => {
    const problem = inputProblem([field({ key: 'path', kind: 'text' })], { pah: 'assets' })

    expect(problem).toContain('no field "pah"')
    expect(problem).toContain('path')
  })
})
