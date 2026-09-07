import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_KINDS,
  FILED_KINDS,
  documentPath,
  documentsByPath,
  EXTENSIONS_BY_KIND,
  isDocumentKind,
  kindForExtension,
  kindsForExtension,
  kindForWorkspace,
  workspaceForKind,
  documentExtensionOf,
  documentStemOf,
  type DocumentDescriptor,
} from './document'
import { extensionOf, stemOf } from './fileName'
import { WORKSPACE_IDS } from './workspace'

describe('kindForWorkspace', () => {
  it('gives the image workspace an image document', () => {
    expect(kindForWorkspace('image')).toBe('image')
  })

  it('gives the 3d workspace a scene document', () => {
    expect(kindForWorkspace('3d')).toBe('scene')
  })

  it('gives the video workspace a sequence document', () => {
    expect(kindForWorkspace('video')).toBe('sequence')
  })

  it('gives the audio workspace a take to edit', () => {
    expect(kindForWorkspace('audio')).toBe('audio')
  })

  it('gives the skyboxes workspace a sky to edit', () => {
    expect(kindForWorkspace('skyboxes')).toBe('skybox')
  })

  it('gives the materials workspace a material to edit', () => {
    expect(kindForWorkspace('materials')).toBe('material')
  })

  // Every workspace opens a document of its own now. The `null` branch stays for the next one
  // to arrive: a workspace whose editor does not exist yet disables the new-document button.
  it('answers with a kind for every workspace the studio shows', () => {
    for (const id of WORKSPACE_IDS) expect(kindForWorkspace(id)).not.toBeNull()
  })

  it('answers for every known workspace', () => {
    for (const id of WORKSPACE_IDS) expect(() => kindForWorkspace(id)).not.toThrow()
  })
})

describe('workspaceForKind', () => {
  it('sends every kind back to the workspace that opens it', () => {
    expect(workspaceForKind('scene')).toBe('3d')
    expect(workspaceForKind('image')).toBe('image')
    expect(workspaceForKind('sequence')).toBe('video')
    expect(workspaceForKind('audio')).toBe('audio')
    expect(workspaceForKind('skybox')).toBe('skyboxes')
  })

  /**
   * A document filed under a workspace that does not open it is a tab nothing can render, and
   * listing a project folder builds one descriptor per file from this answer alone.
   *
   * Not a bijection any more: the 3D space opens a scene AND the interfaces shown over it, so
   * what `kindForWorkspace` answers is the one its New button makes — the FIRST of the list.
   */
  it('files every kind under a workspace that opens it', () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(workspaceForKind(kind)).not.toBeNull()
    }
  })

  it('answers the kind a space CREATES, where it opens more than one', () => {
    expect(kindForWorkspace('3d')).toBe('scene')
    expect(workspaceForKind('gui')).toBe('3d')
  })
})

describe('kindForExtension', () => {
  // Where two kinds share a spelling this answers the first of them, and the FILE settles it —
  // `documentBody.ts` reads which kind out of what the file itself carries.
  it('answers the first kind of a spelling two of them share', () => {
    expect(kindForExtension('.otio')).toBe('sequence')
    expect(kindForExtension('.gltf')).toBe('scene')
  })

  /**
   * Every kind is held in a format other applications already read. The studio's own spellings
   * are not written any more, and they are not READ any more either: one left in a folder is not
   * a document of this build.
   */
  it('holds every kind in an open format, and reads no spelling of the studio’s own', () => {
    expect([...FILED_KINDS].map(kind => EXTENSIONS_BY_KIND[kind])).toEqual([
      '.ora',
      '.gltf',
      '.otio',
      '.otio',
      '.gltf',
      '.mtlx',
      // TypeScript's own, and the one file the studio writes with nothing of its own in it.
      '.ts',
      // The one COMPOUND spelling: plain JSON, so any tool reads it, under a suffix that tells
      // an interface from every other `.json` a project holds.
      '.ui.json',
    ])
    for (const gone of ['.img', '.scene', '.seq', '.aud', '.sky', '.tex']) {
      expect(kindForExtension(gone)).toBeNull()
    }
  })

  // A project folder is the user's own: it holds notes, exports, and whatever else was dropped
  // in there. Only what this build wrote is a document.
  it('answers null for anything else in the folder', () => {
    expect(kindForExtension('.txt')).toBeNull()
    expect(kindForExtension('.tmp')).toBeNull()
    expect(kindForExtension('')).toBeNull()
    expect(kindForExtension('.obj')).toBeNull()
  })

  // `documentPath` writes in lower case: accepted here, a `.SCENE` would be listed under a name
  // `read` cannot find on a case-sensitive volume, and saved beside the original rather than over
  // it.
  it('refuses an extension in capitals rather than listing a file it could not reopen', () => {
    expect(kindForExtension('.SCENE')).toBeNull()
  })
})

describe('isDocumentKind', () => {
  it('accepts every declared kind', () => {
    for (const kind of DOCUMENT_KINDS) expect(isDocumentKind(kind)).toBe(true)
  })

  it('rejects what a hand-edited file could hold', () => {
    expect(isDocumentKind('sculpture')).toBe(false)
    expect(isDocumentKind('')).toBe(false)
    expect(isDocumentKind(null)).toBe(false)
    expect(isDocumentKind(undefined)).toBe(false)
    expect(isDocumentKind(3)).toBe(false)
  })
})

describe('documentPath', () => {
  // Relative, and under the folder the project creates: a project folder can be moved.
  it('names the file after the kind, so a project folder reads by eye', () => {
    expect(documentPath('a3f1', 'scene')).toBe('documents/a3f1.gltf')
    expect(documentPath('a3f1', 'image')).toBe('documents/a3f1.ora')
    expect(documentPath('a3f1', 'sequence')).toBe('documents/a3f1.otio')
  })

  // The compiler keeps `EXTENSIONS_BY_KIND` complete; nothing keeps `DOCUMENT_KINDS` complete,
  // and a kind missing from it is refused at the IPC boundary without a word.
  // Every FILED kind, and only those: a character has no file in the project, so an extension
  // for it would make every model of every library read as a document of this build.
  it('lists every filed kind the extension table knows', () => {
    expect([...FILED_KINDS].sort()).toEqual(Object.keys(EXTENSIONS_BY_KIND).sort())
    expect(FILED_KINDS).not.toContain('character')
  })

  // What a file's own head is allowed to claim. A pair here is a container serving two editors;
  // a THIRD kind joining one would let a file open in an editor nothing meant it for.
  it('bounds a shared spelling to the two kinds that container serves', () => {
    expect(kindsForExtension('.otio')).toEqual(['sequence', 'audio'])
    expect(kindsForExtension('.gltf')).toEqual(['scene', 'skybox'])
    expect(kindsForExtension('.ora')).toEqual(['image'])
    expect(kindsForExtension('.txt')).toEqual([])
  })
})

/**
 * 🛑 `extensionOf` cuts at the LAST dot, so it answers `.json` for `hud.ui.json`. Everything that
 * tells a document by its extension asks `documentExtensionOf` instead — and a `.json` that is
 * not one of ours must not become a document because of it.
 */
describe('a compound extension', () => {
  it('is read whole, where the plain reading stops at the last dot', () => {
    expect(documentExtensionOf('hud.ui.json')).toBe('.ui.json')
    expect(extensionOf('hud.ui.json')).toBe('.json')
  })

  it('leaves every other name to the plain reading', () => {
    expect(documentExtensionOf('Level.gltf')).toBe('.gltf')
    expect(documentExtensionOf('package.json')).toBe('.json')
    expect(documentExtensionOf('Untitled')).toBe('')
  })

  /** The whole point: a `.json` of the project is not a document, and a `.ui.json` is. */
  it('tells a document from an ordinary json', () => {
    expect(kindForExtension(documentExtensionOf('hud.ui.json'))).toBe('gui')
    expect(kindForExtension(documentExtensionOf('tsconfig.json'))).toBeNull()
  })

  it('names a dotted stem no document, however many dots it holds', () => {
    expect(documentExtensionOf('my.hud.ui.json')).toBe('.ui.json')
    expect(documentExtensionOf('a.b.c.txt')).toBe('.txt')
  })
})

/**
 * The stem is the pair of the extension, and it has to be read the same way: `stemOf` cuts at
 * the last dot, so pairing it with a compound suffix made a copy `hud.ui 2.ui.json` — and the
 * one after it `hud.ui 2.ui 2.ui.json`.
 */
describe('the stem of a document name', () => {
  it('drops the whole compound extension, not the last dot', () => {
    expect(documentStemOf('hud.ui.json')).toBe('hud')
    expect(stemOf('hud.ui.json')).toBe('hud.ui')
  })

  it('reads every other name as the plain stem does', () => {
    expect(documentStemOf('Level.gltf')).toBe('Level')
    expect(documentStemOf('package.json')).toBe('package')
    expect(documentStemOf('Untitled')).toBe('Untitled')
  })

  /** Stem and extension spell the file back, which is what the explorer badge compares. */
  it.each(['hud.ui.json', 'Level.gltf', 'notes.txt', 'Untitled'])('spells %s back', name => {
    expect(`${documentStemOf(name)}${documentExtensionOf(name)}`).toBe(name)
  })
})

const document = (
  over: Partial<DocumentDescriptor> & Pick<DocumentDescriptor, 'path' | 'id'>,
): DocumentDescriptor => ({
  kind: 'scene',
  title: over.id,
  workspace: '3d',
  ...over,
})

describe('documents keyed by the path they were read from', () => {
  it('hands the last of two same paths, never the first', () => {
    const first = document({ id: 'a', path: 'Niveau.gltf', title: 'first' })
    const second = document({ id: 'b', path: 'Niveau.gltf', title: 'second' })

    expect(documentsByPath([first, second]).get('Niveau.gltf')).toBe(second)
  })
})
