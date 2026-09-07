import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { pathIn } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS, type FolderRole } from '@shared/domain/folderRole'
import { importFiles } from './importFiles'

const under = (role: FolderRole, relative: string): string =>
  pathIn(DEFAULT_ROLE_PATHS[role], relative)

const deps = (
  root: string,
  adopt: (path: string) => Promise<Asset | null>,
): Parameters<typeof importFiles>[2] => ({
  projectPath: () => root,
  names: async () => [],
  adopt,
  documents: async () => [],
  importBundle: async () => null,
})

describe('importFiles routing', () => {
  it('routes a mixed drop to the folder each kind is filed under', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    const picture = `${root}-facade.png`
    const motion = `${root}-Walking.fbx`
    const mesh = `${root}-character.glb`
    await writeFile(picture, 'png')
    await writeFile(motion, 'fbx')
    await writeFile(mesh, 'glb')
    const adopted: Asset[] = []

    const imported = await importFiles(
      [picture, motion, mesh],
      '',
      deps(root, async path => {
        const asset: Asset = {
          id: `asset-${adopted.length + 1}`,
          name: basename(path),
          type: path.endsWith('.fbx') ? 'animation' : path.endsWith('.png') ? 'image' : 'mesh',
          location: 'local',
          path,
          tags: [],
          createdAt: '2026-09-06T00:00:00.000Z',
        }
        adopted.push(asset)
        return asset
      }),
    )

    expect(await readFile(join(root, under('image', basename(picture))), 'utf8')).toBe('png')
    expect(await readFile(join(root, under('animations', basename(motion))), 'utf8')).toBe('fbx')
    expect(await readFile(join(root, under('models', basename(mesh))), 'utf8')).toBe('glb')
    expect(imported.assets.map(asset => asset.path)).toEqual([
      under('image', basename(picture)),
      under('animations', basename(motion)),
      under('models', basename(mesh)),
    ])
  })

  it('walks a dropped folder and imports every file it can read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    const outside = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-motions-'))
    await writeFile(join(outside, 'Walking.fbx'), 'walk')
    await writeFile(join(outside, 'Start Walking.fbx'), 'start')
    await writeFile(join(outside, 'notes.txt'), 'ignore')
    const adopted: string[] = []

    const imported = await importFiles(
      [outside],
      DEFAULT_ROLE_PATHS.animations,
      deps(root, async path => {
        adopted.push(path)
        return {
          id: `asset-${adopted.length}`,
          name: basename(path),
          type: 'animation',
          location: 'local',
          path,
          tags: [],
          createdAt: '2026-09-06T00:00:00.000Z',
        }
      }),
    )

    expect(adopted.sort()).toEqual(
      ['Start Walking.fbx', 'Walking.fbx'].map(name => under('animations', name)).sort(),
    )
    expect(imported.failed).toEqual(['notes.txt'])
  })

  it('files a glTF dropped on Animations as a motion, not a scene document', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    const source = `${root}.gltf`
    await writeFile(source, '{"asset":{"version":"2.0"}}')
    const adopt = vi.fn(async (path: string): Promise<Asset> => ({
      id: 'asset-1',
      name: 'clip',
      type: 'animation',
      location: 'local',
      path,
      tags: [],
      createdAt: '2026-09-06T00:00:00.000Z',
    }))

    const imported = await importFiles([source], DEFAULT_ROLE_PATHS.animations, deps(root, adopt))

    expect(adopt).toHaveBeenCalledWith(under('animations', basename(source)))
    expect(imported.assets).toHaveLength(1)
    expect(imported.documents).toEqual([])
    expect(imported.refused).toEqual([])
  })

  it('writes a window drop through folderFor, not a mkdir of the drawing path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    const motion = `${root}-Walking.fbx`
    await writeFile(motion, 'fbx')
    const folderFor = vi.fn(async () => 'Motions')
    const adopt = vi.fn(async (path: string): Promise<Asset> => ({
      id: 'asset-1',
      name: 'Walking',
      type: 'animation',
      location: 'local',
      path,
      tags: [],
      createdAt: '2026-09-06T00:00:00.000Z',
    }))

    const imported = await importFiles([motion], '', { ...deps(root, adopt), folderFor })

    expect(folderFor).toHaveBeenCalledWith('animations')
    expect(adopt).toHaveBeenCalledWith(pathIn('Motions', basename(motion)))
    expect(imported.assets).toHaveLength(1)
  })
})
