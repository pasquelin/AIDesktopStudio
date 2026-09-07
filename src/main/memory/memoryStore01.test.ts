import { appendFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MEMORY_VERSION, type MemoryDraft } from '@shared/domain/assistantMemory'
import type { SqliteDriver } from '@main/project/sqlite'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { createMemoryIndex } from './memoryIndex'
import { createMemoryStore, hasMoved, type MemoryStore } from './memoryStore'
import { parseMemoryId, parseMemoryPatch } from './validation'

const draft = (fields: Partial<MemoryDraft> = {}): MemoryDraft => ({
  type: 'decision',
  summary: 'Cameras follow the rail',
  importance: 3,
  source: { kind: 'person' },
  ...fields,
})

let root: string
let file: string
let store: MemoryStore
let database: SqliteDriver
let minted: number

const open = (): MemoryStore => {
  minted = 0
  database = openMemoryDatabase()
  return createMemoryStore({
    file,
    index: createMemoryIndex(database),
    now: () => '2026-08-28T10:00:00.000Z',
    newId: () => `m_${++minted}`,
  })
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-memory-'))
  file = join(root, '.ai-desktop-studio', 'memory.ndjson')
  store = open()
})

afterEach(async () => {
  database.close()
  await rm(root, { recursive: true, force: true })
})

const lines = async (): Promise<unknown[]> =>
  (await readFile(file, 'utf8'))
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line))

describe('remembering something', () => {
  it('answers the memory it made, id and date included', async () => {
    const memory = await store.remember(draft())

    expect(memory).toEqual({
      id: 'm_1',
      type: 'decision',
      summary: 'Cameras follow the rail',
      body: '',
      importance: 3,
      createdAt: '2026-08-28T10:00:00.000Z',
      source: { kind: 'person' },
      refs: [],
      links: [],
      state: 'live',
    })
  })

  it('writes one line carrying the format version', async () => {
    await store.remember(draft())

    expect(await lines()).toEqual([expect.objectContaining({ v: MEMORY_VERSION, id: 'm_1' })])
  })

  it('makes the folder rather than failing on a project that has none', async () => {
    await store.remember(draft())

    expect(await lines()).toHaveLength(1)
  })

  it('finds it again by its words straight away', async () => {
    await store.remember(draft({ summary: 'La caméra suit le rail taillé' }))

    expect((await store.list({ text: 'camera taille' })).map(one => one.id)).toEqual(['m_1'])
  })
})

describe('surviving a restart', () => {
  /** 🛑 The whole point of the file: the index is thrown away, this is not. */
  it('reads back what a previous session wrote, index and all', async () => {
    await store.remember(draft({ summary: 'first' }))
    await store.remember(draft({ summary: 'second' }))
    await store.close()

    store = open()
    expect(await store.rebuild()).toBe(2)
    expect((await store.list({})).map(one => one.summary)).toEqual(
      expect.arrayContaining(['first', 'second']),
    )
  })

  it('reads the file again once it has moved', async () => {
    await store.remember(draft({ summary: 'first' }))
    expect(await store.refresh()).toBe(1)

    await store.remember(draft({ summary: 'second' }))

    expect(await store.refresh()).toBe(2)
  })

  it('opens a project that never remembered anything', async () => {
    expect(await store.rebuild()).toBe(0)
    expect(store.trouble()).toBeNull()
  })

  /**
   * 🛑 A memory written three times is held once, as its LAST line describes it. Without this the
   * file would answer three memories of one, and a correction would never take.
   */
  it('lets the last line about a memory win', async () => {
    await store.remember(draft({ summary: 'the first thing said' }))
    await store.amend('m_1', { summary: 'what it really was' })
    await store.close()

    store = open()
    expect(await store.rebuild()).toBe(1)
    expect((await store.read('m_1'))?.summary).toBe('what it really was')
  })

  it('leaves out what was dropped', async () => {
    await store.remember(draft())
    await store.forget('m_1')
    await store.close()

    store = open()
    expect(await store.rebuild()).toBe(0)
  })

  /**
   * 🛑 One JSON object per line is what buys this: an array would lose every memory after the
   * damaged byte, where here a broken line costs that memory alone.
   */
  it('keeps every good line around a broken one', async () => {
    await store.remember(draft({ summary: 'before' }))
    await appendFile(file, '{ this is not json\n', 'utf8')
    await store.remember(draft({ summary: 'after' }))
    await store.close()

    store = open()
    expect(await store.rebuild()).toBe(2)
    expect(store.trouble()).toBe('unreadable')
  })

  /**
   * 🛑 Set aside, never rewritten: the file is the person's, and a build that cannot read a line
   * must not be the build that deletes it.
   */
  it('leaves a line from a later studio in the file and says so', async () => {
    await store.remember(draft({ summary: 'ours' }))
    await appendFile(file, `${JSON.stringify({ v: MEMORY_VERSION + 1, id: 'm_future' })}\n`, 'utf8')
    await store.close()

    store = open()
    expect(await store.rebuild()).toBe(1)
    expect(store.trouble()).toBe('too-new')
    expect(await lines()).toHaveLength(2)
  })

  it('refuses a line whose summary is not a summary at all', async () => {
    await mkdir(dirname(file), { recursive: true })
    await appendFile(file, `${JSON.stringify({ v: MEMORY_VERSION, id: 'm_x' })}\n`, 'utf8')

    expect(await store.rebuild()).toBe(0)
    expect(store.trouble()).toBe('unreadable')
  })
})

describe('deciding whether the file has moved', () => {
  const stamp = { bytes: 120, modifiedAt: 1000 }

  /**
   * 🛑 Tested as a decision rather than through a rewritten file: putting an mtime back is not
   * something APFS allows — `utimes` rounds the fractional `mtimeMs` a `stat` hands out, and the
   * stamp moved by one, measured, in both directions from one run to the next.
   */
  it('has moved when the index has never read it', () => {
    expect(hasMoved(null, stamp)).toBe(true)
  })

  it('has moved when the file is gone', () => {
    expect(hasMoved(stamp, null)).toBe(true)
  })

  it('has moved on another size, and on another moment', () => {
    expect(hasMoved(stamp, { ...stamp, bytes: 121 })).toBe(true)
    expect(hasMoved(stamp, { ...stamp, modifiedAt: 1001 })).toBe(true)
  })

  /**
   * 🛑 The blind spot, written rather than hidden: a rewrite of the same size within the same
   * millisecond reads as untouched. Nothing the studio does lands there — the file only grows
   * between compactions, and a compaction changes its size.
   */
  it('reads a same-size rewrite of the same moment as untouched', () => {
    expect(hasMoved(stamp, { ...stamp })).toBe(false)
  })
})

describe('changing what a memory says', () => {
  it('answers nothing for a memory it does not hold', async () => {
    expect(await store.amend('m_gone', { summary: 'x' })).toBeNull()
  })

  /**
   * 🛑 Measured before it was fixed: zod KEEPS a key sent as an explicit `undefined`, and
   * structured clone carries it over the boundary. The spread then wrote a summary-less line to
   * the append-only file and threw on binding it — the amendment lost, and every later read of
   * that project answering `trouble: 'unreadable'` for good. `parseMemoryPatch` strips them now.
   */
  it('ignores a field sent as an explicit nothing rather than writing it', async () => {
    await store.remember(draft({ summary: 'held' }))
    await store.amend('m_1', parseMemoryPatch({ summary: undefined, state: 'archived' }))

    expect(await store.read('m_1')).toEqual(
      expect.objectContaining({ summary: 'held', state: 'archived' }),
    )
    expect(await store.rebuild()).toBe(1)
    expect(store.trouble()).toBeNull()
  })

  /**
   * 🛑 A COERCION is not a check: `String(undefined)` reads back as the string "undefined" and
   * `String({})` as "[object Object]", so a window sending nothing at all asked the store about a
   * memory named after its own mistake. The three id-taking channels went through `String`.
   */
  it('refuses an id that is not one, rather than coercing it into a name', () => {
    expect(() => parseMemoryId(undefined)).toThrow()
    expect(() => parseMemoryId({})).toThrow()
    expect(() => parseMemoryId('')).toThrow()
    expect(parseMemoryId('m_1')).toBe('m_1')
  })

  /**
   * 🛑 A caller that read a memory, appended one id and wrote the list back lost whatever another
   * window — or a merge — had linked in between, without a word. The union is computed inside the
   * write queue, so both links survive whatever order they arrive in.
   */
  it('adds a link to what stands, rather than to what the caller had read', async () => {
    await store.remember(draft())

    // Two writers who each read `links: []` and each add one id.
    const [first, second] = await Promise.all([
      store.amend('m_1', { linkTo: ['m_other'] }),
      store.amend('m_1', { linkTo: ['m_third'] }),
    ])

    expect(first?.links.length).toBeLessThan(2)
    expect(second?.links).toEqual(['m_other', 'm_third'])
    expect((await store.read('m_1'))?.links).toEqual(['m_other', 'm_third'])
  })

  it('adds a link once, however many times it is asked for', async () => {
    await store.remember(draft())
    await store.amend('m_1', { linkTo: ['m_other'] })
    await store.amend('m_1', { linkTo: ['m_other'] })

    expect((await store.read('m_1'))?.links).toEqual(['m_other'])
  })

  it('writes the whole memory again rather than a difference', async () => {
    await store.remember(draft())
    await store.amend('m_1', { state: 'pinned' })

    const written = await lines()
    expect(written).toHaveLength(2)
    expect(written[1]).toEqual(expect.objectContaining({ id: 'm_1', state: 'pinned' }))
  })

  it('keeps the id, the date and the source beyond what a caller may set', async () => {
    await store.remember(draft())
    const amended = await store.amend('m_1', { summary: 'reworded' })

    expect(amended).toEqual(
      expect.objectContaining({
        id: 'm_1',
        createdAt: '2026-08-28T10:00:00.000Z',
        source: { kind: 'person' },
        summary: 'reworded',
      }),
    )
  })
})
