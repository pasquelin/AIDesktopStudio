import { access, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import { pathIn } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { importFiles } from './importFiles'

const scenes = (relative: string): string => pathIn(DEFAULT_ROLE_PATHS.scenes, relative)

describe('importFiles nest names', () => {
  it('nests a document named ...gltf inside the project rather than its parent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    const outside = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-source-'))
    const source = join(outside, '...gltf')
    await writeFile(
      source,
      JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin' }] }),
    )
    await writeFile(join(outside, 'mesh.bin'), 'bin')
    const document: DocumentDescriptor = {
      id: 'document-dots',
      kind: 'scene',
      workspace: '3d',
      title: 'Dots',
      path: scenes('document/...gltf'),
    }

    const imported = await importFiles([source], '', {
      projectPath: () => root,
      names: async () => [],
      adopt: async () => null,
      documents: async () => [document],
      importBundle: async () => null,
    })

    expect(await readFile(join(root, scenes('document/mesh.bin')), 'utf8')).toBe('bin')
    expect(imported.documents).toEqual([document])
  })

  it('does not delete the project when a ..gltf import is cancelled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    await writeFile(join(root, 'kept.txt'), 'keep')
    const outside = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-source-'))
    const source = join(outside, '..gltf')
    await writeFile(
      source,
      JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'Heavy.bin' }] }),
    )
    await writeFile(join(outside, 'Heavy.bin'), Buffer.alloc(8 * 1024 * 1024))
    const controller = new AbortController()

    await importFiles(
      [source],
      '',
      {
        projectPath: () => root,
        names: async () => [],
        adopt: async () => null,
        documents: async () => [],
        importBundle: async () => null,
      },
      { signal: controller.signal, onStep: () => controller.abort() },
    )

    expect(await readFile(join(root, 'kept.txt'), 'utf8')).toBe('keep')
  })

  it('leaves no folder behind when the import is cancelled while copying the neighbours', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    const outside = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-source-'))
    const source = join(outside, 'Lourd.gltf')
    await writeFile(
      source,
      JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'Lourd.bin' }] }),
    )
    await writeFile(join(outside, 'Lourd.bin'), Buffer.alloc(8 * 1024 * 1024))
    const controller = new AbortController()
    const documents = vi.fn(async () => [])

    const imported = await importFiles(
      [source],
      '',
      {
        projectPath: () => root,
        names: async () => [],
        adopt: async () => null,
        documents,
        importBundle: async () => null,
      },
      { signal: controller.signal, onStep: () => controller.abort() },
    )

    await expect(access(join(root, scenes('Lourd')))).rejects.toThrow()
    expect(imported.documents).toEqual([])
  })

  it('does not follow a neighbour that a symbolic link takes out of the source folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-import-'))
    const outside = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-source-'))
    const elsewhere = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-elsewhere-'))
    await writeFile(join(elsewhere, 'secret.png'), 'private key')
    await symlink(join(elsewhere, 'secret.png'), join(outside, 'peau.png'))
    await symlink(elsewhere, join(outside, 'textures'))
    const source = join(outside, 'Niveau.gltf')
    await writeFile(
      source,
      JSON.stringify({
        asset: { version: '2.0' },
        images: [{ uri: 'peau.png' }, { uri: 'textures/secret.png' }],
      }),
    )
    const document: DocumentDescriptor = {
      id: 'document-7',
      kind: 'scene',
      workspace: '3d',
      title: 'Niveau',
      path: scenes('Niveau/Niveau.gltf'),
    }

    const imported = await importFiles([source], '', {
      projectPath: () => root,
      names: async () => [],
      adopt: async () => null,
      documents: async () => [document],
      importBundle: async () => null,
    })

    await expect(access(join(root, scenes('Niveau/peau.png')))).rejects.toThrow()
    await expect(access(join(root, scenes('Niveau/textures/secret.png')))).rejects.toThrow()
    expect(imported.failed).toEqual(['peau.png', 'secret.png'])
  })
})
