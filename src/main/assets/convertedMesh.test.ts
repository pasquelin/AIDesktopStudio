import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { landConvertedMesh, type ConvertedMeshDeps } from './convertedMesh'

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])

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
    find: async id => catalog.get(id) ?? null,
    add: async asset => {
      catalog.set(asset.id, asset)
      return asset
    },
    remove: async id => {
      catalog.delete(id)
    },
    replaceBytes: async (id, bytes, extension) => {
      const existing = catalog.get(id)
      if (!existing?.path) throw new Error('no row')
      const path = existing.path.replace(/\.[^.]+$/, extension)
      await rm(join(root, existing.path), { force: true })
      await writeFile(join(root, path), bytes)
      const replaced = { ...existing, path, localChangedAt: '2026-09-06T10:00:00.000Z' }
      catalog.set(id, replaced)
      return replaced
    },
    importFromBytes: async (request, bytes) => {
      const path =
        request.type === 'animation'
          ? `Animations/${request.name}/animation${request.extension}`
          : `Models/${request.name}${request.extension}`
      await mkdir(join(root, dirname(path)), { recursive: true })
      await writeFile(join(root, path), bytes)
      const written = row({
        id: request.id,
        name: request.name,
        type: request.type,
        path,
        tags: [],
        createdAt: '2026-09-06T10:00:00.000Z',
      })
      catalog.set(request.id, written)
      return written
    },
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

  it('refiles a motion that turned out to be a model, the original following it', async () => {
    const { root, catalog, deps } = await studio([
      row({ type: 'animation', path: 'Animations/Robot/animation.fbx' }),
    ])

    const landed = await landConvertedMesh(
      { replaces: 'asset-1', glb: GLB, type: 'mesh', losses: [] },
      deps,
    )

    expect(landed).toMatchObject({
      id: 'asset-1',
      type: 'mesh',
      path: 'Models/Robot.glb',
      convertedFrom: 'Models/.sources/Robot.fbx',
      tags: ['prop'],
    })
    expect(catalog.get('asset-1')?.type).toBe('mesh')
    expect(await exists(join(root, 'Models/.sources/Robot.fbx'))).toBe(true)
    expect(await exists(join(root, 'Animations/Robot'))).toBe(false)
  })

  it('refuses a row already converted, and one that is not a 3D file of the project', async () => {
    const { deps } = await studio([
      row({ id: 'done', path: 'Models/Done.glb', convertedFrom: 'Models/.sources/Done.fbx' }),
      row({ id: 'picture', type: 'image', path: 'Images/Robot.png' }),
    ])
    const request = { glb: GLB, type: 'mesh' as const, losses: [] }

    await expect(landConvertedMesh({ ...request, replaces: 'done' }, deps)).rejects.toThrow(
      'already converted',
    )
    await expect(landConvertedMesh({ ...request, replaces: 'picture' }, deps)).rejects.toThrow(
      'not a 3D file',
    )
  })
})
