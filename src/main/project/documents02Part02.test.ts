import { mkdtemp, readdir, readFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { documentFolderOf } from '@shared/domain/document'

import { isHiddenEntry } from '@shared/domain/folder'

import type { OraSurface } from '@shared/domain/openRaster'

import { type DocumentFiles } from './documents'

import { documentFilesAt } from './project-fixtures'

const NOW = '2026-08-07T10:00:00.000Z'

const SKIES = documentFolderOf('skybox')

const MATERIALS = documentFolderOf('material')

/** One transparent pixel, which is all any of this needs to be real PNG bytes. */
const PIXELS = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
)

/**
 * What an image document's `content` is: the OpenRaster stack, as JSON. Anything else is refused
 * by the writer, exactly as a montage that is not a timeline is.
 */
const oraContent = (srcs: readonly string[] = [], studio = '{"layers":[]}'): string =>
  JSON.stringify({
    width: 64,
    height: 32,
    nodes: srcs.map(src => ({
      kind: 'layer',
      name: src,
      src,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      composite: 'svg:src-over',
    })),
    studio,
  })

/** The surfaces beside it: the flatten the spec demands, and one per layer. */
const oraParts = (srcs: readonly string[] = []): OraSurface[] => [
  { path: 'mergedimage.png', png: PIXELS },
  ...srcs.map(path => ({ path, png: PIXELS })),
]

describe('createDocumentFiles', () => {
  let root = ''

  let documents: DocumentFiles

  /**
   * What a folder holds as a reader SEES it — the role marker left out, exactly as the explorer
   * leaves it out. `readdir` shows it; nothing in the studio does.
   */
  const held = async (folder: string): Promise<string[]> =>
    (await readdir(join(root, folder))).filter(name => !isHiddenEntry(name))

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ia-studio-documents-'))
    documents = documentFilesAt(root, NOW)
  })

  it('removes a document, and stays quiet about one that is not there', async () => {
    await documents.write('doc-1', 'scene', { title: 'Untitled', content: '{}' })
    await documents.remove('doc-1', 'scene')

    expect(await documents.read('doc-1', 'scene')).toBeNull()
    await expect(documents.remove('doc-1', 'scene')).resolves.toBeUndefined()
  })

  it('keeps two kinds of the same id apart', async () => {
    await documents.write('twin', 'scene', { title: 'Twin', content: 'scene side' })
    await documents.write('twin', 'image', {
      title: 'Twin',
      content: oraContent(),
      parts: oraParts(),
    })

    expect((await documents.read('twin', 'scene'))?.content).toBe('scene side')
    expect(JSON.parse((await documents.read('twin', 'image'))?.content ?? '')).toMatchObject({
      studio: '{"layers":[]}',
    })
  })

  /**
   * The five gestures a format is not delivered without: write it, read it back, list it, rename
   * it, and open it again. A sky IS its glTF, so all five run against a real one here — the file
   * another application reads, not a spelling of the studio's own under the same extension.
   */
  it('writes a sky as glTF, and finds it again by its own head', async () => {
    const sky = JSON.stringify({
      asset: { version: '2.0', generator: 'AI Desktop Studio' },
      scene: 0,
      scenes: [{ name: 'Crépuscule', nodes: [0] }],
      nodes: [{ name: 'Sun', rotation: [0, 0, 0, 1] }],
      extras: { iastudio: { sun: { intensity: 2 } } },
    })
    await documents.write('doc-sky', 'skybox', { title: 'Crépuscule', content: sky })

    const listed = await documents.list()
    expect(listed).toMatchObject([{ id: 'doc-sky', kind: 'skybox', title: 'Crépuscule' }])

    // Whole, and still glTF: the envelope went into `asset.extras` rather than in front of it.
    const onDisk: unknown = JSON.parse(await readFile(join(root, SKIES, 'Crépuscule.gltf'), 'utf8'))
    expect(onDisk).toMatchObject({ asset: { version: '2.0' }, scene: 0 })

    await documents.rename('doc-sky', 'skybox', 'Aube')
    expect((await documents.read('doc-sky', 'skybox'))?.content).toContain('"iastudio"')
    expect(await held(SKIES)).toEqual(['Aube.gltf'])
  })

  /**
   * The same five for the material. The one that caught the sky's defect is the RENAME: it
   * rewrites the body from what a read answered, so anything a read drops is written back empty.
   */
  it('writes a material as MaterialX, and finds it again by its own head', async () => {
    const material = JSON.stringify({
      images: [
        {
          input: 'base_color',
          type: 'color3',
          file: 'Assets/base.png',
          colorspace: 'srgb_texture',
          tiling: [1, 1],
          offset: [0, 0],
        },
      ],
      values: [{ input: 'specular_roughness', type: 'float', value: 0.5 }],
      studio: { material: { edgeIntensity: 0.4 } },
    })
    await documents.write('doc-mat', 'material', { title: 'Laiton', content: material })

    const listed = await documents.list()
    expect(listed).toMatchObject([{ id: 'doc-mat', kind: 'material', title: 'Laiton' }])

    // Real MaterialX, not a spelling of the studio's own wearing the extension.
    const onDisk = await readFile(join(root, MATERIALS, 'Laiton.mtlx'), 'utf8')
    expect(onDisk.startsWith('<?xml version="1.0"?>\n<materialx version="1.39"')).toBe(true)
    expect(onDisk).toContain('<standard_surface name="SR_iastudio" type="surfaceshader">')

    await documents.rename('doc-mat', 'material', 'Bronze')
    expect(await held(MATERIALS)).toEqual(['Bronze.mtlx'])
    // The dial no MaterialX input can carry survived the rewrite the rename does.
    expect((await documents.read('doc-mat', 'material'))?.content).toContain('edgeIntensity')
    expect(await documents.list()).toMatchObject([{ id: 'doc-mat', title: 'Bronze' }])
  })
})
