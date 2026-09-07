import { mkdtemp, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  DOCUMENT_VERSION,
  ENVELOPE_LIMIT,
  STUDIO_METADATA_KEY,
  type DocumentFile,
} from '@shared/domain/document'

import { GLTF_HEAD_LIMIT } from '@shared/domain/gltf'

import { bodyFormatOf } from './documentBody'

const scene = bodyFormatOf('.gltf')

const otio = bodyFormatOf('.otio')

/** What a format wrote, as text — every format but OpenRaster writes a string. */
const asText = (body: string | Uint8Array): string =>
  typeof body === 'string' ? body : Buffer.from(body).toString('utf8')

const writeScene = (document: DocumentFile): string => asText(scene.write(document))

/** What every document file carries, so a case states only what it is about. */
const ENVELOPE = {
  version: DOCUMENT_VERSION,
  title: 'Titre',
  updatedAt: '2026-08-18T10:00:00.000Z',
}

const gltf = (studio: Record<string, unknown> = {}): string =>
  JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [], extras: { [STUDIO_METADATA_KEY]: studio } }],
    nodes: [],
  })

const timeline = (studio: Record<string, unknown> = {}): string =>
  JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Bande',
    metadata: { aidesktopstudio: studio },
    global_start_time: null,
    tracks: { OTIO_SCHEMA: 'Stack.1', children: [] },
  })

describe('what a listing pays per document', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-heads-'))
  })

  const laid = async (name: string, body: string): Promise<string> => {
    const file = join(root, name)
    await writeFile(file, body, 'utf8')
    return file
  }

  /** Past the bound, so the rest of the file is what the short head exists not to read. */
  const wide = (over: Record<string, unknown>): string =>
    JSON.stringify({ asset: { version: '2.0' }, nodes: 'x'.repeat(GLTF_HEAD_LIMIT), ...over })

  it('reads a scene bigger than the bound without parsing it', async () => {
    const body = writeScene({
      ...ENVELOPE,
      kind: 'scene',
      id: 'doc-9',
      content: wide({ scene: 0, scenes: [{ extras: { [STUDIO_METADATA_KEY]: {} } }] }),
    })
    const head = await scene.readHead(await laid('Niveau.gltf', body))

    expect(body.length).toBeGreaterThan(GLTF_HEAD_LIMIT)
    expect(head).toMatchObject({ kind: 'scene', id: 'doc-9', title: '', updatedAt: '' })
    expect(head.content).toBeUndefined()
  })

  it('reads a montage bigger than the bound without parsing it', async () => {
    const body = asText(
      otio.write({
        ...ENVELOPE,
        kind: 'sequence',
        id: 'doc-8',
        content: JSON.stringify({
          ...(JSON.parse(timeline()) as Record<string, unknown>),
          spacer: 'x'.repeat(ENVELOPE_LIMIT),
        }),
      }),
    )
    const head = await otio.readHead(await laid('Bande.otio', body))

    expect(body.length).toBeGreaterThan(ENVELOPE_LIMIT)
    expect(head).toMatchObject({ kind: 'sequence', id: 'doc-8' })
    expect(head.content).toBeUndefined()
  })

  /**
   * A bounded read costs an `open`, a `read` and a `close` where reading the file costs one call
   * sized to it — so on a document SMALLER than the bound it was ×0,7, measured 18/08. The bound
   * is read once and its length answers: a file that ended inside it is already in hand.
   */
  it('hands back a document smaller than the bound rather than reading it twice', async () => {
    const body = writeScene({
      ...ENVELOPE,
      kind: 'scene',
      id: 'doc-9',
      content: gltf({ documentId: 'doc-9' }),
    })
    const head = await scene.readHead(await laid('Petite.gltf', body))

    expect(body.length).toBeLessThan(GLTF_HEAD_LIMIT)
    expect(head).toMatchObject({ kind: 'scene', id: 'doc-9' })
    expect(head.content).toBe(body)
  })

  /** The sky and the scene share the extension, so the head has to say which of the two it is. */
  it('takes the kind off the head rather than off the extension', async () => {
    const file = await laid(
      'Crépuscule.gltf',
      writeScene({
        ...ENVELOPE,
        kind: 'skybox',
        id: 'doc-7',
        content: gltf({ documentId: 'doc-7' }),
      }),
    )

    expect(await scene.readHead(file)).toMatchObject({ kind: 'skybox', id: 'doc-7' })
  })

  /**
   * A scene written before the id was stamped on `asset` carries it beside its whole state, which
   * does not fit in the head — so the file is read, exactly as it was. The fallback is what keeps
   * every such document listed rather than renamed to its own file name.
   */
  it('reads a scene whose id sits behind more than the head holds', async () => {
    const buried = JSON.stringify({
      asset: { version: '2.0', extras: { [STUDIO_METADATA_KEY]: { documentKind: 'scene' } } },
      scene: 0,
      scenes: [
        {
          extras: {
            [STUDIO_METADATA_KEY]: {
              scene: { nodes: 'x'.repeat(GLTF_HEAD_LIMIT) },
              documentId: 'doc-6',
            },
          },
        },
      ],
    })

    const head = await scene.readHead(await laid('Vaste.gltf', buried))

    expect(head).toMatchObject({ kind: 'scene', id: 'doc-6' })
    expect(head.content).toBe(buried)
  })

  it('still answers the envelope of a document written before the switch', async () => {
    const file = await laid(
      'Ancienne.gltf',
      `${JSON.stringify({ ...ENVELOPE, kind: 'scene', id: 'doc-5', title: 'Ancienne' })}\n{"nodes":[]}`,
    )

    expect(await scene.readHead(file)).toMatchObject({
      kind: 'scene',
      id: 'doc-5',
      title: 'Ancienne',
    })
  })

  it('turns away a glTF another application exported into the project', async () => {
    const file = await laid(
      'Maille.gltf',
      JSON.stringify({ asset: { version: '2.0' }, meshes: [] }),
    )

    await expect(scene.readHead(file)).rejects.toThrow()
  })

  /** A title holding a brace must not end the block the head is matching. */
  it('reads the head of a montage whose name holds a brace', async () => {
    const file = await laid(
      'Accolade.otio',
      asText(
        otio.write({
          ...ENVELOPE,
          kind: 'sequence',
          id: 'doc-4',
          title: 'Plan { serré }',
          content: timeline(),
        }),
      ),
    )

    expect(await otio.readHead(file)).toMatchObject({ kind: 'sequence', id: 'doc-4' })
  })
})
