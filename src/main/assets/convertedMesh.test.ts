import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { glbFrom } from '@shared/domain/glbContainer'
import { landConvertedMesh, saveConverted, type ConvertedMeshDeps } from './convertedMesh'

vi.mock('@main/ipc/broadcast', () => ({ broadcast: vi.fn() }))

const GLB = glbFrom({
  json: new TextEncoder().encode('{"asset":{"version":"2.0"}}'),
  bin: new Uint8Array(),
})

const row = (fields: Partial<Asset>): Asset => ({
  id: 'asset-1',
  name: 'Robot',
  type: 'mesh',
  location: 'local',
  tags: ['prop'],
  createdAt: '2026-09-01T00:00:00.000Z',
  ...fields,
})

/** A catalogue in a map, and a backend that writes where the real one would. */
async function studio(rows: readonly Asset[]) {
  const root = await mkdtemp(join(tmpdir(), 'ia-studio-converted-'))
  const catalog = new Map(rows.map(one => [one.id, one]))
  for (const one of rows) {
    if (!one.path) continue
    await mkdir(join(root, dirname(one.path)), { recursive: true })
    await writeFile(join(root, one.path), `bytes of ${one.name}`)
  }
  const deps: ConvertedMeshDeps = {
    projectPath: () => root,
    folderFor: async role => (role === 'animations' ? 'Animations' : 'Models'),
    find: async id => catalog.get(id) ?? null,
    add: async asset => {
      catalog.set(asset.id, asset)
      return asset
    },
    hash: async () => 'converted-hash',
    now: () => '2026-09-06T10:00:00.000Z',
  }
  return { root, catalog, deps }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

const host = (deps: ConvertedMeshDeps) => ({
  folderFor: deps.folderFor,
  duringWrite: async <T>(write: (root: string, catalog: ConvertedMeshDeps) => Promise<T>) =>
    await write(deps.projectPath(), deps),
})

describe('landConvertedMesh', () => {
  it('points the row at the glb, keeps the original under .sources, and says what was lost', async () => {
    const { root, deps } = await studio([row({ path: 'Models/Robot.fbx' })])

    const landed = await landConvertedMesh(
      { replaces: 'asset-1', glb: GLB, type: 'mesh', losses: ['textures'] },
      deps,
    )

    expect(landed).toMatchObject({
      path: 'Models/Robot.glb',
      convertedFrom: 'Models/.sources/Robot.fbx',
      importLosses: ['textures'],
      tags: ['prop'],
      createdAt: '2026-09-01T00:00:00.000Z',
    })
    expect(await readFile(join(root, 'Models/.sources/Robot.fbx'), 'utf8')).toBe('bytes of Robot')
    expect(await exists(join(root, 'Models/Robot.fbx'))).toBe(false)
  })

  // 🛑 The import deduplicates on the WHOLE file name, so a `Robot.fbx` lands beside an existing
  // `Robot.glb`; taking the name with another extension made the conversion refuse itself with
  // « already exists », and the `.fbx` stayed unconverted for ever.
  it('takes a free name when a glb of that name is already there', async () => {
    const { root, deps } = await studio([
      row({ path: 'Models/Robot.fbx' }),
      row({ id: 'asset-2', name: 'Robot', path: 'Models/Robot.glb' }),
    ])

    const landed = await landConvertedMesh(
      { replaces: 'asset-1', glb: GLB, type: 'mesh', losses: [] },
      deps,
    )

    expect(landed?.path).toBe('Models/Robot 2.glb')
    expect(await readFile(join(root, 'Models/Robot.glb'), 'utf8')).toBe('bytes of Robot')
  })

  it('refiles a motion that turned out to be a model, the original following it', async () => {
    const { root, catalog, deps } = await studio([
      row({
        type: 'animation',
        path: 'Animations/Robot/animation.fbx',
        derivedFrom: 'asset-src',
        generation: { modelId: 'm', modelLabel: 'M', prompt: 'walk', seed: 1, params: {} },
      }),
    ])
    await mkdir(join(root, 'Animations/Robot/.sources'), { recursive: true })
    await writeFile(join(root, 'Animations/Robot/.sources/rig.bin'), 'rig')

    const landed = await landConvertedMesh(
      { replaces: 'asset-1', glb: GLB, type: 'mesh', losses: [] },
      deps,
    )

    expect(landed).toMatchObject({
      id: 'asset-1',
      type: 'mesh',
      path: 'Models/Robot.glb',
      convertedFrom: 'Models/.sources/Robot/Robot.fbx',
      tags: ['prop'],
      derivedFrom: 'asset-src',
      generation: { modelId: 'm', modelLabel: 'M', prompt: 'walk', seed: 1, params: {} },
    })
    expect(catalog.get('asset-1')?.type).toBe('mesh')
    expect(await exists(join(root, 'Models/.sources/Robot/Robot.fbx'))).toBe(true)
    expect(await readFile(join(root, 'Models/.sources/Robot/rig.bin'), 'utf8')).toBe('rig')
    expect(await exists(join(root, 'Animations/Robot'))).toBe(false)
  })

  it('refuses a row already converted, and one that is not a 3D file of the project', async () => {
    const { deps } = await studio([
      row({ id: 'done', path: 'Models/Done.glb', convertedFrom: 'Models/.sources/Done.fbx' }),
      row({ id: 'picture', type: 'image', path: 'Images/Robot.png' }),
    ])
    const request: Omit<Parameters<typeof landConvertedMesh>[0], 'replaces'> = {
      glb: GLB,
      type: 'mesh',
      losses: [],
    }

    await expect(landConvertedMesh({ ...request, replaces: 'done' }, deps)).rejects.toThrow(
      'already converted',
    )
    await expect(landConvertedMesh({ ...request, replaces: 'picture' }, deps)).rejects.toThrow(
      'not a 3D file',
    )
  })

  it('restores the original and its neighbours when the catalogue upsert fails', async () => {
    const { root, catalog, deps } = await studio([
      row({ type: 'animation', path: 'Animations/Robot/animation.gltf' }),
    ])
    await mkdir(join(root, 'Animations/Robot/.sources'), { recursive: true })
    await writeFile(join(root, 'Animations/Robot/.sources/rig.bin'), 'rig')
    deps.add = async () => {
      throw new Error('catalogue unavailable')
    }

    await expect(
      landConvertedMesh({ replaces: 'asset-1', glb: GLB, type: 'mesh', losses: [] }, deps),
    ).rejects.toThrow('catalogue unavailable')

    expect(catalog.get('asset-1')?.path).toBe('Animations/Robot/animation.gltf')
    expect(await readFile(join(root, 'Animations/Robot/animation.gltf'), 'utf8')).toBe(
      'bytes of Robot',
    )
    expect(await readFile(join(root, 'Animations/Robot/.sources/rig.bin'), 'utf8')).toBe('rig')
    expect(await exists(join(root, 'Models/Robot.glb'))).toBe(false)
  })

  it('leaves other originals in a shared role .sources folder when refiling one asset', async () => {
    const { root, deps } = await studio([row({ type: 'animation', path: 'Animations/Robot.fbx' })])
    await mkdir(join(root, 'Animations/.sources'), { recursive: true })
    await writeFile(join(root, 'Animations/.sources/Other.fbx'), 'other')

    await landConvertedMesh({ replaces: 'asset-1', glb: GLB, type: 'mesh', losses: [] }, deps)

    expect(await readFile(join(root, 'Animations/.sources/Other.fbx'), 'utf8')).toBe('other')
  })

  it('keeps a target created concurrently and restores the original', async () => {
    const { root, deps } = await studio([row({ path: 'Models/Robot.fbx' })])
    deps.hash = async () => {
      await writeFile(join(root, 'Models/Robot.glb'), 'concurrent')
      return 'converted-hash'
    }

    await expect(
      landConvertedMesh({ replaces: 'asset-1', glb: GLB, type: 'mesh', losses: [] }, deps),
    ).rejects.toThrow()

    expect(await readFile(join(root, 'Models/Robot.glb'), 'utf8')).toBe('concurrent')
    expect(await readFile(join(root, 'Models/Robot.fbx'), 'utf8')).toBe('bytes of Robot')
  })

  it('removes an animation folder created by a failed refile', async () => {
    const { root, deps } = await studio([row({ path: 'Models/Walk.bvh' })])
    deps.add = async () => {
      throw new Error('catalogue unavailable')
    }

    await expect(
      landConvertedMesh({ replaces: 'asset-1', glb: GLB, type: 'animation', losses: [] }, deps),
    ).rejects.toThrow('catalogue unavailable')

    expect(await exists(join(root, 'Animations/Walk'))).toBe(false)
    expect(await readFile(join(root, 'Models/Walk.bvh'), 'utf8')).toBe('bytes of Robot')
  })

  it('refuses a catalogue path that leaves the project before moving its file', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ia-studio-converted-escape-'))
    const root = join(parent, 'project')
    await mkdir(join(root, 'Models'), { recursive: true })
    await writeFile(join(parent, 'victim.obj'), 'kept')
    const existing = row({ path: '../victim.obj' })
    const deps: ConvertedMeshDeps = {
      projectPath: () => root,
      folderFor: async () => 'Models',
      find: async () => existing,
      add: async value => value,
      hash: async () => null,
      now: () => '2026-09-07T00:00:00.000Z',
    }

    await expect(
      landConvertedMesh({ replaces: 'asset-1', glb: GLB, type: 'mesh', losses: [] }, deps),
    ).rejects.toThrow('leaves the project')
    expect(await readFile(join(parent, 'victim.obj'), 'utf8')).toBe('kept')
  })
})

describe('saveConverted', () => {
  it('refuses a payload that is not a binary glTF before moving the original', async () => {
    const { root, deps } = await studio([row({ path: 'Models/Robot.fbx' })])
    const record = vi.fn()

    await expect(
      saveConverted(
        {
          replaces: 'asset-1',
          projectPath: deps.projectPath(),
          glb: new Uint8Array([1, 2, 3]),
          type: 'mesh',
          losses: [],
        },
        host(deps),
        record,
      ),
    ).rejects.toThrow('binary glTF')
    expect(record).not.toHaveBeenCalled()
    expect(await readFile(join(root, 'Models/Robot.fbx'), 'utf8')).toBe('bytes of Robot')
  })

  it('refuses a conversion produced for another project before touching the source', async () => {
    const { root, deps } = await studio([row({ path: 'Models/Robot.fbx' })])

    await expect(
      saveConverted(
        {
          replaces: 'asset-1',
          projectPath: '/another-project',
          glb: GLB,
          type: 'mesh',
          losses: [],
        },
        host(deps),
        vi.fn(),
      ),
    ).rejects.toThrow('another project')

    expect(await readFile(join(root, 'Models/Robot.fbx'), 'utf8')).toBe('bytes of Robot')
  })
})
