import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { createShowResource } from './showResource'

const HIDDEN: Asset = {
  id: 'asset-normal',
  name: 'Brique — Normale',
  type: 'image',
  location: 'local',
  map: 'normal',
  path: '.resources/Materials/Brique — Normale.png',
  tags: [],
  createdAt: '2026-09-10T09:00:00.000Z',
}

/**
 * The pair of the hiding — §6.7, T7. A resource nothing can bring back out is a resource the user
 * has lost, which is the complaint the hiding would otherwise create.
 */
describe('bringing an internal resource out', () => {
  let root = ''
  const repath = vi.fn(() => Promise.resolve())

  const showing = (asset: Asset | null) =>
    createShowResource({
      projectPath: () => root,
      folderFor: () => Promise.resolve('Materials'),
      find: () => Promise.resolve(asset),
      repath,
    })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'resources-'))
    repath.mockClear()
    await mkdir(join(root, '.resources/Materials'), { recursive: true })
    await writeFile(join(root, HIDDEN.path ?? ''), Buffer.from([1, 2, 3]))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('moves the file into the project tree rather than copying it', async () => {
    const shown = await showing(HIDDEN).show('asset-normal')

    expect(shown.path).toBe('Materials/Brique — Normale.png')
    expect(await readFile(join(root, 'Materials/Brique — Normale.png'))).toEqual(
      Buffer.from([1, 2, 3]),
    )
    await expect(readFile(join(root, HIDDEN.path ?? ''))).rejects.toThrow()
  })

  /** The catalogue row follows, which is what keeps every document that cites it drawing it. */
  it('tells the catalogue where the file went', async () => {
    await showing(HIDDEN).show('asset-normal')

    expect(repath).toHaveBeenCalledWith(HIDDEN.path, 'Materials/Brique — Normale.png')
  })

  it('leaves a resource that is already out where it is', async () => {
    const outside = { ...HIDDEN, path: 'Materials/Brique.png' }

    await expect(showing(outside).show('asset-normal')).resolves.toEqual(outside)
    expect(repath).not.toHaveBeenCalled()
  })
})
