import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import {
  ASSET_DUPLICATE_NAME,
  freeAnimationPath,
  freeAssetPath,
  moveAssetFile,
  moveAssetFileToFree,
} from './assetFile'

let root = ''

const asset = (fields: Partial<Asset>): Asset => ({
  id: 'asset_1',
  name: 'Ruelle bleue',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-16T10:00:00.000Z',
  ...fields,
})

const put = async (relative: string): Promise<void> => {
  await writeFile(join(root, relative), new Uint8Array([1, 2, 3]))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'assetFile-'))
  await mkdir(join(root, 'assets/img'), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('where a generated asset lands', () => {
  it('is named after the asset, not after its identifier', async () => {
    const path = await freeAssetPath(root, 'assets/img', 'Ruelle bleue', '.png')
    expect(path).toBe('assets/img/Ruelle bleue.png')
  })

  /**
   * A job of four outputs lands four times under one prompt, and the studio has nobody to ask.
   * A name a user TYPED is refused instead — see `checkAssetName`.
   */
  it('suffixes rather than overwriting what the folder already holds', async () => {
    await put('assets/img/Ruelle bleue.png')
    expect(await freeAssetPath(root, 'assets/img', 'Ruelle bleue', '.png')).toBe(
      'assets/img/Ruelle bleue 2.png',
    )

    await put('assets/img/Ruelle bleue 2.png')
    expect(await freeAssetPath(root, 'assets/img', 'Ruelle bleue', '.png')).toBe(
      'assets/img/Ruelle bleue 3.png',
    )
  })

  /**
   * The folder is asked, never the catalogue: a project folder is the user's and holds files no
   * row has heard of. One dropped in by hand would be overwritten without a word.
   */
  it('counts a file nothing in the catalogue knows about as taken', async () => {
    await put('assets/img/Photo.png')

    expect(await freeAssetPath(root, 'assets/img', 'Photo', '.png')).toBe('assets/img/Photo 2.png')
  })

  /**
   * `safeFileName` cuts at the file system's bound, so a base already that long comes back from
   * `${base} 2` as the base itself — every candidate then reads as taken, and the loop never
   * ends. In the process that owns every window.
   */
  it('keeps room for the suffix, so a name already at the bound still terminates', async () => {
    const long = 'a'.repeat(80)
    await put(`assets/img/${long}.png`)

    const path = await freeAssetPath(root, 'assets/img', long, '.png')
    expect(path).toBe(`assets/img/${'a'.repeat(74)} 2.png`)
  })
})

describe('moving an asset file to its new name', () => {
  it('renames the file on disk and answers where it now is', async () => {
    await put('assets/img/asset_1.png')

    const path = await moveAssetFile(root, asset({ path: 'assets/img/asset_1.png' }), 'Ruelle')

    expect(path).toBe('assets/img/Ruelle.png')
    expect(await readdir(join(root, 'assets/img'))).toEqual(['Ruelle.png'])
  })

  it('keeps the extension and the folder — a rename is neither a conversion nor a move', async () => {
    await mkdir(join(root, 'assets/aud'), { recursive: true })
    await put('assets/aud/prise.wav')

    const source = asset({ type: 'audio', path: 'assets/aud/prise.wav' })
    expect(await moveAssetFile(root, source, 'Pas courus')).toBe('assets/aud/Pas courus.wav')
  })

  /**
   * The file it would replace is another asset's, and `rename` takes it without a word on POSIX.
   * Refused rather than suffixed: the name was typed, and suffixing hands back one nobody wrote.
   */
  it('refuses a name the folder already holds rather than overwriting it', async () => {
    await put('assets/img/asset_1.png')
    await put('assets/img/Ruelle.png')

    await expect(
      moveAssetFile(root, asset({ path: 'assets/img/asset_1.png' }), 'Ruelle'),
    ).rejects.toThrow(ASSET_DUPLICATE_NAME)

    expect((await readdir(join(root, 'assets/img'))).sort()).toEqual(['Ruelle.png', 'asset_1.png'])
  })

  /** APFS and NTFS hold ONE file for both, and that file is this asset's own. */
  it('lets an asset change the case of its own name', async () => {
    await put('assets/img/Ruelle.png')

    const path = await moveAssetFile(root, asset({ path: 'assets/img/Ruelle.png' }), 'ruelle')
    expect(path).toBe('assets/img/ruelle.png')
  })

  /**
   * A linked rush keeps its bytes where the user left them. Writing into a folder they merely
   * pointed at is a gesture the studio does not take, so the name stays in the catalogue alone.
   */
  it('leaves an asset with no file of ours alone', async () => {
    expect(await moveAssetFile(root, asset({ sourcePath: '/Users/x/rush.mov' }), 'Prise 4')).toBe(
      undefined,
    )
  })

  /** Refusing would leave a name uncorrectable on the one row that most needs correcting. */
  it('still takes the new name when the file was deleted by hand', async () => {
    const path = await moveAssetFile(root, asset({ path: 'assets/img/gone.png' }), 'Ruelle')
    expect(path).toBe('assets/img/gone.png')
  })

  /** A stored path is user-editable territory — the containment the scheme applies to serve one. */
  it('refuses to move a row pointing outside the project', async () => {
    const escaped = asset({ path: '../../.ssh/id_rsa' })
    expect(await moveAssetFile(root, escaped, 'Ruelle')).toBe('../../.ssh/id_rsa')
  })

  it('does nothing when the file is already called that', async () => {
    await put('assets/img/Ruelle.png')

    expect(await moveAssetFile(root, asset({ path: 'assets/img/Ruelle.png' }), 'Ruelle')).toBe(
      'assets/img/Ruelle.png',
    )
  })
})

/**
 * A caption is a sentence a model wrote: there is nobody to hand a refusal back to, so the name
 * is made to fit rather than rejected — and what comes back is what the folder SETTLED on, which
 * is what lets the row say exactly what the disk says.
 */
describe('moving a file to a name the studio wrote itself', () => {
  it('answers the name it settled on, so the row can carry that one', async () => {
    await put('assets/img/IMG_1234.png')

    const settled = await moveAssetFileToFree(
      root,
      asset({ path: 'assets/img/IMG_1234.png' }),
      'une ruelle bleue',
    )

    expect(settled).toEqual({ name: 'une ruelle bleue', path: 'assets/img/une ruelle bleue.png' })
    expect(await readdir(join(root, 'assets/img'))).toEqual(['une ruelle bleue.png'])
  })

  it('suffixes rather than refusing, and says which name it took', async () => {
    await put('assets/img/IMG_1234.png')
    await put('assets/img/une ruelle.png')

    const settled = await moveAssetFileToFree(
      root,
      asset({ path: 'assets/img/IMG_1234.png' }),
      'une ruelle',
    )

    expect(settled).toEqual({ name: 'une ruelle 2', path: 'assets/img/une ruelle 2.png' })
  })

  /** A caption holding a slash is an ordinary caption and a path traversal at the same time. */
  it('cleans what a file system will not hold, and the row takes the cleaned form', async () => {
    await put('assets/img/IMG_1234.png')

    const settled = await moveAssetFileToFree(
      root,
      asset({ path: 'assets/img/IMG_1234.png' }),
      'vue 3/4 de la ruelle',
    )

    expect(settled?.name).toBe('vue 3 4 de la ruelle')
    expect(settled?.path).toBe('assets/img/vue 3 4 de la ruelle.png')
  })

  it('leaves an asset with no file of ours alone', async () => {
    const linked = asset({ sourcePath: '/Users/x/rush.mov' })
    expect(await moveAssetFileToFree(root, linked, 'une ruelle')).toBe(undefined)
  })
})

/**
 * An animation is the one kind that lands in a FOLDER of its own. The folder carries the name —
 * a rig calls its only clip `NlaTrack` or nothing at all — and the still then has somewhere to
 * live beside it, which is how `resources/animations/` has been laid out since it shipped.
 */
describe('where an imported animation lands', () => {
  const motion = (path: string): Asset => asset({ type: 'animation', name: 'Jump', path })

  it('gives the clip a folder of the asset’s name, and the clip no name at all', async () => {
    expect(await freeAnimationPath(root, 'assets/img', 'Jump', '.glb')).toBe(
      'assets/img/Jump/animation.glb',
    )
    expect(await readdir(join(root, 'assets/img'))).toEqual(['Jump'])
  })

  it('suffixes the FOLDER when one of that name is taken, never the clip', async () => {
    await freeAnimationPath(root, 'assets/img', 'Jump', '.glb')

    expect(await freeAnimationPath(root, 'assets/img', 'Jump', '.glb')).toBe(
      'assets/img/Jump 2/animation.glb',
    )
  })

  // The extension travels: `ANIMATION_EXTENSIONS` takes `.fbx` too, and which file is inside a
  // folder is read rather than spelled.
  it('keeps the extension it was handed', async () => {
    expect(await freeAnimationPath(root, 'assets/img', 'Walk', '.fbx')).toBe(
      'assets/img/Walk/animation.fbx',
    )
  })

  it('renames the folder rather than the clip, and carries the still along', async () => {
    const path = await freeAnimationPath(root, 'assets/img', 'Jump', '.glb')
    await put(path)
    await put('assets/img/Jump/thumb.png')
    await mkdir(join(root, 'assets/img/Jump/.sources'))
    await put('assets/img/Jump/.sources/Jump.fbx')

    expect(await moveAssetFile(root, motion(path), 'Saut')).toBe('assets/img/Saut/animation.glb')
    expect((await readdir(join(root, 'assets/img/Saut'))).sort()).toEqual([
      '.sources',
      'animation.glb',
      'thumb.png',
    ])
    expect(await readdir(join(root, 'assets/img/Saut/.sources'))).toEqual(['Jump.fbx'])
  })

  it('refuses a rename onto a folder another animation holds', async () => {
    const path = await freeAnimationPath(root, 'assets/img', 'Jump', '.glb')
    await put(path)
    await freeAnimationPath(root, 'assets/img', 'Walk', '.glb')

    await expect(moveAssetFile(root, motion(path), 'Walk')).rejects.toThrow(ASSET_DUPLICATE_NAME)
  })

  /**
   * 🛑 The angle this is measured for rather than deduced: a clip a user dropped in by hand and
   * called `animation.glb` reads exactly like one the studio laid out. Its parent is the
   * animations folder itself, and carrying THAT along would rename every other clip's home.
   */
  it('leaves a folder alone when anything else lives in it', async () => {
    await put('assets/img/animation.glb')
    await put('assets/img/Ruelle.png')

    expect(await moveAssetFile(root, motion('assets/img/animation.glb'), 'Saut')).toBe(
      'assets/img/Saut.glb',
    )
    expect(await readdir(join(root, 'assets/img'))).toContain('Ruelle.png')
  })

  // An animation imported BEFORE the studio wrote folders sits flat, and its name is its file's.
  it('renames a flat animation the way every other kind is renamed', async () => {
    await put('assets/img/Jump.glb')

    expect(await moveAssetFile(root, motion('assets/img/Jump.glb'), 'Saut')).toBe(
      'assets/img/Saut.glb',
    )
  })
})
