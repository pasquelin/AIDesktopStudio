import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AsyncCatalog } from '@main/project/catalogClient'
// `hashOrNull` where the backend is wired, `hashSource` where a test states the value it expects:
// the first is what production injects, the second is the same answer without the `null` arm.
import { hashOrNull, hashSource } from '@main/media/runner'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import { roleFolderAt } from '@main/project/project-fixtures'
import { createLocalBackend, type LocalBackend } from './localBackend'

const BYTES = new Uint8Array([1, 2, 3, 4])

describe('local backend', () => {
  let root: string
  let catalog: AsyncCatalog
  let backend: LocalBackend

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scenario-assets-'))
    // No landing folder is laid down: a role's folder is a default, not a layout, and every
    // import below writes into one that has to be created on the way. A user who threw `Images/`
    // away gets it back rather than an import that fails.
    await mkdir(join(root, '.index/posters'), { recursive: true })

    catalog = memoryCatalog()
    backend = createLocalBackend({
      download: () => Promise.resolve(BYTES),
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

  it('writes bytes the renderer produced, such as an edited take', async () => {
    const edited = new Uint8Array([9, 9, 9])
    const asset = await backend.importFromBytes(
      {
        id: 'asset_2',
        name: 'Pad (edited)',
        type: 'audio',
        extension: '.wav',
        derivedFrom: 'asset_1',
      },
      edited,
    )

    expect(asset).toMatchObject({
      // Cleaned on the way to the disk, having nobody to refuse it to: the studio wrote this
      // name itself, and a user's own is refused instead — see `checkAssetName`.
      path: 'Audio/Pad (edited).wav',
      bytes: 3,
      derivedFrom: 'asset_1',
    })
    expect(await readFile(join(root, 'Audio/Pad (edited).wav'))).toEqual(Buffer.from(edited))
    await expect(catalog.find('asset_2')).resolves.toEqual(asset)
  })

  it('overwrites an asset in place, keeping its identity', async () => {
    await backend.importFromBytes(
      { id: 'asset_2', name: 'Pad', type: 'audio', extension: '.wav', jobId: 'job_1' },
      new Uint8Array([1, 2, 3]),
    )

    const replaced = await backend.replaceBytes('asset_2', new Uint8Array([4, 5]), '.wav')

    expect(replaced).toMatchObject({ id: 'asset_2', name: 'Pad', jobId: 'job_1', bytes: 2 })
    expect(await readFile(join(root, 'Audio/Pad.wav'))).toEqual(Buffer.from([4, 5]))
  })

  // An edited take goes back as a wav; leaving it under its old name would hand every reader
  // a file whose extension lies about what is inside it.
  it('renames the file when the bytes are no longer of the same kind, and drops the old one', async () => {
    await backend.importFromBytes(
      { id: 'asset_3', name: 'Import', type: 'audio', extension: '.mp3' },
      new Uint8Array([1]),
    )

    const replaced = await backend.replaceBytes('asset_3', new Uint8Array([4, 5]), '.wav')

    expect(replaced.path).toBe('Audio/Import.wav')
    expect(await readFile(join(root, 'Audio/Import.wav'))).toEqual(Buffer.from([4, 5]))
    await expect(readFile(join(root, 'Audio/Import.mp3'))).rejects.toThrow()
  })

  it('refuses to replace an asset the catalogue does not hold', async () => {
    await expect(backend.replaceBytes('nobody', new Uint8Array([1]), '.wav')).rejects.toThrow()
  })

  /**
   * A LINKED asset keeps its bytes where the user left them and its `path` empty on purpose, so
   * editing one had no file to replace and was refused outright — a picture dragged in from the
   * desktop could never be saved back. The edit lands in the project instead, and the row gains
   * the `path` it did not have.
   */
  it('brings a linked asset into the project rather than refusing the edit', async () => {
    await catalog.add({
      id: 'asset_5',
      name: 'Capture',
      type: 'image',
      location: 'local',
      sourcePath: '/Users/someone/Desktop/Capture.png',
      tags: [],
      createdAt: '2026-08-12T08:00:00.000Z',
    })

    const replaced = await backend.replaceBytes('asset_5', new Uint8Array([4, 5]), '.png')

    expect(replaced).toMatchObject({
      id: 'asset_5',
      name: 'Capture',
      // Its own name, the row having no file of ours to keep the stem of — and free, which is
      // asked of the folder rather than of the catalogue.
      path: 'Images/Capture.png',
    })
    expect(await readFile(join(root, 'Images/Capture.png'))).toEqual(Buffer.from([4, 5]))
  })

  // The file the user only pointed at is not ours to delete: the studio owns the copy it wrote.
  it('leaves the linked file where it was', async () => {
    const linked = join(root, 'outside.png')
    await writeFile(linked, Buffer.from([9]))
    await catalog.add({
      id: 'asset_6',
      name: 'Capture',
      type: 'image',
      location: 'local',
      sourcePath: linked,
      tags: [],
      createdAt: '2026-08-12T08:00:00.000Z',
    })

    await backend.replaceBytes('asset_6', new Uint8Array([4, 5]), '.png')

    expect(await readFile(linked)).toEqual(Buffer.from([9]))
  })

  it('records what the new bytes say about themselves, and drops the stale waveform', async () => {
    await backend.importFromBytes(
      { id: 'asset_4', name: 'Take', type: 'audio', extension: '.wav' },
      new Uint8Array([1]),
    )
    // A waveform computed at ingest, describing the take before any edit.
    await catalog.add({ ...(await catalog.find('asset_4'))!, peaksPath: '.index/peaks/old.bin' })

    const replaced = await backend.replaceBytes('asset_4', new Uint8Array([4, 5]), '.wav', {
      duration: 6_000_000,
      codec: 'pcm_s16le',
      sampleRate: 48_000,
      channels: 1,
    })

    expect(replaced.probe?.duration).toBe(6_000_000)
    // Stale peaks would draw a shape the ear no longer hears.
    expect(replaced.peaksPath).toBeUndefined()
    expect((await catalog.find('asset_4'))?.peaksPath).toBeUndefined()
  })

  // Same reasoning as the waveform above: the fingerprint the row carried describes bytes that
  // are gone. Left alone, it would send a rescan hunting for a file nobody can produce, and would
  // have a fresh import of the ORIGINAL bytes turned away as a duplicate of this row.
  it('re-fingerprints the take when its bytes are replaced', async () => {
    await backend.importFromBytes(
      { id: 'asset_5', name: 'Take', type: 'audio', extension: '.wav' },
      new Uint8Array([1]),
    )
    const before = (await catalog.find('asset_5'))?.hash

    const replaced = await backend.replaceBytes('asset_5', new Uint8Array([4, 5]), '.wav')

    expect(replaced.hash).not.toBe(before)
    expect(replaced.hash).toBe(await hashSource(join(root, 'Audio/Take.wav')))
  })

  // Dropping the waveform is only half the job. Nothing used to derive the new one — `ingest`
  // hangs off the file picker alone — so applying an edit left every clip of that take
  // waveform-less, in every montage, for good.
  it('says the take changed, so a fresh waveform can be derived from the new bytes', async () => {
    const landed: string[] = []
    const watched = createLocalBackend({
      download: () => Promise.resolve(BYTES),
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
      onImported: asset => {
        landed.push(asset.id)
      },
    })
    await watched.importFromBytes(
      { id: 'asset_7', name: 'Take', type: 'audio', extension: '.wav' },
      new Uint8Array([1]),
    )
    landed.length = 0

    await watched.replaceBytes('asset_7', new Uint8Array([4, 5]), '.wav')

    expect(landed).toEqual(['asset_7'])
  })

  it('carries the probe of bytes written beside the source', async () => {
    const asset = await backend.importFromBytes(
      {
        id: 'asset_5',
        name: 'Take (edited)',
        type: 'audio',
        extension: '.wav',
        probe: { duration: 2_000_000, codec: 'pcm_s16le', sampleRate: 48_000, channels: 2 },
      },
      new Uint8Array([1, 2]),
    )

    expect(asset.probe).toMatchObject({ duration: 2_000_000, channels: 2 })
  })
})
