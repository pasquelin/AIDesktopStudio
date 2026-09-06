import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { importFiles } from './importFiles'
import type * as FileSystem from 'node:fs/promises'

const { readFileSpy } = vi.hoisted(() => ({ readFileSpy: vi.fn() }))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof FileSystem>()
  readFileSpy.mockImplementation(actual.readFile)
  return { ...actual, readFile: readFileSpy }
})

describe('importFiles binary meshes', () => {
  beforeEach(() => {
    readFileSpy.mockClear()
  })

  it('copies a binary mesh without loading it as text to search for neighbours', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-import-binary-'))
    const source = `${root}.fbx`
    await writeFile(source, new Uint8Array([0, 255, 0, 254]))
    await mkdir(join(root, DEFAULT_ROLE_PATHS.models), { recursive: true })

    const imported = await importFiles([source], '', {
      projectPath: () => root,
      names: async () => [],
      adopt: async () => null,
      documents: async () => [],
      importBundle: async () => null,
    })

    expect(imported.failed).toEqual([])
    expect(readFileSpy).not.toHaveBeenCalled()
  })
})
