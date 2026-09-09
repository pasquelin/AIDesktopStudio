import { localizedError } from '@shared/localizedError'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import { invoke, resetHandlers } from '@main/ipc/testHarness'
import { registerSceneHandlers } from './export'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const bytes = new Uint8Array([103, 108, 84, 70])

describe('the scene export handler', () => {
  let folder: string
  let pickSavePath: (name: string, extension: string) => Promise<string | null>

  beforeEach(async () => {
    resetHandlers()
    folder = await mkdtemp(join(tmpdir(), 'scenario-export-'))
    pickSavePath = vi.fn((name: string, extension: string) =>
      Promise.resolve(join(folder, `${name}${extension}`)),
    )
    registerSceneHandlers({ pickSavePath })
  })

  it('writes the bytes where the dialog landed', async () => {
    await invoke(CHANNELS.sceneExport, { name: 'set', format: 'glb', data: bytes })

    await expect(readFile(join(folder, 'set.glb'))).resolves.toEqual(Buffer.from(bytes))
  })

  // The extension belongs to the format: a save dialog offering `.glb` for a USDZ would lie.
  it('opens the dialog on the extension the format names', async () => {
    await invoke(CHANNELS.sceneExport, { name: 'set', format: 'usdz', data: bytes })

    expect(pickSavePath).toHaveBeenCalledWith('set', '.usdz')
  })

  // The name, never the path: where a file sits is this side's business.
  it('answers the name it was written under', async () => {
    await expect(
      invoke(CHANNELS.sceneExport, { name: 'set', format: 'gltf', data: bytes }),
    ).resolves.toBe('set.gltf')
  })

  it('writes nothing at all when the dialog was dismissed', async () => {
    registerSceneHandlers({ pickSavePath: () => Promise.resolve(null) })

    await expect(
      invoke(CHANNELS.sceneExport, { name: 'set', format: 'glb', data: bytes }),
    ).resolves.toBeNull()
  })

  // The renderer is the sandboxed side: what crosses is validated, never trusted.
  it('refuses a format nothing writes', async () => {
    await expect(
      invoke(CHANNELS.sceneExport, { name: 'set', format: 'dxf', data: bytes }),
    ).rejects.toThrow()
  })

  it('writes each of the shape formats under its own extension', async () => {
    for (const format of ['obj', 'ply', 'stl']) {
      await expect(
        invoke(CHANNELS.sceneExport, { name: 'set', format, data: bytes }),
      ).resolves.toBe(`set.${format}`)
    }
  })

  it('refuses a name that would climb out of the folder the user chose', async () => {
    await expect(
      invoke(CHANNELS.sceneExport, { name: '../escape', format: 'glb', data: bytes }),
    ).rejects.toThrow()
  })

  it('refuses the name of the folder above', async () => {
    await expect(
      invoke(CHANNELS.sceneExport, { name: '..', format: 'glb', data: bytes }),
    ).rejects.toThrow()
  })

  /**
   * The whole reason this handler answers a name rather than a path — and a rejected
   * `ipcMain.handle` hands its message to the renderer, which files it in the journal. Node
   * builds that message around the absolute path, so it was the one way one crossed.
   */
  it('says why the write failed without saying where the file sits', async () => {
    const secret = join(folder, 'somewhere', 'private', 'set.glb')
    registerSceneHandlers({ pickSavePath: () => Promise.resolve(secret) })

    let refusal = ''
    try {
      await invoke(CHANNELS.sceneExport, { name: 'set', format: 'glb', data: bytes })
    } catch (error) {
      refusal = String(error)
    }

    expect(refusal).toContain(localizedError('fileWriteFailed', { code: ' (ENOENT)' }).message)
    expect(refusal).toContain('ENOENT')
    expect(refusal).not.toContain(folder)
    expect(refusal).not.toContain('private')
  })

  it('refuses bytes that are not bytes', async () => {
    await expect(
      invoke(CHANNELS.sceneExport, { name: 'set', format: 'glb', data: 'not bytes' }),
    ).rejects.toThrow()
  })
})
