import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AsyncCatalog } from '@main/project/catalogClient'
// `hashOrNull` where the backend is wired, `hashSource` where a test states the value it expects:
// the first is what production injects, the second is the same answer without the `null` arm.
import { hashOrNull } from '@main/media/runner'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import { isHiddenEntry } from '@shared/domain/folder'
import { roleFolderAt } from '@main/project/project-fixtures'
import { createLocalBackend, extensionFromUrl, type LocalBackend } from './localBackend'

const BYTES = new Uint8Array([1, 2, 3, 4])

describe('file naming', () => {
  it('keeps the extension the URL carries', () => {
    expect(extensionFromUrl('https://cdn.example/x/render.WEBP?token=abc', 'image')).toBe('.webp')
  })

  it('falls back per type when the URL carries none, or carries nonsense', () => {
    expect(extensionFromUrl('https://cdn.example/render', 'image')).toBe('.png')
    expect(extensionFromUrl('https://cdn.example/render.a-very-long-thing', 'mesh')).toBe('.glb')
    expect(extensionFromUrl('not a url', 'video')).toBe('.mp4')
  })

  // The API controls the URL, and a name is now taken from it — only its extension, and only
  // when it looks like one. `../../.ssh/id_rsa` would otherwise be written outside the project.
  it('refuses an extension that would climb out of the project', () => {
    expect(extensionFromUrl('https://cdn.example/take/../../.ssh/id_rsa', 'audio')).toBe('.mp3')
    expect(extensionFromUrl('https://cdn.example/take.wav/../..', 'audio')).toBe('.mp3')
  })
})

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

  /**
   * The API states no duration beside the bytes it hands over: a generated take reached the
   * timeline as an untimed clip — five arbitrary seconds — and nothing said whether it carried
   * a sound, which is what decides that a drop lays down one clip or two.
   */
  it('reads a downloaded take back for its length and its tracks', async () => {
    const probeFile = vi.fn(async () => ({
      duration: 5_400_000,
      codec: 'h264',
      width: 848,
      height: 480,
      sampleRate: 48_000,
      channels: 2,
    }))
    const probing = createLocalBackend({
      download: () => Promise.resolve(BYTES),
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
      probeFile,
    })

    const asset = await probing.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/take.mp4',
      name: 'Terrier',
      type: 'video',
    })

    expect(asset.probe?.duration).toBe(5_400_000)
    expect(asset.probe?.channels).toBe(2)
    // The file that was just written, never the URL it came from.
    expect(probeFile).toHaveBeenCalledWith(join(root, 'Video/Terrier.mp4'))
  })

  // A tool the user has not installed must cost nothing but the length nobody could read.
  it('imports the take all the same when nothing can read it back', async () => {
    const probing = createLocalBackend({
      download: () => Promise.resolve(BYTES),
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
      probeFile: () => Promise.reject(new Error('no ffprobe')),
    })

    const asset = await probing.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/take.mp4',
      name: 'Terrier',
      type: 'video',
    })

    expect(asset.path).toBe('Video/Terrier.mp4')
    expect(asset.probe).toBeUndefined()
  })

  // Pulling a twin twice lands on the same id on purpose. Rebuilding the row from the request
  // alone dropped what the user had put on it.
  it('keeps the tags and the creation date when a row is written again', async () => {
    await catalog.add({
      id: 'asset_1',
      name: 'Boulder',
      type: 'image',
      location: 'local',
      tags: ['hero', 'final'],
      createdAt: '2026-08-01T09:00:00.000Z',
    })

    const rewritten = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
      remoteAssetId: 'asset_remote',
    })

    expect(rewritten.tags).toEqual(['final', 'hero'])
    expect(rewritten.createdAt).toBe('2026-08-01T09:00:00.000Z')
    // The file did change, and that is what the local stamp is for.
    expect(rewritten.localChangedAt).toBe('2026-08-06T10:00:00.000Z')
  })

  /**
   * Now that the file is named after the row, a second pull has somewhere else to land: the free
   * name beside the one it wrote the first time. Two files for one asset, the row pointing at
   * the newer and nothing ever coming back for the older.
   */
  it('lands a twin pulled twice on the file it landed on the first time', async () => {
    const first = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
    })

    const second = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
    })

    expect(second.path).toBe(first.path)
    // The role marker left out, exactly as the explorer leaves it out: `readdir` shows it,
    // nothing in the studio does.
    expect((await readdir(join(root, 'Images'))).filter(name => !isHiddenEntry(name))).toEqual([
      'Boulder.png',
    ])
  })

  /**
   * A second pull must not put the API's wording back over a name the user has since chosen —
   * and not on ONE of the two either: writing the request's name into the row while the file
   * kept the user's is the two-name problem again, in the opposite direction.
   */
  it('keeps the name the row carries when the request brings another', async () => {
    await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
    })

    // As a rename leaves it: the row and the file say the same thing, which is the whole point.
    const held = await catalog.find('asset_1')
    if (held) await catalog.add({ ...held, name: 'Ruelle bleue', path: 'Images/Ruelle bleue.png' })

    const rewritten = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
    })

    expect(rewritten.name).toBe('Ruelle bleue')
    expect(rewritten.path).toBe('Images/Ruelle bleue.png')
  })

  /** The suffix follows the bytes: a take that comes back re-encoded stops claiming to be a wav. */
})
