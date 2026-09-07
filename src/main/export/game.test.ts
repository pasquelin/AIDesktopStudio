import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import type { GameExportOutcome } from '@shared/domain/gameExport'
import type { Asset } from '@shared/domain/asset'
import { invoke, resetHandlers } from '@main/ipc/testHarness'
import { registerGameExportHandler } from './game'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const SCENE = JSON.stringify({ nodes: [] })

describe('the door onto a game written out of the studio', () => {
  let chosen: string
  let project: string
  let runtime: string

  beforeEach(async () => {
    resetHandlers()
    chosen = await mkdtemp(join(tmpdir(), 'game-export-'))
    project = await mkdtemp(join(tmpdir(), 'game-project-'))
    runtime = join(project, 'gameRuntime')
    await mkdir(runtime, { recursive: true })
    await writeFile(join(runtime, 'runtime.js'), '// bundle')
    registerGameExportHandler({
      pickFolder: () => Promise.resolve<string | null>(chosen),
      projectPath: () => project,
      assetsById: () => Promise.resolve([]),
      bundledAnimation: () => Promise.resolve(null),
      runtimeFolder: () => runtime,
    })
  })

  const exporting = async (over: Record<string, unknown> = {}) =>
    (await invoke(CHANNELS.gameExport, {
      title: 'Demo',
      entryScene: 'doc-1',
      scenes: [{ id: 'doc-1', title: 'Menu', content: SCENE }],
      scripts: [],
      ...over,
    })) as GameExportOutcome | null

  it('answers the folder NAME and writes the game inside it', async () => {
    const outcome = await exporting()

    expect(outcome).toMatchObject({ folder: 'Demo', scenes: 1 })
    expect((await readdir(join(chosen, 'Demo'))).sort()).toEqual([
      'game.json',
      'index.html',
      'runtime.js',
      'scenes',
    ])
  })

  /** 🛑 A title is a person's words, and a folder name is not — `..` climbs out of the choice. */
  it('writes a game whose title would climb out of the folder inside it', async () => {
    await exporting({ title: '../../evil' })

    expect(await readdir(chosen)).toEqual(['evil'])
  })

  /**
   * The half a caller with no screen needs: a folder NAMED rather than picked. What guards it is
   * the project's own boundary, since nobody is there to choose one outside.
   */
  describe('a folder the caller names', () => {
    it('writes there without raising a picker', async () => {
      const pickFolder = vi.fn(() => Promise.resolve<string | null>(chosen))
      resetHandlers()
      registerGameExportHandler({
        pickFolder,
        projectPath: () => project,
        assetsById: () => Promise.resolve([]),
        bundledAnimation: () => Promise.resolve(null),
        runtimeFolder: () => runtime,
      })

      expect(await exporting({ folder: 'Builds' })).toMatchObject({ folder: 'Demo' })
      expect(await readdir(join(project, 'Builds', 'Demo'))).toContain('index.html')
      expect(pickFolder).not.toHaveBeenCalled()
    })

    it('refuses a folder that climbs out of the project', async () => {
      expect(await exporting({ folder: '../elsewhere' })).toBeNull()
    })

    /** 🛑 ONE folder, which is what `folderInsideProject` says its own safety rests on: it reads
     * what the disk resolves to and refuses nothing about the SHAPE of a name. */
    it('refuses a path where a folder name was asked for', async () => {
      expect(await exporting({ folder: 'Builds/Nested' })).toBeNull()
    })

    it('picks as before when the folder is empty', async () => {
      await exporting({ folder: '' })

      expect(await readdir(chosen)).toEqual(['Demo'])
    })
  })

  it('answers nothing when nobody picked a folder, and asks nothing with no project', async () => {
    resetHandlers()
    registerGameExportHandler({
      pickFolder: () => Promise.resolve<string | null>(null),
      projectPath: () => null,
      assetsById: () => Promise.resolve([]),
      bundledAnimation: () => Promise.resolve(null),
      runtimeFolder: () => runtime,
    })

    expect(await exporting()).toBeNull()
  })

  /** In development the folder exists only once `pnpm game:runtime` has run, and git ignores it. */
  it('says a game has no runtime rather than letting an ENOENT out', async () => {
    resetHandlers()
    registerGameExportHandler({
      pickFolder: () => Promise.resolve<string | null>(chosen),
      projectPath: () => project,
      assetsById: () => Promise.resolve([]),
      bundledAnimation: () => Promise.resolve(null),
      runtimeFolder: () => join(project, 'nowhere'),
    })

    await expect(exporting()).rejects.toThrow(/pnpm game:runtime/)
  })

  it('copies the scene it was handed, whole', async () => {
    await exporting()

    expect(await readFile(join(chosen, 'Demo/scenes/doc-1.gltf'), 'utf8')).toBe(SCENE)
  })

  it('copies decoder subfolders required by compressed models', async () => {
    await mkdir(join(runtime, 'decoders/draco'), { recursive: true })
    await writeFile(join(runtime, 'decoders/draco/decoder.wasm'), 'decoder')

    await exporting()

    expect(await readFile(join(chosen, 'Demo/decoders/draco/decoder.wasm'), 'utf8')).toBe('decoder')
  })

  it('replaces a previous package without keeping files the new game cannot reach', async () => {
    await exporting({
      scenes: [
        { id: 'doc-1', title: 'Menu', content: SCENE },
        { id: 'old', title: 'Old level', content: SCENE },
      ],
    })

    await exporting()

    expect(await readdir(join(chosen, 'Demo/scenes'))).toEqual(['doc-1.gltf'])
    expect((await readdir(chosen)).filter(name => name.startsWith('Demo.'))).toEqual([])
  })

  // The other half of the sweep above: what a game still reaches has to SURVIVE the swap. Only
  // the disappearance of the unreachable was covered, and that half alone protects nobody.
  it('keeps an asset the new game still reaches across a replacement', async () => {
    await writeFile(join(project, 'tex.png'), 'pixels')
    registerGameExportHandler({
      pickFolder: () => Promise.resolve<string | null>(chosen),
      projectPath: () => project,
      assetsById: () => Promise.resolve([{ id: 'tex-1', path: 'tex.png' } as Asset]),
      bundledAnimation: () => Promise.resolve(null),
      runtimeFolder: () => runtime,
    })
    const wearing = JSON.stringify({ nodes: [{ material: { map: { assetId: 'tex-1' } } }] })
    const scenes = [{ id: 'doc-1', title: 'Menu', content: wearing }]

    await exporting({ scenes })
    const first = await readdir(join(chosen, 'Demo/assets'))
    await exporting({ scenes })

    expect(first).toHaveLength(1)
    expect(await readdir(join(chosen, 'Demo/assets'))).toEqual(first)
  })

  it('keeps the previous complete package when building its replacement fails', async () => {
    await exporting()
    await writeFile(join(chosen, 'Demo/kept.txt'), 'previous')
    resetHandlers()
    registerGameExportHandler({
      pickFolder: () => Promise.resolve<string | null>(chosen),
      projectPath: () => project,
      assetsById: () => Promise.resolve([]),
      bundledAnimation: () => Promise.resolve(null),
      runtimeFolder: () => join(project, 'missing-runtime'),
    })

    await expect(exporting()).rejects.toThrow(/pnpm game:runtime/)

    expect(await readFile(join(chosen, 'Demo/kept.txt'), 'utf8')).toBe('previous')
    expect((await readdir(chosen)).filter(name => name.startsWith('Demo.'))).toEqual([])
  })

  it('serializes two exports aimed at the same package', async () => {
    let picks = 0
    resetHandlers()
    registerGameExportHandler({
      pickFolder: async () => {
        picks += 1
        if (picks === 1) await new Promise<void>(resolve => setImmediate(resolve))
        return chosen
      },
      projectPath: () => project,
      assetsById: () => Promise.resolve([]),
      bundledAnimation: () => Promise.resolve(null),
      runtimeFolder: () => runtime,
    })
    const first = exporting({ scenes: [{ id: 'first', title: 'First', content: SCENE }] })
    const second = exporting({ scenes: [{ id: 'second', title: 'Second', content: SCENE }] })

    await Promise.all([first, second])

    expect(await readdir(join(chosen, 'Demo/scenes'))).toEqual(['second.gltf'])
    expect((await readdir(chosen)).filter(name => name.startsWith('Demo.'))).toEqual([])
  })

  it('recovers a complete package left behind between directory renames', async () => {
    await mkdir(join(chosen, 'Demo.previous'))
    await writeFile(join(chosen, 'Demo.previous/kept.txt'), 'previous')
    resetHandlers()
    registerGameExportHandler({
      pickFolder: () => Promise.resolve<string | null>(chosen),
      projectPath: () => project,
      assetsById: () => Promise.resolve([]),
      bundledAnimation: () => Promise.resolve(null),
      runtimeFolder: () => join(project, 'missing-runtime'),
    })

    await expect(exporting()).rejects.toThrow(/pnpm game:runtime/)

    expect(await readFile(join(chosen, 'Demo/kept.txt'), 'utf8')).toBe('previous')
    expect((await readdir(chosen)).filter(name => name.startsWith('Demo.'))).toEqual([])
  })
})
