import { mkdtemp, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  DOCUMENT_KIND_KEY,
  DOCUMENT_VERSION,
  ENVELOPE_LIMIT,
  STUDIO_METADATA_KEY,
  type DocumentFile,
} from '@shared/domain/document'

import { bodyFormatOf } from './documentBody'

/** What `readFile` hands a format: a format reads bytes, whatever the shape of what it wrote. */
const onDisk = (body: string | Uint8Array): Buffer => Buffer.from(body)

/** What a format wrote, as text — every format but OpenRaster writes a string. */
const asText = (body: string | Uint8Array): string =>
  typeof body === 'string' ? body : Buffer.from(body).toString('utf8')

/** What every document file carries, so a case states only what it is about. */
const ENVELOPE = {
  version: DOCUMENT_VERSION,
  title: 'Titre',
  updatedAt: '2026-08-18T10:00:00.000Z',
}

const isRecordOf = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

describe('an interface held as plain JSON', () => {
  const ui = bodyFormatOf('.ui.json')

  const uiBody = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({
      version: 1,
      mode: 'screen',
      design: { width: 1920, height: 1080 },
      root: { type: 'screen', id: 'root', children: [] },
      bindings: [],
      ...over,
    })

  const written = (over: Record<string, unknown> = {}, id = 'doc_1'): string =>
    asText(ui.write({ ...ENVELOPE, kind: 'gui', id, content: uiBody(over) }))

  /** The whole reason the format is not the studio's envelope: the file has to BE json. */
  it('writes one JSON object, which anything can parse', () => {
    const parsed: unknown = JSON.parse(written())

    expect(parsed).toMatchObject({ version: 1, mode: 'screen' })
  })

  /**
   * 🛑 The stamp opens the file. Written behind the tree it would fall outside the bounded head,
   * and the document would drop out of every listing — measured on glTF, whose mark once sat
   * behind a long list of root nodes.
   */
  it('opens on the studio stamp, whatever the tree weighs', () => {
    expect(written().startsWith(`{\n  "${STUDIO_METADATA_KEY}": {`)).toBe(true)
  })

  it('reads back the identity it wrote', () => {
    const read = ui.read(onDisk(written()))

    expect(read).toMatchObject({ kind: 'gui', id: 'doc_1' })
    expect(JSON.parse(read.content)).toMatchObject({ mode: 'screen' })
  })

  /** Title and clock are the FILE's, never the body's: written here they would go stale. */
  it('carries neither the title nor the clock into the file', () => {
    const parsed: unknown = JSON.parse(written())
    const held = isRecordOf(parsed) ? parsed[STUDIO_METADATA_KEY] : null

    expect(held).toEqual({ documentId: 'doc_1', [DOCUMENT_KIND_KEY]: 'gui' })
  })

  it('survives a round trip through the disk, twice over', () => {
    const once = written({ mode: 'world' })
    const again = asText(ui.write({ ...ui.read(onDisk(once)), title: 'Autre' }))

    expect(JSON.parse(again)).toEqual(JSON.parse(once))
  })

  /**
   * 🛑 Refused, never wrapped — and a RENAME is what makes this matter: it reaches this writer
   * from the main process without passing the window's own refusal, so an enveloped fallback
   * would turn a damaged interface into two lines no other tool parses, on a gesture nobody
   * thinks of as writing.
   */
  it('refuses a body that is not an interface rather than enveloping it', () => {
    const notOne: DocumentFile = {
      ...ENVELOPE,
      kind: 'gui',
      content: '{"OTIO_SCHEMA":"Timeline.1"}',
    }

    expect(() => ui.write(notOne)).toThrow()
  })

  it('refuses a body written by a later build rather than rewriting it', () => {
    const tooNew: DocumentFile = { ...ENVELOPE, kind: 'gui', content: uiBody({ version: 99 }) }

    expect(() => ui.write(tooNew)).toThrow()
  })

  it('refuses a body whose root is not a screen', () => {
    const broken: DocumentFile = {
      ...ENVELOPE,
      kind: 'gui',
      content: uiBody({ root: { type: 'panel' } }),
    }

    expect(() => ui.write(broken)).toThrow()
  })

  describe('listing one', () => {
    let folder = ''

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), 'ui-head-'))
    })

    it('reads the head without opening the tree', async () => {
      const file = join(folder, 'hud.ui.json')
      const huge = Array.from({ length: 400 }, (_, index) => ({
        type: 'panel',
        id: `p${index}`,
        children: [],
      }))
      const body = written({ root: { type: 'screen', id: 'root', children: huge } })
      await writeFile(file, body)

      // Bigger than the bounded read, so answering at all proves the head was enough.
      expect(Buffer.byteLength(body)).toBeGreaterThan(ENVELOPE_LIMIT)
      await expect(ui.readHead(file)).resolves.toMatchObject({ kind: 'gui', id: 'doc_1' })
    })

    /** A `.ui.json` somebody else wrote is not ours, and a listing says so rather than opening it. */
    it('turns away a file with nothing of the studio in it', async () => {
      const file = join(folder, 'other.ui.json')
      await writeFile(file, uiBody())

      await expect(ui.readHead(file)).rejects.toThrow()
    })
  })
})
