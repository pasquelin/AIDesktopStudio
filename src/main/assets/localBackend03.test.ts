import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AssetType } from '@shared/domain/asset'
import type { AsyncCatalog } from '@main/project/catalogClient'
// `hashOrNull` where the backend is wired, `hashSource` where a test states the value it expects:
// the first is what production injects, the second is the same answer without the `null` arm.
import { hashOrNull } from '@main/media/runner'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import { roleFolderAt } from '@main/project/project-fixtures'
import { createLocalBackend, type Download, type LocalBackend } from './localBackend'

const BYTES = new Uint8Array([1, 2, 3, 4])

/**
 * The still of an asset whose own file no browser can decode. Without it, a mesh that WAS a
 * picture in the library becomes an icon the instant it is downloaded — which is how this was
 * reported, and what the poster path answers.
 */
describe('the still brought down beside the bytes', () => {
  const POSTER = new Uint8Array([7, 7, 7])

  let root: string
  let catalog: AsyncCatalog
  let backend: LocalBackend
  let download: Mock<Download>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scenario-posters-'))
    for (const folder of ['assets/3d', 'assets/img', 'assets/tex', 'assets/sky', 'assets/vid']) {
      await mkdir(join(root, folder), { recursive: true })
    }
    await mkdir(join(root, 'assets/aud'), { recursive: true })
    await mkdir(join(root, '.index/posters'), { recursive: true })

    catalog = memoryCatalog()
    download = vi.fn<Download>(url => Promise.resolve(url.includes('thumb') ? POSTER : BYTES))
    backend = createLocalBackend({
      download,
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
    })
  })

  afterEach(async () => {
    await catalog.close()
    await rm(root, { recursive: true, force: true })
  })

  it('writes it under the project and records where', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/model.glb',
      name: 'Skeleton',
      type: 'mesh',
      thumbnailUrl: 'https://cdn.example/thumb/asset_remote.jpg',
    })

    expect(asset.posterPath).toBe('.index/posters/asset_1.jpg')
    expect(await readFile(join(root, '.index/posters/asset_1.jpg'))).toEqual(Buffer.from(POSTER))
  })

  /**
   * A grid of video tiles is a grid of identical grey rectangles otherwise, and so is a clip on
   * the strip — both read `posterUrl`. The still the library already holds is the cheapest true
   * picture of the take there is; nothing needs decoding to show it.
   */
  it('writes one for a rush, whose own file no grid can paint', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_2',
      url: 'https://cdn.example/take.mp4',
      name: 'Terrier',
      type: 'video',
      thumbnailUrl: 'https://cdn.example/thumb/asset_remote.jpg',
    })

    expect(asset.posterPath).toBe('.index/posters/asset_2.jpg')
    expect(await readFile(join(root, '.index/posters/asset_2.jpg'))).toEqual(Buffer.from(POSTER))
  })

  /**
   * A picture answers for itself. A sound must NOT be given one: a timeline clip reads
   * `posterUrl` like every other surface, and the still would be painted under its waveform.
   */
  it('writes none for a kind that has a picture of its own', async () => {
    const alreadyShowable: AssetType[] = ['image', 'skybox', 'audio']
    for (const type of alreadyShowable) {
      const asset = await backend.importFromUrl({
        id: `asset_${type}`,
        url: `https://cdn.example/render.${type === 'audio' ? 'mp3' : 'png'}`,
        name: 'Boulder',
        type,
        thumbnailUrl: 'https://cdn.example/thumb/asset_remote.jpg',
      })

      expect(asset.posterPath).toBeUndefined()
    }

    // One download per asset, and not one thumbnail among them.
    expect(download).toHaveBeenCalledTimes(3)
  })

  // The model is the asset; the still is a convenience. A CDN answering 404 must not cost the
  // import that carries it.
  it('imports the asset all the same when the still cannot be fetched', async () => {
    download.mockImplementation((url: string) =>
      url.includes('thumb') ? Promise.reject(new Error('404')) : Promise.resolve(BYTES),
    )

    const asset = await backend.importFromUrl({
      id: 'asset_3',
      url: 'https://cdn.example/model.glb',
      name: 'Skeleton',
      type: 'mesh',
      thumbnailUrl: 'https://cdn.example/thumb/gone.jpg',
    })

    expect(asset.path).toBe('Modelling/Models/Skeleton.glb')
    expect(asset.posterPath).toBeUndefined()
  })

  // Pulling the same twin twice is ordinary. A still that failed the second time must leave the
  // one already on disk, which is a true picture of the same asset.
  it('keeps the still an earlier pull wrote when a later one fails', async () => {
    await backend.importFromUrl({
      id: 'asset_4',
      url: 'https://cdn.example/model.glb',
      name: 'Skeleton',
      type: 'mesh',
      thumbnailUrl: 'https://cdn.example/thumb/asset_remote.jpg',
    })

    download.mockImplementation((url: string) =>
      url.includes('thumb') ? Promise.reject(new Error('404')) : Promise.resolve(BYTES),
    )
    const again = await backend.importFromUrl({
      id: 'asset_4',
      url: 'https://cdn.example/model.glb',
      name: 'Skeleton',
      type: 'mesh',
      thumbnailUrl: 'https://cdn.example/thumb/asset_remote.jpg',
    })

    expect(again.posterPath).toBe('.index/posters/asset_4.jpg')
  })

  // The name follows the extension the CDN's URL carried, and a second pull can carry another.
  // The file the row stops pointing at is ours, and nothing would ever come back for it.
  it('drops the still it replaces when the new one lands under another name', async () => {
    await backend.importFromUrl({
      id: 'asset_6',
      url: 'https://cdn.example/model.glb',
      name: 'Skeleton',
      type: 'mesh',
      thumbnailUrl: 'https://cdn.example/thumb/asset_remote.jpg',
    })
    expect(await readFile(join(root, '.index/posters/asset_6.jpg'))).toEqual(Buffer.from(POSTER))

    const again = await backend.importFromUrl({
      id: 'asset_6',
      url: 'https://cdn.example/model.glb',
      name: 'Skeleton',
      type: 'mesh',
      thumbnailUrl: 'https://cdn.example/thumb/asset_remote.webp',
    })

    expect(again.posterPath).toBe('.index/posters/asset_6.webp')
    await expect(readFile(join(root, '.index/posters/asset_6.jpg'))).rejects.toThrow()
  })

  it('asks for nothing when the request carries no still', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_5',
      url: 'https://cdn.example/model.glb',
      name: 'Skeleton',
      type: 'mesh',
    })

    expect(asset.posterPath).toBeUndefined()
    expect(download).toHaveBeenCalledTimes(1)
  })
})
