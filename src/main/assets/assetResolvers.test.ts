import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'

// `protocol.ts` reaches for `protocol` and `net` at call time only, but importing it still pulls
// Electron in — and there is no Electron under Vitest.
vi.mock('electron', () => ({ net: {}, protocol: {} }))

const { createAssetResolvers } = await import('./assetResolvers')
const { ASSET_HOST, POSTER_HOST, THUMB_HOST } = await import('@shared/domain/asset')
const { FILE_HOST } = await import('@shared/domain/assetAccess')
const { FAVORITE_HOST } = await import('@shared/domain/favorite')
const { TEMPLATE_HOST } = await import('@shared/domain/sceneTemplate')
const { ANIMATION_HOST } = await import('@shared/domain/animationLibrary')
const { MODEL_HOST } = await import('@shared/domain/localModel')
const { TEXTURE_HOST } = await import('@shared/domain/checkerTexture')
const { CHARACTER_HOST } = await import('@shared/domain/bundledCharacter')
const { CATALOGUE_CLOSED } = await import('@main/project/catalogClient')
const { NoProjectError } = await import('@main/project/store')

const PROJECT = '/projects/My project'

const asset = (fields: Partial<Asset>): Asset => ({
  id: 'asset-1',
  name: 'Rush',
  type: 'video',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...fields,
})

type Deps = Parameters<typeof createAssetResolvers>[0]

const hostsWith = (overrides: Partial<Deps> = {}) =>
  createAssetResolvers({
    projectPath: () => PROJECT,
    findAsset: () => Promise.resolve(null),
    favouriteThumbnail: () => '/userData/favorites/favorite_1.png',
    thumbnailOf: () => Promise.resolve(null),
    bundledAnimation: id => Promise.resolve(`/resources/animations/${id}`),
    bundledTemplate: file => Promise.resolve(`/resources/templates/${file}`),
    bundledModel: file => Promise.resolve(`/resources/models/${file}`),
    bundledTexture: file => Promise.resolve(`/resources/textures/${file}`),
    bundledCharacter: file => Promise.resolve(`/resources/characters/${file}`),
    ...overrides,
  })

const resolversReading = (findAsset: () => Promise<Asset | null>) => hostsWith({ findAsset })

describe('what the asset scheme resolves', () => {
  it('serves a file of the project by its path, kept sources included, and nothing outside', async () => {
    const hosts = hostsWith()

    expect(await hosts[FILE_HOST]?.('models/robot/.sources/robot.mtl')).toBe(
      `${PROJECT}/models/robot/.sources/robot.mtl`,
    )
    expect(await hosts[FILE_HOST]?.('../elsewhere/secret.txt')).toBeNull()
    expect(await hostsWith({ projectPath: () => null })[FILE_HOST]?.('models/robot.mtl')).toBeNull()
  })

  it('serves the file a row names, and the still beside it, off the same identifier', async () => {
    const resolvers = resolversReading(() =>
      Promise.resolve(asset({ path: 'assets/rush.mp4', posterPath: '.index/posters/a.jpg' })),
    )

    await expect(resolvers[ASSET_HOST]?.('asset-1')).resolves.toBe(`${PROJECT}/assets/rush.mp4`)
    await expect(resolvers[POSTER_HOST]?.('asset-1')).resolves.toBe(
      `${PROJECT}/.index/posters/a.jpg`,
    )
  })

  it('serves nothing while no project is open, without asking the catalogue', async () => {
    const findAsset = vi.fn(() => Promise.resolve(asset({ path: 'assets/rush.mp4' })))
    const hosts = hostsWith({ projectPath: () => null, findAsset })

    await expect(hosts[ASSET_HOST]?.('asset-1')).resolves.toBeNull()
    expect(findAsset).not.toHaveBeenCalled()
  })

  /**
   * The whole point of the lot this came with: a project left while a grid still asks for its
   * stills is « no file ». Absorbed HERE, since only this side can tell it from a defect —
   * `servedPath` journals whatever reaches it as one.
   */
  it('answers nothing when the project goes while the read is in flight', async () => {
    const closing = resolversReading(() => Promise.reject(new Error(CATALOGUE_CLOSED)))
    const gone = resolversReading(() => Promise.reject(new NoProjectError()))
    // `project.catalog()` throws before any promise exists, which is the shape this must survive.
    const throwing = resolversReading(() => {
      throw new NoProjectError()
    })

    await expect(closing[ASSET_HOST]?.('asset-1')).resolves.toBeNull()
    await expect(gone[POSTER_HOST]?.('asset-1')).resolves.toBeNull()
    await expect(throwing[ASSET_HOST]?.('asset-1')).resolves.toBeNull()
  })

  // What the level in `servedPath` was raised for: a defect must keep travelling, or it is
  // served as a quiet 404 and the journal never says the resolver broke.
  it('lets a defect travel rather than serving it as a missing file', async () => {
    const broken = resolversReading(() => Promise.reject(new TypeError('find is not a function')))

    await expect(broken[ASSET_HOST]?.('asset-1')).rejects.toThrow(TypeError)
  })

  // Kept outside every project, which is why no catalogue can answer for it.
  it('reads a favourite off the folder beside the settings, and a thumbnail off its cache', async () => {
    const hosts = hostsWith({
      thumbnailOf: relative => Promise.resolve(`${PROJECT}/.index/thumbs/${relative}.png`),
    })

    await expect(hosts[FAVORITE_HOST]?.('favorite_1')).resolves.toBe(
      '/userData/favorites/favorite_1.png',
    )
    await expect(hosts[THUMB_HOST]?.('folder/file.png')).resolves.toBe(
      `${PROJECT}/.index/thumbs/folder/file.png.png`,
    )
  })

  // Shipped beside the app and common to every project: one is asked for before any project is
  // open — the new-document window drawing its tiles, a sky judged in an empty studio.
  it.each([
    [TEMPLATE_HOST, 'basic.png', '/resources/templates/basic.png'],
    [MODEL_HOST, 'text.png', '/resources/models/text.png'],
    [ANIMATION_HOST, 'walk', '/resources/animations/walk'],
    [TEXTURE_HOST, 'GridLarge.png', '/resources/textures/GridLarge.png'],
    [CHARACTER_HOST, 'HeroMedium.glb', '/resources/characters/HeroMedium.glb'],
  ])('serves %s with no project open', async (host, key, file) => {
    const hosts = hostsWith({ projectPath: () => null })

    await expect(hosts[host]?.(key)).resolves.toBe(file)
  })
})
