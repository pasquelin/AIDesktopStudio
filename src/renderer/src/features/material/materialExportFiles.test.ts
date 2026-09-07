import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MATERIAL_TARGET_OF } from '@shared/domain/exportRegistry'
import { useDocuments } from '@/stores/documents'
import { lendMaterialExportPort, materialExportFiles } from './materialExportFiles'

const BYTES = new Uint8Array([1, 2, 3])
const gpu = vi.fn(() => Promise.resolve([{ name: 'Brique', extension: '.png', bytes: BYTES }]))

vi.mock('@/engines/material/export/exportPort', () => ({ createMaterialExportPort: () => gpu }))

beforeEach(() => {
  gpu.mockClear()
  useDocuments.setState({
    documents: {
      'doc-1': {
        id: 'doc-1',
        kind: 'material',
        workspace: 'materials',
        title: 'Brique',
        path: 'documents/Brique.mtlx',
      },
    },
    stored: [],
    activeId: 'doc-1',
  })
})

describe('what a material hands the writer', () => {
  it('bakes through a lent port, and never asks the GPU chunk for one', async () => {
    const lent = vi.fn(() => Promise.resolve([{ name: 'Brique', extension: '.png', bytes: BYTES }]))
    const giveBack = lendMaterialExportPort(lent)
    try {
      const request = await materialExportFiles('doc-1', 'raw')

      expect(request).toEqual({
        folder: 'Brique',
        target: MATERIAL_TARGET_OF['raw'],
        files: [{ name: 'Brique', extension: '.png', bytes: BYTES }],
      })
      expect(gpu).not.toHaveBeenCalled()
    } finally {
      giveBack()
    }
  })

  it('refuses a material that bakes to no file at all', async () => {
    gpu.mockResolvedValueOnce([])

    await expect(materialExportFiles('doc-1', 'raw')).rejects.toThrow('no channel to export')
  })
})
