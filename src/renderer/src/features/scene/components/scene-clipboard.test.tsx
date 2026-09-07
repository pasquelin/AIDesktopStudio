import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import type { SceneNode } from '@/engines/scene/sceneState'
import { useDocuments } from '@/stores/documents'
import { clearScenes } from '@/stores/scene-fixtures'
import { useSceneClipboard } from '@/stores/sceneClipboard'
import { sceneOf, selectIn, useScenes } from '@/stores/scenes'
import { SceneDocument } from './Scene/Document/SceneDocument'

vi.mock('@/features/shell/components/dockviewApi', () => ({ setDocumentTitle: vi.fn() }))

// jsdom has no WebGL context: what this covers is the wiring between the keyboard and the store.
vi.mock('@/engines/scene/SceneRenderer', () => ({
  SceneRenderer: class {
    mount = vi.fn()
    apply = vi.fn()
    dispose = vi.fn()
    setMotion = vi.fn()
    setNavigating = vi.fn()
    configure = vi.fn()
    setMode = vi.fn()
    setSnapping = vi.fn()
    setSpace = vi.fn()
    setProjection = vi.fn()
    setDisplayModes = vi.fn()
    activePane = vi.fn(() => 0)
    setSkeletons = vi.fn()
    setIsolation = vi.fn()
    setPoseMode = vi.fn()
    setSculptMode = vi.fn()
    setArmedRelief = vi.fn()
    setSculptBrush = vi.fn()
    setSculptTool = vi.fn()
    setPickedBone = vi.fn()
    setPickedPathPoint = vi.fn()
    setCameraPreview = vi.fn()
    setQuadView = vi.fn()
    setPaneViews = vi.fn()
    setPlayhead = vi.fn()
    setPreview = vi.fn()
    refreshTextures = vi.fn()
    viewFrom = vi.fn()
    frameSelection = vi.fn()
  },
}))

function meshesOf(documentId: string): SceneNode[] {
  return sceneOf(useScenes.getState(), documentId).nodes.filter(node => node.type === 'mesh')
}

function openSecondScene(): void {
  useDocuments.setState({
    documents: {
      'doc-2': {
        id: 'doc-2',
        kind: 'scene',
        workspace: '3d',
        title: 'Other',
        path: 'documents/Other.gltf',
      },
    },
    activeId: 'doc-2',
  })
  render(<SceneDocument documentId="doc-2" />)
}

beforeEach(() => {
  clearScenes()
  useSceneClipboard.setState({ nodes: [] })
  useDocuments.setState({
    documents: {
      'doc-1': {
        id: 'doc-1',
        kind: 'scene',
        workspace: '3d',
        title: 'Set',
        path: 'documents/Set.gltf',
      },
    },
    activeId: 'doc-1',
  })
  useScenes.getState().runCommand('doc-1', addNode(meshNode('box-1')))
  selectIn('doc-1', ['box-1'])
})

describe('duplicating and pasting', () => {
  it('duplicates the selection, and selects the copy', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{d}{/Meta}')

    const meshes = meshesOf('doc-1')
    expect(meshes).toHaveLength(2)
    // The copy, not the original: what was just made is what the next gesture acts on.
    expect(sceneOf(useScenes.getState(), 'doc-1').selectedIds).toEqual([meshes[1]?.id])
  })

  it('undoes a duplicate in one go', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{d}{/Meta}')
    useScenes.getState().undo('doc-1')

    expect(meshesOf('doc-1')).toHaveLength(1)
  })

  it('copies without touching the scene, and pastes a separate copy', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{c}{/Meta}')
    expect(meshesOf('doc-1')).toHaveLength(1)

    await userEvent.keyboard('{Meta>}{v}{/Meta}')
    const meshes = meshesOf('doc-1')
    expect(meshes).toHaveLength(2)
    expect(meshes[1]?.id).not.toBe(meshes[0]?.id)
  })

  // Two pastes of one copy must not put the same ids in twice.
  it('pastes twice as two separate objects', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{c}{/Meta}')
    await userEvent.keyboard('{Meta>}{v}{/Meta}')
    await userEvent.keyboard('{Meta>}{v}{/Meta}')

    const ids = meshesOf('doc-1').map(node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cuts what is selected, and can paste it back', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{x}{/Meta}')
    expect(meshesOf('doc-1')).toHaveLength(0)

    await userEvent.keyboard('{Meta>}{v}{/Meta}')
    expect(meshesOf('doc-1')).toHaveLength(1)
  })

  it('does nothing at all with an empty clipboard', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{v}{/Meta}')

    expect(meshesOf('doc-1')).toHaveLength(1)
  })

  // The clipboard belongs to the studio, not to a document.
  it('pastes into another scene what was copied in one', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.keyboard('{Meta>}{c}{/Meta}')

    openSecondScene()
    await userEvent.keyboard('{Meta>}{v}{/Meta}')

    expect(meshesOf('doc-2')).toHaveLength(1)
  })

  // Its parent stayed behind: kept, the outliner would drop the node while the viewport still
  // drew it, and nothing could reach it again.
  it('roots a pasted node whose parent the destination does not hold', async () => {
    useScenes.getState().runCommand('doc-1', addNode(meshNode('child-1', 'box-1')))
    selectIn('doc-1', ['child-1'])
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.keyboard('{Meta>}{c}{/Meta}')

    openSecondScene()
    await userEvent.keyboard('{Meta>}{v}{/Meta}')

    expect(meshesOf('doc-2')[0]?.parentId).toBeNull()
  })

  /**
   * The four buttons left the bar with the fifteen others, and no menu row replaced THESE: the
   * Edit rows keep their native roles so a text field goes on copying, and a command row in
   * their place would act on the scene with the caret in a field. The keys remain the way in,
   * and `useShortcuts` is what arbitrates — highlighted text keeps ⌘C, everything else is the
   * scene's.
   */
  it('pastes nothing while nothing has been copied', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{v}{/Meta}')

    expect(meshesOf('doc-1')).toHaveLength(1)
  })
})
