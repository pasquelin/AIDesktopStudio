import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { Project } from '@shared/domain/project'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useProject } from '@/stores/project'
import { openRecent } from './openRecent'

const openDocument = vi.fn()
vi.mock('./components/dockviewApi', () => ({
  openDocument: (...args: unknown[]) => openDocument(...args),
}))

const DOCUMENT: DocumentDescriptor = {
  id: 'one',
  kind: 'scene',
  workspace: '3d',
  title: 'Niveau',
  path: 'Modelling/Scenes/Niveau.gltf',
}

const project = (path: string): Project => ({
  path,
  manifest: { version: 1, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
})

describe('openRecent', () => {
  const opened: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    opened.length = 0
    installFakeBridge()
    useDocuments.setState({ documents: {}, stored: [DOCUMENT] })
    useProject.setState({
      project: project('/projects/One'),
      open: path => {
        opened.push(path)
        return Promise.resolve(true)
      },
    })
  })

  it('opens a document of the project in front without touching the project', async () => {
    await openRecent({ project: '/projects/One', path: DOCUMENT.path })

    expect(opened).toEqual([])
    expect(openDocument).toHaveBeenCalledWith(DOCUMENT)
  })

  // ONE project is open at a time, so a document of another one is a switch before it is an
  // opening — and the switch comes first, or the document is looked for in the wrong folder.
  it('switches project first when the document belongs to another', async () => {
    await openRecent({ project: '/projects/Two', path: DOCUMENT.path })

    expect(opened).toEqual(['/projects/Two'])
    expect(openDocument).toHaveBeenCalledWith(DOCUMENT)
  })

  /** A no to one of the two questions on the way out leaves both where they were. */
  it('opens nothing when the project refuses to be left', async () => {
    useProject.setState({ open: () => Promise.resolve(false) })

    await openRecent({ project: '/projects/Two', path: DOCUMENT.path })

    expect(openDocument).not.toHaveBeenCalled()
  })

  it('opens the project alone for a row that names no document', async () => {
    await openRecent({ project: '/projects/Two' })

    expect(opened).toEqual(['/projects/Two'])
    expect(openDocument).not.toHaveBeenCalled()
  })
})
