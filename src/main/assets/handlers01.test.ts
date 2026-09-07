import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import type { Asset } from '@shared/domain/asset'
import type { CloudAsset } from '@shared/domain/cloudAsset'
import { invoke as invokeChannel, resetHandlers } from '@main/ipc/testHarness'
import { createActivityLog, type ActivityLog } from '@main/project/activityLog'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { RemoteAssetCatalog } from '@main/provider/assetCatalog'
import { registerAssetHandlers, type AssetHandlerDeps } from './handlers'
import type { CloudBackend } from './cloudBackend'
import { assetHandlerCalls } from './handlersTestFixtures'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  // The harness answers `unknown`, and every caller knows the shape its own channel returns.
  // A guard here would be a second copy of the contract `shared/ipc.ts` already states.
  const answer: unknown = await invokeChannel(channel, ...args)
  return answer as T
}

function localAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset_1',
    name: 'Boulder',
    type: 'image',
    location: 'local',
    path: 'assets/img/asset_1.png',
    tags: [],
    createdAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

function cloudAsset(id: string): CloudAsset {
  return {
    id,
    name: 'Boulder',
    type: 'image',
    remoteType: 'txt2img',
    ownerId: 'proj_a',
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    privacy: 'private',
    tags: [],
    collectionIds: [],
  }
}

type Harness = {
  catalog: AsyncCatalog
  cloud: CloudBackend
  journal: ActivityLog
  /** The rows the describe channel handed over — what proves the ids were resolved first. */
  described: Asset[]
  listed: unknown[]
  searched: unknown[]
  tagged: unknown[]
  deleted: string[][]
  pulled: string[]
  pushed: string[]
  removedFiles: string[]
  /** The moves a rename ordered, in order — a name is a file name now, and this is that half. */
  renamedFiles: { id: string; name: string }[]
}

function setup(
  overrides: {
    remote?: Partial<RemoteAssetCatalog>
    open?: AssetHandlerDeps['remote']
    push?: CloudBackend['push']
    renameFile?: AssetHandlerDeps['renameFile']
  } = {},
): Harness {
  resetHandlers()
  const catalog = memoryCatalog()
  onTestFinished(catalog.close)
  const calls = assetHandlerCalls()

  const remote: RemoteAssetCatalog = {
    list: request => {
      calls.listed.push(request)
      return Promise.resolve({ assets: [cloudAsset('remote_1')], token: null })
    },
    search: request => {
      calls.searched.push(request)
      return Promise.resolve({ assets: [cloudAsset('remote_2')], token: null })
    },
    getBulk: ids => Promise.resolve(ids.map(cloudAsset)),
    updateTags: (assetId, add, remove) => {
      calls.tagged.push({ assetId, add, remove })
      return Promise.resolve()
    },
    deleteMany: ids => {
      calls.deleted.push([...ids])
      return Promise.resolve()
    },
    downloadUrl: () => Promise.resolve('https://cdn/fresh'),
    ...overrides.remote,
  }

  const cloud: CloudBackend = {
    pull: async asset => {
      calls.pulled.push(asset.id)
      return await catalog.add(localAsset({ id: `local_${asset.id}`, remoteAssetId: asset.id }))
    },
    push:
      overrides.push ??
      (async assetId => {
        calls.pushed.push(assetId)
        const asset = await catalog.find(assetId)
        if (!asset) throw new Error('missing')
        return asset
      }),
  }

  // The real one, on the same in-memory catalogue: what reaches the journal is part of what a
  // handler does, and a spy would only prove the call was made.
  const journal = createActivityLog({
    catalog: () => catalog,
    broadcast: () => {},
    now: () => '2026-08-08T10:00:00.000Z',
  })

  const described: Asset[] = []

  registerAssetHandlers({
    catalog: () => catalog,
    remote: overrides.open ?? (() => remote),
    cloud: () => cloud,
    // The real one is exercised in `autoCaption.test.ts`; here it must only stay out of the way.
    captionArrivals: async () => {},
    describeAssets: async assets => {
      described.push(...assets)
      return assets.length
    },
    removeFile: async asset => {
      calls.removedFiles.push(asset.id)
    },
    // The disk itself is exercised in `assetFile.test.ts`; what this harness has to show is
    // that the handler moves the file BEFORE the row, and files the path it comes back with.
    renameFile:
      overrides.renameFile ??
      (async (asset, name) => {
        calls.renamedFiles.push({ id: asset.id, name })
        return asset.path ? `assets/img/${name}.png` : undefined
      }),
    activeOwnerId: () => 'proj_a',
    journal: () => journal,
  })

  return {
    catalog,
    cloud,
    journal,
    described,
    ...calls,
  }
}

describe('browsing the library', () => {
  let harness: Harness

  beforeEach(() => {
    harness = setup()
  })

  it('takes the plain listing when nothing needs the search index', async () => {
    await invoke(CHANNELS.cloudBrowse, { types: ['mesh'] })

    expect(harness.searched).toHaveLength(0)
    expect(harness.listed[0]).toMatchObject({ types: expect.arrayContaining(['img23d']) })
  })

  it('takes the search index for a tag, which the listing cannot answer', async () => {
    // `GET /assets?tags=` honours tags for public assets only — search is the only way.
    await invoke(CHANNELS.cloudBrowse, { tags: ['hero'] })

    expect(harness.listed).toHaveLength(0)
    expect(harness.searched[0]).toMatchObject({ filter: 'tags = "hero"' })
  })

  it('takes the search index for free text', async () => {
    await invoke(CHANNELS.cloudBrowse, { text: 'boulder' })
    expect(harness.searched[0]).toMatchObject({ query: 'boulder' })
  })

  it('keeps newest-first when the index answers in the listing place', async () => {
    // Left to itself the index ranks by relevance, and the shelf merges this source with two
    // others on `createdAt` alone: typing a word would reorder one lane of three.
    await invoke(CHANNELS.cloudBrowse, { text: 'boulder' })
    expect(harness.searched[0]).toMatchObject({ sortBy: ['createdAt:desc'] })
  })

  it('asks for no order at all when the caller searches for what fits best', async () => {
    // Relevance is never a value the API is told — it refuses `score` as a sort field — but the
    // ranking it applies when nothing overrules it. An agent asking for stone textures wants it.
    await invoke(CHANNELS.cloudBrowse, { text: 'boulder', order: 'relevance' })
    expect(harness.searched[0]).not.toHaveProperty('sortBy')
  })

  it('marks a ranked page apart from a stamped one', async () => {
    setup({ remote: { search: () => Promise.resolve({ assets: [], token: '40' }) } })

    const stamped = await invoke<{ cursor: string | null }>(CHANNELS.cloudBrowse, { text: 'a' })
    const ranked = await invoke<{ cursor: string | null }>(CHANNELS.cloudBrowse, {
      text: 'a',
      order: 'relevance',
    })

    expect(stamped.cursor).toBe('o:40')
    expect(ranked.cursor).toBe('r:40')
  })

  it('reads a ranked cursor in the order it was made, not in the one the query asks for', async () => {
    // A client that forgets to repeat `order` would otherwise take offset 40 of one ranking for
    // the next page of another: rows repeated, rows never seen, and nothing to notice it by.
    await invoke(CHANNELS.cloudBrowse, { text: 'boulder', cursor: 'r:40' })

    expect(harness.searched[0]).not.toHaveProperty('sortBy')
    expect(harness.searched[0]).toMatchObject({ offset: 40 })
  })

  it('keeps newest-first for a relevance asked with no words to rank by', async () => {
    // Over an unqueried index, relevance is not a ranking — it is whatever order the shard
    // answers in, which is worse than the stamp for every reader.
    await invoke(CHANNELS.cloudBrowse, { tags: ['hero'], order: 'relevance' })
    expect(harness.searched[0]).toMatchObject({ sortBy: ['createdAt:desc'] })
  })

  it('narrows a search too, not only a listing', async () => {
    // The index knows the API's eight media classes, not our six: asking for skies through it
    // comes back as every image, and only this filter tells them apart.
    setup({
      remote: {
        search: () =>
          Promise.resolve({
            assets: [{ ...cloudAsset('a'), type: 'skybox' }, cloudAsset('b')],
            token: null,
          }),
      },
    })

    const page = await invoke<{ assets: CloudAsset[] }>(CHANNELS.cloudBrowse, {
      text: 'sunset',
      types: ['skybox'],
    })
    expect(page.assets.map(asset => asset.id)).toEqual(['a'])
  })

  it('narrows here what the API could not narrow itself', async () => {
    // Asking for pictures sends no type filter at all, so the page may hold other kinds.
    setup({
      remote: {
        list: () =>
          Promise.resolve({
            assets: [cloudAsset('a'), { ...cloudAsset('b'), type: 'mesh' }],
            token: null,
          }),
      },
    })

    const page = await invoke<{ assets: CloudAsset[] }>(CHANNELS.cloudBrowse, { types: ['image'] })
    expect(page.assets.map(asset => asset.id)).toEqual(['a'])
  })

  it('refuses a page larger than the API allows', async () => {
    await expect(invoke(CHANNELS.cloudBrowse, { pageSize: 5000 })).rejects.toThrow()
  })
})

describe('the public feed', () => {
  let harness: Harness

  beforeEach(() => {
    harness = setup()
  })

  it('searches what everyone published, newest first', async () => {
    await invoke(CHANNELS.cloudExplore, { type: 'image' })

    // Never the plain listing: `GET /assets` answers for this key alone.
    expect(harness.listed).toHaveLength(0)
    expect(harness.searched[0]).toMatchObject({
      publicFeed: true,
      sortBy: ['createdAt:desc'],
      offset: 0,
    })
  })

  it('looks for what was typed, keeping the order the shelf merges on', async () => {
    await invoke(CHANNELS.cloudExplore, { type: 'image', text: 'dragon' })

    // The order stands with a text as without one: the shelf interleaves this feed with the
    // library and the project on `createdAt`, and a page ranked by relevance carries no stamp
    // that merge could place.
    expect(harness.searched[0]).toMatchObject({
      query: 'dragon',
      publicFeed: true,
      sortBy: ['createdAt:desc'],
    })
  })

  it('asks for the whole feed when nothing was typed', async () => {
    await invoke(CHANNELS.cloudExplore, { type: 'image', text: '   ' })
    expect(harness.searched[0]).not.toHaveProperty('query')
  })

  it('leaves out anything the API flagged', async () => {
    await invoke(CHANNELS.cloudExplore, { type: 'video' })
    expect(harness.searched[0]).toMatchObject({ filter: expect.stringContaining('nsfw IS EMPTY') })
  })

  it('types the hits again, because the filter casts wider than the studio decides', async () => {
    setup({
      remote: {
        search: () =>
          Promise.resolve({
            assets: [{ ...cloudAsset('a'), type: 'skybox' }, cloudAsset('b')],
            token: null,
          }),
      },
    })

    const page = await invoke<{ assets: CloudAsset[] }>(CHANNELS.cloudExplore, { type: 'skybox' })
    expect(page.assets.map(asset => asset.id)).toEqual(['a'])
  })

  // The thumbnail a hit does not carry is filled in by `cloudAssetOfHit`, one layer down — see
  // `assetNormalizer.test.ts` and `assetCatalog.test.ts`. The fake catalogue here answers with
  // `CloudAsset`s directly, so it never crosses that reader.

  it('walks past a page the retyping emptied rather than reporting the end', async () => {
    // The filter casts wider than the studio decides, so a whole page can fall to it. Handed up
    // empty, it reads as the end of the feed: the grid does not ask again on an empty grid.
    let round = 0
    setup({
      remote: {
        search: () => {
          round += 1
          const dropped: CloudAsset = { ...cloudAsset('a'), type: 'video' }
          const assets = round === 1 ? [dropped] : [cloudAsset('b')]
          return Promise.resolve({ assets, token: String(round * 40) })
        },
      },
    })

    const page = await invoke<{ assets: CloudAsset[] }>(CHANNELS.cloudExplore, { type: 'image' })
    expect(page.assets.map(asset => asset.id)).toEqual(['b'])
  })

  it('gives up after a few empty rounds rather than walking the whole index', async () => {
    const audioAsset: CloudAsset = { ...cloudAsset('a'), type: 'audio' }
    // A kind nobody has published would otherwise cost a search quota per page, to the end.
    const { searched } = setup({
      remote: {
        search: () => Promise.resolve({ assets: [audioAsset], token: '40' }),
      },
    })

    const page = await invoke<{ assets: CloudAsset[]; cursor: string | null }>(
      CHANNELS.cloudExplore,
      { type: 'image' },
    )
    expect(page.assets).toEqual([])
    expect(searched.length).toBeLessThanOrEqual(3)
    // The cursor stays live on purpose: the feed is not over, this handler simply stopped
    // spending quota on it. `useExplore` is what carries on from here.
    expect(page.cursor).not.toBeNull()
  })

  it('walks by offset, and marks the cursor as the index produced it', async () => {
    setup({
      remote: { search: () => Promise.resolve({ assets: [cloudAsset('a')], token: '40' }) },
    })

    const page = await invoke<{ cursor: string | null }>(CHANNELS.cloudExplore, { type: 'image' })
    expect(page.cursor).toBe('o:40')
  })

  it('reads back the offset it handed out', async () => {
    await invoke(CHANNELS.cloudExplore, { type: 'image', cursor: 'o:40' })
    expect(harness.searched[0]).toMatchObject({ offset: 40 })
  })

  it('caps how far into the index a cursor may point', async () => {
    // `o:1e99` passes validation — it is a short string — and asks the index for an offset no
    // index can answer for.
    await invoke(CHANNELS.cloudExplore, { type: 'image', cursor: 'o:1e99' })

    const asked = harness.searched[0]
    expect(asked).toMatchObject({ offset: 10_000 })
  })

  it('bounds the offset it walks to itself, not only the one handed in', async () => {
    // The empty-round loop reads the API's own token back as an offset, and that token is just
    // as much an outside value as the cursor. Recorded HERE and not through the harness: this
    // override replaces the `search` the harness records through, so its log would stay empty
    // and an assertion over it would hold vacuously.
    const offsets: unknown[] = []
    setup({
      remote: {
        search: request => {
          offsets.push(request.offset)
          return Promise.resolve({
            assets: [{ ...cloudAsset('a'), type: 'audio' }],
            token: 'later',
          })
        },
      },
    })

    await invoke(CHANNELS.cloudExplore, { type: 'image' })

    expect(offsets.length).toBeGreaterThan(0)
    expect(offsets.every(offset => Number.isFinite(offset))).toBe(true)
  })

  it('stops walking once the offset can no longer move', async () => {
    // A token the bound clamps, or one that is not a number, asks the index the very same
    // question again — and the search is billed either way.
    const offsets: number[] = []
    setup({
      remote: {
        search: request => {
          offsets.push(request.offset)
          return Promise.resolve({
            assets: [{ ...cloudAsset('a'), type: 'audio' }],
            token: 'not-a-number',
          })
        },
      },
    })

    await invoke(CHANNELS.cloudExplore, { type: 'image' })
    expect(offsets).toEqual([0])
  })

  it('refuses a feed of everything: the masonry shows one kind at a time', async () => {
    await expect(invoke(CHANNELS.cloudExplore, {})).rejects.toThrow()
  })
})

describe('what resembles an asset the caller names', () => {
  it('measures the likeness against the asset it was given', async () => {
    // Never against a reference chosen here: "the library's most recent" is what the HOME wants,
    // and baking it in left the channel unusable for a right-click on some other asset.
    const harness = setup()
    await invoke(CHANNELS.cloudSimilar, 'asset_named')

    expect(harness.listed).toHaveLength(0)
    expect(harness.searched[0]).toMatchObject({ like: ['asset_named'], publicFeed: true })
  })

  it('asks for no order at all, since the API ranks by likeness', async () => {
    // Naming a sort on a semantic search silently drops the ranking that is the whole point.
    const harness = setup()
    await invoke(CHANNELS.cloudSimilar, 'asset_named')

    expect(harness.searched[0]).not.toHaveProperty('sortBy')
  })

  it('takes the reference back out of its own results', async () => {
    // The API answers with the reference itself, at the top.
    setup({
      remote: {
        search: () =>
          Promise.resolve({ assets: [cloudAsset('ref'), cloudAsset('other')], token: null }),
      },
    })

    const assets = await invoke<CloudAsset[]>(CHANNELS.cloudSimilar, 'ref')
    expect(assets.map(asset => asset.id)).toEqual(['other'])
  })

  it('refuses an empty reference rather than asking the index for nothing', async () => {
    setup()
    await expect(invoke(CHANNELS.cloudSimilar, '')).rejects.toThrow()
  })
})
