import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pathIn } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { importFiles } from './importFiles'

describe('a source bigger than the reader holds at once', () => {
  it('keeps dependencies declared after eight mebibytes of OBJ geometry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-import-'))
    const outside = await mkdtemp(join(tmpdir(), 'ia-studio-source-'))
    const source = join(outside, 'Large.obj')
    await writeFile(source, `${'v 0 0 0\n'.repeat(1024 * 1024 + 1)}mtllib Large.mtl\n`)
    await writeFile(join(outside, 'Large.mtl'), 'newmtl skin\n')

    await importFiles([source], '', {
      projectPath: () => root,
      names: async () => [],
      adopt: async relative => ({
        id: 'asset-large',
        name: 'Large',
        type: 'mesh',
        location: 'local',
        path: relative,
        tags: [],
        createdAt: '2026-09-07T00:00:00.000Z',
      }),
      documents: async () => [],
      importBundle: async () => null,
    })

    const library = pathIn(DEFAULT_ROLE_PATHS.models, 'Large/.sources/Large.mtl')
    expect(await readFile(join(root, library), 'utf8')).toContain('newmtl')
  })

  // 🛑 A glTF is parsed WHOLE — a 300 Mo file would be a 600 Mo string on the main process, and
  // above the ceiling it carries its buffers inside it and names no neighbour to fetch.
  it('reads no reference out of a glTF past the ceiling, rather than holding all of it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-import-'))
    const outside = await mkdtemp(join(tmpdir(), 'ia-studio-source-'))
    const source = join(outside, 'Huge.gltf')
    const document = { asset: { version: '2.0' }, buffers: [{ uri: 'Huge.bin' }] }
    await writeFile(source, `${JSON.stringify(document)}\n${' '.repeat(8 * 1024 * 1024)}`)
    await writeFile(join(outside, 'Huge.bin'), 'binary')

    await importFiles([source], '', {
      projectPath: () => root,
      names: async () => [],
      adopt: async relative => ({
        id: 'asset-huge',
        name: 'Huge',
        type: 'mesh',
        location: 'local',
        path: relative,
        tags: [],
        createdAt: '2026-09-07T00:00:00.000Z',
      }),
      documents: async () => [],
      importBundle: async () => null,
    })

    await expect(
      readFile(join(root, pathIn(DEFAULT_ROLE_PATHS.models, 'Huge/.sources/Huge.bin')), 'utf8'),
    ).rejects.toThrow()
  })
})
