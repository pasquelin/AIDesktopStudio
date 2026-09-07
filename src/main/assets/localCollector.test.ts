import { describe, expect, it } from 'vitest'
import type { Asset, AssetType } from '@shared/domain/asset'
import type { Job } from '@shared/domain/job'
import type { WorkspaceId } from '@shared/domain/workspace'
import type { LocalBackend, WriteRequest } from './localBackend'
import {
  createLocalCollector,
  type CollectableProduction,
  type LocalCollectorDeps,
} from './localCollector'

const JOB: Job = {
  id: 'job_1',
  targetId: 'sana-600m-1024',
  label: 'Sana 600M',
  status: 'running',
  progress: 1,
  createdAt: '2026-08-22T10:00:00.000Z',
  assetIds: [],
}

const PRODUCED: CollectableProduction = {
  path: '/tmp/ai-desktop-studio-generations/job_1.png',
  type: 'image',
  prompt: 'a red cube on a white table',
}

function harness(over: Partial<LocalCollectorDeps> = {}, importing?: () => Promise<never>) {
  const written: WriteRequest[] = []
  const sources: string[] = []
  const discarded: string[] = []

  const backend: LocalBackend = {
    importFromUrl: () => Promise.reject(new Error('a local generation is never downloaded')),
    replaceBytes: () => Promise.reject(new Error('not used by the collector')),
    importFromBytes: () => Promise.reject(new Error('a generation is filed by path, not by bytes')),
    importFromFile: (request, sourcePath) => {
      if (importing) return importing()
      written.push(request)
      sources.push(sourcePath)
      const asset: Asset = {
        id: request.id,
        name: request.name,
        type: request.type,
        location: 'local',
        tags: [],
        createdAt: JOB.createdAt,
      }
      return Promise.resolve(asset)
    },
  }

  const collect = createLocalCollector({
    producedBy: () => PRODUCED,
    discard: path => {
      discarded.push(path)
      return Promise.resolve()
    },
    backend,
    newId: () => 'asset_1',
    log: () => {},
    ...over,
  })

  return { collect, written, sources, discarded }
}

describe('filing a generation made on this machine', () => {
  /**
   * Handed over BY PATH: the engine writes video, audio, meshes and panoramas, and reading one to
   * write it back put the whole file through the main process's heap for nothing.
   */
  it('hands the file the engine wrote to the project, by path', async () => {
    const held = harness()

    expect(await held.collect(JOB, [], null)).toEqual({ ids: ['asset_1'], workspaces: ['image'] })
    expect(held.written[0]).toMatchObject({ id: 'asset_1', type: 'image', jobId: 'job_1' })
    expect(held.sources).toEqual([PRODUCED.path])
  })

  it('names the asset after what was asked, not after the model that answered', async () => {
    const held = harness()
    await held.collect(JOB, [], null)

    expect(held.written[0]?.name).toContain('red cube')
  })

  it('keeps the extension the engine chose to write', async () => {
    const held = harness({ producedBy: () => ({ ...PRODUCED, path: '/tmp/out.webp' }) })
    await held.collect(JOB, [], null)

    expect(held.written[0]?.extension).toBe('webp')
  })

  it('drops the hand-off only once the file is in the project', async () => {
    const held = harness()
    await held.collect(JOB, [], null)

    expect(held.discarded).toEqual([PRODUCED.path])
  })

  it('keeps the asset when the hand-off could not be removed', async () => {
    const held = harness({ discard: () => Promise.reject(new Error('busy')) })

    expect(await held.collect(JOB, [], null)).toEqual({ ids: ['asset_1'], workspaces: ['image'] })
  })

  it("asks for the file under the runner's job id, not the studio's", async () => {
    const asked: string[] = []
    const held = harness({
      producedBy: id => {
        asked.push(id)
        return id === 'local_abc' ? PRODUCED : null
      },
    })

    expect(await held.collect({ ...JOB, remoteId: 'local_abc' }, [], null)).toEqual({
      ids: ['asset_1'],
      workspaces: ['image'],
    })
    expect(asked).toEqual(['local_abc'])
  })

  const shelves: readonly { type: AssetType; workspace: WorkspaceId }[] = [
    { type: 'video', workspace: 'video' },
    { type: 'audio', workspace: 'audio' },
    { type: 'mesh', workspace: '3d' },
    { type: 'image', workspace: 'image' },
    { type: 'skybox', workspace: 'skyboxes' },
  ]

  it.each(shelves)('files a $type generation on its own shelf', async ({ type, workspace }) => {
    const held = harness({
      producedBy: () => ({ ...PRODUCED, type, path: `/tmp/out.${type}` }),
    })

    expect(await held.collect(JOB, [], null)).toEqual({ ids: ['asset_1'], workspaces: [workspace] })
    expect(held.written[0]?.type).toBe(type)
  })

  it('files nothing for a job that produced no file', async () => {
    const held = harness({ producedBy: () => null })

    expect(await held.collect(JOB, [], null)).toEqual({ ids: [], workspaces: [] })
    expect(held.written).toEqual([])
  })

  it('fails rather than reporting a job with nothing behind it', async () => {
    const held = harness({}, () => Promise.reject(new Error('gone')))

    await expect(held.collect(JOB, [], null)).rejects.toThrow('gone')
  })
})
