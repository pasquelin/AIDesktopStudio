import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { pathIn } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { importFiles } from './importFiles'

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
