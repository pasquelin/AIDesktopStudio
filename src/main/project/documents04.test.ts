import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  documentFolderOf,
  DOCUMENT_VERSION,
  LEGACY_DOCUMENTS_FOLDER,
} from '@shared/domain/document'

import { isHiddenEntry } from '@shared/domain/folder'

import type { OraSurface } from '@shared/domain/openRaster'

import { exists } from '@main/persistence'

import { type DocumentFiles } from './documents'

import { documentFilesAt } from './project-fixtures'

const NOW = '2026-08-07T10:00:00.000Z'

/**
 * Where a first save lands, per kind — four shelves here, where `documents/` was one for all.
 * Read off the domain rather than spelt out: what these cases are about is that a document lands
 * with its own section, not that the section is called what it is called today.
 */
const SCENES = documentFolderOf('scene')

const IMAGES = documentFolderOf('image')

/**
 * Whether this volume hands back a file stored DECOMPOSED when asked for its composed name —
 * measured here rather than read off the platform, which answers for neither the filesystem nor
 * the volume a project sits on. APFS does, ext4 does not; NTFS folds CASE and not normalisation.
 */
const volumeAnswersComposedNames = async (folder: string): Promise<boolean> => {
  const probe = join(folder, 'probe-é.txt'.normalize('NFD'))
  await writeFile(probe, '', 'utf8')
  const answers = await exists(join(folder, 'probe-é.txt'.normalize('NFC')))
  await rm(probe, { force: true })
  return answers
}

/** One transparent pixel, which is all any of this needs to be real PNG bytes. */
const PIXELS = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
)

/**
 * What an image document's `content` is: the OpenRaster stack, as JSON. Anything else is refused
 * by the writer, exactly as a montage that is not a timeline is.
 */
const oraContent = (srcs: readonly string[] = [], studio = '{"layers":[]}'): string =>
  JSON.stringify({
    width: 64,
    height: 32,
    nodes: srcs.map(src => ({
      kind: 'layer',
      name: src,
      src,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      composite: 'svg:src-over',
    })),
    studio,
  })

/** The surfaces beside it: the flatten the spec demands, and one per layer. */
const oraParts = (srcs: readonly string[] = []): OraSurface[] => [
  { path: 'mergedimage.png', png: PIXELS },
  ...srcs.map(path => ({ path, png: PIXELS })),
]

describe('createDocumentFiles', () => {
  let root = ''

  let documents: DocumentFiles

  /**
   * What a folder holds as a reader SEES it — the role marker left out, exactly as the explorer
   * leaves it out. `readdir` shows it; nothing in the studio does.
   */
  const held = async (folder: string): Promise<string[]> =>
    (await readdir(join(root, folder))).filter(name => !isHiddenEntry(name))

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-documents-'))
    documents = documentFilesAt(root, NOW)
  })

  describe('a file changed outside the studio', () => {
    const LATER = new Date('2026-08-07T11:00:00.000Z')

    // Still the same document — same id, same kind — with other content. A file replaced by
    // something unreadable is no longer this document at all, and `locate` says so first.
    const OUTSIDE = `${JSON.stringify({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Level',
      updatedAt: NOW,
      id: 'doc-1',
    })}\n{"nodes":["theirs"]}`

    // `utimes` rather than a second write and a wait: the modification time is what the studio
    // compares, and setting it outright is both exact and instant.
    const changeBehindTheStudio = async (file: string): Promise<void> => {
      await writeFile(file, OUTSIDE, 'utf8')
      await utimes(file, LATER, LATER)
    }

    it('is not written over, and the write says so rather than failing', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{"nodes":[]}' })
      const file = join(root, SCENES, 'Level.gltf')
      await changeBehindTheStudio(file)

      expect(await documents.write('doc-1', 'scene', { title: 'Level', content: '{}' })).toBe(
        'stale',
      )
      expect(await readFile(file, 'utf8')).toBe(OUTSIDE)
    })

    /**
     * `headOf` keeps what it read, keyed on the modification time and the size — a scene is a
     * whole parse to open the head of, and `locate` asks for one at every save. A file the user
     * replaced in the Finder must not be answered for out of that map.
     */
    it('is listed as what it now holds, never as what the studio last read', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{"nodes":[]}' })
      expect((await documents.list()).map(entry => entry.kind)).toEqual(['scene'])

      const file = join(root, SCENES, 'Level.gltf')
      await writeFile(
        file,
        `${JSON.stringify({ version: DOCUMENT_VERSION, kind: 'skybox', title: 'Level', updatedAt: NOW, id: 'doc-1' })}\n{}`,
        'utf8',
      )
      await utimes(file, LATER, LATER)

      expect((await documents.list()).map(entry => entry.kind)).toEqual(['skybox'])
    })

    it('is written over once the caller says the user agreed', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{"nodes":[]}' })
      await changeBehindTheStudio(join(root, SCENES, 'Level.gltf'))

      const written = await documents.write(
        'doc-1',
        'scene',
        { title: 'Level', content: '{"ours":true}' },
        true,
      )

      expect(written).toBe('written')
      expect((await documents.read('doc-1', 'scene'))?.content).toBe('{"ours":true}')
    })
  })

  /**
   * The gesture the whole change exists for. A document is renamed by being called something
   * else, and its file follows — the id does not move, so the tab holding it does not either.
   */
  describe('rename', () => {
    it('moves the file and rewrites the title, keeping the id', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{"nodes":[]}' })

      const renamed = await documents.rename('doc-1', 'scene', 'Décor')

      expect(renamed).toEqual({
        id: 'doc-1',
        kind: 'scene',
        title: 'Décor',
        workspace: '3d',
        path: `${SCENES}/Décor.gltf`,
      })
      expect(await held(SCENES)).toEqual(['Décor.gltf'])
      expect(await documents.read('doc-1', 'scene')).toMatchObject({
        title: 'Décor',
        content: '{"nodes":[]}',
      })
    })

    // The one case the old code forbade outright, `openInTab` being the only guard it had.
    it('renames a document written before the file carried a name', async () => {
      await mkdir(join(root, LEGACY_DOCUMENTS_FOLDER), { recursive: true })
      const v2 = { version: 2, kind: 'scene', title: 'Niveau', updatedAt: NOW }
      await writeFile(
        join(root, LEGACY_DOCUMENTS_FOLDER, '6d517ff3.gltf'),
        `${JSON.stringify(v2)}\n{}`,
        'utf8',
      )

      await documents.rename('6d517ff3', 'scene', 'Décor')

      expect(await readdir(join(root, LEGACY_DOCUMENTS_FOLDER))).toEqual(['Décor.gltf'])
      expect((await documents.read('6d517ff3', 'scene'))?.id).toBe('6d517ff3')
    })

    /**
     * Refused rather than suffixed: this is a name the user typed, and handing them a document
     * called something they did not write is worse than saying no.
     */
    it('refuses a name the folder already holds, and touches nothing', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: 'first' })
      await documents.write('doc-2', 'scene', { title: 'Décor', content: 'second' })

      await expect(documents.rename('doc-2', 'scene', 'Niveau')).rejects.toThrow(/duplicate/)
      expect([...(await held(SCENES))].sort()).toEqual(['Décor.gltf', 'Niveau.gltf'])
    })

    it('says which refusal it is, rather than calling every one a duplicate', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{}' })

      await expect(documents.rename('doc-1', 'scene', '   ')).rejects.toThrow(/empty/)
      await expect(documents.rename('doc-1', 'scene', 'Brique 1/2')).rejects.toThrow(/invalid/)
    })

    it('lets a document keep the name it already has', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{}' })

      await expect(documents.rename('doc-1', 'scene', 'Niveau')).resolves.toMatchObject({
        path: `${SCENES}/Niveau.gltf`,
      })
    })

    /**
     * The container is rewritten from the document, so a rename that dropped its surfaces would
     * write a stack with no pixels under it — every layer gone, on a rename, in silence. That is
     * what the old folder shape hid: the parts were the folder's own entries and stayed put.
     */
    it('renames a container, surfaces and all', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png']),
        parts: oraParts(['data/p_a.png']),
      })

      await documents.rename('doc-1', 'image', 'Affiche')

      expect(await held(IMAGES)).toEqual(['Affiche.ora'])
      expect((await documents.read('doc-1', 'image'))?.parts).toEqual(oraParts(['data/p_a.png']))
    })

    /**
     * `fs.rename` overwrites without a word on POSIX, and replaces an empty directory without
     * one either — which is what an untouched `.ora` is. Asked of the disk and not of the index:
     * the index only knows what it has read, and anything at all may be sitting there.
     */
    it('refuses when something already stands where it would land, and changes nothing', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{}' })
      await mkdir(join(root, SCENES, 'Décor.gltf', 'in the way'), { recursive: true })

      await expect(documents.rename('doc-1', 'scene', 'Décor')).rejects.toThrow()
      expect((await documents.read('doc-1', 'scene'))?.title).toBe('Niveau')
      expect(await readdir(join(root, SCENES, 'Décor.gltf'))).toEqual(['in the way'])
    })

    /**
     * `Niveau` → `niveau` is the plainest rename there is, and on APFS and NTFS the file it
     * would land on is the one it is leaving: the disk answered « taken » and the user was told
     * their own document was in the way.
     */
    it('lets a name change only its case', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: '{}' })

      await expect(documents.rename('doc-1', 'scene', 'niveau')).resolves.toMatchObject({
        path: `${SCENES}/niveau.gltf`,
      })
      expect(await held(SCENES)).toEqual(['niveau.gltf'])
    })

    /**
     * The same rename, on a file the volume stores DECOMPOSED — how `Été.gltf` arrives from a
     * zip made by Archive Utility, a share, or a restore off HFS+. The name check exempts the
     * document being renamed by plain equality, so a listing left as the disk spells it would
     * refuse the user their own document: the composed name it was known by no longer matches
     * the decomposed entry beside it.
     *
     * The blind spot, in clear, and it is a defect rather than an omission: `FolderEntry.path`
     * is both the identity a catalogue joins on — rightly NFC — and the address every `join(root,
     * path)` opens. Where the volume does not answer a composed name, ext4 among them, the second
     * job has no translation back and the document is listed but unreachable.
     */
    it('lets a name change its case on a file the disk spells decomposed', async ({ skip }) => {
      await mkdir(join(root, SCENES), { recursive: true })
      if (!(await volumeAnswersComposedNames(join(root, SCENES)))) return skip()

      const envelope = `${JSON.stringify({
        version: DOCUMENT_VERSION,
        kind: 'scene',
        title: 'Été',
        updatedAt: NOW,
        id: 'doc-1',
      })}\n{}`
      await writeFile(join(root, SCENES, 'Été.gltf'.normalize('NFD')), envelope, 'utf8')

      await expect(documents.rename('doc-1', 'scene', 'ÉTÉ')).resolves.toMatchObject({
        title: 'ÉTÉ',
      })
    })

    // A rename and a save in flight aim at two different paths, so nothing queues them but the id.
    it('does not let a write in flight land under the name just left behind', async () => {
      await documents.write('doc-1', 'scene', { title: 'Niveau', content: 'first' })

      await Promise.all([
        documents.write('doc-1', 'scene', { title: 'Niveau', content: 'x'.repeat(100_000) }),
        documents.rename('doc-1', 'scene', 'Décor'),
      ])

      expect(await held(SCENES)).toEqual(['Décor.gltf'])
    })
  })

  it('keeps a failed operation from blocking the file afterwards', async () => {
    await expect(documents.read('doc-1', 'scene')).resolves.toBeNull()
    await documents.write('doc-1', 'scene', { title: 'After', content: '1' })

    expect((await documents.read('doc-1', 'scene'))?.title).toBe('After')
  })

  describe('list', () => {
    // The project folder is what says which documents exist: a registry kept beside it would
    // follow the application instead, and open the previous project's tabs in the next one.
    it('answers with what the folder holds, kind and workspace included', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{}' })
      await documents.write('doc-2', 'image', {
        title: 'Poster',
        content: oraContent(),
        parts: oraParts(),
      })

      expect(await documents.list()).toEqual(
        expect.arrayContaining([
          {
            id: 'doc-1',
            kind: 'scene',
            title: 'Level',
            workspace: '3d',
            path: `${SCENES}/Level.gltf`,
          },
          {
            id: 'doc-2',
            kind: 'image',
            title: 'Poster',
            workspace: 'image',
            path: `${IMAGES}/Poster.ora`,
          },
        ]),
      )
    })

    it('answers empty for a project that has never saved anything', async () => {
      expect(await documents.list()).toEqual([])
    })

    it('ignores what is not a document of a kind this build knows', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{}' })
      await writeFile(join(root, SCENES, 'notes.txt'), 'a note', 'utf8')
      await writeFile(join(root, SCENES, 'old.blend'), 'x', 'utf8')

      expect((await documents.list()).map(entry => entry.id)).toEqual(['doc-1'])
    })

    // One document truncated by a crash must not cost the user the listing of all the others.
    it('skips a document it cannot read and lists the rest', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{}' })
      await writeFile(join(root, SCENES, 'broken.gltf'), '{ not json', 'utf8')

      expect((await documents.list()).map(entry => entry.id)).toEqual(['doc-1'])
    })

    // The folder's word beats the file's, exactly as `read` has it.
    it('skips a document whose extension disagrees with what it holds', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{}' })
      const written = await readFile(join(root, SCENES, 'Level.gltf'), 'utf8')
      await writeFile(join(root, SCENES, 'doc-2.ora'), written, 'utf8')

      expect((await documents.list()).map(entry => entry.id)).toEqual(['doc-1'])
    })

    // A crash between the write and the rename leaves a staging copy behind for good. Nothing
    // else ever looks at that folder, so the listing is where it gets cleaned up.
    it('sweeps a staging copy no write is holding', async () => {
      await documents.write('doc-1', 'scene', { title: 'Level', content: '{}' })
      await writeFile(
        join(root, SCENES, 'doc-9.gltf.3f2a1c88-9d4e-4b7a-8c15-2e6f0a7b9d31.tmp'),
        '{}',
        'utf8',
      )

      await documents.list()
      expect(await held(SCENES)).toEqual(['Level.gltf'])
    })

    /**
     * The remains of a container half-written by a process that died. A file now, where it used
     * to be a folder — and the walk still has to leave it out of the listing and sweep it away.
     */
    it('sweeps a staging copy of a container', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Planche',
        content: oraContent(),
        parts: oraParts(),
      })
      await writeFile(
        join(root, IMAGES, 'Planche.ora.3f2a1c88-9d4e-4b7a-8c15-2e6f0a7b9d31.tmp'),
        'half a container',
        'utf8',
      )

      const listed = await documents.list()

      expect(listed.map(entry => entry.id)).toEqual(['doc-1'])
      expect(await held(IMAGES)).toEqual(['Planche.ora'])
    })
  })
})
