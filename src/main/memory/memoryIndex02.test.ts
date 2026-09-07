import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Memory, MemoryRef } from '@shared/domain/assistantMemory'
import type { SqliteDriver } from '@main/project/sqlite'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { createMemoryIndex, type MemoryIndex } from './memoryIndex'
import { digestOf, embeddedTextOf } from './vectors'

const memory = (fields: Partial<Memory> = {}): Memory => ({
  id: 'm_one',
  type: 'decision',
  summary: 'Cameras follow the rail',
  body: '',
  importance: 3,
  createdAt: '2026-08-28T10:00:00.000Z',
  source: { kind: 'person' },
  refs: [],
  links: [],
  state: 'live',
  ...fields,
})

let database: SqliteDriver
let index: MemoryIndex

beforeEach(() => {
  database = openMemoryDatabase()
  index = createMemoryIndex(database)
})

afterEach(() => database.close())

describe('what answers a question', () => {
  const NOW = '2026-08-28T12:00:00.000Z'
  const ask = (fields: Partial<Parameters<MemoryIndex['recall']>[0]> = {}): readonly Memory[] =>
    index.recall({ text: '', now: NOW, limit: 10, ...fields })

  const vectorFor = (one: Memory, values: readonly number[]): void =>
    index.writeVectors([
      {
        memoryId: one.id,
        model: 'e',
        digest: digestOf(embeddedTextOf(one.summary, one.body)),
        values: new Float32Array(values),
      },
    ])

  /**
   * 🛑 A question is not a filter. Read as one — every term required — « à quoi sert le script
   * CameraRig ? » demanded thirteen words of one memory, and a real studio answered nothing.
   */
  it('answers a whole question, not only a memory holding every word of it', () => {
    index.putAll([
      memory({ id: 'm_script', summary: 'Scripts/CameraRig.ts drives the rail' }),
      memory({ id: 'm_other', summary: 'the palette is night blue and ochre' }),
    ])

    const asked = 'what is the script CameraRig for in this project?'

    expect(ask({ text: asked })[0]?.id).toBe('m_script')
    // The listing, which IS a filter, still narrows: nothing holds all of those words.
    expect(index.list({ text: asked })).toEqual([])
  })

  it('finds by an exact word what no vector could reach', () => {
    index.putAll([
      memory({ id: 'm_script', summary: 'Scripts/CameraRig.ts drives the rail' }),
      memory({ id: 'm_other', summary: 'the palette is night blue and ochre' }),
    ])

    expect(ask({ text: 'CameraRig' }).map(one => one.id)).toEqual(['m_script'])
  })

  /** The one voice that answers a question nobody can word exactly. */
  it('finds by meaning what the words missed', () => {
    const near = memory({ id: 'm_near', summary: 'we chose to export materials as MaterialX' })
    const far = memory({ id: 'm_far', summary: 'the forest GLB takes forty seconds to load' })
    index.putAll([near, far])
    vectorFor(near, [1, 0])
    vectorFor(far, [0, 1])

    const found = ask({
      text: 'nothing matches these words',
      question: new Float32Array([1, 0]),
      model: 'e',
    })

    expect(found[0]?.id).toBe('m_near')
  })

  it('answers on words alone when no model has embedded anything', () => {
    index.putAll([memory({ id: 'm_script', summary: 'Scripts/CameraRig.ts drives the rail' })])

    expect(ask({ text: 'CameraRig', model: 'e' }).map(one => one.id)).toEqual(['m_script'])
  })

  /** What is on screen is not a guess — see `RECALL_WEIGHTS`. */
  it('puts what the open document is anchored to ahead of a word that merely matched', () => {
    index.putAll([
      memory({ id: 'm_words', summary: 'the rail was rebuilt in the workshop' }),
      memory({
        id: 'm_here',
        summary: 'a note about nothing',
        refs: [{ kind: 'scene', ref: 's_1' }],
      }),
    ])

    const found = ask({ text: 'rail', refs: [{ kind: 'scene', ref: 's_1' }] })

    expect(found[0]?.id).toBe('m_here')
  })

  it('gives a pinned memory even when nothing about it was asked', () => {
    index.putAll([
      memory({ id: 'm_pinned', state: 'pinned', summary: 'always tell me about the client' }),
      memory({ id: 'm_words', summary: 'the rail was rebuilt' }),
    ])

    expect(ask({ text: 'rail' })[0]?.id).toBe('m_pinned')
  })

  /**
   * 🛑 Merged and not concatenated: a memory both voices found would otherwise be answered twice,
   * and the second copy would push a different memory out of the budget.
   */
  it('answers a memory once when the words and the meaning both found it', () => {
    const both = memory({ id: 'm_both', summary: 'the rail and the cameras' })
    index.put(both)
    vectorFor(both, [1, 0])

    const found = ask({ text: 'rail', question: new Float32Array([1, 0]), model: 'e' })

    expect(found.map(one => one.id)).toEqual(['m_both'])
  })

  it('answers nothing at all when nothing is held', () => {
    expect(ask({ text: 'rail' })).toEqual([])
  })

  /** A vector another model made is in another space: scoring against it is worse than not. */
  it('ignores the vectors of a model it was not asked about', () => {
    const one = memory({ id: 'm_one', summary: 'a memory with an old vector' })
    index.put(one)
    index.writeVectors([
      {
        memoryId: one.id,
        model: 'old',
        digest: digestOf(embeddedTextOf(one.summary, one.body)),
        values: new Float32Array([1, 0]),
      },
    ])

    // Found by nothing but its own presence, so the ranking never sees a similarity at all.
    expect(ask({ question: new Float32Array([1, 0]), model: 'e' })).toEqual([])
  })
})

describe('what a recall may answer with', () => {
  const NOW_TOO = '2026-08-28T12:00:00.000Z'

  /**
   * 🛑 What archiving MEANS. The panel still lists it and the file still holds it, but the
   * assistant stops being given it — a memory set aside came back beside its own replacement.
   */
  it('never answers an archived memory', () => {
    index.putAll([
      memory({ id: 'm_old', summary: 'the rail, as it used to be', state: 'archived' }),
      memory({ id: 'm_now', summary: 'the rail, as it is' }),
    ])

    const found = index.recall({ text: 'rail', now: NOW_TOO, limit: 10 })

    expect(found.map(one => one.id)).toEqual(['m_now'])
  })

  it('never answers one anchored on the open document either, once archived', () => {
    const anchor: MemoryRef = { kind: 'scene', ref: 's_1' }
    index.put(memory({ id: 'm_old', state: 'archived', refs: [anchor] }))

    expect(index.recall({ text: '', refs: [anchor], now: NOW_TOO, limit: 10 })).toEqual([])
  })
})

describe('how many it holds', () => {
  /**
   * 🛑 The ANSWERABLE states. The briefing's signal is driven by this count, and a project whose
   * memories were all archived told the model « memory.recall answers it » for a recall that
   * answers nothing — a wasted round trip on every conversation.
   */
  it('counts what a recall could answer with, never what was set aside', () => {
    index.put(memory({ id: 'm_live' }))
    index.put(memory({ id: 'm_pinned', state: 'pinned' }))
    index.put(memory({ id: 'm_archived', state: 'archived' }))

    expect(index.count()).toBe(2)
  })
})
