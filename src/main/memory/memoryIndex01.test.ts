import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Memory } from '@shared/domain/assistantMemory'
import type { SqliteDriver } from '@main/project/sqlite'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { createMemoryIndex, type MemoryIndex } from './memoryIndex'
import { digestOf, embeddedTextOf, type MemoryVector } from './vectors'

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

describe('holding a memory', () => {
  it('reads back everything it was given, refs and links included', () => {
    const written = memory({
      body: 'the rail was chosen so a shot repeats',
      usedAt: '2026-08-28T11:00:00.000Z',
      source: { kind: 'action', ref: 'scene.rail.create' },
      // Held in the order the index answers in — sorted, never the order they were written.
      refs: [
        { kind: 'file', ref: 'Scripts/Cam.ts' },
        { kind: 'scene', ref: 's_1' },
      ],
      links: ['m_two'],
      state: 'pinned',
      supersedes: 'm_old',
    })
    index.put(written)

    expect(index.read('m_one')).toEqual(written)
  })

  it('answers nothing for an id it never saw', () => {
    expect(index.read('m_gone')).toBeNull()
  })

  /**
   * 🛑 One line of the file is the whole truth about one memory. Merging would leave a ref that
   * its author removed, and nothing would ever say where it came from.
   */
  it('replaces the refs of a memory rather than adding to them', () => {
    index.put(memory({ refs: [{ kind: 'scene', ref: 's_1' }] }))
    index.put(memory({ refs: [{ kind: 'file', ref: 'Scripts/Cam.ts' }] }))

    expect(index.read('m_one')?.refs).toEqual([{ kind: 'file', ref: 'Scripts/Cam.ts' }])
  })

  /**
   * 🛑 Read through the fts5 table itself, and it has to be: `list` joins on `memories`, so a
   * dead row answers nothing and every other case here stayed green on the defect. Measured —
   * `INSERT OR REPLACE` fires no `AFTER DELETE` trigger, so the corpus grew by one on every
   * amend and bm25 came to rank against ghosts. `integrity-check` reported nothing either.
   */
  it('forgets the words of the version it replaced', () => {
    index.put(memory({ summary: 'zebra crossing' }))
    index.put(memory({ summary: 'giraffe walking' }))

    expect(database.prepare('SELECT count(*) AS held FROM memories_fts').get()?.held).toBe(1)
    expect(
      database.prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'zebra'").all(),
    ).toEqual([])
  })

  it('keeps a link to a memory it has never read', () => {
    index.put(memory({ links: ['m_not_here_yet'] }))

    expect(index.read('m_one')?.links).toEqual(['m_not_here_yet'])
  })
})

describe('finding a memory by its words', () => {
  beforeEach(() => {
    index.putAll([
      memory({ id: 'm_rail', summary: 'La caméra suit le rail taillé' }),
      memory({ id: 'm_sprint', summary: 'PlayerController.ts holds the sprint' }),
      memory({ id: 'm_light', summary: 'The key light stays at 45 degrees', body: 'sprint' }),
    ])
  })

  /** 🛑 The whole reason for `remove_diacritics 2`: nobody types accents into a search box. */
  it('finds an accented word typed without its accent', () => {
    expect(index.list({ text: 'camera taille' }).map(one => one.id)).toEqual(['m_rail'])
  })

  it('finds a file name whole, which is what an exact search is for', () => {
    expect(index.list({ text: 'PlayerController.ts' }).map(one => one.id)).toContain('m_sprint')
  })

  it('searches the body as well as the summary', () => {
    expect(index.list({ text: 'sprint' }).map(one => one.id)).toEqual(
      expect.arrayContaining(['m_sprint', 'm_light']),
    )
  })

  /**
   * 🛑 Punctuation alone tokenises to nothing, and fts5 cannot look for what it never indexed.
   * Without the fallback, searching « 45% » answers that nothing matched.
   */
  it('falls back to a scan when nothing tokenises', () => {
    index.put(memory({ id: 'm_odd', summary: 'weight is 45%' }))

    expect(index.list({ text: '%' }).map(one => one.id)).toEqual(['m_odd'])
  })

  it('answers an empty list rather than everything when nothing matches', () => {
    expect(index.list({ text: 'submarine' })).toEqual([])
  })
})

describe('narrowing a listing', () => {
  beforeEach(() => {
    index.putAll([
      memory({ id: 'm_a', type: 'decision', state: 'live', importance: 5 }),
      memory({ id: 'm_b', type: 'script', state: 'archived', importance: 1 }),
      memory({
        id: 'm_c',
        type: 'script',
        state: 'live',
        importance: 3,
        refs: [{ kind: 'scene', ref: 's_1' }],
      }),
    ])
  })

  it('keeps only the types asked for', () => {
    expect(index.list({ types: ['script'] }).map(one => one.id)).toEqual(['m_c', 'm_b'])
  })

  it('keeps only the states asked for', () => {
    expect(index.list({ states: ['live'] }).map(one => one.id)).toEqual(['m_a', 'm_c'])
  })

  it('anchors on what is in front of the person', () => {
    expect(index.list({ refs: [{ kind: 'scene', ref: 's_1' }] }).map(one => one.id)).toEqual([
      'm_c',
    ])
  })

  it('ranks by weight when no words were asked for', () => {
    expect(index.list({}).map(one => one.id)).toEqual(['m_a', 'm_c', 'm_b'])
  })

  it('answers at most what it was asked for', () => {
    expect(index.list({ limit: 1 })).toHaveLength(1)
  })
})

describe('what the index believes the file to be', () => {
  it('has no opinion before it is told', () => {
    expect(index.stamp()).toBeNull()
  })

  it('holds one stamp, not a history of them', () => {
    index.restamp({ bytes: 120, modifiedAt: 1 })
    index.restamp({ bytes: 240, modifiedAt: 2 })

    expect(index.stamp()).toEqual({ bytes: 240, modifiedAt: 2 })
  })
})

describe('emptying it for a rebuild', () => {
  /**
   * 🛑 The rows go through `memories` so the fts5 triggers fire. Emptied around them, the index
   * would keep every word it ever read and answer searches about memories that are gone.
   */
  it('forgets the words as well as the rows', () => {
    index.put(memory({ summary: 'a memorable sentence' }))
    index.clear()

    expect(index.list({ text: 'memorable' })).toEqual([])
    expect(index.list({})).toEqual([])
    expect(index.stamp()).toBeNull()
  })

  it('is still usable afterwards', () => {
    index.put(memory())
    index.clear()
    index.put(memory({ id: 'm_new', summary: 'written after the wipe' }))

    expect(index.list({ text: 'wipe' }).map(one => one.id)).toEqual(['m_new'])
  })
})

describe('what a retrieval served', () => {
  it('stamps only the memories it names', () => {
    index.putAll([memory({ id: 'm_a' }), memory({ id: 'm_b' })])
    index.markUsed(['m_a'], '2026-08-28T12:00:00.000Z')

    expect(index.read('m_a')?.usedAt).toBe('2026-08-28T12:00:00.000Z')
    expect(index.read('m_b')?.usedAt).toBeUndefined()
  })
})

describe('the embeddings beside the memories', () => {
  const vectorOf = (memoryId: string, values: readonly number[], digest: string): MemoryVector => ({
    memoryId,
    model: 'e',
    digest,
    values: new Float32Array(values),
  })

  const digestFor = (one: Memory): string => digestOf(embeddedTextOf(one.summary, one.body))

  /**
   * 🛑 The table itself, never `vectors()`. That reader JOINs on `memories`, so an orphan it left
   * behind reads as absent through it — a test written the obvious way passes WITH the leak.
   */
  const rowsHeld = (): number =>
    Number(database.prepare('SELECT count(*) AS held FROM memory_vectors').get()?.['held'] ?? -1)

  /**
   * 🛑 Read through `recall` and not through a reader of its own: the blob is written here and
   * compared by `dotOfBytes` on the other side, so an accessor that unpacked it back would prove
   * the round trip of a path nothing in production takes.
   */
  const scoredByMeaning = (question: readonly number[]): readonly string[] =>
    index
      .recall({
        // No word in common with any memory here: the vector voice is the only one that can answer.
        text: 'zzz',
        question: new Float32Array(question),
        model: 'e',
        now: '2026-08-28T12:00:00.000Z',
        limit: 10,
      })
      .map(one => one.id)

  it('scores a memory on the floats it was handed, through the blob', () => {
    const written = memory({ summary: 'a sentence with a vector' })
    index.put(written)
    index.writeVectors([vectorOf('m_one', [1, 0, 0], digestFor(written))])

    expect(scoredByMeaning([1, 0, 0])).toEqual(['m_one'])
  })

  it('names what still has none, and stops naming it once it has one', () => {
    const written = memory()
    index.put(written)

    expect(index.pendingVectors('e')).toBe(1)
    expect(index.withoutVector('e', 10).map(one => one.id)).toEqual(['m_one'])

    index.writeVectors([vectorOf('m_one', [1], digestFor(written))])

    expect(index.pendingVectors('e')).toBe(0)
    expect(index.withoutVector('e', 10)).toEqual([])
  })

  it('embeds both halves of a memory, not the summary alone', () => {
    index.put(memory({ summary: 'the rail', body: 'Scripts/Cam.ts drives it' }))

    expect(index.withoutVector('e', 10)[0]?.text).toBe('the rail\nScripts/Cam.ts drives it')
  })

  /**
   * 🛑 The reason the table is keyed on a digest rather than on a row. Reading the file back
   * empties and rewrites `memories`, which is what an opening does whenever anything was
   * remembered since — and a vector costs 24 ms to make.
   */
  it('keeps a vector across a rebuild that rewrote the same memory', () => {
    const written = memory()
    index.put(written)
    index.writeVectors([vectorOf('m_one', [1], digestFor(written))])

    index.clear()
    index.putAll([written])

    expect(index.pendingVectors('e')).toBe(0)
    expect(scoredByMeaning([1])).toEqual(['m_one'])
  })

  it('asks for a new one when the words changed, and stops answering the old one', () => {
    const written = memory()
    index.put(written)
    index.writeVectors([vectorOf('m_one', [1], digestFor(written))])

    index.put(memory({ summary: 'the cameras follow the target after all' }))

    expect(index.pendingVectors('e')).toBe(1)
    // Not merely « pending »: the stale vector must not be scored against a question either.
    expect(scoredByMeaning([1])).toEqual([])
  })

  it('drops what another model produced, and keeps its own', () => {
    const written = memory()
    index.put(written)
    index.writeVectors([{ ...vectorOf('m_one', [1], digestFor(written)), model: 'old' }])

    index.dropOtherVectors('e')

    expect(rowsHeld()).toBe(0)
    expect(index.pendingVectors('e')).toBe(1)
  })

  it('drops the vector of a memory that was forgotten', () => {
    const written = memory()
    index.put(written)
    index.writeVectors([vectorOf('m_one', [1], digestFor(written))])
    index.remove('m_one')

    expect(rowsHeld()).toBe(0)
  })

  /** `clear` spares them on purpose, so a memory the file dropped is only orphaned after. */
  it('sweeps the vectors of memories the file no longer holds', () => {
    const written = memory()
    index.put(written)
    index.writeVectors([vectorOf('m_one', [1], digestFor(written))])

    index.clear()
    index.putAll([memory({ id: 'm_other' })])

    expect(rowsHeld()).toBe(1)

    index.sweepVectors()

    expect(rowsHeld()).toBe(0)
  })
})
