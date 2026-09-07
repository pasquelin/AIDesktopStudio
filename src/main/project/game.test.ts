import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyGame, GAME_FILE, GAME_VERSION, type GameManifest } from '@shared/domain/game'
import { createProjectGame, GameLockedError, type ProjectGameStore } from './game'

const declared = (): GameManifest => ({
  ...emptyGame(),
  scenes: ['3f2a-11e9'],
  entryScene: '3f2a-11e9',
  scripts: [{ id: 'one', path: 'scripts/player.ts' }],
  settings: { title: 'The dungeon' },
})

describe('the game a project declares', () => {
  let root: string | null
  let game: ProjectGameStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-game-'))
    game = createProjectGame({ rootOf: () => root })
  })

  afterEach(async () => {
    if (root !== null) await rm(root, { recursive: true, force: true })
  })

  const rawFile = (): string => join(root ?? '', GAME_FILE)
  const writeRaw = (body: string): Promise<void> => writeFile(rawFile(), body, 'utf8')

  it('has none for a project that never declared one', async () => {
    expect(await game.read()).toEqual({ game: emptyGame(), trouble: null })
  })

  it('hands back what was stored, and leaves the file readable by hand', async () => {
    await game.write(declared())

    expect(await game.read()).toEqual({ game: declared(), trouble: null })
    expect(await readFile(rawFile(), 'utf8')).toContain('\n  ')
  })

  it('opens a manifest that names only what its author cared to write', async () => {
    await writeRaw(JSON.stringify({ version: GAME_VERSION, scenes: ['3f2a-11e9'] }))

    expect(await game.read()).toEqual({
      game: { ...emptyGame(), scenes: ['3f2a-11e9'] },
      trouble: null,
    })
  })

  it('refuses to write over a file it could not read, rather than losing it', async () => {
    await writeRaw('{ not json')

    expect(await game.read()).toEqual({ game: emptyGame(), trouble: 'unreadable' })
    await expect(game.write(declared())).rejects.toBeInstanceOf(GameLockedError)
    expect(await readFile(rawFile(), 'utf8')).toBe('{ not json')
  })

  it('leaves a manifest from a later build exactly where it is', async () => {
    const later = JSON.stringify({ version: GAME_VERSION + 1, scenes: [], mysteries: ['fog'] })
    await writeRaw(later)

    expect(await game.read()).toEqual({ game: emptyGame(), trouble: 'too-new' })
    await expect(game.write(declared())).rejects.toBeInstanceOf(GameLockedError)
    expect(await readFile(rawFile(), 'utf8')).toBe(later)
  })

  it('has none, and writes none, while no project is open', async () => {
    const closed = createProjectGame({ rootOf: () => null })

    expect(await closed.read()).toEqual({ game: emptyGame(), trouble: null })
    await expect(closed.write(declared())).rejects.toThrow()
  })
})
