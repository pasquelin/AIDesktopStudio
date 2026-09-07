import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { documentFolderOf, DOCUMENT_KINDS, type DocumentKind } from '@shared/domain/document'
import { ORA_MERGED_PATH, ORA_MIMETYPE } from '@shared/domain/openRaster'
import { documentFilesAt, snapshotDocuments, withTempProject } from './project-fixtures'
import { projectName } from '@shared/domain/project'

const NOW = '2026-08-16T10:00:00.000Z'

/**
 * A body of the shape its kind's file accepts. A montage IS its OpenTimelineIO file, so anything
 * else is refused at the write — written here already indented and already named after the title,
 * which is what the format's own writer would make of it.
 */
const bodyOf = (kind: DocumentKind): string =>
  kind === 'sequence' || kind === 'audio'
    ? JSON.stringify(
        {
          OTIO_SCHEMA: 'Timeline.1',
          name: kind,
          // What `otioBody` stamps on every save, so what is written here comes back byte for
          // byte: the id, and which of the two kinds `.otio` names this file is.
          metadata: { aidesktopstudio: { documentId: `doc-${kind}`, documentKind: kind } },
          tracks: { OTIO_SCHEMA: 'Stack.1', children: [] },
        },
        null,
        2,
      )
    : kind === 'image'
      ? // An image IS its OpenRaster container, so its content is the stack that container
        // holds — anything else is refused at the write, like a montage that is not a timeline.
        JSON.stringify({ width: 64, height: 32, nodes: [], studio: '{"layers":[]}' })
      : kind === 'gui'
        ? // Same family: an interface IS its JSON, and a body that is not one is refused. The
          // stamp is written here too, so what comes back equals what went in.
          JSON.stringify(
            {
              aidesktopstudio: { documentId: `doc-${kind}`, documentKind: kind },
              version: 1,
              mode: 'screen',
              design: { width: 1920, height: 1080 },
              root: { type: 'screen', id: 'root', children: [] },
              bindings: [],
            },
            null,
            2,
          )
        : `{"of":"${kind}"}`

/** The surfaces beside it: the flatten the spec demands, and nothing else for an empty stack. */
const PIXELS = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
)

const imageSnapshot = async () => {
  const { root, documents } = await withTempProject()
  await documents.write('doc-1', 'image', {
    title: 'Cover',
    content: JSON.stringify({
      width: 64,
      height: 32,
      nodes: [
        {
          kind: 'layer',
          name: 'Ink',
          src: 'data/p_a.png',
          x: 0,
          y: 0,
          opacity: 1,
          visible: true,
          composite: 'svg:src-over',
        },
      ],
      studio: '{"layers":[]}',
    }),
    parts: [
      { path: ORA_MERGED_PATH, png: PIXELS },
      { path: 'data/p_a.png', png: PIXELS },
    ],
  })
  return { root, whole: await snapshotDocuments(documents) }
}

const stripImageSurfaces = async (root: string) => {
  await writeFile(
    join(root, documentFolderOf('image'), 'Cover.ora'),
    zipSync({
      mimetype: [strToU8(ORA_MIMETYPE), { level: 0 }],
      'stack.xml': strToU8(
        `<?xml version='1.0' encoding='UTF-8'?>\n` +
          `<image version="0.0.3" w="64" h="32"><stack>` +
          `<layer name="Ink" x="0" y="0" opacity="1" visibility="visible" ` +
          `composite-op="svg:src-over" src="data/p_a.png"/>` +
          `</stack></image>\n`,
      ),
      'aidesktopstudio/document.json': strToU8('{"layers":[]}'),
    }),
  )
  return snapshotDocuments(documentFilesAt(root, NOW))
}

/**
 * The measuring tool has to be measured too: a snapshot that missed a document, or that differed
 * between two reads of the same folder, would report every later phase as safe.
 */
describe('the project fixture', () => {
  it('creates a real project folder, and takes it away with the test', async () => {
    const { root, project } = await withTempProject('Mine')

    expect(projectName(project.path)).toMatch(/^Mine-/)
    expect(await readdir(root)).toContain('.project.json')
  })

  it('reads every kind of document back through one snapshot', async () => {
    const { documents } = await withTempProject()

    for (const kind of DOCUMENT_KINDS) {
      await documents.write(`doc-${kind}`, kind, { title: kind, content: bodyOf(kind) })
    }

    const taken = await snapshotDocuments(documents)

    expect(taken).toHaveLength(DOCUMENT_KINDS.length)
    expect(taken.map(one => one.kind).sort()).toEqual([...DOCUMENT_KINDS].sort())
    // Compared as VALUES: a container re-spells its stack on the way back, the keys coming out
    // in the order the unpacker builds them rather than the order they went in.
    for (const one of taken) expect(JSON.parse(one.content)).toEqual(JSON.parse(bodyOf(one.kind)))
  })

  // The loss this tool exists to catch, and the one a file count cannot see: the stack is intact
  // and every surface beside it is gone.
  it('sees the surfaces of an image document, not just its stack', async () => {
    const { root, whole } = await imageSnapshot()
    const stripped = await stripImageSurfaces(root)

    expect(whole[0]?.parts).toEqual([
      { path: 'data/p_a.png', bytes: PIXELS.byteLength },
      { path: ORA_MERGED_PATH, bytes: PIXELS.byteLength },
    ])
    expect(JSON.parse(stripped[0]?.content ?? '')).toEqual(JSON.parse(whole[0]?.content ?? ''))
    expect(stripped[0]?.parts).toEqual([])
  })

  /**
   * The whole point of the tool. A folder read by a second reader — one holding none of the
   * first's caches — must describe the same project, or nothing built on this measures anything.
   */
  it('describes the same project when it is read again from scratch', async () => {
    const { root, documents } = await withTempProject()
    await documents.write('doc-1', 'scene', { title: 'Level', content: bodyOf('scene') })
    await documents.write('doc-2', 'audio', { title: 'Take', content: bodyOf('audio') })

    const first = await snapshotDocuments(documents)
    const second = await snapshotDocuments(documentFilesAt(root, NOW))

    expect(second).toEqual(first)
  })
})
