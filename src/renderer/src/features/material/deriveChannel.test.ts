import { localizedError } from '@shared/localizedError'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assetUrl, type Asset } from '@shared/domain/asset'
import type { PbrChannel } from '@shared/domain/material'
import type { SaveTextureRequest } from '@shared/ipc'
import { setChannel } from '@/engines/material/commands'
import type { DerivePort, DeriveRequest } from '@/engines/material/derive/derivePort'
import { bridgeWatchingLogs } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { installMaterial } from '@/stores/material-fixtures'
import { materialOf, useMaterials } from '@/stores/materials'
import { deriveMaterialChannel } from './deriveChannel'

const asset = (id: string, name: string): Asset => ({
  id,
  name,
  type: 'image',
  location: 'local',
  path: `assets/${id}.png`,
  tags: [],
  createdAt: '2026-08-09T00:00:00.000Z',
})

const png = new Uint8Array([137, 80, 78, 71])

const channels = () => materialOf(useMaterials.getState(), 'doc-1').channels

const fill = (channel: PbrChannel, assetId: string) =>
  useMaterials
    .getState()
    .runCommand(
      'doc-1',
      setChannel(channel, { assetId, origin: 'imported', width: 512, height: 512 }),
    )

/** The GPU half, replaced: jsdom has neither WebGL nor a PNG encoder. */
const port = () =>
  vi.fn((_request: DeriveRequest) => Promise.resolve({ png, width: 512, height: 512 }))

const saved = () =>
  vi.fn((_request: SaveTextureRequest) => Promise.resolve(asset('derived-1', 'x')))

beforeEach(() => {
  installMaterial('doc-1')
  useAssets.setState({ items: [asset('img-1', 'Brique')] })
})

describe('deriving one channel from another', () => {
  it('puts the computed picture in the channel, badged as derived', async () => {
    bridgeWatchingLogs({ assets: { saveTexture: saved() } })
    fill('height', 'img-1')

    await expect(deriveMaterialChannel('doc-1', 'normal', port())).resolves.toBe(true)

    expect(channels().normal).toEqual({
      assetId: 'derived-1',
      origin: 'derived',
      width: 512,
      height: 512,
    })
  })

  it('reads the source channel the domain names, not the one being written', async () => {
    bridgeWatchingLogs({ assets: { saveTexture: saved() } })
    fill('height', 'img-1')
    const derive = port()

    await deriveMaterialChannel('doc-1', 'normal', derive)

    expect(derive).toHaveBeenCalledWith({ channel: 'normal', sourceUrl: assetUrl('img-1') })
  })

  /**
   * The channel travels with the bytes: it is what badges the row in the shelf, and what later
   * lets the catalogue answer which normal maps a project holds. `derivedFrom` is the trail
   * back to the pixels it was computed from.
   */
  it('files the result as a channel of the project, tied to its source', async () => {
    const saveTexture = saved()
    bridgeWatchingLogs({ assets: { saveTexture } })
    fill('height', 'img-1')

    await deriveMaterialChannel('doc-1', 'normal', port())

    expect(saveTexture).toHaveBeenCalledWith({
      name: 'Brique — Normale',
      map: 'normal',
      derivedFrom: 'img-1',
      png,
    })
  })

  /**
   * The shelf is what the tile reads for the picture it shows: pointed at first, the channel
   * holds an id the store has never heard of and the tile draws an empty frame. Asserted on the
   * ORDER, because "it was called" and "the store holds it" are both true either way round.
   */
  it('lists the new asset before pointing the channel at it', async () => {
    const order: string[] = []
    const search = vi.fn(() => {
      order.push('search')
      return Promise.resolve([asset('img-1', 'Brique'), asset('derived-1', 'N')])
    })
    bridgeWatchingLogs({ assets: { saveTexture: saved(), search } })
    fill('height', 'img-1')
    const unsubscribe = useMaterials.subscribe(() => order.push('channel'))

    await deriveMaterialChannel('doc-1', 'normal', port())
    unsubscribe()

    expect(order).toEqual(['search', 'channel'])
    expect(useAssets.getState().items.map(item => item.id)).toContain('derived-1')
  })

  it('refuses a channel nothing derives', async () => {
    bridgeWatchingLogs()

    await expect(deriveMaterialChannel('doc-1', 'baseColor', port())).resolves.toBe(false)
  })

  it('says so rather than computing from nothing when the source is empty', async () => {
    const { entries } = bridgeWatchingLogs()

    await expect(deriveMaterialChannel('doc-1', 'normal', port())).resolves.toBe(false)

    expect(entries().at(-1)?.message).toContain(
      localizedError('channelEmpty', { channel: 'height' }).message,
    )
  })

  /**
   * A derivation runs for as long as its source takes to decode. Pixels computed from a height
   * map that has since been replaced describe nothing that is still open — and writing them
   * would badge as derived a channel that no longer matches what it claims to come from.
   */
  it('abandons, out loud, when the source changed while it was computing', async () => {
    const { entries } = bridgeWatchingLogs({ assets: { saveTexture: saved() } })
    fill('height', 'img-1')

    const derive: DerivePort = () => {
      fill('height', 'img-2')
      return Promise.resolve({ png, width: 512, height: 512 })
    }

    await expect(deriveMaterialChannel('doc-1', 'normal', derive)).resolves.toBe(false)

    expect(channels().normal).toBeUndefined()
    expect(entries().at(-1)?.message).toContain(
      localizedError('channelChanged', { channel: 'height' }).message,
    )
  })

  /**
   * Only the menu row goes dead while a derivation runs — the tile still takes a drop. A picture
   * the user put there by hand meanwhile is the more recent gesture, and it is the one that has
   * to survive: overwriting it would replace a chosen file with a result badged `derived`.
   */
  it('leaves alone a channel the user filled while it was computing', async () => {
    const { entries } = bridgeWatchingLogs({ assets: { saveTexture: saved() } })
    fill('height', 'img-1')

    const derive: DerivePort = () => {
      fill('normal', 'my-own-normal')
      return Promise.resolve({ png, width: 512, height: 512 })
    }

    await expect(deriveMaterialChannel('doc-1', 'normal', derive)).resolves.toBe(false)

    expect(channels().normal?.assetId).toBe('my-own-normal')
    expect(entries().at(-1)?.message).toContain(
      localizedError('channelChanged', { channel: 'normal' }).message,
    )
  })

  /**
   * The two longest waits come AFTER the first check: writing the file, then relisting the
   * catalogue. A guard that closed before them would leave exactly the state it exists to stop —
   * a channel badged `derived` from a source the texture no longer holds.
   */
  it('abandons when the source changes while the file is being written', async () => {
    const saveTexture = vi.fn((_request: SaveTextureRequest) => {
      fill('height', 'img-2')
      return Promise.resolve(asset('derived-1', 'x'))
    })
    const { entries } = bridgeWatchingLogs({ assets: { saveTexture } })
    fill('height', 'img-1')

    await expect(deriveMaterialChannel('doc-1', 'normal', port())).resolves.toBe(false)

    expect(channels().normal).toBeUndefined()
    expect(entries().at(-1)?.message).toContain(
      localizedError('channelChanged', { channel: 'height' }).message,
    )
  })

  it('reports a GPU that refused rather than leaving the row silent', async () => {
    const { entries } = bridgeWatchingLogs()
    fill('height', 'img-1')
    const derive: DerivePort = () => Promise.reject(new Error('no WebGL context'))

    await expect(deriveMaterialChannel('doc-1', 'normal', derive)).resolves.toBe(false)

    expect(entries().at(-1)?.message).toContain('no WebGL context')
    expect(channels().normal).toBeUndefined()
  })

  /** An id is not a name: the pack holds eight pictures and they have to be told apart. */
  it('names the result after the picture it was computed from', async () => {
    const saveTexture = saved()
    bridgeWatchingLogs({ assets: { saveTexture } })
    fill('baseColor', 'img-1')

    await deriveMaterialChannel('doc-1', 'roughness', port())

    expect(saveTexture.mock.calls[0]?.[0]).toMatchObject({ name: 'Brique — Rugosité' })
  })

  /** The shelf can be behind: the channel still points at a real file, and it still has a name. */
  it('falls back to the channel name when the shelf has never heard of the source', async () => {
    const saveTexture = saved()
    bridgeWatchingLogs({ assets: { saveTexture } })
    useAssets.setState({ items: [] })
    fill('baseColor', 'img-1')

    await deriveMaterialChannel('doc-1', 'height', port())

    expect(saveTexture.mock.calls[0]?.[0]).toMatchObject({ name: 'Couleur de base — Hauteur' })
  })
})
