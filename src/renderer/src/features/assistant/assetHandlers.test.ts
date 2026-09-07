import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAssetCounts, type Asset } from '@shared/domain/asset'
import { installFakeBridge } from '@/services/fakeBridge'
import { runAction } from './executor'

const ASSET: Asset = {
  id: 'asset-1',
  name: 'Boulder',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-17T10:00:00.000Z',
}

beforeEach(() => {
  installFakeBridge()
})

describe('searching the library', () => {
  it('passes only the narrowings it was given', async () => {
    const search = vi.fn(async () => [])
    installFakeBridge({ assets: { search } })

    await runAction('assets.searchProjectCatalogue', {
      text: 'stone',
      type: 'image',
      tags: ['pbr'],
      limit: 10,
    })
    expect(search).toHaveBeenCalledWith({
      text: 'stone',
      type: 'image',
      tags: ['pbr'],
      limit: 10,
    })

    await runAction('assets.searchProjectCatalogue', {})
    expect(search).toHaveBeenLastCalledWith({})
  })

  /**
   * "Everything that was NOT generated" is a question the catalogue does not answer, so the flag
   * only ever travels affirmatively — `generated: false` would silently mean "no filter" and
   * hand back imports as well.
   */
  it('asks about generated assets only when asked to', async () => {
    const search = vi.fn(async () => [])
    installFakeBridge({ assets: { search } })

    await runAction('assets.searchProjectCatalogue', { generated: true })
    expect(search).toHaveBeenCalledWith({ generated: true })

    await runAction('assets.searchProjectCatalogue', { generated: false })
    expect(search).toHaveBeenLastCalledWith({})
  })

  // The measure this answers is on `searchAssets`.
  it('answers what the project holds when nothing matched', async () => {
    const counts = emptyAssetCounts()
    installFakeBridge({
      assets: { search: vi.fn(async () => []), counts: vi.fn(async () => counts) },
    })

    expect(await runAction('assets.searchProjectCatalogue', { text: 'nothing' })).toEqual({
      ok: true,
      data: { found: [], projectHolds: counts },
    })
  })

  it('counts the library in the catalogue rather than by listing it', async () => {
    const counts = emptyAssetCounts()
    installFakeBridge({ assets: { counts: vi.fn(async () => counts) } })

    expect(await runAction('assets.counts', {})).toEqual({ ok: true, data: counts })
  })
})

describe('reading and correcting an asset', () => {
  /**
   * Through the catalogue, NOT through `assets.captionImages` — that one is the captioning channel
   * and calls the API. Reading a generation's output must cost nothing.
   */
  it('reads the ids a finished generation handed back, out of the catalogue', async () => {
    const search = vi.fn(async () => [])
    installFakeBridge({ assets: { search } })

    await runAction('asset.get', { assetIds: ['asset-1', 'asset-2'] })
    expect(search).toHaveBeenCalledWith({ ids: ['asset-1', 'asset-2'], limit: 2 })
  })

  /**
   * Tags are replaced whole by the channel, so an empty list is a real instruction — "clear
   * them" — and an absent field is "leave them alone". Reading the KEY rather than the list is
   * what tells the two apart.
   */
  it('clears tags when given an empty list, and leaves them alone when given none', async () => {
    const update = vi.fn(async () => ASSET)
    installFakeBridge({ assets: { update } })

    await runAction('asset.update', { assetId: 'asset-1', tags: [] })
    expect(update).toHaveBeenCalledWith('asset-1', { tags: [] })

    await runAction('asset.update', { assetId: 'asset-1', name: 'Stone' })
    expect(update).toHaveBeenLastCalledWith('asset-1', { name: 'Stone' })
  })

  it('refuses a change that changes nothing rather than writing an empty one', async () => {
    const update = vi.fn(async () => ASSET)
    installFakeBridge({ assets: { update } })

    expect(await runAction('asset.update', { assetId: 'asset-1' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('removes assets locally, and remotely only when asked', async () => {
    const remove = vi.fn(async () => {})
    installFakeBridge({ assets: { remove } })

    await runAction('assets.removeFromLibrary', { assetIds: ['asset-1'] })
    expect(remove).toHaveBeenCalledWith(['asset-1'], false)

    await runAction('assets.removeFromLibrary', { assetIds: ['asset-1'], alsoRemote: true })
    expect(remove).toHaveBeenLastCalledWith(['asset-1'], true)
  })

  it('refuses an empty list rather than calling the channel with one', async () => {
    const remove = vi.fn(async () => {})
    installFakeBridge({ assets: { remove } })

    expect(await runAction('assets.removeFromLibrary', { assetIds: [] })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('correcting what the library holds', () => {
  it('captions images through the API, answering how many it named', async () => {
    const describe = vi.fn(async () => 2)
    installFakeBridge({ assets: { describe } })

    expect(await runAction('assets.captionImages', { assetIds: ['a', 'b'] })).toEqual({
      ok: true,
      data: 2,
    })
    expect(describe).toHaveBeenCalledWith(['a', 'b'])
  })

  it('names the assets whose file has gone', async () => {
    const absent = vi.fn(async () => ['asset-2'])
    installFakeBridge({ assets: { absent } })

    expect(await runAction('assets.listMissing', { assetIds: ['asset-1', 'asset-2'] })).toEqual({
      ok: true,
      data: ['asset-2'],
    })
  })

  it('pulls a model’s textures into the library as assets of their own', async () => {
    const extractTextures = vi.fn(async () => [ASSET])
    installFakeBridge({ assets: { extractTextures } })

    expect(await runAction('asset.extractTextures', { assetId: 'mesh-1' })).toEqual({
      ok: true,
      data: [ASSET],
    })
    expect(extractTextures).toHaveBeenCalledWith('mesh-1')
  })

  /**
   * An asset that lives only in the remote library has no file to show, which the channel
   * answers as `false` — reported as `ok`, a client would believe a window had opened.
   */
  it('says so rather than ok when there is no file to show', async () => {
    installFakeBridge({ assets: { reveal: vi.fn(async () => false) } })

    expect(await runAction('asset.reveal', { assetId: 'asset-1' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})
