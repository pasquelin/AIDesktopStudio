import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { AsyncCatalog } from '@main/project/catalogClient'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import { adoptFile, type AdoptFileDeps } from './adoptFile'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

let root = ''
let catalog: AsyncCatalog
let landed: Asset[]
let lines: string[]

const deps = (overrides: Partial<AdoptFileDeps> = {}): AdoptFileDeps => ({
  projectPath: () => root,
  catalog: () => catalog,
  newAssetId: () => 'asset-1',
  now: () => '2026-08-17T10:00:00.000Z',
  hash: async () => 'fingerprint',
  probeFile: async () => ({ duration: 4_000_000, codec: 'h264' }),
  roles: () => ({}),
  onAdopted: asset => landed.push(asset),
  record: report => lines.push(report.messageKey),
  ...overrides,
})

const put = async (relative: string, bytes: Uint8Array = PNG): Promise<void> => {
  await mkdir(join(root, relative, '..'), { recursive: true })
  await writeFile(join(root, relative), bytes)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adopt-'))
  catalog = memoryCatalog()
  landed = []
  lines = []
})

afterEach(async () => {
  await catalog.close()
  await rm(root, { recursive: true, force: true })
})

describe('adoptFile', () => {
  it('gives a picture the project holds a row pointing INSIDE the project', async () => {
    await put('Images/facade.jpg')

    const asset = await adoptFile('Images/facade.jpg', deps())

    expect(asset).toMatchObject({
      name: 'facade',
      type: 'image',
      location: 'local',
      path: 'Images/facade.jpg',
      hash: 'fingerprint',
    })
    // The row must NOT read as a linked external media: that is what `ingest` writes, and it is
    // what stops the rescan following the file when the user moves it.
    expect(asset?.sourcePath).toBeUndefined()
    expect(await catalog.search({ path: 'Images/facade.jpg' })).toHaveLength(1)
  })

  it('says so in the journal, and hands the asset to whatever derives from it', async () => {
    await put('Images/facade.jpg')

    const asset = await adoptFile('Images/facade.jpg', deps())

    expect(lines).toEqual(['activity.fileAdopted'])
    expect(landed).toEqual([asset])
  })

  it('files a picture under the skyboxes folder as a skybox', async () => {
    await put('Skyboxes/a clear blue sky at noon.png')

    const asset = await adoptFile('Skyboxes/a clear blue sky at noon.png', deps())

    expect(asset).toMatchObject({ type: 'skybox', path: 'Skyboxes/a clear blue sky at noon.png' })
  })

  it('hands back the row it already has rather than doubling it', async () => {
    await put('Images/facade.jpg')
    const first = await adoptFile('Images/facade.jpg', deps())

    const second = await adoptFile('Images/facade.jpg', deps({ newAssetId: () => 'asset-2' }))

    expect(second?.id).toBe(first?.id)
    expect(await catalog.search({ path: 'Images/facade.jpg' })).toHaveLength(1)
  })

  it('adopts an FBX in the animations folder as a motion', async () => {
    await put('Modelling/Animations/Walking.fbx', new Uint8Array([0x46, 0x42, 0x58]))

    expect(await adoptFile('Modelling/Animations/Walking.fbx', deps())).toMatchObject({
      name: 'Walking',
      type: 'animation',
      path: 'Modelling/Animations/Walking.fbx',
    })
  })

  it('adopts an FBX in the models folder as a mesh', async () => {
    await put('Modelling/Models/prop.fbx', new Uint8Array([0x46, 0x42, 0x58]))

    expect(await adoptFile('Modelling/Models/prop.fbx', deps())).toMatchObject({
      type: 'mesh',
      path: 'Modelling/Models/prop.fbx',
    })
  })

  it('retargets a row whose folder now says it is a motion', async () => {
    await put('Modelling/Animations/Walking.fbx', new Uint8Array([0x46, 0x42, 0x58]))
    await catalog.add({
      id: 'asset-1',
      name: 'Walking',
      type: 'mesh',
      location: 'local',
      path: 'Modelling/Animations/Walking.fbx',
      tags: [],
      createdAt: '2026-09-06T00:00:00.000Z',
    })

    expect(await adoptFile('Modelling/Animations/Walking.fbx', deps())).toMatchObject({
      id: 'asset-1',
      type: 'animation',
    })
  })

  it('leaves a file the studio cannot show alone, writing nothing', async () => {
    await put('Notes/brief.txt', new Uint8Array([0x68, 0x69]))
    await put('Images/photo.heic')

    expect(await adoptFile('Notes/brief.txt', deps())).toBeNull()
    expect(await adoptFile('Images/photo.heic', deps())).toBeNull()
    expect(await catalog.search({})).toHaveLength(0)
    expect(lines).toEqual([])
  })

  it('adopts an OpenEXR as an image, which is how a heightmap enters the catalogue', async () => {
    await put('World/height.exr')

    expect(await adoptFile('World/height.exr', deps())).toMatchObject({
      name: 'height',
      type: 'image',
      path: 'World/height.exr',
    })
  })

  /**
   * A document wears the extension of an open format now, so the spelling of a picture painted
   * in another application is also the spelling of one of ours. Asked as MATERIAL, `.ora` is a
   * picture — refusing it because a document could bear that name is what stopped the studio
   * from ever opening a layered picture made anywhere else.
   */
  it('adopts a layered picture another application wrote, document spelling or not', async () => {
    await put('Images/planche.ora')

    expect(await adoptFile('Images/planche.ora', deps())).toMatchObject({
      type: 'image',
      path: 'Images/planche.ora',
    })
  })

  /**
   * The other side of the same rule, and what keeps a document out of the shelf: the three other
   * spellings a document wears carry no source domain, so nothing here can take one for material.
   */
  it('takes no document spelling the studio cannot draw as material', async () => {
    await put('Repérages/décor.gltf', new Uint8Array([0x7b, 0x7d]))
    await put('Montages/bande.otio', new Uint8Array([0x7b, 0x7d]))
    await put('Matières/roche.mtlx', new Uint8Array([0x7b, 0x7d]))

    expect(await adoptFile('Repérages/décor.gltf', deps())).toBeNull()
    expect(await adoptFile('Montages/bande.otio', deps())).toBeNull()
    expect(await adoptFile('Matières/roche.mtlx', deps())).toBeNull()
    expect(await catalog.search({})).toHaveLength(0)
  })

  /**
   * The suffix wins even when it lies, as every system does — the one exception is having no
   * suffix at all, where the bytes are the only thing left to read.
   */
  it('trusts a present extension over the bytes, and the bytes when there is none', async () => {
    await put('Notes/photo.txt', PNG)
    await put('Images/scan', PNG)

    expect(await adoptFile('Notes/photo.txt', deps())).toBeNull()
    expect(await adoptFile('Images/scan', deps())).toMatchObject({ type: 'image', name: 'scan' })
  })

  it('reads the length of a take, and asks for none of a picture', async () => {
    const probeFile = vi.fn(async () => ({ duration: 4_000_000, codec: 'h264' }))
    await put('Video/rush.mp4')
    await put('Images/facade.jpg')

    const take = await adoptFile('Video/rush.mp4', deps({ probeFile }))
    await adoptFile('Images/facade.jpg', deps({ probeFile, newAssetId: () => 'asset-2' }))

    expect(take?.probe).toEqual({ duration: 4_000_000, codec: 'h264' })
    expect(probeFile).toHaveBeenCalledTimes(1)
  })

  /**
   * `.index/` holds the previews and the proxies the studio rewrites at will, and the explorer
   * SHOWS them when the reader asks. A row pointing in there dies at the next eviction, and a
   * proxy adopted as a take would be given a proxy of its own.
   */
  it('refuses what the studio keeps for itself, however the reader reached it', async () => {
    await put('.index/thumbnails/3f9a.png')
    await put('.index/posters/asset_1.png')

    expect(await adoptFile('.index/thumbnails/3f9a.png', deps())).toBeNull()
    expect(await adoptFile('.index/posters/asset_1.png', deps())).toBeNull()
    expect(await catalog.search({})).toHaveLength(0)
    expect(lines).toEqual([])
  })

  /**
   * The row only exists once the fingerprint and the probe have answered — seconds, for a rush —
   * and nothing in the catalogue holds `path` unique. Two double-clicks in that window used to
   * mint two rows over one file, and derive it twice.
   */
  it('mints one row for two adoptions of the same file at once', async () => {
    await put('Video/rush.mp4')
    let ids = 0
    const shared = deps({
      newAssetId: () => `asset-${(ids += 1)}`,
      probeFile: async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { duration: 4_000_000, codec: 'h264' }
      },
    })

    const [first, second] = await Promise.all([
      adoptFile('Video/rush.mp4', shared),
      adoptFile('Video/rush.mp4', shared),
    ])

    expect(second?.id).toBe(first?.id)
    expect(await catalog.search({ path: 'Video/rush.mp4' })).toHaveLength(1)
    expect(landed).toHaveLength(1)
  })

  /**
   * 🛑 The ORDINARY answer, not a fault: the assistant calls this with a name a person spoke —
   * `voilier vert`, straight from the sentence. An ENOENT crossing the boundary was logged as a
   * handler error and counted on the status line as a studio failure, and the caller could not
   * tell "no such file" from "the catalogue broke".
   */
  it('answers nothing for a path the project does not hold, rather than throwing', async () => {
    await expect(adoptFile('voilier vert', deps())).resolves.toBeNull()
  })

  it('refuses a path that leaves the project, and a folder', async () => {
    await mkdir(join(root, 'Textures'), { recursive: true })

    expect(await adoptFile('../elsewhere/secret.png', deps())).toBeNull()
    expect(await adoptFile('Textures', deps())).toBeNull()
  })

  it('keeps a row that carries no fingerprint rather than losing the file', async () => {
    await put('Images/facade.jpg')

    const asset = await adoptFile('Images/facade.jpg', deps({ hash: async () => null }))

    expect(asset?.hash).toBeUndefined()
    expect(asset?.path).toBe('Images/facade.jpg')
  })
})
