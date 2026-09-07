import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'

// The module reaches for `protocol` and `net` at call time only, but importing it still pulls
// Electron in — and there is no Electron under Vitest.
vi.mock('electron', () => ({ net: {}, protocol: {} }))

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@main/log', () => ({ log }))

// The journal is mocked at module scope: a case that asserts on it must not be reading what the
// case before it left behind.
beforeEach(() => vi.clearAllMocks())

const { assetFilePath, exportFileOf, posterFileOf, servedFileOf, servedPath } =
  await import('./protocol')
const { ASSET_HOST, POSTER_HOST } = await import('@shared/domain/asset')
const { FAVORITE_HOST } = await import('@shared/domain/favorite')

const asset = (fields: Partial<Asset>): Asset => ({
  id: 'asset-1',
  name: 'Rush',
  type: 'video',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...fields,
})

const PROJECT = resolve('/projects/My project')

describe('asset file resolution', () => {
  it('resolves a path stored by the catalogue', () => {
    expect(assetFilePath(PROJECT, 'assets/img/asset_1.png')).toBe(
      join(PROJECT, 'assets/img/asset_1.png'),
    )
  })

  // The catalogue is a file in a folder the user can edit: what it holds is not trusted.
  it('refuses a path escaping the project', () => {
    expect(assetFilePath(PROJECT, '../../.ssh/id_rsa')).toBeNull()
    expect(assetFilePath(PROJECT, 'assets/../../secrets/.env')).toBeNull()
  })

  it('refuses an absolute path', () => {
    expect(assetFilePath(PROJECT, '/etc/passwd')).toBeNull()
  })

  it('refuses the project folder itself', () => {
    expect(assetFilePath(PROJECT, '.')).toBeNull()
    expect(assetFilePath(PROJECT, '')).toBeNull()
  })
})

describe('what the scheme serves for an asset', () => {
  it('serves a file the project owns', () => {
    const path = servedFileOf(PROJECT, asset({ path: 'assets/img/asset_1.png' }))
    expect(path).toBe(join(PROJECT, 'assets/img/asset_1.png'))
  })

  it('serves the proxy of a file the project owns, so a 4K generation does not freeze the monitor', () => {
    const generated = asset({
      path: 'Video/take.mp4',
      proxyPath: '.index/proxies/a.mp4',
      probe: { duration: 1, codec: 'avc1', width: 3840, height: 2160 },
    })
    expect(servedFileOf(PROJECT, generated)).toBe(join(PROJECT, '.index/proxies/a.mp4'))
  })

  it('serves the proxy of a linked rush, which is the point of making one', () => {
    // ProRes is not something WebCodecs decodes: served as is, the monitor would stay black.
    const linked = asset({ sourcePath: '/Volumes/Rushes/a.mov', proxyPath: '.index/proxies/a.mp4' })
    expect(servedFileOf(PROJECT, linked)).toBe(join(PROJECT, '.index/proxies/a.mp4'))
  })

  it('serves a linked file where it lies, since linking is not copying', () => {
    const linked = asset({ sourcePath: '/Volumes/Rushes/a.mov' })
    expect(servedFileOf(PROJECT, linked)).toBe('/Volumes/Rushes/a.mov')
  })

  it('refuses a linked path that is not absolute, which no picker ever returns', () => {
    expect(servedFileOf(PROJECT, asset({ sourcePath: '../../.ssh/id_rsa' }))).toBeNull()
  })

  it('serves nothing for an asset that has no file yet', () => {
    expect(servedFileOf(PROJECT, asset({}))).toBeNull()
  })
})

describe('what an export composites from', () => {
  it('takes the original of a WebCodecs-readable file, even when a proxy exists', () => {
    const generated = asset({
      path: 'Video/take.mp4',
      proxyPath: '.index/proxies/a.mp4',
      probe: { duration: 1, codec: 'h264', width: 3840, height: 2160 },
    })
    expect(exportFileOf(PROJECT, generated)).toBe(join(PROJECT, 'Video/take.mp4'))
  })

  it('takes the proxy of a ProRes the project copied in, or the monitor would stay black', () => {
    const copied = asset({
      path: 'Video/take.mov',
      proxyPath: '.index/proxies/a.mp4',
      probe: { duration: 1, codec: 'prores', width: 3840, height: 2160 },
    })
    expect(exportFileOf(PROJECT, copied)).toBe(join(PROJECT, '.index/proxies/a.mp4'))
  })
})

/**
 * A mesh's own file is a `.glb`, and a `<img>` given one draws a broken tile. The still written
 * beside it answers on its own host, which is why this resolution is separate rather than a
 * fourth fallback inside `servedFileOf`.
 */
describe('what the scheme serves as a still', () => {
  it('serves the still written beside an asset', () => {
    const mesh = asset({
      type: 'mesh',
      path: 'assets/3d/a.glb',
      posterPath: '.index/posters/a.jpg',
    })

    expect(posterFileOf(PROJECT, mesh)).toBe(join(PROJECT, '.index/posters/a.jpg'))
  })

  // Answering with the model itself is exactly the broken tile this replaces.
  it('never falls back to the asset the still stands for', () => {
    expect(posterFileOf(PROJECT, asset({ type: 'mesh', path: 'assets/3d/a.glb' }))).toBeNull()
  })

  // Same containment as everywhere else: a stored path is user-editable territory.
  it('refuses a still path escaping the project', () => {
    expect(posterFileOf(PROJECT, asset({ posterPath: '../../.ssh/id_rsa' }))).toBeNull()
  })
})

/**
 * One scheme, two hosts: a row of the open project's catalogue, and a still kept outside every
 * project. Resolved by different means, so the routing has to tell them apart — the wrong
 * resolver would answer 404 on a file that is plainly there.
 */
describe('routing a URL of the scheme', () => {
  const resolveAsset = vi.fn(() => Promise.resolve('/projects/a/assets/img/asset_1.png'))
  const resolveFavorite = vi.fn(() => Promise.resolve('/userData/favorites/favorite_1.png'))
  const resolvePoster = vi.fn(() => Promise.resolve('/projects/a/.index/posters/asset_1.jpg'))
  const resolvers = {
    [ASSET_HOST]: resolveAsset,
    [FAVORITE_HOST]: resolveFavorite,
    [POSTER_HOST]: resolvePoster,
  }

  // One id, two files: the model and the picture of it. Only the host tells them apart.
  it('sends the same identifier to a different file on the poster host', async () => {
    await expect(servedPath('ai-desktop-studio://poster/asset_1', resolvers)).resolves.toBe(
      '/projects/a/.index/posters/asset_1.jpg',
    )
    expect(resolvePoster).toHaveBeenCalledWith('asset_1')
    expect(resolveAsset).not.toHaveBeenCalled()
  })

  it('sends an asset to the catalogue and a favourite to the folder beside the settings', async () => {
    await expect(servedPath('ai-desktop-studio://asset/asset_1', resolvers)).resolves.toBe(
      '/projects/a/assets/img/asset_1.png',
    )
    expect(resolveAsset).toHaveBeenCalledWith('asset_1')

    await expect(servedPath('ai-desktop-studio://favorite/favorite_1', resolvers)).resolves.toBe(
      '/userData/favorites/favorite_1.png',
    )
    expect(resolveFavorite).toHaveBeenCalledWith('favorite_1')
  })

  /**
   * A plain object carries `Object.prototype`, so every one of its keys would be a live host —
   * `ai-desktop-studio://toString/x` reached `net.fetch` with a path nobody registered.
   */
  it('serves nothing for a host that is only inherited', async () => {
    await expect(servedPath('ai-desktop-studio://toString/x', resolvers)).resolves.toBeNull()
    await expect(servedPath('ai-desktop-studio://constructor/x', resolvers)).resolves.toBeNull()
    await expect(servedPath('ai-desktop-studio://__proto__/x', resolvers)).resolves.toBeNull()
  })

  /**
   * A `protocol.handle` cannot let anything fly: left to travel, a rejection reaches the window
   * as a network error rather than as a 404, and the tile that meets one keeps the icon.
   */
  it('serves nothing when a resolver refuses, however it refuses', async () => {
    const rejecting = { [ASSET_HOST]: () => Promise.reject(new Error('broke')) }
    // A resolver that throws before any promise exists — `project.catalog()` does exactly this.
    const throwing = {
      [ASSET_HOST]: () => {
        throw new Error('broke')
      },
    }

    await expect(servedPath('ai-desktop-studio://asset/asset_1', rejecting)).resolves.toBeNull()
    await expect(servedPath('ai-desktop-studio://asset/asset_1', throwing)).resolves.toBeNull()
  })

  /**
   * The ordinary refusal — a project left while a grid still asks for its stills — is the
   * RESOLVER's to absorb, since only it can tell it from a defect. What reaches here is therefore
   * a resolver that broke, and a 404 is the only trace it will ever leave outside the journal.
   */
  it('journals a resolver that refuses as a defect, not as a missing file', async () => {
    await servedPath('ai-desktop-studio://asset/asset_1', {
      [ASSET_HOST]: () => Promise.reject(new TypeError('find is not a function')),
    })

    expect(log.error).toHaveBeenCalledWith('assets', expect.stringContaining('asset/asset_1'))
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('serves nothing for a host neither resolver knows', async () => {
    await expect(servedPath('ai-desktop-studio://something-else/1', resolvers)).resolves.toBeNull()
    await expect(servedPath('https://example.com/1', resolvers)).resolves.toBeNull()
  })
})
