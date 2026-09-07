import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSkyboxContent } from '@shared/domain/skybox'
import { useDocuments } from '@/stores/documents'
import { useSkyboxes } from '@/stores/skyboxes'
import { lendSkyboxExportPort, skyboxExportFiles } from './skyboxExportFiles'

const port = vi.fn(() => Promise.resolve([{ name: 'Ciel', extension: '.hdr', bytes: BYTES }]))
const BYTES = new Uint8Array([1, 2, 3])

vi.mock('@/engines/skybox/exportPort', () => ({ createSkyboxExportPort: () => port }))

beforeEach(() => {
  port.mockClear()
  useDocuments.setState({
    documents: {
      'doc-1': {
        id: 'doc-1',
        kind: 'skybox',
        workspace: 'skyboxes',
        title: 'Ciel',
        path: 'documents/Ciel.gltf',
      },
    },
    stored: [],
    activeId: 'doc-1',
  })
  useSkyboxes.setState({
    states: { 'doc-1': { ...createSkyboxContent(), source: { assetId: 'asset-1' } } },
  })
})

describe('what the sky hands the writer', () => {
  it('renders through a lent port, and never asks the GPU chunk for one', async () => {
    const lent = vi.fn(() => Promise.resolve([{ name: 'Ciel', extension: '.png', bytes: BYTES }]))
    const giveBack = lendSkyboxExportPort(lent)
    try {
      const request = await skyboxExportFiles('doc-1', { kind: 'faces', size: 1024 })

      expect(request.files).toEqual([{ name: 'Ciel', extension: '.png', bytes: BYTES }])
      expect(port).not.toHaveBeenCalled()
    } finally {
      giveBack()
    }
  })

  it('hands the port the command it was given, whole', async () => {
    await skyboxExportFiles('doc-1', { kind: 'panorama', target: 'sky.exr' })

    expect(port).toHaveBeenCalledWith(
      expect.objectContaining({ command: { kind: 'panorama', target: 'sky.exr' } }),
      undefined,
    )
  })

  /**
   * The writer takes a folder and ONLY a folder — `pathSegment` refuses an empty one, so a
   * panorama handed none is a target that fails at the first click and nowhere before it.
   */
  it('names a folder for the panorama as well as for the faces', async () => {
    const faces = await skyboxExportFiles('doc-1', { kind: 'faces', size: 1024 })
    const panorama = await skyboxExportFiles('doc-1', { kind: 'panorama', target: 'sky.hdr' })

    expect(faces.folder).toBe('Ciel')
    expect(panorama.folder).toBe('Ciel')
  })

  it('says which target the files are for, so the writer holds them to its extension', async () => {
    expect((await skyboxExportFiles('doc-1', { kind: 'faces', size: 1024 })).target).toBe(
      'sky.faces',
    )
    expect((await skyboxExportFiles('doc-1', { kind: 'panorama', target: 'sky.hdr' })).target).toBe(
      'sky.hdr',
    )
  })
})
