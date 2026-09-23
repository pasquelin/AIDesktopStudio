import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { type DocumentFiles } from './documents'
import { documentFilesAt } from './project-fixtures'

const NOW = '2026-09-10T10:00:00.000Z'

/** A glTF another application exported: real, and carrying nothing of the studio. */
const FOREIGN = JSON.stringify({
  asset: { version: '2.0', generator: 'Another application' },
  scene: 0,
  scenes: [{ nodes: [] }],
  cameras: [{ type: 'perspective' }],
})

describe('a document sitting on a file of its own', () => {
  let root = ''
  let documents: DocumentFiles

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-destination-'))
    documents = documentFilesAt(root, NOW)
    await mkdir(join(root, 'Repérages'), { recursive: true })
    await writeFile(join(root, 'Repérages', 'Niveau.gltf'), FOREIGN, 'utf8')
  })

  /**
   * §5.3 — the destination belongs to the document. Without it the writer frees the name against
   * the folder, and a glTF another application exported grew a `Niveau 2.gltf` at every save
   * instead of being edited in place (E-24).
   */
  it('writes into the file it was given, not beside it', async () => {
    const written = await documents.write(
      'doc-1',
      'scene',
      { title: 'Niveau', content: JSON.stringify({ asset: { version: '2.0' }, scenes: [] }) },
      false,
      { path: 'Repérages/Niveau.gltf' },
    )

    expect(written).toBe('written')
    expect(await readdir(join(root, 'Repérages'))).toEqual(['Niveau.gltf'])
    expect(await readFile(join(root, 'Repérages', 'Niveau.gltf'), 'utf8')).toContain('"scenes"')
  })

  // The other half of the same destination: a file the listing does not claim is still read.
  it('reads the file it was given', async () => {
    const read = await documents.read('doc-1', 'scene', 'Repérages/Niveau.gltf')

    expect(read?.kind).toBe('scene')
    expect(read?.content).toContain('Another application')
  })

  // A document that has no chosen file keeps every rule it had: named after its title, in the
  // folder its author picked.
  it('leaves a document with no destination where its title puts it', async () => {
    await documents.write('doc-2', 'scene', { title: 'Autre', content: '{"nodes":[]}' }, false, {
      folder: 'Repérages',
    })

    expect((await readdir(join(root, 'Repérages'))).sort()).toEqual(['Autre.gltf', 'Niveau.gltf'])
  })
})
