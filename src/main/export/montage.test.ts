import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS, EVENTS } from '@shared/ipc'
import { invoke, invokeFrom, openWindow, resetHandlers } from '@main/ipc/testHarness'
import type { BundleClient } from '@main/bundle/bundleClient'
import { readOtiozFile } from '@main/bundle/otiozRead'
import { writeOtiozFile } from '@main/bundle/otiozWrite'
import { registerMontageHandlers } from './montage'
import { createRunningTasks, registerTaskCancelHandler } from '@main/task/runningTasks'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const CONTENT = '{"OTIO_SCHEMA":"Timeline.1"}'

/**
 * The worker, in this process. Faithful in the only way that matters here: the handler is asked
 * for a bundle and answers `false` when it was stopped — which is what the real client relays.
 */
const inProcessBundles = (): BundleClient => ({
  write: ({ path, content, media, ...watch }) => writeOtiozFile(path, { content, media }, watch),
  read: ({ path, into, ...watch }) => readOtiozFile(path, into, watch),
})

describe('the montage export handler', () => {
  let folder: string
  let pickSavePath: (name: string, extension: string) => Promise<string | null>

  beforeEach(async () => {
    resetHandlers()
    folder = await mkdtemp(join(tmpdir(), 'scenario-otio-'))
    pickSavePath = vi.fn((name: string, extension: string) =>
      Promise.resolve(join(folder, `${name}${extension}`)),
    )
    registerMontageHandlers({
      pickSavePath,
      projectPath: () => null,
      bundles: inProcessBundles,
      running: createRunningTasks(),
    })
  })

  it('writes the cut where the dialog landed, under the extension its target writes', async () => {
    await expect(
      invoke(CHANNELS.montageExport, {
        id: 'export-1',
        name: 'Bande',
        target: 'montage.otio',
        content: CONTENT,
      }),
    ).resolves.toBe('Bande.otio')

    expect(pickSavePath).toHaveBeenCalledWith('Bande', '.otio')
    await expect(readFile(join(folder, 'Bande.otio'), 'utf8')).resolves.toBe(CONTENT)
  })

  it('writes nothing at all when the dialog was dismissed', async () => {
    registerMontageHandlers({
      pickSavePath: () => Promise.resolve(null),
      projectPath: () => null,
      bundles: inProcessBundles,
      running: createRunningTasks(),
    })

    await expect(
      invoke(CHANNELS.montageExport, {
        id: 'export-1',
        name: 'Bande',
        target: 'montage.otio',
        content: CONTENT,
      }),
    ).resolves.toBeNull()
  })

  // The renderer is the sandboxed side, and a name carrying a separator is a write outside the
  // folder the user picked.
  it('refuses a name that would leave the folder the dialog chose', async () => {
    await expect(
      invoke(CHANNELS.montageExport, {
        id: 'export-1',
        name: '../escape',
        target: 'montage.otio',
        content: CONTENT,
      }),
    ).rejects.toThrow()
  })

  it('refuses a target that belongs to another section', async () => {
    await expect(
      invoke(CHANNELS.montageExport, {
        id: 'export-1',
        name: 'Bande',
        target: 'scene.usdz',
        content: CONTENT,
      }),
    ).rejects.toThrow()
  })

  // The id is a key in a table this process keeps for as long as the export runs, and the
  // sandboxed side names it.
  it('refuses an export named by nothing, or by a name without end', async () => {
    for (const id of ['', 'x'.repeat(65)]) {
      await expect(
        invoke(CHANNELS.montageExport, {
          id,
          name: 'Bande',
          target: 'montage.otio',
          content: CONTENT,
        }),
      ).rejects.toThrow()
    }
  })
})

describe('the same cut, bundled with the media it points at', () => {
  let project: string
  let out: string
  let rush: string
  let running: ReturnType<typeof createRunningTasks>
  let asking: ReturnType<typeof openWindow>

  beforeEach(async () => {
    resetHandlers()
    project = await realpath(await mkdtemp(join(tmpdir(), 'ai-desktop-studio-project-')))
    out = await mkdtemp(join(tmpdir(), 'scenario-out-'))
    rush = join(project, 'plan.mp4')
    await writeFile(rush, new Uint8Array(2048).fill(9))

    running = createRunningTasks()
    registerMontageHandlers({
      pickSavePath: (name, extension) => Promise.resolve(join(out, `${name}${extension}`)),
      projectPath: () => project,
      bundles: inProcessBundles,
      running,
    })
    registerTaskCancelHandler(running)
    // Named rather than anonymous: a bundle reports its progress to the window that asked, so
    // every case here is invoked FROM one.
    asking = openWindow()
  })

  const exporting = (request: unknown): unknown =>
    invokeFrom(asking, CHANNELS.montageExport, request)

  const bundling = (source: string): unknown => ({
    id: 'export-1',
    name: 'Bande',
    target: 'montage.otioz',
    content: CONTENT,
    media: [{ source, entry: 'media/plan.mp4' }],
  })

  it('writes a bundle holding the cut and the medium', async () => {
    await expect(exporting(bundling(`file://${rush}`))).resolves.toBe('Bande.otioz')

    const entries = unzipSync(await readFile(join(out, 'Bande.otioz')))
    expect(Object.keys(entries)).toEqual(['version.txt', 'content.otio', 'media/plan.mp4'])
  })

  /**
   * The row belongs to one status line: a second window showing a bar for an export it cannot
   * stop is worse than showing nothing.
   */
  it('reports how far along it is, to the window that asked and to no other', async () => {
    const other = openWindow()

    await exporting(bundling(`file://${rush}`))

    const steps = asking.sent.filter(one => one.channel === EVENTS.taskProgress)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.at(-1)).toEqual({
      channel: EVENTS.taskProgress,
      payload: { id: 'export-1', ratio: 1 },
    })
    expect(other.sent).toEqual([])
  })

  /**
   * The half a bundle had before was progress and no stop: gigabytes with nothing to press. It
   * leaves nothing behind either — a half-written archive looks exactly like a finished one.
   */
  it('stops on demand, answers nothing, and leaves no half-written archive', async () => {
    // The stop arrives mid-write, which is the only moment worth testing: pressed before the
    // dialog answers it would prove nothing about the loop that moves the bytes.
    asking.webContents.send = () => void running.cancel('export-1')

    await expect(exporting(bundling(`file://${rush}`))).resolves.toBeNull()
    await expect(readFile(join(out, 'Bande.otioz'))).rejects.toThrow()
  })

  /**
   * The window shows the row and its stop button from the moment it invokes, and the dialog is
   * where a person sits for as long as they like. An id only registered once the dialog answered
   * would refuse every press until then — and the archive would be written and called a success.
   */
  it('answers a stop pressed while the save dialog is still open', async () => {
    resetHandlers()
    registerMontageHandlers({
      pickSavePath: (name, extension) => {
        running.cancel('export-1')
        return Promise.resolve(join(out, `${name}${extension}`))
      },
      projectPath: () => project,
      bundles: inProcessBundles,
      running,
    })

    await expect(exporting(bundling(`file://${rush}`))).resolves.toBeNull()
    await expect(readFile(join(out, 'Bande.otioz'))).rejects.toThrow()
  })

  it('says nothing was stopped when the id names no running task', async () => {
    expect(invoke(CHANNELS.taskCancel, 'export-never-started')).toBe(false)
  })

  /**
   * The paths never cross back, and this is why: the renderer names what to read, so a montage
   * pointing anywhere would have that file packed into something handed to somebody else.
   */
  it('refuses a medium that sits outside the open project', async () => {
    const elsewhere = join(await mkdtemp(join(tmpdir(), 'scenario-elsewhere-')), 'secret.mp4')
    await writeFile(elsewhere, new Uint8Array([1, 2, 3]))

    await expect(exporting(bundling(`file://${elsewhere}`))).rejects.toThrow()
    await expect(readFile(join(out, 'Bande.otioz'))).rejects.toThrow()
  })

  /**
   * The entry becomes a path inside the archive, and the renderer names it. Unchecked, the studio
   * writes a zip-slip file of its own making and hands it to somebody else.
   */
  it('refuses an entry that would climb out of the bundle', async () => {
    await expect(
      exporting({
        id: 'export-1',
        name: 'Bande',
        target: 'montage.otioz',
        content: CONTENT,
        media: [{ source: `file://${rush}`, entry: 'media/../../.bashrc' }],
      }),
    ).rejects.toThrow()
  })

  it('refuses two media asking for the same entry, one pixel set landing under the other', async () => {
    await expect(
      exporting({
        id: 'export-1',
        name: 'Bande',
        target: 'montage.otioz',
        content: CONTENT,
        media: [
          { source: `file://${rush}`, entry: 'media/plan.mp4' },
          { source: `file://${rush}`, entry: 'media/plan.mp4' },
        ],
      }),
    ).rejects.toThrow()
  })

  it('refuses a medium the cut names and the project does not hold', async () => {
    await expect(exporting(bundling(`file://${join(project, 'absent.mp4')}`))).rejects.toThrow()
  })

  // Without one there is nothing to resolve a medium against, and every path would be refused
  // one by one for a reason that is not the real one.
  it('writes nothing when no project is open', async () => {
    resetHandlers()
    registerMontageHandlers({
      pickSavePath: (name, extension) => Promise.resolve(join(out, `${name}${extension}`)),
      projectPath: () => null,
      bundles: inProcessBundles,
      running: createRunningTasks(),
    })

    await expect(exporting(bundling(`file://${rush}`))).resolves.toBeNull()
  })
})
