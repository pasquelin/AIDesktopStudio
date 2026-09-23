import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RECOVERY_FOLDER, type RecoveryDraft } from '@shared/domain/recovery'
import { createRecoveryFiles, type RecoveryFiles } from './recoveryFiles'

/**
 * The recovery area — what stands between a crash and an afternoon of work.
 *
 * Every case reads the DISK, because that is the whole promise: an entry the studio believes it
 * wrote and did not is worth nothing at all.
 */
describe('the recovery area', () => {
  let root = ''
  let recovery: RecoveryFiles

  const draft = (overrides: Partial<RecoveryDraft['entry']> = {}): RecoveryDraft => ({
    entry: {
      documentId: 'doc-1',
      kind: 'scene',
      title: 'Repérage',
      workspace: '3d',
      path: 'Scenes/Repérage.gltf',
      savedAt: '2026-09-10T09:00:00.000Z',
      ...overrides,
    },
    content: '{"nodes":[]}',
  })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'recovery-'))
    recovery = createRecoveryFiles(() => root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('gives back the work it was handed', async () => {
    await recovery.write(draft())

    await expect(recovery.read('doc-1')).resolves.toMatchObject({
      entry: { title: 'Repérage', kind: 'scene' },
      content: '{"nodes":[]}',
    })
  })

  it('carries the surfaces an image document holds beside its stack', async () => {
    await recovery.write({
      ...draft({ documentId: 'doc-2', kind: 'image', workspace: 'image' }),
      parts: [{ path: 'mergedimage.png', png: new Uint8Array([137, 80, 78, 71]) }],
    })

    const read = await recovery.read('doc-2')
    expect(read?.parts).toEqual([
      { path: 'mergedimage.png', png: new Uint8Array([137, 80, 78, 71]) },
    ])
  })

  /**
   * A pass writing two surfaces after one that wrote three must not leave the third: a restore
   * would hand the document a layer it no longer has.
   */
  it('leaves no surface behind from a longer pass', async () => {
    const png = new Uint8Array([137, 80, 78, 71])
    await recovery.write({
      ...draft({ documentId: 'doc-3' }),
      parts: [
        { path: 'data/0.png', png },
        { path: 'data/1.png', png },
      ],
    })
    await recovery.write({
      ...draft({ documentId: 'doc-3' }),
      parts: [{ path: 'data/0.png', png }],
    })

    expect(await readdir(join(root, RECOVERY_FOLDER, 'doc-3', 'parts'))).toEqual(['0.png'])
  })

  it('offers what is waiting, newest first', async () => {
    await recovery.write(draft({ documentId: 'doc-old', savedAt: '2026-09-09T09:00:00.000Z' }))
    await recovery.write(draft({ documentId: 'doc-new', savedAt: '2026-09-10T09:00:00.000Z' }))

    expect((await recovery.list()).map(entry => entry.documentId)).toEqual(['doc-new', 'doc-old'])
  })

  it('drops one entry and leaves the others', async () => {
    await recovery.write(draft({ documentId: 'doc-a' }))
    await recovery.write(draft({ documentId: 'doc-b' }))

    await recovery.clear('doc-a')

    expect((await recovery.list()).map(entry => entry.documentId)).toEqual(['doc-b'])
  })

  /** A folder path composed from a value that crossed the boundary: one `..` writes anywhere. */
  it('refuses an id that is not a plain name', async () => {
    await expect(recovery.write(draft({ documentId: '../escape' }))).rejects.toThrow()
  })

  /** One folder a crash caught mid-write must not cost the user every other offer in the list. */
  it('skips a damaged entry rather than answering with none', async () => {
    await recovery.write(draft({ documentId: 'doc-good' }))
    await mkdir(join(root, RECOVERY_FOLDER, 'doc-broken'), { recursive: true })
    await writeFile(join(root, RECOVERY_FOLDER, 'doc-broken', 'entry.json'), '{ not json')

    expect((await recovery.list()).map(entry => entry.documentId)).toEqual(['doc-good'])
  })
})
