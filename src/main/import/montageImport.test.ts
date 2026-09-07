import { mkdir, mkdtemp, readdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { CHANNELS, EVENTS } from '@shared/ipc'
import type { BundleClient } from '@main/bundle/bundleClient'
import { readOtiozFile } from '@main/bundle/otiozRead'
import { writeOtiozFile } from '@main/bundle/otiozWrite'
import { createRunningTasks, registerTaskCancelHandler } from '@main/task/runningTasks'
import { invokeFrom, openWindow, resetHandlers } from '@main/ipc/testHarness'
import { registerMontageImportHandlers } from './montageImport'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const CONTENT = '{"OTIO_SCHEMA":"Timeline.1"}'
const RUSH = new Uint8Array(2048).fill(9)

/** The worker, in this process: the handler is asked to unpack and the real reader unpacks. */
const inProcessBundles = (): BundleClient => ({
  write: ({ path, content, media, ...watch }) => writeOtiozFile(path, { content, media }, watch),
  read: ({ path, into, ...watch }) => readOtiozFile(path, into, watch),
})

describe('reading a montage bundle into the project', () => {
  let project: string
  let archive: string
  let running: ReturnType<typeof createRunningTasks>
  let asking: ReturnType<typeof openWindow>
  let adopted: string[]

  const adopt = async (relative: string): Promise<Asset | null> => {
    adopted.push(relative)
    return { id: `asset-${adopted.length}`, path: relative } as Asset
  }

  async function install(
    changes: Partial<Parameters<typeof registerMontageImportHandlers>[0]> = {},
  ): Promise<void> {
    resetHandlers()
    running = createRunningTasks()
    registerMontageImportHandlers({
      pickImportPath: () => Promise.resolve(archive),
      projectPath: () => project,
      bundles: inProcessBundles,
      running,
      adopt,
      ...changes,
    })
    registerTaskCancelHandler(running)
    asking = openWindow()
  }

  beforeEach(async () => {
    adopted = []
    project = await realpath(await mkdtemp(join(tmpdir(), 'ai-desktop-studio-project-')))
    const rushes = await mkdtemp(join(tmpdir(), 'scenario-rushes-'))
    const rush = join(rushes, 'plan.mp4')
    await writeFile(rush, RUSH)

    archive = join(rushes, 'Bande.otioz')
    await writeOtiozFile(archive, {
      content: CONTENT,
      media: [{ source: `file://${rush}`, entry: 'media/plan.mp4', path: rush }],
    })

    await install()
  })

  const importing = (id = 'import-1'): unknown => invokeFrom(asking, CHANNELS.montageImport, { id })

  /**
   * The media are COPIED in and given rows of their own rather than pointed at where they lie: a
   * bundle comes from another machine, and a montage linked to a folder that is not there is a
   * montage of red clips.
   */
  it('unpacks the media into a folder of the project and catalogues each', async () => {
    const read = await importing()

    expect(read).toEqual({
      content: CONTENT,
      media: [{ entry: 'media/plan.mp4', assetId: 'asset-1' }],
      folder: 'Bande',
    })
    expect(adopted).toEqual(['Bande/plan.mp4'])
    expect(await readdir(join(project, 'Bande'))).toEqual(['plan.mp4'])
  })

  /** Fresh, so a stop can take the folder away without deleting files somebody already had. */
  it('never unpacks into a folder the project already holds', async () => {
    await mkdir(join(project, 'Bande'))
    await writeFile(join(project, 'Bande', 'theirs.txt'), 'not mine')

    await importing()

    expect(await readdir(join(project, 'Bande'))).toEqual(['theirs.txt'])
    expect(await readdir(join(project, 'Bande 2'))).toEqual(['plan.mp4'])
  })

  it('reports how far along it is, to the window that asked', async () => {
    await importing()

    const steps = asking.sent.filter(one => one.channel === EVENTS.taskProgress)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.at(-1)).toEqual({
      channel: EVENTS.taskProgress,
      payload: { id: 'import-1', ratio: 1 },
    })
  })

  /** Half a montage's rushes left in somebody's project is worse than none of them. */
  it('stops on demand, answers nothing, and takes its folder away with it', async () => {
    asking.webContents.send = () => void running.cancel('import-1')

    await expect(importing()).resolves.toBeNull()
    await expect(readdir(join(project, 'Bande'))).rejects.toThrow()
  })

  /**
   * An id only named to the table once the dialog answered would refuse every stop until then —
   * and the bundle would unpack and be called a success. Nothing lands on disk either: the folder
   * is not made at all, rather than made and taken away once the reader answers nothing.
   */
  it('answers a stop given while the picker is still open, and makes no folder', async () => {
    await install({
      pickImportPath: () => {
        running.cancel('import-1')
        return Promise.resolve(archive)
      },
    })

    await expect(importing()).resolves.toBeNull()
    await expect(readdir(join(project, 'Bande'))).rejects.toThrow()
  })

  it('unpacks nothing when the picker was dismissed', async () => {
    await install({ pickImportPath: () => Promise.resolve(null) })

    await expect(importing()).resolves.toBeNull()
    expect(await readdir(project)).toEqual([])
  })

  // The media are copied INTO the project, so without one there is nowhere for them to land.
  it('unpacks nothing when no project is open', async () => {
    await install({ projectPath: () => null })

    await expect(importing()).resolves.toBeNull()
  })

  /**
   * A medium the studio has no editor for lands on disk and gets no row: the clip that named it
   * is dropped by the reader, which is the honest answer for a rush it could not open anyway.
   */
  it('leaves out a medium the catalogue refused, rather than naming a row that is not there', async () => {
    await install({ adopt: () => Promise.resolve(null) })

    await expect(importing()).resolves.toEqual(
      expect.objectContaining({ content: CONTENT, media: [] }),
    )
    expect(await readdir(join(project, 'Bande'))).toEqual(['plan.mp4'])
  })

  it('takes its folder away when the read failed, rather than leaving half a montage', async () => {
    await install({
      bundles: () => ({
        write: inProcessBundles().write,
        read: () => Promise.reject(new Error('this file carries no cut')),
      }),
    })

    await expect(importing()).rejects.toThrow()
    await expect(readdir(join(project, 'Bande'))).rejects.toThrow()
  })
})
