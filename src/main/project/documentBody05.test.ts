import { describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION, type DocumentFile } from '@shared/domain/document'

import { bodyFormatOf } from './documentBody'

const otio = bodyFormatOf('.otio')

/** What `readFile` hands a format: a format reads bytes, whatever the shape of what it wrote. */
const onDisk = (body: string | Uint8Array): Buffer => Buffer.from(body)

const timeline = (studio: Record<string, unknown> = {}): string =>
  JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Bande',
    metadata: { aidesktopstudio: studio },
    global_start_time: null,
    tracks: { OTIO_SCHEMA: 'Stack.1', children: [] },
  })

describe('a montage held as OpenTimelineIO', () => {
  // The whole point of the format being the document: nothing of ours may sit in the file, or
  // another application reads a first line it has no schema for.
  it('writes the standard file and nothing else', () => {
    const written = otio.write({
      version: 1,
      kind: 'sequence',
      title: 'Bande',
      updatedAt: '',
      content: timeline({ documentId: 'doc-7' }),
    })

    expect(otio.read(onDisk(written))).toMatchObject({ kind: 'sequence', id: 'doc-7' })
    expect(onDisk(written).toString('utf8').startsWith('{')).toBe(true)
  })

  // The field another application shows. A save already carries the title; a RENAME is what would
  // otherwise leave the old one inside a file the studio has just called something else.
  it('stamps the title into the name the standard holds', () => {
    const written = otio.write({
      version: 1,
      kind: 'sequence',
      title: 'Bande son',
      updatedAt: '',
      content: timeline(),
    })

    expect(written).toContain('"name": "Bande son"')
  })

  /**
   * The one place a save can be stopped. A window that mistook this file's format would put a
   * body no reader understands into it, and the next listing would drop the document from the
   * project altogether — file there, invisible, and no envelope left to recover it from.
   */
  it('refuses to write a body that is not a timeline', () => {
    const draft: Omit<DocumentFile, 'content'> = {
      version: 1,
      kind: 'sequence',
      title: '',
      updatedAt: '',
    }

    expect(() => otio.write({ ...draft, content: '{"tracks":[],"settings":{}}' })).toThrow()
    expect(() => otio.write({ ...draft, content: 'not json at all' })).toThrow()
  })

  it('reads a montage back as a sequence document, content untouched', () => {
    const content = timeline({ documentId: 'doc-7' })

    expect(otio.read(onDisk(content))).toEqual({
      version: DOCUMENT_VERSION,
      kind: 'sequence',
      title: '',
      updatedAt: '',
      id: 'doc-7',
      content,
    })
  })

  /**
   * A file another application wrote knows nothing of our ids. It still opens: the descriptor
   * falls back on the file name, exactly as it does for a document written before version 3.
   */
  it('takes no id from a file that carries none', () => {
    expect(otio.read(onDisk(timeline())).id).toBeUndefined()
    expect(otio.read(onDisk(JSON.stringify({ OTIO_SCHEMA: 'Timeline.1' }))).id).toBeUndefined()
  })

  // Refused rather than opened empty: a tab showing nothing is indistinguishable from a new
  // document, and the next ⌘S would write that over whatever the file really held.
  it('refuses a file that is not a timeline', () => {
    expect(() => otio.read(onDisk('{"OTIO_SCHEMA":"Clip.1"}'))).toThrow()
    expect(() => otio.read(onDisk('not json at all'))).toThrow()
  })
})
