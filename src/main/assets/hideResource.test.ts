import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { createHideResource } from './hideResource'

const SHOWN: Asset = {
  id: 'asset-generated',
  name: 'Ciel de nuit',
  type: 'image',
  location: 'local',
  path: 'Images/Ciel de nuit.png',
  tags: [],
  createdAt: '2026-09-10T09:00:00.000Z',
}

/**
 * G-V for a generation a document asked for — §6.3, D7 and E-26: a picture that became a layer
 * used to sit in the pictures folder for good, layer undone or not.
 */
describe('taking a file into the internal store', () => {
  let root = ''
  const repath = vi.fn(() => Promise.resolve())

  const hiding = (asset: Asset | null) =>
    createHideResource({ projectPath: () => root, find: () => Promise.resolve(asset), repath })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'resources-'))
    repath.mockClear()
    await mkdir(join(root, 'Images'), { recursive: true })
    await writeFile(join(root, SHOWN.path ?? ''), Buffer.from([1, 2, 3]))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('moves the file out of the explorer rather than copying it', async () => {
    const hidden = await hiding(SHOWN).hide('asset-generated')

    expect(hidden.path).toBe('.resources/Images/Ciel de nuit.png')
    expect(await readFile(join(root, hidden.path ?? ''))).toEqual(Buffer.from([1, 2, 3]))
    await expect(readFile(join(root, SHOWN.path ?? ''))).rejects.toThrow()
  })

  /** The catalogue row follows, which is what keeps the document that cites it drawing it. */
  it('tells the catalogue where the file went', async () => {
    await hiding(SHOWN).hide('asset-generated')

    expect(repath).toHaveBeenCalledWith(SHOWN.path, '.resources/Images/Ciel de nuit.png')
  })

  it('leaves a resource already in the store where it is', async () => {
    const inside = { ...SHOWN, path: '.resources/Images/Ciel.png' }

    await expect(hiding(inside).hide('asset-generated')).resolves.toEqual(inside)
    expect(repath).not.toHaveBeenCalled()
  })
})
