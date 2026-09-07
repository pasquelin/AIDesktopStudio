import { describe, expect, it } from 'vitest'
import { DOCUMENT_VERSION } from '@shared/domain/document'
import { MANIFEST_VERSION } from '@shared/domain/project'
import {
  parseAssetQuery,
  parseDocumentDraft,
  parseDocumentEnvelope,
  parseDocumentId,
  parseDocumentKind,
  parseFolderPath,
  parseLandingFolder,
  parseManifest,
} from './validation'

const valid = {
  version: DOCUMENT_VERSION,
  kind: 'scene',
  title: 'Untitled',
  updatedAt: '2026-08-07T10:00:00.000Z',
}

describe('parseDocumentId', () => {
  it('accepts an ordinary id', () => {
    expect(parseDocumentId('doc_a3f1')).toBe('doc_a3f1')
  })

  // The id ends up in a path, and the renderer is what supplies it.
  it('refuses anything that would walk out of the documents folder', () => {
    expect(() => parseDocumentId('../../etc/passwd')).toThrow()
    expect(() => parseDocumentId('nested/id')).toThrow()
    expect(() => parseDocumentId('back\\slash')).toThrow()
    expect(() => parseDocumentId('..')).toThrow()
    expect(() => parseDocumentId('.')).toThrow()
  })

  it('refuses an empty id', () => {
    expect(() => parseDocumentId('')).toThrow()
    expect(() => parseDocumentId('   ')).toThrow()
  })

  /**
   * No escape, but `writeFile` throws on a NUL — after the folder was made and the files before
   * it were written, which leaves something nobody can tell from a finished piece of work.
   */
  it('refuses a control character, which no filesystem call survives', () => {
    expect(() => parseDocumentId('a\u0000b')).toThrow()
    expect(() => parseDocumentId('a\nb')).toThrow()
    expect(() => parseDocumentId('a\u001fb')).toThrow()
  })
})

describe('parseDocumentKind', () => {
  it('accepts a declared kind', () => {
    expect(parseDocumentKind('scene')).toBe('scene')
  })

  it('refuses a kind no editor answers for', () => {
    expect(() => parseDocumentKind('sculpture')).toThrow()
    expect(() => parseDocumentKind(null)).toThrow()
  })
})

describe('parseDocumentEnvelope', () => {
  it('accepts a well-formed envelope', () => {
    expect(parseDocumentEnvelope(valid)).toEqual(valid)
  })

  // The content lives on the lines under the envelope and never reaches this schema: what a
  // kind stores is its editor's business, and parsing it here would put every editor's format
  // on the thread that owns every window.
  it('drops whatever a hand edit put beside the envelope', () => {
    expect(parseDocumentEnvelope({ ...valid, content: { nodes: [] } })).toEqual(valid)
  })

  // A project folder is user territory: hand-edited, truncated, or written by an older build.
  it('refuses a file missing what every reader needs', () => {
    expect(() => parseDocumentEnvelope({ ...valid, version: undefined })).toThrow()
    expect(() => parseDocumentEnvelope({ ...valid, kind: 'nonsense' })).toThrow()
    expect(() => parseDocumentEnvelope({ ...valid, updatedAt: '' })).toThrow()
    expect(() => parseDocumentEnvelope(null)).toThrow()
    expect(() => parseDocumentEnvelope('a string')).toThrow()
  })

  it('refuses a version outside the range this build understands', () => {
    expect(() => parseDocumentEnvelope({ ...valid, version: 0 })).toThrow()
    expect(() => parseDocumentEnvelope({ ...valid, version: 1.5 })).toThrow()
    // A file from a later build is refused, not read as if it were this one and then
    // flattened by the next save.
    expect(() => parseDocumentEnvelope({ ...valid, version: DOCUMENT_VERSION + 1 })).toThrow()
  })
})

describe('parseManifest', () => {
  const manifest = {
    version: MANIFEST_VERSION,
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
  }

  it('reads a manifest this build wrote', () => {
    expect(parseManifest(manifest)).toEqual(manifest)
  })

  // A project written before the name left the manifest opens unchanged: the field is simply not
  // read any more, so nothing has to be migrated.
  it('reads a manifest written when the name still lived here', () => {
    expect(parseManifest({ ...manifest, name: 'Reel' })).toEqual(manifest)
  })

  // The same cap `documentEnvelope` has always carried, and for a heavier reason: a document
  // flattened by a later save is one file, a project is the whole folder.
  it('refuses a version outside the range this build understands', () => {
    expect(() => parseManifest({ ...manifest, version: 0 })).toThrow()
    expect(() => parseManifest({ ...manifest, version: 1.5 })).toThrow()
    expect(() => parseManifest({ ...manifest, version: MANIFEST_VERSION + 1 })).toThrow()
  })

  it('refuses a manifest a field short', () => {
    expect(() => parseManifest({ version: MANIFEST_VERSION })).toThrow()
  })
})

describe('parseDocumentDraft', () => {
  it('keeps what the editor owns, serialized as it arrived', () => {
    expect(parseDocumentDraft({ title: 'Stone', content: '{"tiling":2}' })).toEqual({
      title: 'Stone',
      content: '{"tiling":2}',
    })
  })

  // The editor serializes; the file layer writes. A draft that arrives as anything else has
  // been built by hand, and writing it would put an object where a document goes.
  it('refuses a content that was never serialized', () => {
    expect(() => parseDocumentDraft({ title: 'Stone', content: { tiling: 2 } })).toThrow()
    expect(() => parseDocumentDraft({ title: 'Stone' })).toThrow()
  })

  // The renderer owns none of these three: the file layer stamps them.
  it('drops an envelope the renderer tried to dictate', () => {
    const drafted = parseDocumentDraft({
      title: 'Stone',
      content: '{}',
      version: 99,
      kind: 'image',
      updatedAt: 'whenever',
    })

    expect(drafted).toEqual({ title: 'Stone', content: '{}' })
  })

  it('refuses a draft with no title', () => {
    expect(() => parseDocumentDraft({ content: null })).toThrow()
    expect(() => parseDocumentDraft(null)).toThrow()
  })

  /**
   * The field this schema does not name is the field the disk never sees, and zod strips in
   * silence. An image document holds one PNG per layer: without `parts` here, `storeFolder`
   * replaced the folder with a manifest alone — a save that threw away the pixels it was called
   * to keep, and nothing in the reply said so.
   */
  it('keeps the surfaces that go beside the content', () => {
    const png = Uint8Array.from([137, 80, 78, 71])
    const drafted = parseDocumentDraft({
      title: 'Poster',
      content: '{"layers":[{"id":"l1"}]}',
      parts: [{ path: 'data/p_l1.png', png }],
    })

    expect(drafted.parts).toEqual([{ path: 'data/p_l1.png', png }])
  })

  // These names become ZIP entries the studio writes AND reads back, so one naming its way out
  // of the container has to be turned away at the boundary.
  it('refuses a surface that names its way out of the container', () => {
    expect(() =>
      parseDocumentDraft({
        title: 'Poster',
        content: '{}',
        parts: [{ path: '../escaped.png', png: Uint8Array.from([137]) }],
      }),
    ).toThrow()
  })

  // Same silence, same cost: the link is what brings a double-click back to the tab that edits
  // an asset, and it is read off the file after a restart.
  it('keeps the asset a document was opened to edit', () => {
    const drafted = parseDocumentDraft({ title: 'Poster', content: '{}', sourceAssetId: 'asset_1' })

    expect(drafted.sourceAssetId).toBe('asset_1')
  })

  it('leaves both out when the editor sends neither', () => {
    const drafted = parseDocumentDraft({ title: 'Stone', content: '{}' })

    expect(drafted.parts).toBeUndefined()
    expect(drafted.sourceAssetId).toBeUndefined()
  })
})

describe('parseAssetQuery', () => {
  it('lets a workspace ask for the kinds it uses', () => {
    expect(parseAssetQuery({ types: ['image', 'skybox'] })).toEqual({
      types: ['image', 'skybox'],
    })
  })

  it('refuses a kind the studio does not have', () => {
    expect(() => parseAssetQuery({ types: ['hologram'] })).toThrow()
    expect(() => parseAssetQuery({ type: 'hologram' })).toThrow()
  })

  it('refuses a list longer than there are kinds', () => {
    // A caller asking for eight of six kinds has lost track of what it wants.
    const tooMany = Array.from({ length: 8 }, () => 'image')
    expect(() => parseAssetQuery({ types: tooMany })).toThrow()
  })

  it('narrows by where the bytes are, and by nothing else that looks like it', () => {
    expect(parseAssetQuery({ location: 'cloud' })).toEqual({ location: 'cloud' })
    expect(() => parseAssetQuery({ location: 'remote' })).toThrow()
  })

  it('accepts a sync state the catalogue can hold, and refuses the rest', () => {
    expect(parseAssetQuery({ syncStatus: 'local-ahead' })).toEqual({ syncStatus: 'local-ahead' })
    expect(() => parseAssetQuery({ syncStatus: 'pushing' })).toThrow()
  })

  it('refuses a group that names nothing', () => {
    expect(parseAssetQuery({ groupId: 'job_1' })).toEqual({ groupId: 'job_1' })
    expect(() => parseAssetQuery({ groupId: '   ' })).toThrow()
  })

  /**
   * The one field a missing schema line does not REFUSE but silently drops, `z.object` stripping
   * what it does not declare: `asset.get` then asked an unfiltered catalogue and answered its
   * first rows as though they were the generation's own output.
   */
  it('keeps the ids a caller reads a generation back by', () => {
    expect(parseAssetQuery({ ids: ['asset_1', 'asset_2'] })).toEqual({
      ids: ['asset_1', 'asset_2'],
    })
    expect(() => parseAssetQuery({ ids: ['  '] })).toThrow()
  })

  it('asks for everything when asked for nothing', () => {
    expect(parseAssetQuery({})).toEqual({})
  })

  /**
   * 🛑 The whole of what keeps the studio's own rows out of a window: `hidden` reaches
   * `.resources/` past `NOT_PRIVATE`, and it is the ABSENCE of a line above that refuses it here.
   * A field added to the schema by reflex would hand the explorer everything the studio owns,
   * with the typecheck, the lint and every other case of this file still green.
   */
  it('drops the reach into what the studio owns, which only the main process may ask for', () => {
    expect(parseAssetQuery({ path: '.resources/Materials/GridLarge.png', hidden: true })).toEqual({
      path: '.resources/Materials/GridLarge.png',
    })
  })
})

/**
 * The one channel where a window names a path of its own. Everything here is about the refusal:
 * `join(root, '../../..')` walks out of the project on every platform, and the renderer has no
 * business reaching a folder nobody opened.
 */
describe('parseFolderPath', () => {
  it('takes the project root, which is the empty path', () => {
    expect(parseFolderPath('')).toBe('')
  })

  it('takes a folder inside the project', () => {
    expect(parseFolderPath('assets/img')).toBe('assets/img')
  })

  it.each(['..', '../secrets', 'assets/../..', 'assets/./img'])('refuses %s', path => {
    expect(() => parseFolderPath(path)).toThrow()
  })

  // Windows takes a backslash as a separator, so a check that only looked at `/` would let
  // `..\..` walk straight out.
  it.each(['..\\secrets', 'assets\\img'])('refuses the backslash in %s', path => {
    expect(() => parseFolderPath(path)).toThrow()
  })

  it.each(['/etc', 'C:\\Windows'])('refuses the absolute path %s', path => {
    expect(() => parseFolderPath(path)).toThrow()
  })

  // 🛑 Forward slashes, so `isAbsolute` answers FALSE on this Mac and on the Linux runner: the
  // drive letter is what refuses it, and dropping that clause leaves both of them green.
  it.each(['C:/Windows', 'd:/data'])('refuses the drive letter in %s', path => {
    expect(() => parseFolderPath(path)).toThrow()
  })

  // Both rows, so the bound is pinned at one number rather than anywhere inside an interval.
  it('refuses a path past its own bound and keeps the last one under it', () => {
    expect(parseFolderPath('a'.repeat(1024))).toBe('a'.repeat(1024))
    expect(() => parseFolderPath('a'.repeat(1025))).toThrow()
  })

  // Code points, not UTF-16 units: an astral path is half as long as `length` reads it.
  it('counts the bound in code points, so an astral path is not halved', () => {
    const astral = String.fromCodePoint(0x1f3ac).repeat(1024)
    expect(parseFolderPath(astral)).toBe(astral)
  })

  // Measured, not assumed: APFS takes a control character in a name and `readdir` hands it back,
  // so refusing here would lose a folder that exists. Built rather than typed — a literal one
  // makes this file binary to `git grep`.
  it('takes the control character a folder on disk may really carry', () => {
    expect(parseFolderPath(`assets/${String.fromCodePoint(0x85)}img`)).toBe(
      `assets/${String.fromCodePoint(0x85)}img`,
    )
  })

  it('refuses what is not a string at all', () => {
    expect(() => parseFolderPath(null)).toThrow()
  })
})

describe('parseLandingFolder', () => {
  it('takes the folder a document was filed in', () => {
    expect(parseLandingFolder('Images/Croquis')).toBe('Images/Croquis')
  })

  // A caller with no folder to offer leaves the writer its own default, which is not the same
  // thing as naming the project root.
  it('takes nothing at all, and the root, apart', () => {
    expect(parseLandingFolder(undefined)).toBeUndefined()
    expect(parseLandingFolder('')).toBe('')
  })

  it('refuses a walk out of the project, as every path channel does', () => {
    expect(() => parseLandingFolder('../secrets')).toThrow()
  })

  /**
   * On top of the shape, and this one is the field's own rule made true: nothing a user can
   * click reaches here, since the tree lists no hidden folder — and a document written into
   * `.index/` would be swept by the next rescan.
   */
  it.each(['.index', '.index/thumbs', 'Images/.hidden'])('refuses the studio’s own %s', path => {
    expect(() => parseLandingFolder(path)).toThrow()
  })
})
