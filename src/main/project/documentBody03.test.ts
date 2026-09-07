import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_KIND_KEY,
  DOCUMENT_VERSION,
  ENVELOPE_LIMIT,
  STUDIO_METADATA_KEY,
  type DocumentFile,
} from '@shared/domain/document'

import { isGltfDocument } from '@shared/domain/gltf'

import { bodyFormatOf, ENVELOPED } from './documentBody'

const scene = bodyFormatOf('.gltf')

/** What `readFile` hands a format: a format reads bytes, whatever the shape of what it wrote. */
const onDisk = (body: string | Uint8Array): Buffer => Buffer.from(body)

/** What a format wrote, as text — every format but OpenRaster writes a string. */
const asText = (body: string | Uint8Array): string =>
  typeof body === 'string' ? body : Buffer.from(body).toString('utf8')

const writeScene = (document: DocumentFile): string => asText(scene.write(document))

const gltf = (studio: Record<string, unknown> = {}): string =>
  JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [], extras: { [STUDIO_METADATA_KEY]: studio } }],
    nodes: [],
  })

describe('a scene held as glTF', () => {
  /**
   * The migration shim: a `.gltf` a project held before the switch still opens, its envelope on
   * a first line of ours. The format reads the FILE rather than the extension.
   */
  it('still reads a `.gltf` that holds the studio’s own shape', () => {
    const document: DocumentFile = {
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Level',
      updatedAt: '2026-08-18T10:00:00.000Z',
      id: 'doc-1',
      content: '{"nodes":[]}',
    }

    expect(scene.read(onDisk(asText(ENVELOPED.write(document))))).toEqual(document)
  })

  it('writes the standard file and nothing else', () => {
    const written = writeScene({
      version: 1,
      kind: 'scene',
      title: 'Level',
      updatedAt: '',
      content: gltf({ documentId: 'doc-3', documentKind: 'scene' }),
    })

    // The whole file parses as one document: an envelope would leave a second line no glTF
    // reader has a schema for, and `startsWith('{')` alone cannot tell the two apart.
    expect(isGltfDocument(JSON.parse(written))).toBe(true)
    expect(scene.read(onDisk(written))).toMatchObject({ kind: 'scene', id: 'doc-3' })
  })

  // The field another application shows, on the scene the document points at — a rename would
  // otherwise leave the old title inside a file the studio has just called something else.
  it('stamps the title into the name the standard holds', () => {
    const written = writeScene({
      version: 1,
      kind: 'scene',
      title: 'Repérage',
      updatedAt: '',
      content: gltf(),
    })

    expect(JSON.parse(written).scenes[0].name).toBe('Repérage')
    // Compact: indenting a scene of 5 000 nodes takes its file from 2 396 Ko to 6 840 Ko, and
    // those spaces are parsed again on every open. Measured 18/08.
    expect(written).not.toContain('\n')
  })

  // What the file HOLDS decides, never the name it wears: a document whose content is not glTF
  // falls back on the envelope rather than being refused.
  it('writes the envelope for a document that is not glTF', () => {
    const sky: DocumentFile = {
      version: DOCUMENT_VERSION,
      kind: 'skybox',
      title: 'Ciel',
      updatedAt: '2026-08-18T10:00:00.000Z',
      id: 'doc-9',
      content: '{"adjustments":{}}',
    }

    expect(scene.read(onDisk(scene.write(sky)))).toEqual(sky)
  })

  it('takes the kind from the file, this container serving two editors', () => {
    expect(scene.read(onDisk(gltf({ documentKind: 'skybox' }))).kind).toBe('skybox')
    expect(scene.read(onDisk(gltf())).kind).toBe('scene')
  })

  it('takes no id from a glTF that carries none', () => {
    expect(scene.read(onDisk(gltf())).id).toBeUndefined()
  })

  // Seen on screen: a scene written before the file went compact is indented, so its first line
  // is `{` — read as an envelope, it dropped out of the listing altogether.
  it('reads an indented one, whose first line is not an envelope', () => {
    const indented = JSON.stringify(JSON.parse(gltf({ documentId: 'doc-3' })), null, 2)

    expect(scene.read(onDisk(indented))).toMatchObject({ kind: 'scene', id: 'doc-3' })
  })

  /**
   * `readHead` looks for the studio's mark inside the first `ENVELOPE_LIMIT` bytes and turns away
   * a file that has none. Behind the default scene's list of root nodes the mark fell outside it:
   * a scene of about 1 900 objects at the root was present in the folder, absent from every list,
   * and `locate` could no longer find the file a save had to be written back to.
   */
  it('writes the mark ahead of the list of root nodes, however long that list is', () => {
    const many = JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: Array.from({ length: 5_000 }, (_unused, at) => at), extras: {} }],
      nodes: Array.from({ length: 5_000 }, (_unused, at) => ({ name: `Mesh ${at}` })),
    })

    const written = writeScene({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Foule',
      updatedAt: '',
      content: many,
    })

    expect(written.indexOf(`"${STUDIO_METADATA_KEY}"`)).toBeLessThan(ENVELOPE_LIMIT)
  })

  /**
   * And however many scenes stand BEFORE the default one. Hoisting the default scene's own extras
   * was not enough: a file whose `scene` is not 0 puts every earlier scene in the way, measured
   * at 47 886 bytes on three scenes of 5 000 nodes — a document present in the folder, absent
   * from every list. This is why the mark rides on `asset`.
   */
  it('writes the mark ahead of the scenes that come before the default one', () => {
    const crowded = JSON.stringify({
      asset: { version: '2.0' },
      scene: 2,
      scenes: [
        { nodes: Array.from({ length: 5_000 }, (_unused, at) => at), extras: {} },
        { nodes: Array.from({ length: 5_000 }, (_unused, at) => at), extras: {} },
        { nodes: [0], extras: {} },
      ],
      nodes: [{ name: 'Rig' }],
    })

    const written = writeScene({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Trois scènes',
      updatedAt: '',
      content: crowded,
    })

    expect(written.indexOf(`"${STUDIO_METADATA_KEY}"`)).toBeLessThan(ENVELOPE_LIMIT)
    // The default scene is still the third one: reordering `scenes` would move indices a JSON
    // pointer of `KHR_animation_pointer` is allowed to name.
    expect(JSON.parse(written).scene).toBe(2)
    expect(scene.read(onDisk(written)).kind).toBe('scene')
  })

  /**
   * The mark on `asset` says the kind; the stamp on the scene says everything. Both are read off
   * the same `document`, so they cannot come to disagree — and the mark keeps whatever another
   * application left in `asset.extras`.
   */
  it('marks the asset without dropping the extras it already carried', () => {
    const held = JSON.stringify({
      asset: { version: '2.0', generator: 'Blender', extras: { blender: { flavour: 'cycles' } } },
      scene: 0,
      scenes: [{ nodes: [], extras: {} }],
      nodes: [],
    })

    const written = writeScene({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: '',
      updatedAt: '',
      content: held,
    })
    const asset = JSON.parse(written).asset

    // The key the rest of the studio spells a kind with, never one of its own: two spellings of
    // one invariant are free to drift, and nothing reads this copy.
    expect(asset.extras[STUDIO_METADATA_KEY]).toEqual({ [DOCUMENT_KIND_KEY]: 'scene' })
    expect(asset.extras.blender).toEqual({ flavour: 'cycles' })
    expect(asset.generator).toBe('Blender')
  })

  // `in` walks the prototype chain, so a root member with one of those names was dropped.
  it('carries a root member that happens to be named like something on Object.prototype', () => {
    const odd = JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [], extras: {} }],
      nodes: [],
      constructor: { kept: true },
      toString: 'kept',
    })

    const written = writeScene({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: '',
      updatedAt: '',
      content: odd,
    })

    expect(JSON.parse(written).constructor).toEqual({ kept: true })
    expect(JSON.parse(written).toString).toBe('kept')
  })

  // The mark moved to the front of the scene object; the title still has to win over the name
  // the file arrived with, which is what a rename writes.
  it('still stamps the title over a name the file already had', () => {
    const named = JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ name: 'Ancien', nodes: [], extras: { [STUDIO_METADATA_KEY]: {} } }],
      nodes: [],
    })

    const written = writeScene({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Nouveau',
      updatedAt: '',
      content: named,
    })

    expect(JSON.parse(written).scenes[0].name).toBe('Nouveau')
  })
})
