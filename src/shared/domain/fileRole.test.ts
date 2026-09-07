import { describe, expect, it } from 'vitest'
import { EXTENSIONS_BY_KIND } from './document'
import { FILE_DOMAINS, natureOf, opensInStudio, sourceNatureOf } from './fileRole'

describe('natureOf', () => {
  /**
   * The decision the whole table rests on: the folder no longer votes. There is no such thing as
   * a texture file — there are PNGs, and a material document that gives some of them a part to
   * play. `Textures/` says nothing, and neither does a `_normal` suffix: a normal map and an
   * albedo are both PNGs, and guessing would be right often and wrong silently.
   */
  it('reads a source file from its extension, whatever folder it sits in', () => {
    expect(natureOf('Characters/hero.png')).toEqual({ domain: 'image', role: 'source' })
    expect(natureOf('A001.mov')).toEqual({ domain: 'video', role: 'source' })
    expect(natureOf('take.wav')).toEqual({ domain: 'audio', role: 'source' })
    expect(natureOf('prop.glb')).toEqual({ domain: 'mesh', role: 'source' })
    expect(natureOf('Textures/brick_normal.png').domain).toBe('image')
    expect(natureOf('Skies/sunset.hdr').domain).toBe('image')
  })

  it('files a document as an edit, in the domain its editor works in', () => {
    expect(natureOf('Level.gltf')).toEqual({ domain: 'mesh', role: 'edit' })
    expect(natureOf('Cover.ora')).toEqual({ domain: 'image', role: 'edit' })
    expect(natureOf('Montage.otio')).toEqual({ domain: 'video', role: 'edit' })
    expect(natureOf('Brick.mtlx')).toEqual({ domain: 'material', role: 'edit' })
    expect(natureOf('Dusk.mtlx')).toEqual({ domain: 'material', role: 'edit' })
  })

  // A project folder is the user's own: a `.pdf` of notes beside the rushes is shown and left
  // alone. Inventing a domain for it would be worse than saying there is none.
  it('says `other` for a file the studio has no domain for', () => {
    expect(natureOf('notes.pdf')).toEqual({ domain: 'other', role: 'source' })
    expect(natureOf('README')).toEqual({ domain: 'other', role: 'source' })
  })

  /**
   * Asymmetric on purpose. `kindForExtension` is case-sensitive by contract — the listing that
   * walks the folder does not read `.SCENE` as a document — so answering `edit` here would show
   * the user an editable document nothing can open. Source extensions carry no such contract.
   */
  it('folds the case of a source extension, and not of a document one', () => {
    expect(natureOf('HERO.PNG').domain).toBe('image')
    expect(natureOf('Level.SCENE')).toEqual({ domain: 'other', role: 'source' })
  })

  // The compiler cannot see this one: `EXTENSIONS_BY_KIND` is complete by its type, but nothing
  // makes `natureOf` agree with it, and a kind that fell through would be filed as `other`.
  it('knows every document extension the studio reads', () => {
    for (const extension of Object.values(EXTENSIONS_BY_KIND)) {
      expect(natureOf(`Untitled${extension}`).role).toBe('edit')
    }
  })

  it('offers every domain a file can be filed under', () => {
    expect(FILE_DOMAINS).toContain('other')
    expect(FILE_DOMAINS).toContain('material')
  })
})

describe('opensInStudio', () => {
  it('opens a picture, a take, a sound and a model here', () => {
    expect(opensInStudio('facade.jpg')).toBe(true)
    expect(opensInStudio('rush.mp4')).toBe(true)
    expect(opensInStudio('theme.wav')).toBe(true)
    expect(opensInStudio('chair.glb')).toBe(true)
  })

  it('always opens a document of the studio', () => {
    expect(opensInStudio('Planche.ora')).toBe(true)
    expect(opensInStudio('Level.gltf')).toBe(true)
  })

  it('leaves a file it has no editor for to the system', () => {
    expect(opensInStudio('brief.txt')).toBe(false)
    expect(opensInStudio('storyboard.pdf')).toBe(false)
  })

  it('catalogues pictures that the canvas cannot decode without opening an empty editor', () => {
    for (const name of ['scan.tif', 'plate.exr', 'dome.hdr']) {
      expect(opensInStudio(name)).toBe(false)
    }
    expect(opensInStudio('photo.heic')).toBe(false)
  })

  it('catalogues an OpenEXR as an image without promising to display it', () => {
    expect(sourceNatureOf('height.exr')).toEqual({
      domain: 'image',
      openable: false,
      catalogable: true,
    })
  })

  it('catalogues a broadcast rush without opening a player that cannot decode it', () => {
    // Chromium decodes no MXF: opened as a tab it shows a blank player, where handing the file
    // to the system opened the one that reads it.
    expect(sourceNatureOf('rush.mxf')).toEqual({
      domain: 'video',
      openable: false,
      catalogable: true,
    })
  })

  // A montage IS a document now, whichever application wrote it — the studio reads the standard
  // rather than a spelling of its own, so a cut from Resolve opens where its own do.
  it('opens a cut as the document it is, whoever wrote it', () => {
    expect(natureOf('Bande.otio')).toEqual({ domain: 'video', role: 'edit' })
    expect(opensInStudio('Bande.otio')).toBe(true)
  })

  it('opens every self-contained mesh the import dialog advertises', () => {
    for (const name of [
      'chair.glb',
      'chair.obj',
      'chair.fbx',
      'chair.stl',
      'chair.ply',
      'chair.usdz',
    ]) {
      expect(opensInStudio(name)).toBe(true)
      expect(natureOf(name).domain).toBe('mesh')
    }
  })

  // The blind spot `opensInStudio` writes down, held here so it fails the day it changes.
  it('cannot tell a plain glTF mesh from a scene document, the name being all it has', () => {
    expect(natureOf('chair.gltf')).toEqual({ domain: 'mesh', role: 'edit' })
    expect(opensInStudio('chair.gltf')).toBe(true)
  })

  it('folds the case, as the source table it reads does', () => {
    expect(opensInStudio('FACADE.JPG')).toBe(true)
  })
})
