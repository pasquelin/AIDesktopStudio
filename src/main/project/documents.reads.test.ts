import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DocumentBody from './documentBody'
import type { DocumentFiles } from './documents'
import { documentFilesAt } from './project-fixtures'

/**
 * How many times one gesture parses one document.
 *
 * Apart from `documents.test.ts` because it MOCKS the body format to count through it, and the
 * other seventy-five cases have no business running against a wrapped one.
 *
 * The unit is the parse rather than the syscall, and that is what the defect was about: a `.otio`
 * carries no head of ours, so finding out what a file IS reads and parses all of it —
 * `documents.bench.ts` measures 17 ms at 5 000 clips, on the thread that owns every window.
 * Doing it twice to open one document is not a slow read, it is the same read twice.
 */
const { parses } = vi.hoisted(() => ({ parses: [] as string[] }))

vi.mock('./documentBody', async importOriginal => {
  const real = await importOriginal<typeof DocumentBody>()
  return {
    ...real,
    bodyFormatOf: (extension: string) => {
      const format = real.bodyFormatOf(extension)
      return {
        ...format,
        read: (body: Buffer) => {
          parses.push(`read${extension}`)
          return format.read(body)
        },
        readHead: (file: string) => {
          parses.push(`readHead${extension}`)
          return format.readHead(file)
        },
      }
    },
  }
})

const NOW = '2026-08-18T10:00:00.000Z'

const otio = (studio: Record<string, unknown>): string =>
  JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Bande',
    metadata: { aidesktopstudio: studio },
    global_start_time: null,
    tracks: { OTIO_SCHEMA: 'Stack.1', children: [] },
  })

describe('what one gesture on a montage costs', () => {
  let root = ''
  let documents: DocumentFiles

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-reads-'))
    documents = documentFilesAt(root, NOW)
    await writeFile(
      join(root, 'Rushes.otio'),
      otio({ documentId: 'doc-1', documentKind: 'sequence' }),
      'utf8',
    )
    parses.length = 0
  })

  // Two before this was written: `locate` verified the file by reading it, then threw that read
  // away and `read` opened the same file again.
  it('parses a listed montage once when it is opened', async () => {
    await documents.list()
    parses.length = 0

    await documents.read('doc-1', 'sequence')

    expect(parses).toEqual(['read.otio'])
  })

  // Four before: verify, describe, verify again, then read. The listing itself is the first of
  // the two left, and it is the one that had to happen.
  it('parses a listed montage once when it is renamed', async () => {
    await documents.list()
    parses.length = 0

    await documents.rename('doc-1', 'sequence', 'Bande finale')

    expect(parses).toEqual(['read.otio'])
  })

  // The listing is what pays for the walk; a second one over an unchanged folder pays nothing.
  // Nothing held that before: every listing read and parsed every montage of the project.
  it('parses nothing on a second listing of an unchanged folder', async () => {
    await documents.list()
    parses.length = 0

    expect(await documents.list()).toHaveLength(1)
    expect(parses).toEqual([])
  })

  // The cache is keyed on the clock and the size, so a file the user replaced is read again —
  // the whole point of not keeping a registry beside the folder.
  it('parses again a montage that changed on disk', async () => {
    await documents.list()
    parses.length = 0

    await writeFile(
      join(root, 'Rushes.otio'),
      otio({ documentId: 'doc-1', documentKind: 'sequence', note: 'changed under the studio' }),
      'utf8',
    )

    expect(await documents.list()).toHaveLength(1)
    expect(parses).toEqual(['readHead.otio'])
  })

  /**
   * The SAME LENGTH, which is the only rewrite that exercises the clock half of the key — the case
   * above adds a field, so its size moves and a cache comparing size alone would pass it.
   *
   * It is also the shape of the rewrite the studio cannot see coming: another application saving a
   * montage in place, where the payload changed and the byte count did not.
   */
  it('parses again a montage rewritten to exactly the same length', async () => {
    await documents.list()
    parses.length = 0

    const before = otio({ documentId: 'doc-1', documentKind: 'sequence', note: 'aaa' })
    const after = otio({ documentId: 'doc-1', documentKind: 'sequence', note: 'bbb' })
    expect(after).toHaveLength(before.length)

    await writeFile(join(root, 'Rushes.otio'), before, 'utf8')
    await documents.list()
    parses.length = 0
    await writeFile(join(root, 'Rushes.otio'), after, 'utf8')

    expect(await documents.list()).toHaveLength(1)
    expect(parses).toEqual(['readHead.otio'])
  })
})
