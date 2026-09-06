import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import type { Asset } from '@shared/domain/asset'
import type { CloudAsset } from '@shared/domain/cloudAsset'
import { invoke as invokeChannel, resetHandlers } from '@main/ipc/testHarness'
import { NotAuthenticatedError, recordFailuresTo } from '@main/provider/client'
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
    projectPath: () => '/project',
    catalog: () => catalog,
    remote: overrides.open ?? (() => remote),
    cloud: () => cloud,
    captionArrivals: async () => {},
    describeAssets: async assets => {
      described.push(...assets)
      return assets.length
    },
    removeFile: async asset => {
      calls.removedFiles.push(asset.id)
    },
    // This harness proves the handler moves the file before its catalogue row.
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

describe('what a decorative band is allowed to write in the journal', () => {
  afterEach(() => recordFailuresTo(null))

  it('leaves the journal alone when a shelf is refused', async () => {
    // The journal is what one opens after a job went wrong. A band that polls on its own would
    // fill it with requests nobody made, and the push that really failed scrolls off the top.
    //
    // `cloudBrowse` is in here too: it reads like a browser's channel, but both of its callers
    // are shelves of the home, and the lookalikes band opens on one of them.
    const noted: string[] = []
    recordFailuresTo((_scope, detail) => noted.push(detail))

    setup({
      remote: {
        search: () => Promise.reject(new Error('429 too many requests')),
        list: () => Promise.reject(new Error('429 too many requests')),
      },
    })

    await expect(invoke(CHANNELS.cloudExplore, { type: 'image' })).rejects.toThrow()
    await expect(invoke(CHANNELS.cloudSimilar, 'asset_1')).rejects.toThrow()
    await expect(invoke(CHANNELS.cloudBrowse, {})).rejects.toThrow()
    expect(noted).toEqual([])
  })

  /**
   * No key yet: there is no library to list. Refusing the handler used to dump a stack in the
   * terminal — Electron logs every rejection — for a band that polls as it appears.
   */
  it('answers empty when no key is in place, rather than refusing the handler', async () => {
    setup({
      open: () => {
        throw new NotAuthenticatedError()
      },
    })

    await expect(invoke(CHANNELS.cloudBrowse, {})).resolves.toEqual({ assets: [], cursor: null })
    await expect(invoke(CHANNELS.cloudExplore, { type: 'image' })).resolves.toEqual({
      assets: [],
      cursor: null,
    })
    await expect(invoke(CHANNELS.cloudSimilar, 'asset_1')).resolves.toEqual([])
  })

  it('still refuses a pull when no key is in place', async () => {
    setup({
      open: () => {
        throw new NotAuthenticatedError()
      },
    })

    await expect(invoke(CHANNELS.cloudPull, ['remote_1'])).rejects.toThrow('missing')
  })

  it('still writes it for a call the user did make', async () => {
    // The contrast is the point: silence belongs to the reads nobody asked for, not to every
    // failure. Deleting a selection is a gesture, and its refusal belongs in the journal.
    const noted: string[] = []
    recordFailuresTo((_scope, detail) => noted.push(detail))

    const harness = setup({
      remote: { deleteMany: () => Promise.reject(new Error('429 too many requests')) },
    })
    await harness.catalog.add(localAsset({ remoteAssetId: 'remote_1' }))

    await expect(invoke(CHANNELS.assetsRemove, ['asset_1'], true)).rejects.toThrow()
    expect(noted).toHaveLength(1)
  })

  it('still tells the caller it was refused rather than answering an empty band', async () => {
    // An empty answer would be indistinguishable from an account that holds nothing alike, and
    // the shelf would take itself off the page until the key changes.
    setup({ remote: { search: () => Promise.reject(new Error('503')) } })

    await expect(invoke(CHANNELS.cloudSimilar, 'asset_1')).rejects.toThrow()
  })
})

describe('renaming and tagging', () => {
  let harness: Harness

  beforeEach(() => {
    harness = setup()
  })

  it('changes only what was named', async () => {
    await harness.catalog.add(localAsset({ tags: ['stone'] }))
    const updated = await invoke<Asset>(CHANNELS.assetsUpdate, 'asset_1', { name: 'Rock' })

    expect(updated).toMatchObject({ name: 'Rock', tags: ['stone'] })
  })

  /**
   * The correction the extension cannot make: a normal map and an albedo are both PNGs. The row
   * is what remembers it, and the FILE does not move — a row carries its own path, and what the
   * studio calls a picture has never been decided by the folder it sits in.
   */
  it('writes what a file is, leaving the file where it is', async () => {
    await harness.catalog.add(localAsset({ type: 'image', path: 'Repérages/ruelle.png' }))

    const updated = await invoke<Asset>(CHANNELS.assetsUpdate, 'asset_1', { type: 'image' })

    expect(updated).toMatchObject({ type: 'image', path: 'Repérages/ruelle.png' })
  })

  it('tells the library which tags moved, not the whole set', async () => {
    await harness.catalog.add(localAsset({ tags: ['stone', 'draft'], remoteAssetId: 'remote_1' }))
    await invoke(CHANNELS.assetsUpdate, 'asset_1', { tags: ['stone', 'hero'] })

    expect(harness.tagged[0]).toEqual({ assetId: 'remote_1', add: ['hero'], remove: ['draft'] })
  })

  it('keeps the local change when the library cannot be told', async () => {
    // The tags are the project's own first; a network that is down must not lose the edit.
    const offline = setup({
      remote: { updateTags: () => Promise.reject(new Error('offline')) },
    })
    await offline.catalog.add(localAsset({ remoteAssetId: 'remote_1' }))

    const updated = await invoke<Asset>(CHANNELS.assetsUpdate, 'asset_1', { tags: ['hero'] })
    expect(updated.tags).toEqual(['hero'])
  })

  it('says so rather than inventing a row for an asset that is gone', async () => {
    await expect(invoke(CHANNELS.assetsUpdate, 'asset_gone', { name: 'x' })).rejects.toThrow()
  })

  /**
   * The whole of this change: the shelf read « je veux un model avec son skeleton » where the
   * explorer read `asset_40f76c36-8ad4-….png`, and renaming wrote the catalogue alone — so the
   * two only ever drifted further apart.
   */
  it('moves the file with the name, and files it where it landed', async () => {
    await harness.catalog.add(localAsset({ path: 'assets/img/asset_1.png' }))

    const updated = await invoke<Asset>(CHANNELS.assetsUpdate, 'asset_1', { name: 'Ruelle' })

    expect(harness.renamedFiles).toEqual([{ id: 'asset_1', name: 'Ruelle' }])
    expect(updated).toMatchObject({ name: 'Ruelle', path: 'assets/img/Ruelle.png' })
  })

  /**
   * An animation wears its FOLDER's name, and its still lives inside that folder — so the still
   * travelled with the rename without anyone naming it. Recomposed rather than reported: the row
   * would otherwise keep pointing into a folder that no longer exists, and the tile go blank.
   */
  it('carries an animation’s still into the folder the rename moved', async () => {
    const moved = setup({
      renameFile: async () => 'assets/img/Saut/animation.glb',
    })
    await moved.catalog.add(
      localAsset({
        type: 'animation',
        path: 'assets/img/Jump/animation.glb',
        posterPath: 'assets/img/Jump/thumb.png',
        convertedFrom: 'assets/img/Jump/.sources/Jump.fbx',
      }),
    )

    const updated = await invoke<Asset>(CHANNELS.assetsUpdate, 'asset_1', { name: 'Saut' })

    expect(updated).toMatchObject({
      path: 'assets/img/Saut/animation.glb',
      posterPath: 'assets/img/Saut/thumb.png',
      convertedFrom: 'assets/img/Saut/.sources/Jump.fbx',
    })
  })

  it('leaves the file alone when only the tags changed', async () => {
    await harness.catalog.add(localAsset({ path: 'assets/img/asset_1.png' }))
    await invoke(CHANNELS.assetsUpdate, 'asset_1', { tags: ['hero'] })

    expect(harness.renamedFiles).toEqual([])
  })

  /** A linked rush keeps its bytes where the user left them, and its row keeps the path it had —
   * `undefined` from the move must not erase it.
   */
  it('keeps the path of an asset whose file is not ours to move', async () => {
    const renameFile = async (): Promise<undefined> => undefined
    const linked = setup({ renameFile })
    await linked.catalog.add(localAsset({ path: 'assets/img/asset_1.png' }))

    const updated = await invoke<Asset>(CHANNELS.assetsUpdate, 'asset_1', { name: 'Prise 4' })
    expect(updated).toMatchObject({ name: 'Prise 4', path: 'assets/img/asset_1.png' })
  })

  /**
   * Refused rather than cleaned on the way to the disk: `safeFileName` would turn `Vue 3/4` into
   * `Vue 3 4` in the folder while the catalogue kept the slash — the two names apart again.
   */
  it('refuses a name no file system would hold', async () => {
    await harness.catalog.add(localAsset({ path: 'assets/img/asset_1.png' }))

    await expect(invoke(CHANNELS.assetsUpdate, 'asset_1', { name: 'Vue 3/4' })).rejects.toThrow(
      'invalid',
    )
    expect(harness.renamedFiles).toEqual([])
  })

  /** The row must not be renamed over a move that failed: it would name a file that is gone. */
  it('leaves the row untouched when the folder refused the move', async () => {
    const clash = setup({
      renameFile: () => Promise.reject(new Error('duplicate')),
    })
    await clash.catalog.add(localAsset({ name: 'Ruelle', path: 'assets/img/Ruelle.png' }))

    await expect(invoke(CHANNELS.assetsUpdate, 'asset_1', { name: 'Photo' })).rejects.toThrow(
      'duplicate',
    )
    expect(await clash.catalog.find('asset_1')).toMatchObject({ name: 'Ruelle' })
  })
})

describe('removing assets', () => {
  let harness: Harness

  beforeEach(() => {
    harness = setup()
  })

  it('refuses rollback from a different project without touching this project', async () => {
    await harness.catalog.add(localAsset())
    await expect(invoke(CHANNELS.assetsRemove, ['asset_1'], false, '/old-project')).rejects.toThrow(
      'project',
    )
    expect(harness.removedFiles).toEqual([])
    expect(await harness.catalog.find('asset_1')).not.toBeNull()
  })

  it('drops the row and the file it owns', async () => {
    await harness.catalog.add(localAsset())
    await invoke(CHANNELS.assetsRemove, ['asset_1'], false)

    expect(harness.removedFiles).toEqual(['asset_1'])
    expect(await harness.catalog.find('asset_1')).toBeNull()
  })

  it('leaves the library alone unless it was asked', async () => {
    await harness.catalog.add(localAsset({ remoteAssetId: 'remote_1' }))
    await invoke(CHANNELS.assetsRemove, ['asset_1'], false)

    expect(harness.deleted).toHaveLength(0)
  })

  it('deletes the twins before the rows that point at them', async () => {
    // A row dropped first leaves nothing saying what to delete on the other side.
    await harness.catalog.add(localAsset({ remoteAssetId: 'remote_1' }))
    await invoke(CHANNELS.assetsRemove, ['asset_1'], true)

    expect(harness.deleted).toEqual([['remote_1']])
    expect(await harness.catalog.find('asset_1')).toBeNull()
  })
})

describe('moving assets between the two sides', () => {
  let harness: Harness

  beforeEach(() => {
    harness = setup()
  })

  it('brings down each asset in turn rather than all at once', async () => {
    await invoke(CHANNELS.cloudPull, ['remote_1', 'remote_2'])
    expect(harness.pulled).toEqual(['remote_1', 'remote_2'])
  })

  it('keeps the assets it did bring down when one of them fails', async () => {
    // The bytes of the first are already on disk and its row already added; a single rejection
    // would leave the caller unable to say which ids made it.
    const flaky = setup()
    flaky.cloud.pull = asset => {
      if (asset.id === 'remote_2') return Promise.reject(new Error('not-found'))
      return Promise.resolve(localAsset({ id: `local_${asset.id}` }))
    }

    const outcomes = await invoke<{ assetId: string; ok: boolean }[]>(CHANNELS.cloudPull, [
      'remote_1',
      'remote_2',
      'remote_3',
    ])

    expect(outcomes.map(one => [one.assetId, one.ok])).toEqual([
      ['remote_1', true],
      ['remote_2', false],
      ['remote_3', true],
    ])
  })

  it('reports what each push did, successes and failures alike', async () => {
    const flaky = setup({
      push: assetId => {
        if (assetId === 'asset_2') return Promise.reject(new Error('upload-too-large'))
        return Promise.resolve(localAsset({ id: assetId }))
      },
    })
    await flaky.catalog.add(localAsset({ id: 'asset_1' }))
    await flaky.catalog.add(localAsset({ id: 'asset_2' }))

    const outcomes = await invoke<{ assetId: string; ok: boolean }[]>(CHANNELS.cloudPush, [
      'asset_1',
      'asset_2',
    ])

    // One refusal does not hide the one that went up.
    expect(outcomes.map(one => [one.assetId, one.ok])).toEqual([
      ['asset_1', true],
      ['asset_2', false],
    ])
  })

  it('records on the asset why its push failed', async () => {
    const failing = setup({ push: () => Promise.reject(new Error('upload-too-large')) })
    await failing.catalog.add(localAsset())

    await invoke(CHANNELS.cloudPush, ['asset_1'])

    const asset = await failing.catalog.find('asset_1')
    expect(asset?.syncStatus).toBe('error')
    expect(asset?.syncError).toBeTruthy()
  })

  it('plans without sending anything', async () => {
    await harness.catalog.add(localAsset())
    const plan = await invoke<{ summary: Record<string, number> }>(
      CHANNELS.cloudPlan,
      ['asset_1'],
      'push',
    )

    expect(plan.summary).toMatchObject({ push: 1 })
    expect(harness.pushed).toHaveLength(0)
  })

  it('refuses a policy it does not know', async () => {
    await expect(invoke(CHANNELS.cloudPlan, ['asset_1'], 'mirror')).rejects.toThrow()
  })
})
