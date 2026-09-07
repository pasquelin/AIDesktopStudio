import { mkdtemp, readdir, readFile, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import { invoke, resetHandlers } from '@main/ipc/testHarness'
import { registerExportHandlers } from './folder'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46])

/** Built rather than written: `no-literal-nul-byte.test.ts` refuses the byte itself in a source. */
const NUL = String.fromCharCode(0)

const file = (name: string, extension = '.png', bytes = png): unknown => ({
  name,
  extension,
  bytes,
})

describe('the two doors onto one writer', () => {
  let chosen: string

  beforeEach(async () => {
    resetHandlers()
    chosen = await mkdtemp(join(tmpdir(), 'scenario-export-'))
    registerExportHandlers({
      pickFolder: () => Promise.resolve<string | null>(chosen),
      projectPath: () => null,
    })
  })

  it('writes a sky through its own channel, into a folder of its own', async () => {
    await invoke(CHANNELS.skyboxExport, {
      folder: 'Coucher',
      target: 'sky.faces',
      files: [file('Coucher_Rt'), file('Coucher_Up')],
    })

    await expect(readdir(join(chosen, 'Coucher'))).resolves.toEqual([
      'Coucher_Rt.png',
      'Coucher_Up.png',
    ])
  })

  it('refuses a sky the same way it refuses a texture — one writer, one set of rules', async () => {
    await expect(
      invoke(CHANNELS.skyboxExport, {
        folder: '../escape',
        target: 'sky.faces',
        files: [file('Rt')],
      }),
    ).rejects.toThrow()
    await expect(
      invoke(CHANNELS.skyboxExport, {
        folder: 'Ciel',
        target: 'sky.faces',
        files: [file('sub/Rt')],
      }),
    ).rejects.toThrow()
  })
})

describe('the texture export handler', () => {
  let chosen: string
  let pickFolder: () => Promise<string | null>

  beforeEach(async () => {
    resetHandlers()
    chosen = await mkdtemp(join(tmpdir(), 'scenario-texture-'))
    pickFolder = vi.fn(() => Promise.resolve<string | null>(chosen))
    registerExportHandlers({ pickFolder, projectPath: () => null })
  })

  it('writes every file into a folder named after the texture', async () => {
    await invoke(CHANNELS.materialExport, {
      folder: 'Brique',
      target: 'material.unity',
      files: [file('Brique_BaseColor'), file('Brique_ORM')],
    })

    await expect(readdir(join(chosen, 'Brique'))).resolves.toEqual([
      'Brique_BaseColor.png',
      'Brique_ORM.png',
    ])
  })

  it('writes the bytes it was handed, not a re-encoding of them', async () => {
    await invoke(CHANNELS.materialExport, {
      folder: 'Brique',
      target: 'material.unity',
      files: [file('Brique_BaseColor')],
    })

    await expect(readFile(join(chosen, 'Brique', 'Brique_BaseColor.png'))).resolves.toEqual(
      Buffer.from(png),
    )
  })

  it('gives each file the extension its target writes, a glTF material being one file', async () => {
    await invoke(CHANNELS.materialExport, {
      folder: 'Brique',
      target: 'material.gltf',
      files: [file('Brique', '.glb', glb)],
    })

    await expect(readdir(join(chosen, 'Brique'))).resolves.toEqual(['Brique.glb'])
  })

  // The name, never the path: where a folder sits is this side's business.
  it('answers the name of the folder it filled', async () => {
    await expect(
      invoke(CHANNELS.materialExport, {
        folder: 'Brique',
        target: 'material.unity',
        files: [file('Brique_BaseColor')],
      }),
    ).resolves.toBe('Brique')
  })

  it('writes nothing when the dialog was dismissed', async () => {
    pickFolder = () => Promise.resolve(null)
    resetHandlers()
    registerExportHandlers({ pickFolder, projectPath: () => null })

    await expect(
      invoke(CHANNELS.materialExport, {
        folder: 'Brique',
        target: 'material.unity',
        files: [file('Brique_BaseColor')],
      }),
    ).resolves.toBeNull()
    await expect(readdir(chosen)).resolves.toEqual([])
  })

  /** Re-exporting after a change is the ordinary case, and it must not fail on the second go. */
  it('writes over a folder it already filled', async () => {
    const twice = {
      folder: 'Brique',
      target: 'material.unity',
      files: [file('Brique_BaseColor')],
    }
    await invoke(CHANNELS.materialExport, twice)

    await expect(invoke(CHANNELS.materialExport, twice)).resolves.toBe('Brique')
  })

  describe('refuses what the sandboxed side must not decide', () => {
    it('a folder that would climb out of the one that was picked', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: '../escape',
          target: 'material.unity',
          files: [file('a')],
        }),
      ).rejects.toThrow()
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: '..',
          target: 'material.unity',
          files: [file('a')],
        }),
      ).rejects.toThrow()
    })

    it('a file name carrying a separator', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: [file('sub/base')],
        }),
      ).rejects.toThrow()
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: [file('..\\base')],
        }),
      ).rejects.toThrow()
    })

    it('an extension no target writes', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: [file('base', '.exe')],
        }),
      ).rejects.toThrow()
    })

    /**
     * The extension is checked against THIS target rather than against every extension the studio
     * writes somewhere: a list of all of them answers « some target writes this », which let a
     * `.glb` ride in under a target that only ever writes pictures.
     */
    it('an extension another target writes, which is not the same question', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: [file('Brique', '.glb', glb)],
        }),
      ).rejects.toThrow()
    })

    /**
     * The renderer names the target as well as the file, so naming one is not a permission.
     * Without the channel pinning its section, this request writes a `.usdz` through the door
     * that exists to write a material.
     */
    it('a target belonging to another section, on a channel that stands for one', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'scene.usdz',
          files: [file('Brique', '.usdz', glb)],
        }),
      ).rejects.toThrow()
      await expect(readdir(chosen)).resolves.toEqual([])
    })

    it('a target that is not in the registry at all', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.substance',
          files: [file('Brique_BaseColor')],
        }),
      ).rejects.toThrow()
    })

    /**
     * Which of the two rules speaks — the type or the ceiling — is not what this holds; both are
     * there and either refusing is the right answer. What it holds is that nothing reaches the
     * disk, which a `rejects.toThrow()` alone would not have said.
     */
    it('anything that is not bytes, without writing a thing', async () => {
      const notBytes = { name: 'base', extension: '.png', bytes: new ArrayBuffer(8) }

      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: [notBytes],
        }),
      ).rejects.toThrow()
      await expect(readdir(chosen)).resolves.toEqual([])
    })

    it('an export with no file in it at all', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: [],
        }),
      ).rejects.toThrow()
    })

    it('more files than the widest target writes', async () => {
      const many = Array.from({ length: 65 }, (_unused, index) => file(`base-${index}`))

      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: many,
        }),
      ).rejects.toThrow()
    })

    /**
     * Real bytes, not a `byteLength` written over a empty array: faked, what the test observed
     * was `writeFile` choking on a length no buffer had, and it passed with no ceiling at all.
     */
    it('a set of files too large to be an export', async () => {
      const big = (): Uint8Array => new Uint8Array(64 * 1024 * 1024)
      const files = Array.from({ length: 9 }, (_unused, index) => ({
        name: `base-${index}`,
        extension: '.png',
        bytes: big(),
      }))

      await expect(
        invoke(CHANNELS.materialExport, { folder: 'Brique', target: 'material.unity', files }),
      ).rejects.toThrow(/too_big|custom|Invalid/i)
      await expect(readdir(chosen)).resolves.toEqual([])
    })

    it('a name carrying a control character, which would break the write half way', async () => {
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: 'Brique',
          target: 'material.unity',
          files: [file(`a${NUL}b`)],
        }),
      ).rejects.toThrow()
      await expect(
        invoke(CHANNELS.materialExport, {
          folder: `a${NUL}b`,
          target: 'material.unity',
          files: [file('base')],
        }),
      ).rejects.toThrow()
    })
  })

  it('never opens a dialog for a request it refuses', async () => {
    await expect(
      invoke(CHANNELS.materialExport, {
        folder: '../escape',
        target: 'material.unity',
        files: [file('a')],
      }),
    ).rejects.toThrow()

    expect(pickFolder).not.toHaveBeenCalled()
  })
})

/**
 * The third door, and the only one an outside client can use: the destination is NAMED rather
 * than pointed at, so it is held inside the open project instead of being trusted.
 */
describe('the door that names its destination', () => {
  let project: string

  beforeEach(async () => {
    resetHandlers()
    project = await realpath(await mkdtemp(join(tmpdir(), 'ai-desktop-studio-project-')))
    registerExportHandlers({
      pickFolder: () => Promise.resolve<string | null>(null),
      projectPath: () => project,
    })
  })

  it('writes into the open project, and answers the folder name', async () => {
    await expect(
      invoke(CHANNELS.projectExport, {
        folder: 'Rendus',
        target: 'picture.png',
        files: [file('vue')],
      }),
    ).resolves.toBe('Rendus')

    await expect(readdir(join(project, 'Rendus'))).resolves.toEqual(['vue.png'])
  })

  // No dialog is raised on this door at all: nobody is there to fill one.
  it('refuses when no project is open rather than asking where to put it', async () => {
    const pickFolder = vi.fn(() => Promise.resolve<string | null>(null))
    resetHandlers()
    registerExportHandlers({ pickFolder, projectPath: () => null })

    await expect(
      invoke(CHANNELS.projectExport, {
        folder: 'Rendus',
        target: 'picture.png',
        files: [file('vue')],
      }),
    ).resolves.toBeNull()
    expect(pickFolder).not.toHaveBeenCalled()
  })

  it('refuses a destination that resolves out of the project', async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), 'scenario-elsewhere-'))
    await symlink(elsewhere, join(project, 'Rendus'))

    await expect(
      invoke(CHANNELS.projectExport, {
        folder: 'Rendus',
        target: 'picture.png',
        files: [file('vue')],
      }),
    ).resolves.toBeNull()
    await expect(readdir(elsewhere)).resolves.toEqual([])
  })

  // The same parser as the other two doors, so a climbing name never reaches the write at all.
  it('refuses a name that is not one segment', async () => {
    await expect(
      invoke(CHANNELS.projectExport, {
        folder: '../escape',
        target: 'picture.png',
        files: [file('vue')],
      }),
    ).rejects.toThrow()
  })
})
