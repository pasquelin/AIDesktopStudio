import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { ExternalFileImport } from '@shared/domain/externalFile'
import { CHANNELS } from '@shared/ipc'
import { invoke, resetHandlers } from '@main/ipc/testHarness'
import { createRunningTasks } from '@main/task/runningTasks'
import { registerMediaHandlers, type MediaHandlerDeps } from './handlers'
import { linkedAsset } from './link'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

function deps(overrides: Partial<MediaHandlerDeps> = {}): MediaHandlerDeps {
  let linked = 0
  return {
    media: {
      ingest: vi.fn(async () => undefined),
      derive: vi.fn(async () => undefined),
      cancel: vi.fn(),
    },
    link: vi.fn(async (source: string, type: Asset['type']) =>
      linkedAsset(source, {
        id: `asset-${(linked += 1)}`,
        type,
        now: '2026-08-07T10:00:00.000Z',
      }),
    ),
    adopt: vi.fn(async () => null),
    pickMedia: vi.fn(async () => ['/Volumes/Rushes/A001.mov']),
    pickAnimation: vi.fn(async () => ['/motions/Walking.fbx']),
    folderFor: vi.fn(async () => 'Animations'),
    capabilities: async () => ({ ffmpeg: true }),
    importPaths: async () => ({ assets: [], documents: [], montages: [], refused: [], failed: [] }),
    claimExternalFiles: () => [],
    running: createRunningTasks(),
    ...overrides,
  }
}

describe('media handlers', () => {
  beforeEach(() => {
    resetHandlers()
    vi.clearAllMocks()
  })

  it('links every picked file into the catalogue', async () => {
    const injected = deps({ pickMedia: async () => ['/rushes/a.mov', '/takes/b.wav'] })
    registerMediaHandlers(injected)

    const imported = await invoke(CHANNELS.mediaLink)

    expect(imported).toMatchObject({
      assets: [
        { name: 'a', type: 'video' },
        { name: 'b', type: 'audio' },
      ],
    })
    expect(injected.link).toHaveBeenCalledTimes(2)
  })

  // The renderer has no filesystem: a path there is only ever text on screen, and handing the
  // window every user's folder layout widens what a compromised dependency could read.
  it('tells the window everything about a linked file except where it is', async () => {
    registerMediaHandlers(deps({ pickMedia: async () => ['/Volumes/Rushes/a.mov'] }))

    const imported = await invoke(CHANNELS.mediaLink)

    expect(imported).toMatchObject({
      assets: [expect.not.objectContaining({ sourcePath: expect.anything() })],
    })
  })

  it('starts an ingest per linked file, without waiting for it to finish', async () => {
    const injected = deps()
    registerMediaHandlers(injected)

    await invoke(CHANNELS.mediaLink)

    // Resolving on the catalogue rows is what puts the file in the browser at once; probing a
    // twenty-minute rush must not hold the dialog open.
    expect(injected.media.ingest).toHaveBeenCalledWith(
      'asset-1',
      '/Volumes/Rushes/A001.mov',
      'video',
    )
  })

  it('ignores a file the studio has no editor for, rather than cataloguing a text file', async () => {
    const injected = deps({ pickMedia: async () => ['/notes.txt', '/rushes/a.mov'] })
    registerMediaHandlers(injected)

    const imported = await invoke(CHANNELS.mediaLink)

    expect(imported).toMatchObject({ assets: [expect.anything()] })
    expect(injected.link).toHaveBeenCalledOnce()
  })

  it('copies a picked 3D file into the project rather than linking it where it lies', async () => {
    const imported = linkedAsset('/outside/Robot.fbx', {
      id: 'asset-mesh',
      type: 'mesh',
      now: '2026-09-06T10:00:00.000Z',
    })
    const importPaths = vi.fn(async () => ({
      assets: [imported],
      documents: [],
      montages: [],
      refused: [{ name: 'Broken.fbx', extension: 'fbx' }],
      failed: ['skin.png'],
    }))
    const injected = deps({
      pickMedia: async () => ['/outside/Robot.fbx', '/rushes/a.mov'],
      importPaths,
    })
    registerMediaHandlers(injected)

    const result = await invoke(CHANNELS.mediaLink)

    expect(importPaths).toHaveBeenCalledWith(['/outside/Robot.fbx'], '', {})
    expect(injected.link).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      assets: [{ type: 'video' }, { type: 'mesh' }],
      refused: [{ name: 'Broken.fbx', extension: 'fbx' }],
      failed: ['skin.png'],
    })
  })

  /**
   * The picker copies into the folder it was raised on — the same act as dropping those files
   * there. It used to link instead, so one rush imported through the menu and dropped in the
   * explorer left the project in two different states.
   */
  it('copies what the picker gave into the folder it was asked for', async () => {
    const importPaths = vi.fn(async () => ({
      assets: [],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    }))
    const injected = deps({ pickMedia: async () => ['/rushes/a.mov'], importPaths })
    registerMediaHandlers(injected)

    await invoke(CHANNELS.mediaIngest, 'Rushes/Jour 1')

    expect(importPaths).toHaveBeenCalledWith(['/rushes/a.mov'], 'Rushes/Jour 1', {})
    expect(injected.link).not.toHaveBeenCalled()
  })

  it('answers an empty list when the dialog was dismissed', async () => {
    const injected = deps({ pickMedia: async () => [] })
    registerMediaHandlers(injected)

    await expect(invoke(CHANNELS.mediaIngest, '')).resolves.toEqual({
      assets: [],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    })
    expect(injected.media.ingest).not.toHaveBeenCalled()
  })

  it('imports paths supplied by the desktop into the requested project folder', async () => {
    const imported = linkedAsset('/outside/model.glb', {
      id: 'asset-1',
      type: 'mesh',
      now: '2026-09-03T10:00:00.000Z',
    })
    const importPaths = vi.fn(async () => ({
      assets: [imported],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    }))
    registerMediaHandlers(deps({ importPaths, claimExternalFiles: () => ['/outside/model.glb'] }))

    const result = await invoke(CHANNELS.mediaIngestPaths, 'request-1', 'Models', 'task-1')

    expect(importPaths).toHaveBeenCalledWith(
      ['/outside/model.glb'],
      'Models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result).toEqual({
      assets: [expect.not.objectContaining({ sourcePath: expect.anything() })],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    })
  })

  it('imports picked motions into the animations folder', async () => {
    const imported = linkedAsset('/motions/Walking.fbx', {
      id: 'asset-walk',
      type: 'animation',
      now: '2026-09-06T10:00:00.000Z',
    })
    const importPaths = vi.fn(async () => ({
      assets: [imported],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    }))
    const folderFor = vi.fn(async () => 'Animations')
    registerMediaHandlers(deps({ importPaths, folderFor }))

    const result = await invoke(CHANNELS.mediaImportPicked, 'animations', 'task-anim')

    expect(folderFor).toHaveBeenCalledWith('animations')
    expect(importPaths).toHaveBeenCalledWith(
      ['/motions/Walking.fbx'],
      'Animations',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result).toEqual({
      assets: [expect.not.objectContaining({ sourcePath: expect.anything() })],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    })
  })

  it('imports nothing when the motion picker is dismissed', async () => {
    const importPaths = vi.fn()
    registerMediaHandlers(deps({ pickAnimation: async () => [], importPaths }))

    await expect(invoke(CHANNELS.mediaImportPicked, 'animations', 'task-none')).resolves.toEqual({
      assets: [],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    })
    expect(importPaths).not.toHaveBeenCalled()
  })

  it('stops an external import through the shared task table', async () => {
    const running = createRunningTasks()
    const importPaths = vi.fn(
      async (_paths: readonly string[], _folder: string, watch: { signal?: AbortSignal }) =>
        await new Promise<ExternalFileImport>(resolve => {
          watch.signal?.addEventListener(
            'abort',
            () => resolve({ assets: [], documents: [], montages: [], refused: [], failed: [] }),
            { once: true },
          )
        }),
    )
    registerMediaHandlers(deps({ importPaths, running }))

    const importing = invoke(CHANNELS.mediaIngestPaths, 'request-2', '', 'task-2')
    await vi.waitFor(() => expect(importPaths).toHaveBeenCalledOnce())

    expect(running.cancel('task-2')).toBe(true)
    await expect(importing).resolves.toMatchObject({ failed: [] })
  })

  it('adopts a file of the project, and answers the row without its whereabouts', async () => {
    const injected = deps({
      adopt: vi.fn(async (relative: string) =>
        linkedAsset(`/projects/one/${relative}`, {
          id: 'asset-9',
          type: 'image',
          now: '2026-08-17T10:00:00.000Z',
        }),
      ),
    })
    registerMediaHandlers(injected)

    const asset = await invoke(CHANNELS.mediaAdopt, 'Images/facade.jpg')

    expect(injected.adopt).toHaveBeenCalledWith('Images/facade.jpg')
    expect(asset).toEqual(expect.not.objectContaining({ sourcePath: expect.anything() }))
  })

  it('answers nothing for a file the studio has no editor for', async () => {
    registerMediaHandlers(deps())

    await expect(invoke(CHANNELS.mediaAdopt, 'Notes/brief.txt')).resolves.toBeNull()
  })

  // The one channel where a window names a path of its own — `../../.ssh/id_rsa` would otherwise
  // reach the disk through it.
  it('refuses a path that walks out of the project', async () => {
    const injected = deps()
    registerMediaHandlers(injected)

    await expect(invoke(CHANNELS.mediaAdopt, '../../.ssh/id_rsa')).rejects.toThrow()
    expect(injected.adopt).not.toHaveBeenCalled()
  })

  it('cancels the ingest of one asset', async () => {
    const injected = deps()
    registerMediaHandlers(injected)

    await invoke(CHANNELS.mediaCancel, 'asset-1')
    expect(injected.media.cancel).toHaveBeenCalledWith('asset-1')
  })

  it('refuses a cancel with no asset to cancel, rather than passing junk down', () => {
    registerMediaHandlers(deps())
    expect(() => invoke(CHANNELS.mediaCancel, '')).toThrow()
  })

  it('reports what the pipeline can do, so the interface can say what is missing', async () => {
    registerMediaHandlers(deps({ capabilities: async () => ({ ffmpeg: false }) }))
    await expect(invoke(CHANNELS.mediaAvailable)).resolves.toEqual({ ffmpeg: false })
  })
})
