import type * as DockviewApi from '@/features/shell/components/dockviewApi'
import { saveDocument } from '@/features/shell/documentIo'
import { forgetLoadState } from '@/features/shell/documentLoad'
import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useProject } from '@/stores/project'
import { sceneOf, useScenes } from '@/stores/scenes'
import {
  DOCUMENT_VERSION,
  type DocumentDescriptor,
  type DocumentDraft,
  type DocumentFile,
  type DocumentKind,
  type DocumentWrite,
} from '@shared/domain/document'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'

/**
 * Dockview announces the new tab and the store follows; a suite has no live one, so the opening
 * is the real function and the announcement alone is stood in for.
 */
vi.mock('@/features/shell/components/dockviewApi', async importOriginal => {
  const real = await importOriginal<typeof DockviewApi>()
  const { useDocuments: store } = await import('@/stores/documents')
  return {
    ...real,
    openDocument: (document: DocumentDescriptor) => {
      real.openDocument(document)
      store.getState().activate(document.id)
    },
  }
})

const PILOT: DocumentDescriptor = {
  id: 'doc-pilot',
  kind: 'scene',
  title: 'Pilot Scene',
  workspace: '3d',
  path: 'Scenes/Pilot Scene.gltf',
}

const CUBE = {
  ...meshNode('cube-1'),
  name: 'Pilot Cube',
  transform: { ...IDENTITY_TRANSFORM, position: { x: 2, y: 1, z: -3 } },
}

/** The project's files, written and read back the way the disk does it. */
const disk = new Map<string, DocumentFile>()

/** A read the case hands over when it chooses to, so the ask and the landing are two moments. */
let deliver: (() => void) | null = null

function installDisk({ held = false }: { held?: boolean } = {}): {
  read: ReturnType<typeof vi.fn>
} {
  const read = vi.fn((id: string) => {
    const file = disk.get(id) ?? null
    if (!held) return Promise.resolve(file)
    return new Promise<DocumentFile | null>(resolve => {
      deliver = () => resolve(file)
    })
  })
  installFakeBridge({
    documents: {
      read,
      list: () => Promise.resolve([...disk.keys()].map(() => PILOT)),
      write: (id: string, kind: DocumentKind, draft: DocumentDraft) => {
        disk.set(id, {
          version: DOCUMENT_VERSION,
          kind,
          title: draft.title,
          content: draft.content,
          updatedAt: '2026-09-09T10:00:00.000Z',
        })
        return Promise.resolve<DocumentWrite>('written')
      },
    },
  })
  return { read }
}

/** The scene, with its cube, written into the project — step one of the run. */
async function savePilotScene(): Promise<void> {
  useDocuments.setState({ documents: { [PILOT.id]: PILOT }, stored: [PILOT], activeId: PILOT.id })
  useScenes.getState().runCommand(PILOT.id, addNode(CUBE))
  expect(await saveDocument(PILOT.id)).toBe(true)
}

/** And what closing the project and opening it again leaves: the file, and nothing in memory. */
function reopenProject(): void {
  useDocuments.setState({ documents: {}, stored: [PILOT], activeId: null })
  useScenes.getState().drop(PILOT.id)
}

beforeEach(() => {
  disk.clear()
  deliver = null
  forgetLoadState(PILOT.id)
  useDocuments.setState({ documents: {}, stored: [], activeId: null })
  useProject.setState({
    project: {
      path: '/Films/Pilot',
      manifest: {
        version: 1,
        createdAt: '2026-09-09T10:00:00.000Z',
        updatedAt: '2026-09-09T10:00:00.000Z',
      },
    },
  })
})

describe('opening a document from outside the window', () => {
  /**
   * The run of 2026-09-09, without the pause it needed to pass: a cube saved into a scene, the
   * project closed and opened again, the scene opened and its state asked for in the very next
   * call. It answered a scene without the cube — `document.open` had announced success while the
   * file was still on its way back.
   */
  it('answers the next call with the scene that was saved', async () => {
    installDisk()
    await savePilotScene()
    reopenProject()

    expect(await runAction('document.open', { path: PILOT.path })).toEqual({
      ok: true,
      data: { documentId: PILOT.id },
    })

    expect(await runAction('scene.state', {})).toMatchObject({
      ok: true,
      data: {
        documentId: PILOT.id,
        nodes: [{ name: 'Pilot Cube', transform: { position: { x: 2, y: 1, z: -3 } } }],
      },
    })
  })

  it('waits for a read that is slow to land', async () => {
    installDisk({ held: true })
    await savePilotScene()
    reopenProject()

    const settled: unknown[] = []
    const opening = runAction('document.open', { path: PILOT.path }).then(outcome =>
      settled.push(outcome),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toEqual([])

    deliver?.()
    await opening
    expect(settled).toEqual([{ ok: true, data: { documentId: PILOT.id } }])
  })

  // The tab is up either way; what must not happen is a client being told to write into it.
  it('refuses when the file will not read', async () => {
    installFakeBridge({
      documents: {
        list: () => Promise.resolve([PILOT]),
        read: () => Promise.reject(new Error('gltf is truncated')),
      },
    })
    useDocuments.setState({ stored: [PILOT] })

    expect(await runAction('document.open', { path: PILOT.path })).toMatchObject({
      ok: false,
      refusal: 'failed',
      detail: expect.stringContaining('gltf is truncated'),
    })
  })

  // A read the caller's own next gesture dropped, named apart from a file that would not read:
  // there is nothing to repair, and the same call sent again works.
  it('refuses when the document is closed while it opens', async () => {
    installDisk({ held: true })
    await savePilotScene()
    reopenProject()

    const opening = runAction('document.open', { path: PILOT.path })
    await Promise.resolve()
    await runAction('document.close', { documentId: PILOT.id })
    deliver?.()

    expect(await opening).toMatchObject({ ok: false, refusal: 'failed' })
    expect(useScenes.getState().states[PILOT.id]).toBeUndefined()
  })

  /**
   * A listing a client holds may predate a file that has since arrived — its own generation, or
   * another program's. Answering "no such document" for one sitting on the disk is the least
   * useful refusal there is, so the folder is re-read before refusing.
   */
  it('re-reads the folder before refusing a path it has not heard of', async () => {
    installDisk()
    await savePilotScene()
    reopenProject()
    const relist = vi.fn(() => {
      useDocuments.setState({ stored: [PILOT] })
      return Promise.resolve()
    })
    useDocuments.setState({ stored: [], relist })

    expect(await runAction('document.open', { path: PILOT.path })).toMatchObject({ ok: true })
    expect(relist).toHaveBeenCalled()
  })

  // `badInput` sent a client back to check a path that was well formed all along, when the only
  // true answer was that nothing sits there.
  it('says the document is not there rather than blaming the parameters', async () => {
    installDisk()

    expect(await runAction('document.open', { path: 'Nowhere/Absent.ora' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  /**
   * The same seam on the other door, and worse there: Dockview mounts a background tab's panel
   * only when it comes forward, so a document open behind another has never read its file.
   */
  it('brings a tab forward with its content, not just its name', async () => {
    installDisk()
    await savePilotScene()
    // The state a reopened project leaves behind a second tab: adopted, and never mounted.
    useDocuments.setState({ documents: { [PILOT.id]: PILOT }, stored: [PILOT], activeId: null })
    useScenes.getState().drop(PILOT.id)

    expect(await runAction('document.activate', { documentId: PILOT.id })).toEqual({
      ok: true,
      data: { documentId: PILOT.id },
    })

    expect(await runAction('scene.state', {})).toMatchObject({
      ok: true,
      data: { nodes: [{ name: 'Pilot Cube' }] },
    })
  })

  it('refuses to activate a tab whose file will not read', async () => {
    installFakeBridge({
      documents: {
        list: () => Promise.resolve([PILOT]),
        read: () => Promise.reject(new Error('gltf is truncated')),
      },
    })
    useDocuments.setState({ documents: { [PILOT.id]: PILOT }, stored: [PILOT], activeId: null })

    expect(await runAction('document.activate', { documentId: PILOT.id })).toMatchObject({
      ok: false,
      refusal: 'failed',
      detail: expect.stringContaining('gltf is truncated'),
    })
  })

  // The section comes forward with its front tab, which may never have been mounted either.
  it('opens a space with the content of the tab it brings forward', async () => {
    installDisk()
    await savePilotScene()
    useDocuments.setState({ documents: { [PILOT.id]: PILOT }, stored: [PILOT], activeId: PILOT.id })
    useScenes.getState().drop(PILOT.id)

    expect(await runAction('workspace.open', { workspace: '3d' })).toEqual({
      ok: true,
      data: { documentId: PILOT.id },
    })
    expect(sceneOf(useScenes.getState(), PILOT.id).nodes.map(node => node.name)).toContain(
      'Pilot Cube',
    )
  })

  // `file.open` reaches the same tab by its path, and answered `opened: 'document'` before the
  // read — the handler already re-reads the folder for the same reason, and stopped one step short.
  it('opens a document file with its content', async () => {
    installDisk()
    await savePilotScene()
    reopenProject()

    expect(await runAction('file.open', { path: PILOT.path })).toEqual({
      ok: true,
      data: { opened: 'document' },
    })
    expect(sceneOf(useScenes.getState(), PILOT.id).nodes.map(node => node.name)).toContain(
      'Pilot Cube',
    )
  })

  it('reads the file once for two opens racing on it', async () => {
    const { read } = installDisk()
    await savePilotScene()
    reopenProject()

    const outcomes = await Promise.all([
      runAction('document.open', { path: PILOT.path }),
      runAction('document.open', { path: PILOT.path }),
    ])

    expect(outcomes).toEqual([
      { ok: true, data: { documentId: PILOT.id } },
      { ok: true, data: { documentId: PILOT.id } },
    ])
    expect(read).toHaveBeenCalledTimes(1)
  })
})
