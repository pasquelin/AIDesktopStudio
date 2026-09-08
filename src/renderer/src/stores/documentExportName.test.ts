import { beforeEach, describe, expect, it } from 'vitest'
import { workshopIdOf } from '@shared/domain/character'
import { useDocuments } from './documents'
import { documentExportName } from './documentExportName'

beforeEach(() => useDocuments.setState({ documents: {}, activeId: null, stored: [] }))
describe('documentExportName', () => {
  // A workshop is no document: exporting one used to fall back to the bare word « scene ».
  it('names a workshop export after the model tab opened on it', () => {
    useDocuments.setState({
      documents: {
        'character-1': {
          id: 'character-1',
          kind: 'character',
          title: 'Hero Knight',
          workspace: '3d',
          path: 'Models/hero.glb',
          sourceAssetId: 'asset-hero',
        },
      },
      activeId: 'character-1',
    })

    expect(documentExportName(useDocuments.getState(), workshopIdOf('asset-hero'), 'scene')).toBe(
      'Hero Knight',
    )
    expect(documentExportName(useDocuments.getState(), workshopIdOf('asset-none'), 'scene')).toBe(
      'scene',
    )
  })
})
