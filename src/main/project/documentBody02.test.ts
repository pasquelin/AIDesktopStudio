import { describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION } from '@shared/domain/document'

import { bodyFormatOf } from './documentBody'

const script = bodyFormatOf('.ts')

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

describe('a script held as plain TypeScript', () => {
  const SOURCE = "import { defineScript } from '@studio'\nexport default defineScript({})\n"

  /** 🛑 The bytes and nothing else: an envelope written here would be code that does not compile. */
  it('writes the text alone, with nothing of the studio around it', () => {
    expect(asText(script.write({ ...ENVELOPE, kind: 'script', content: SOURCE }))).toBe(SOURCE)
  })

  it('reads a file no studio ever wrote, as the script it is', () => {
    expect(script.read(onDisk(SOURCE))).toMatchObject({ kind: 'script', content: SOURCE })
  })

  /**
   * The head is COMPOSED, never read: `foundAt` falls back on the file name for a document whose
   * envelope carries no id, which is what names a script. Listing a project of a hundred scripts
   * therefore opens none of them.
   */
  it('answers a head without going near the disk', async () => {
    expect(await script.readHead('/nowhere/at/all/Walk.ts')).toMatchObject({
      kind: 'script',
      title: '',
    })
  })
})
