import { describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { opensAsScene } from './openAsScene'

const MESH: Asset = {
  id: 'asset-1',
  name: 'Niveau',
  type: 'mesh',
  location: 'local',
  path: 'Repérages/Niveau.gltf',
  tags: [],
  createdAt: '2026-09-10T09:00:00.000Z',
}

/** §2.6, case 2 — the one extension that legitimately serves two roles. */
describe('the row a glTF can be opened as a scene from', () => {
  it('offers the choice for a glTF of the project', () => {
    expect(opensAsScene(MESH)).toBe(true)
  })

  // The studio writes its scenes as glTF text; a container it cannot write back into is no
  // destination, so the choice is not offered for one.
  it('offers nothing for a binary container', () => {
    expect(opensAsScene({ ...MESH, path: 'Repérages/Niveau.glb' })).toBe(false)
  })

  it('offers nothing for a row that is not a model', () => {
    expect(opensAsScene({ ...MESH, type: 'image', path: 'Images/Planche.png' })).toBe(false)
  })

  // A library row has no file here to read, let alone to write back into.
  it('offers nothing for a row the project holds no file for', () => {
    expect(opensAsScene({ ...MESH, location: 'cloud' })).toBe(false)
    expect(opensAsScene({ ...MESH, path: undefined })).toBe(false)
  })
})
