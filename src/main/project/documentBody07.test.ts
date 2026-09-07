import { describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION, type DocumentFile } from '@shared/domain/document'

import { bodyFormatOf } from './documentBody'

const scene = bodyFormatOf('.gltf')

/** What `readFile` hands a format: a format reads bytes, whatever the shape of what it wrote. */
const onDisk = (body: string | Uint8Array): Buffer => Buffer.from(body)

describe('a sky held as glTF', () => {
  const skyDocument = (over: Partial<DocumentFile> = {}): DocumentFile => ({
    version: DOCUMENT_VERSION,
    kind: 'skybox',
    title: 'Crépuscule',
    updatedAt: '2026-08-18T10:00:00.000Z',
    id: 'doc-sky',
    content: JSON.stringify({
      asset: { version: '2.0', generator: 'AI Desktop Studio' },
      scene: 0,
      scenes: [{ name: 'Crépuscule', nodes: [0] }],
      nodes: [{ name: 'Sun' }],
    }),
    ...over,
  })

  /**
   * Kind and id come back; title and clock come back EMPTY, and that is the contract rather than
   * a loss — `foundAt` fills them from the file's own name and the disk's own time. A title baked
   * in here would be the one that goes stale the first time the file is renamed from outside.
   */
  it('reads back the kind and the id it wrote, and the content whole', () => {
    const read = scene.read(onDisk(scene.write(skyDocument())))

    expect(read).toMatchObject({
      kind: 'skybox',
      id: 'doc-sky',
      title: '',
      updatedAt: '',
    })
    // The envelope is stamped INTO `asset.extras`, so the content that comes back holds it: the
    // file is one object, not a line of ours in front of a standard one.
    expect(JSON.parse(read.content)).toMatchObject({ scene: 0, nodes: [{ name: 'Sun' }] })
  })

  /**
   * `asset` goes FIRST and on one line, which is the whole of how a listing reads a project of
   * skies without inflating every one of them. Whitespace is free in JSON, so the file stays
   * valid for every other reader.
   */
  it('puts the envelope on the first line, where a head read reaches it', () => {
    const written = scene.write(skyDocument())
    const head = onDisk(written).toString('utf8')
    const line = head.slice(0, head.indexOf('\n'))

    expect(line.startsWith('{"asset":')).toBe(true)
    expect(JSON.parse(`${line.replace(/,$/, '')}}`)).toMatchObject({
      asset: { extras: { aidesktopstudio: { documentKind: 'skybox' } } },
    })
  })

  it('is valid JSON a reader that knows nothing of the studio can parse', () => {
    expect(JSON.parse(onDisk(scene.write(skyDocument())).toString('utf8'))).toMatchObject({
      asset: { version: '2.0' },
      scene: 0,
    })
  })

  /**
   * A rename reaches the file, and the title rides where another glTF reader will SHOW it: the
   * default scene's own `name`. Nothing of ours spells it a second time, so nothing can disagree.
   */
  it('renames the default scene rather than stamping a title of its own', () => {
    const written = onDisk(scene.write(skyDocument({ title: 'Aube' }))).toString('utf8')

    expect(JSON.parse(written)).toMatchObject({ scenes: [{ name: 'Aube' }] })
    expect(written).not.toContain('"title"')
  })

  // A `.gltf` from anywhere else claims no kind, and takes the first one the extension names.
  it('reads a glTF that carries no envelope of ours as a scene', () => {
    const read = scene.read(onDisk(JSON.stringify({ asset: { version: '2.0' }, nodes: [] })))

    expect(read).toMatchObject({ kind: 'scene', title: '' })
    expect(read.id).toBeUndefined()
  })
})
