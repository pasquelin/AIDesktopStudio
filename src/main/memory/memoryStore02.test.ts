import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MEMORY_VERSION, type MemoryDraft } from '@shared/domain/assistantMemory'
import type { SqliteDriver } from '@main/project/sqlite'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { createMemoryIndex } from './memoryIndex'
import { createMemoryStore, type MemoryStore } from './memoryStore'

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

describe('what this machine served', () => {
  /**
   * 🛑 `usedAt` says when THIS machine last answered with a memory, so it stays out of a file
   * that travels — and a rebuild has to carry it across, or the next write by any window would
   * throw away every reading the retrieval had made.
   */
  it('never travels in the file, and survives a rebuild all the same', async () => {
    await store.remember(draft())
    await store.markUsed(['m_1'])

    expect((await lines())[0]).not.toHaveProperty('usedAt')
    expect((await store.read('m_1'))?.usedAt).toBe('2026-08-28T10:00:00.000Z')

    await store.rebuild()
    expect((await store.read('m_1'))?.usedAt).toBe('2026-08-28T10:00:00.000Z')
  })
})

describe('forgetting', () => {
  it('says so when there was nothing to forget', async () => {
    expect(await store.forget('m_gone')).toBe(false)
  })

  it('stops answering it, and writes down that it is gone', async () => {
    await store.remember(draft())
    expect(await store.forget('m_1')).toBe(true)

    expect(await store.read('m_1')).toBeNull()
    expect((await lines())[1]).toEqual(expect.objectContaining({ id: 'm_1', state: 'dropped' }))
  })
})

describe('resetting a project memory', () => {
  it('leaves no file and no memory behind', async () => {
    await store.remember(draft())
    await store.reset()

    expect(await store.list({})).toEqual([])
    await expect(readFile(file, 'utf8')).rejects.toThrow()
  })
})

describe('what a memory replaces', () => {
  const scriptDraft = (summary: string): MemoryDraft => ({
    type: 'script',
    summary,
    importance: 4,
    source: { kind: 'action', ref: 'script.write' },
    refs: [{ kind: 'file', ref: 'Scripts/Cam.ts' }],
  })

  /**
   * 🛑 A rule fires again on the same script. Two memories saying different things about one
   * file, with nothing to tell which is now, would both be recalled.
   */
  it('supersedes the one standing on the same reference, and archives it', async () => {
    const first = await store.remember(scriptDraft('the rig drives the rail'))
    const second = await store.remember(scriptDraft('the rig drives the rail and the target'))

    expect(second.supersedes).toBe(first.id)
    expect((await store.read(first.id))?.state).toBe('archived')
    expect((await store.list({ states: ['live'] })).map(one => one.summary)).toEqual([
      'the rig drives the rail and the target',
    ])
  })

  it('survives a restart, with the replaced one still archived', async () => {
    const first = await store.remember(scriptDraft('one'))
    await store.remember(scriptDraft('two'))
    await store.rebuild()

    expect((await store.read(first.id))?.state).toBe('archived')
    expect((await store.list({ states: ['live'] })).map(one => one.summary)).toEqual(['two'])
  })

  it('replaces nothing when it is about another file', async () => {
    await store.remember(scriptDraft('one'))
    const other = await store.remember({
      ...scriptDraft('two'),
      refs: [{ kind: 'file', ref: 'Scripts/Other.ts' }],
    })

    expect(other.supersedes).toBeUndefined()
    expect(await store.list({ states: ['live'] })).toHaveLength(2)
  })

  /** A memory anchored on nothing has nothing to be the same as: it is simply another one. */
  it('replaces nothing when the draft names no reference', async () => {
    const draft: MemoryDraft = {
      type: 'decision',
      summary: 'a decision recorded in git',
      importance: 3,
      source: { kind: 'action', ref: 'git.commit' },
    }
    await store.remember(draft)
    const second = await store.remember(draft)

    expect(second.supersedes).toBeUndefined()
    expect(await store.list({ states: ['live'] })).toHaveLength(2)
  })

  it('replaces nothing of another type on the same file', async () => {
    await store.remember(scriptDraft('one'))
    const other = await store.remember({ ...scriptDraft('two'), type: 'problem' })

    expect(other.supersedes).toBeUndefined()
  })
})

describe('compacting the file', () => {
  const readLines = async (): Promise<readonly string[]> =>
    (await readFile(file, 'utf8')).split('\n').filter(line => line.trim().length > 0)

  it('leaves one line per memory that still stands', async () => {
    const first = await store.remember(draft({ summary: 'one' }))
    await store.amend(first.id, { summary: 'one, said better' })
    await store.remember(draft({ summary: 'two' }))

    expect(await readLines()).toHaveLength(3)
    await expect(store.compact()).resolves.toBe(1)

    const lines = await readLines()
    expect(lines).toHaveLength(2)
    expect(lines.join('\n')).toContain('one, said better')
  })

  /**
   * 🛑 The one gesture that loses anything, and it loses only what was already forgotten:
   * archiving is a state, forgetting is a removal, and this is what carries the second out.
   */
  it('drops what was forgotten and keeps what was archived', async () => {
    const gone = await store.remember(draft({ summary: 'forgotten' }))
    const kept = await store.remember(draft({ summary: 'archived' }))
    await store.forget(gone.id)
    await store.amend(kept.id, { state: 'archived' })
    await store.compact()

    const body = (await readLines()).join('\n')
    expect(body).not.toContain('forgotten')
    expect(body).toContain('archived')
  })

  it('reads back the same memories after a restart', async () => {
    await store.remember(draft({ summary: 'one' }))
    await store.remember(draft({ summary: 'two' }))
    await store.compact()

    database.close()
    store = open()
    await store.rebuild()

    expect((await store.list({})).map(one => one.summary).sort()).toEqual(['one', 'two'])
  })

  /**
   * 🛑 The saving is measured against the FILE, and the file grows under the session that reads
   * it: a count taken once at the read and never followed would report a stale figure — and this
   * is the gesture that then rewrites the file from it.
   */
  it('measures its saving against a file that grew since it was read', async () => {
    await store.remember(draft({ summary: 'first' }))
    await store.rebuild()
    await store.amend('m_1', { state: 'pinned' })
    await store.amend('m_1', { summary: 'reworded' })

    // Four lines on disk — one written, one re-read, two amendments — for one memory standing.
    await expect(store.compact()).resolves.toBe(2)
    expect(await lines()).toHaveLength(1)
  })

  it('saves nothing on a file that was never written', async () => {
    await expect(store.compact()).resolves.toBe(0)
  })
})

describe('what compaction refuses to touch', () => {
  /**
   * 🛑 A line a NEWER studio wrote is deliberately kept out of the index. Rewriting the file
   * from the index would erase it — and this is the one gesture that rewrites.
   */
  it('refuses a file it could not read whole, and leaves every line standing', async () => {
    await store.remember(draft({ summary: 'readable' }))
    await appendFile(file, `${JSON.stringify({ v: MEMORY_VERSION + 1, id: 'm_future' })}\n`)
    await store.rebuild()

    expect(store.trouble()).toBe('too-new')
    await expect(store.compact()).resolves.toBe(0)
    expect(await readFile(file, 'utf8')).toContain('m_future')
  })

  /**
   * 🛑 The session that compacts is rarely the one that read. `trouble` is set by `readFileInto`
   * alone, and `refresh` short-circuits on an unmoved stamp — so a second launch over the very
   * same file saw `trouble === null` and rewrote it, reporting the erased lines as lines saved.
   */
  it('refuses a file a PREVIOUS session found unreadable, not merely this one', async () => {
    await store.remember(draft({ summary: 'readable' }))
    await appendFile(file, `${JSON.stringify({ v: MEMORY_VERSION + 1, id: 'm_future' })}\n`)
    await store.rebuild()

    // A second launch over the SAME index — which is a file on disk and survives — so the stamp
    // has not moved and `refresh` answers from it without reading a line.
    store = createMemoryStore({
      file,
      index: createMemoryIndex(database),
      now: () => '2026-08-28T10:00:00.000Z',
      newId: () => 'm_next',
    })
    expect(await store.refresh()).toBe(1)
    expect(store.trouble()).toBeNull()

    await expect(store.compact()).resolves.toBe(0)
    expect(await readFile(file, 'utf8')).toContain('m_future')
  })

  it('refuses a file that would not read at all, rather than emptying it', async () => {
    await store.remember(draft({ summary: 'held' }))
    await appendFile(file, 'this is not a line of json\n')
    await store.rebuild()

    expect(store.trouble()).toBe('unreadable')
    await expect(store.compact()).resolves.toBe(0)
    expect(await readFile(file, 'utf8')).toContain('held')
  })
})

describe('what a memory may not replace', () => {
  const pinnedDraft = (summary: string): MemoryDraft => ({
    type: 'script',
    summary,
    importance: 4,
    source: { kind: 'action', ref: 'script.write' },
    refs: [{ kind: 'file', ref: 'Scripts/Cam.ts' }],
  })

  /**
   * 🛑 Pinning IS the decision to always give it. An automatic rule archiving it would undo that
   * decision without a word — the same invariant `staleIn` holds for the upkeep.
   */
  it('never supersedes a pinned memory', async () => {
    const pinned = await store.remember({ ...pinnedDraft('the rail'), state: 'pinned' })
    const second = await store.remember(pinnedDraft('the rail and the target'))

    expect(second.supersedes).toBeUndefined()
    expect((await store.read(pinned.id))?.state).toBe('pinned')
  })
})
