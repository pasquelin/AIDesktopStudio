import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { documentFolderOf, DOCUMENT_VERSION } from '@shared/domain/document'

import { isHiddenEntry } from '@shared/domain/folder'

import type { OraSurface } from '@shared/domain/openRaster'

import { type DocumentFiles } from './documents'

import { documentFilesAt } from './project-fixtures'

const NOW = '2026-08-07T10:00:00.000Z'

const IMAGES = documentFolderOf('image')

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

  /**
   * An image document IS an OpenRaster container — one file, a ZIP, holding a `stack.xml`, one
   * PNG per surface and the studio's own state. What is checked here is the contract the
   * renderer depends on: the surfaces come back byte for byte, and the file another application
   * opens is the document rather than a copy of it.
   */
  describe('a document written as an OpenRaster container', () => {
    it('reads back the stack and every surface', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png']),
        parts: oraParts(['data/p_a.png']),
      })

      const file = await documents.read('doc-1', 'image')

      expect(file?.title).toBe('Poster')
      expect(JSON.parse(file?.content ?? '')).toMatchObject({
        width: 64,
        height: 32,
        studio: '{"layers":[]}',
      })
      expect(file?.parts).toEqual(oraParts(['data/p_a.png']))
    })

    /** One FILE, not a folder — and a ZIP another application opens, `mimetype` first. */
    it('writes one file, and it is a container', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png']),
        parts: oraParts(['data/p_a.png']),
      })

      expect(await held(IMAGES)).toEqual(['Poster.ora'])
      const bytes = await readFile(join(root, IMAGES, 'Poster.ora'))
      expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
      expect(bytes.subarray(30, 38).toString('utf8')).toBe('mimetype')
    })

    /**
     * The defect `writeAtomic` had: the tidy-up threw over the error it was cleaning up after,
     * and the caller heard the wrong one. A landing folder that is a FILE is what makes them
     * distinguishable — `mkdir` fails on it, naming itself.
     */
    it('reports why the write failed, not why the tidy-up would not go away', async () => {
      await writeFile(join(root, IMAGES), 'a file where the folder goes')

      await expect(
        documents.write('doc-1', 'image', { title: 'Poster', content: oraContent() }),
      ).rejects.toThrow(/mkdir/)
    })

    it('lists a container like any other document', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(),
        parts: oraParts(),
      })

      expect(await documents.list()).toEqual([
        {
          id: 'doc-1',
          kind: 'image',
          title: 'Poster',
          workspace: 'image',
          path: `${IMAGES}/Poster.ora`,
        },
      ])
    })

    // Written whole at every ⌘S: the second write must leave the container holding the second
    // document, not both merged.
    it('replaces the whole container rather than merging into it', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png', 'data/p_b.png']),
        parts: oraParts(['data/p_a.png', 'data/p_b.png']),
      })
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png']),
        parts: oraParts(['data/p_a.png']),
      })

      expect((await documents.read('doc-1', 'image'))?.parts).toEqual(oraParts(['data/p_a.png']))
    })

    it('leaves no staging copy behind', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png']),
        parts: oraParts(['data/p_a.png']),
      })
      await documents.write('doc-1', 'image', { title: 'Poster', content: oraContent() })

      expect(await held(IMAGES)).toEqual(['Poster.ora'])
    })

    it('takes the container away on remove', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png']),
        parts: oraParts(['data/p_a.png']),
      })
      await documents.remove('doc-1', 'image')

      expect(await documents.list()).toEqual([])
      expect(await held(IMAGES)).toEqual([])
    })

    /**
     * The renderer names the surfaces and they become ZIP entries the studio writes AND reads
     * back — the one field of this contract that crosses a security boundary. The IPC boundary
     * REFUSES one outright (`validation.test.ts`); this is the packer's own last line, below it,
     * where dropping is right — one odd name must cost that surface, never the whole picture.
     */
    it('drops a surface that would name its way out of the container', async () => {
      await documents.write('doc-1', 'image', {
        title: 'Poster',
        content: oraContent(['data/p_a.png']),
        parts: [...oraParts(['data/p_a.png']), { path: '../escaped.png', png: PIXELS }],
      })

      const paths = (await documents.read('doc-1', 'image'))?.parts?.map(one => one.path) ?? []
      expect(paths).not.toContain('../escaped.png')
      expect(paths).toContain('data/p_a.png')
    })

    /**
     * A body no reader understands would drop the document from every listing while it sat in
     * the folder — the same refusal a montage that is not a timeline gets, and the one place a
     * save can be stopped.
     */
    it('refuses a content that is not a stack', async () => {
      await expect(
        documents.write('doc-1', 'image', { title: 'Poster', content: '{}' }),
      ).rejects.toThrow()

      expect(await documents.list()).toEqual([])
    })

    /**
     * A container written elsewhere may carry no `w`/`h` on its `<image>`, which the unpacker
     * reads as zero. Refusing that on the way OUT makes the document unsaveable for good — the
     * value came from the read, and the write is echoing it back.
     */
    it('saves a container whose stack declares no size', async () => {
      const sizeless = JSON.stringify({ width: 0, height: 0, nodes: [], studio: '{}' })

      await documents.write('doc-1', 'image', {
        title: 'Sans taille',
        content: sizeless,
        parts: oraParts(),
      })

      expect(JSON.parse((await documents.read('doc-1', 'image'))?.content ?? '')).toMatchObject({
        width: 0,
        height: 0,
      })
    })

    it('reads back nothing for a container that was never written', async () => {
      expect(await documents.read('doc-9', 'image')).toBeNull()
    })
  })

  /**
   * A montage in the open format IS the document — there is no envelope of ours in the file, so
   * every field one carries has to come from the standard's metadata or from the folder.
   */
  describe('a montage held as OpenTimelineIO', () => {
    const otio = (studio: Record<string, unknown> = {}): string =>
      JSON.stringify({
        OTIO_SCHEMA: 'Timeline.1',
        name: 'Bande',
        metadata: { aidesktopstudio: studio },
        global_start_time: null,
        tracks: { OTIO_SCHEMA: 'Stack.1', children: [] },
      })

    it('lists a file another application wrote, named after its file', async () => {
      await writeFile(join(root, 'Rushes.otio'), otio(), 'utf8')

      expect(await documents.list()).toEqual([
        {
          id: 'Rushes',
          kind: 'sequence',
          title: 'Rushes',
          workspace: 'video',
          path: 'Rushes.otio',
        },
      ])
    })

    it('remembers which document one of its own is, whatever the file is called', async () => {
      await writeFile(join(root, 'Rushes.otio'), otio({ documentId: 'doc-7' }), 'utf8')

      expect((await documents.list())[0]?.id).toBe('doc-7')
    })

    it('hands the whole standard file to the editor, untouched', async () => {
      const content = otio({ documentId: 'doc-7' })
      await writeFile(join(root, 'Rushes.otio'), content, 'utf8')
      await documents.list()

      expect(await documents.read('doc-7', 'sequence')).toEqual({
        version: DOCUMENT_VERSION,
        kind: 'sequence',
        title: '',
        updatedAt: '',
        id: 'doc-7',
        content,
      })
    })

    // The defect this whole change exists to close: a save that wrote our envelope back would
    // leave a file no other application can read, and the studio would be the only reader again.
    it('writes the montage back with nothing of ours in front of it', async () => {
      const content = otio({ documentId: 'doc-7' })
      await writeFile(join(root, 'Rushes.otio'), content, 'utf8')
      await documents.list()

      expect(await documents.write('doc-7', 'sequence', { title: 'Rushes', content })).toBe(
        'written',
      )

      const written = await readFile(join(root, 'Rushes.otio'), 'utf8')
      expect(JSON.parse(written)).toMatchObject({ OTIO_SCHEMA: 'Timeline.1', name: 'Rushes' })
      expect(written.startsWith('{')).toBe(true)
    })

    it('stays one file when it is renamed', async () => {
      await writeFile(join(root, 'Rushes.otio'), otio({ documentId: 'doc-7' }), 'utf8')
      await documents.list()

      expect((await documents.rename('doc-7', 'sequence', 'Bande son')).path).toBe('Bande son.otio')
      expect(await readdir(root)).toEqual(['Bande son.otio'])
    })

    // A tab opened on nothing is indistinguishable from a new document, and the next ⌘S would
    // write that over whatever the file really held.
    it('leaves a file that is not a timeline out of the listing', async () => {
      await writeFile(join(root, 'Notes.otio'), '{"OTIO_SCHEMA":"Clip.1"}', 'utf8')

      expect(await documents.list()).toEqual([])
    })
  })

  /**
   * The same for the 3D scene, with one difference that is the whole difficulty: `.gltf` serves
   * the scene AND the sky, and the sky still writes the studio's envelope — so this container
   * holds two spellings at once, and the FILE is what tells them apart.
   */
  describe('a scene held as glTF', () => {
    const gltf = (studio: Record<string, unknown> = {}): string =>
      JSON.stringify({
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [], extras: { aidesktopstudio: studio } }],
        nodes: [],
      })

    // Named after its file, an id being what a document written here carries and this one has not.
    // A glTF with nothing of ours in it is a MESH, and `turns away a file of an open format the
    // studio did not write` is the other half of that rule.
    it('lists one of ours that lost its id, named after its file', async () => {
      await writeFile(join(root, 'Repérage.gltf'), gltf(), 'utf8')

      expect(await documents.list()).toEqual([
        {
          id: 'Repérage',
          kind: 'scene',
          title: 'Repérage',
          workspace: '3d',
          path: 'Repérage.gltf',
        },
      ])
    })

    it('remembers which document one of its own is, whatever the file is called', async () => {
      await writeFile(join(root, 'Repérage.gltf'), gltf({ documentId: 'doc-3' }), 'utf8')

      expect((await documents.list())[0]?.id).toBe('doc-3')
    })

    /**
     * Seen on screen, not deduced: a scene written before the file went compact is indented, so
     * its first line is `{`. Read as an envelope, it dropped out of the listing — the file sat in
     * the folder wearing its extension, and nothing opened it.
     */
    it('lists one written indented, whose first line is not an envelope', async () => {
      const indented = JSON.stringify(JSON.parse(gltf({ documentId: 'doc-3' })), null, 2)
      await writeFile(join(root, 'Repérage.gltf'), indented, 'utf8')

      expect((await documents.list())[0]).toMatchObject({ id: 'doc-3', kind: 'scene' })
    })

    // The defect this change exists to close: a save writing our envelope back would leave a
    // file no other application can read, and the studio would be its only reader again.
    it('writes the scene back with nothing of ours in front of it', async () => {
      const content = gltf({ documentId: 'doc-3', documentKind: 'scene' })
      await writeFile(join(root, 'Repérage.gltf'), content, 'utf8')
      await documents.list()

      expect(await documents.write('doc-3', 'scene', { title: 'Repérage', content })).toBe(
        'written',
      )

      const written = await readFile(join(root, 'Repérage.gltf'), 'utf8')
      expect(JSON.parse(written)).toMatchObject({ asset: { version: '2.0' } })
      expect(JSON.parse(written).scenes[0].name).toBe('Repérage')
    })

    // The sky shares this extension and is NOT glTF yet. Listing it as a scene would open it in
    // the wrong editor, and writing it as one would throw away everything it holds.
    it('still lists a sky written the studio’s own way, under the same extension', async () => {
      await documents.write('sky-1', 'skybox', { title: 'Ciel', content: '{"adjustments":{}}' })

      expect((await documents.list()).map(({ kind, title }) => ({ kind, title }))).toEqual([
        { kind: 'skybox', title: 'Ciel' },
      ])
    })
  })
})
