import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { saveAnimationThumbnail } from './animationThumbnail'

let root = ''
const asset: Asset = {
  id: 'motion',
  name: 'Jump.glb',
  path: 'Animations/Jump/animation.glb',
  type: 'animation',
  location: 'local',
  tags: [],
  createdAt: '2026-01-01',
}
const png = new Uint8Array(24)
png.set([137, 80, 78, 71, 13, 10, 26, 10])
const header = new DataView(png.buffer)
header.setUint32(12, 0x49484452)
header.setUint32(16, 512)
header.setUint32(20, 512)
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'animation-thumbnail-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('persists the PNG inside the clip’s own folder, under the one name such a folder holds', async () => {
  const save = vi.fn(async () => true)
  await saveAnimationThumbnail(
    { projectPath: root, assetId: asset.id, sourcePath: asset.path, png },
    root,
    async () => asset,
    save,
  )
  await mkdir(join(root, '.index'), { recursive: true })
  await rm(join(root, '.index'), { recursive: true })
  expect(new Uint8Array(await readFile(join(root, 'Animations/Jump/thumb.png')))).toEqual(png)
  expect(save).toHaveBeenCalledWith({
    assetId: asset.id,
    sourcePath: asset.path,
    posterPath: 'Animations/Jump/thumb.png',
  })
})
it('refuses a result that belongs to an old project or a moved animation', async () => {
  const save = vi.fn(async () => true)
  const request = { projectPath: root, assetId: asset.id, sourcePath: asset.path, png }
  await expect(
    saveAnimationThumbnail(
      { ...request, projectPath: root + '-old' },
      root,
      async () => asset,
      save,
    ),
  ).rejects.toThrow('another project')
  await expect(
    saveAnimationThumbnail(request, root, async () => ({ ...asset, path: 'Moved.glb' }), save),
  ).rejects.toThrow('moved')
  expect(save).not.toHaveBeenCalled()
})
