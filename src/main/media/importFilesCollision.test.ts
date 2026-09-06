import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { importFiles } from './importFiles'

describe('importFiles neighbour packages', () => {
  it('keeps a colliding package name aligned with its source file capability', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-import-collision-'))
    const sourceFolder = await mkdtemp(join(tmpdir(), 'ia-studio-import-source-'))
    const source = join(sourceFolder, 'Robot.obj')
    await writeFile(source, 'mtllib Robot.mtl')
    await writeFile(join(sourceFolder, 'Robot.mtl'), 'newmtl Body')
    await mkdir(join(root, DEFAULT_ROLE_PATHS.models, 'Robot'), { recursive: true })
    const adopt = vi.fn(async (path: string): Promise<Asset> => ({
      id: 'asset-1',
      name: basename(path),
      type: 'mesh',
      location: 'local',
      path,
      tags: [],
      createdAt: '2026-09-07T00:00:00.000Z',
    }))

    await importFiles([source], '', {
      projectPath: () => root,
      names: async () => ['Robot'],
      adopt,
      documents: async () => [],
      importBundle: async () => null,
    })

    const nested = `${DEFAULT_ROLE_PATHS.models}/Robot 2`
    expect(adopt).toHaveBeenCalledWith(`${nested}/Robot 2.obj`)
    expect(await readFile(join(root, nested, '.sources/Robot.mtl'), 'utf8')).toBe('newmtl Body')
  })
})
