import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONTEXT_VERSION, type ContextCard } from '@shared/domain/projectContext'
import {
  ContextLockedError,
  createProjectContext,
  PROJECT_CONTEXT_FILE,
  type ProjectContextStore,
} from './context'

const card = (fields: Partial<ContextCard> = {}): ContextCard => ({
  id: 'one',
  title: 'World',
  body: 'A medieval forest',
  active: true,
  pictures: [],
  ...fields,
})

describe('the context a project carries', () => {
  let root: string | null
  let context: ProjectContextStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-context-'))
    context = createProjectContext({ rootOf: () => root })
  })

  afterEach(async () => {
    if (root !== null) await rm(root, { recursive: true, force: true })
  })

  const writeRaw = (body: string): Promise<void> =>
    writeFile(join(root ?? '', PROJECT_CONTEXT_FILE), body, 'utf8')

  it('has none for a project that never wrote one', async () => {
    expect(await context.read()).toEqual({ cards: [], trouble: null })
  })

  it('hands back what was stored, and leaves the file readable by hand', async () => {
    await context.write([card()])

    expect(await context.read()).toEqual({ cards: [card()], trouble: null })
    expect(await readFile(join(root ?? '', PROJECT_CONTEXT_FILE), 'utf8')).toContain('\n  ')
  })

  it('refuses to write over a file it could not read, rather than losing it', async () => {
    await writeRaw('{ not json')

    expect(await context.read()).toEqual({ cards: [], trouble: 'unreadable' })
    await expect(context.write([card()])).rejects.toBeInstanceOf(ContextLockedError)
    expect(await readFile(join(root ?? '', PROJECT_CONTEXT_FILE), 'utf8')).toBe('{ not json')
  })

  it('tells a file from a later build apart from a broken one', async () => {
    await writeRaw(JSON.stringify({ version: CONTEXT_VERSION + 1, cards: [] }))

    expect(await context.read()).toEqual({ cards: [], trouble: 'too-new' })
  })

  it('has none, and writes none, while no project is open', async () => {
    const closed = createProjectContext({ rootOf: () => null })

    expect(await closed.read()).toEqual({ cards: [], trouble: null })
    await expect(closed.write([card()])).rejects.toThrow()
  })
})
