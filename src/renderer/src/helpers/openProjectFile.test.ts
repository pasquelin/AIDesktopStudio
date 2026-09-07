import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { lendPictureMeasure } from '@/features/image/pictureSize'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { openProjectFile } from './openProjectFile'

const dockview = vi.hoisted(() => ({
  openDocument: vi.fn(),
  openFileView: vi.fn(),
}))

vi.mock('@/features/shell/components/dockviewApi', () => dockview)

const heightmap: Asset = {
  id: 'asset_height',
  name: 'height',
  type: 'image',
  location: 'local',
  path: 'World/height.exr',
  tags: [],
  createdAt: '2026-08-17T10:00:00.000Z',
}

const picture: Asset = {
  ...heightmap,
  id: 'asset_pic',
  name: 'facade',
  path: 'Images/facade.jpg',
}

describe('openProjectFile', () => {
  let giveBackMeasure: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    useDocuments.setState({ documents: {}, stored: [], activeId: null })
    useLayouts.setState({ layout: null, activeWorkspace: '3d', home: false })
    useProject.setState({
      project: {
        path: '/projects/demo',
        manifest: {
          version: 1,
          createdAt: '2026-08-07T10:00:00.000Z',
          updatedAt: '2026-08-07T10:00:00.000Z',
        },
      },
      known: true,
    })
    giveBackMeasure = lendPictureMeasure(() => Promise.resolve({ width: 800, height: 600 }))
  })

  afterEach(() => giveBackMeasure())

  it('catalogues an OpenEXR and leaves the tab to the system', async () => {
    const openFile = vi.fn(() => Promise.resolve(true))
    installFakeBridge({
      media: { adopt: () => Promise.resolve(heightmap) },
      project: { openFile },
    })

    expect(await openProjectFile('World/height.exr')).toBe('system')
    expect(openFile).toHaveBeenCalledWith('World/height.exr')
    expect(Object.keys(useDocuments.getState().documents)).toHaveLength(0)
  })

  it('still opens a picture the studio can paint', async () => {
    installFakeBridge({
      media: { adopt: () => Promise.resolve(picture) },
    })

    expect(await openProjectFile('Images/facade.jpg')).toBe('asset')
    expect(Object.keys(useDocuments.getState().documents)).toHaveLength(1)
  })

  it('opens a registered project file in its own editor without cataloguing it', async () => {
    const adopt = vi.fn(() => Promise.resolve(null))
    installFakeBridge({ media: { adopt } })

    expect(await openProjectFile('Controls/character.input.json')).toBe('editor')
    expect(dockview.openFileView).toHaveBeenCalledWith({
      id: 'inputMap',
      path: 'Controls/character.input.json',
      title: 'character',
    })
    expect(adopt).not.toHaveBeenCalled()
  })
})
