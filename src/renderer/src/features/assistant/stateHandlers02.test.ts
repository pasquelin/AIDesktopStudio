import { holdCanvas } from '@/features/image/canvasHosts'
import { installFakeBridge } from '@/services/fakeBridge'
import { canvasHostStub } from '@/stores/canvas-fixtures'
import { installDocuments, retitleDocument } from '@/stores/document-fixtures'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { usePlay } from '@/stores/play'
import { useProject } from '@/stores/project'
import { useTasks } from '@/stores/tasks'
import type { DocumentNameFailure } from '@shared/domain/documentName'
import type { WorkspaceId } from '@shared/domain/workspace'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'

const openDocument = vi.hoisted(() => vi.fn())
vi.mock('@/features/shell/components/dockviewApi', () => ({ openDocument, showWorkspace: vi.fn() }))

const closeDocument = vi.hoisted(() => vi.fn(async () => true))
const documentIsDirty = vi.hoisted(() => vi.fn(() => false))
const saveDocument = vi.hoisted(() => vi.fn(async () => true))
const dropDocument = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/features/shell/documentIo', () => ({
  closeDocument,
  documentIsDirty,
  saveDocument,
  dropDocument,
}))

const WHEN = '2026-08-17T10:00:00.000Z'

beforeEach(() => {
  installFakeBridge()
  // Left set, a paused game of one case is the state every case after it reads.
  usePlay.setState({ reports: {} })
  useTasks.setState({ running: {} })
  openDocument.mockClear()
  closeDocument.mockClear()
  closeDocument.mockResolvedValue(true)
  saveDocument.mockClear()
  saveDocument.mockResolvedValue(true)
  dropDocument.mockClear()
  dropDocument.mockResolvedValue(true)
  documentIsDirty.mockReturnValue(false)
  useProject.setState({
    project: {
      path: '/tmp/Film',
      manifest: { version: 1, createdAt: WHEN, updatedAt: WHEN },
    },
  })
  useLayouts.setState({ activeWorkspace: '3d', home: false })
  useDocuments.setState({ stored: [] })
})

describe('closing and renaming', () => {
  // The tab's own cross, question about unsaved work included: a second path that skipped it
  // would be the only way in the studio to lose work silently.
  it('closes through the same path the tab does', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')

    expect(await runAction('document.close', { documentId: 'doc-a' })).toEqual({ ok: true })
    expect(closeDocument).toHaveBeenCalledWith('doc-a')
  })

  it('reports a close the person cancelled as a refusal, not as done', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')
    closeDocument.mockResolvedValue(false)

    expect(await runAction('document.close', { documentId: 'doc-a' })).toMatchObject({
      ok: false,
      refusal: 'declined',
    })
  })

  it('renames a document, and refuses a name the store turned down', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')
    const rename = vi.fn(async () => null)
    useDocuments.setState({ rename })

    expect(await runAction('document.rename', { documentId: 'doc-a', title: 'Niveau 2' })).toEqual({
      ok: true,
    })
    expect(rename).toHaveBeenCalledWith('doc-a', 'Niveau 2')

    const turnedDown: DocumentNameFailure = 'empty'
    useDocuments.setState({ rename: vi.fn(async () => turnedDown) })
    expect(await runAction('document.rename', { documentId: 'doc-a', title: '.' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

describe('reading the activity', () => {
  it('passes the limit through, and asks for the default when none is given', async () => {
    const read = vi.fn(async () => [])
    installFakeBridge({ activity: { read } })

    await runAction('activity.recent', { limit: 5 })
    expect(read).toHaveBeenCalledWith({ limit: 5 })

    await runAction('activity.recent', {})
    expect(read).toHaveBeenCalledWith({})
  })
})

/**
 * The only export an outside client can ask for. Every other export channel raises a native picker
 * nobody outside can fill, and the destination here is NAMED rather than pointed at — which is why
 * it is held inside the project by the main process rather than trusted.
 */
describe('exporting the document in front', () => {
  /** A one-pixel PNG, base64, which is what a mounted engine hands its snapshot over as. */
  const PIXEL = 'data:image/png;base64,iVBORw0KGgo='

  const withImage = (): void => {
    installDocuments({ 'doc-b': 'image' }, 'doc-b')
    holdCanvas('doc-b', () =>
      canvasHostStub({ flatten: async () => new Uint8Array(0), snapshot: async () => PIXEL }),
    )
  }

  it('renders the image in front and writes it under its own title', async () => {
    withImage()
    const exportInto = vi.fn(async () => 'doc-b')
    installFakeBridge({ project: { exportInto } })

    expect(await runAction('document.export', {})).toEqual({ ok: true, data: 'doc-b' })
    expect(exportInto).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'doc-b',
        files: [expect.objectContaining({ extension: '.png' })],
      }),
    )
  })

  // Each door used to leave the fallback to `safeFileName`, whose own default is `texture`: a
  // title made of separators is cleaned down to nothing, and the picture came out named `texture`.
  it('names a picture with no usable title after its own space', async () => {
    withImage()
    retitleDocument('doc-b', '///')
    const exportInto = vi.fn(async () => 'image')
    installFakeBridge({ project: { exportInto } })

    await runAction('document.export', {})

    expect(exportInto).toHaveBeenCalledWith(expect.objectContaining({ folder: 'image' }))
  })

  it('writes into the folder it was given rather than the title', async () => {
    withImage()
    const exportInto = vi.fn(async () => 'Rendus')
    installFakeBridge({ project: { exportInto } })

    await runAction('document.export', { folder: 'Rendus' })
    expect(exportInto).toHaveBeenCalledWith(expect.objectContaining({ folder: 'Rendus' }))
  })

  /**
   * A montage answers with its CUT, not with a film: the film needs a session the viewport
   * drives and a client cannot hold, while the `.otio` is one encoding of plain data. This case
   * asserted the refusal until the montage got that encoding.
   */
  it.each<WorkspaceId>(['video', 'audio'])('writes the cut of a %s montage', async workspace => {
    installDocuments({ 'doc-m': workspace }, 'doc-m')
    const exportInto = vi.fn(async () => 'doc-m')
    installFakeBridge({ project: { exportInto } })

    expect(await runAction('document.export', {})).toEqual({ ok: true, data: 'doc-m' })
    expect(exportInto).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'doc-m',
        files: [expect.objectContaining({ extension: '.otio' })],
      }),
    )
  })

  // Same question as the picture above, on the last door that still left the fallback to
  // `safeFileName`: a montage with no usable title came out named after the material space.
  it('names a montage with no usable title after its own space', async () => {
    installDocuments({ 'doc-m': 'video' }, 'doc-m')
    retitleDocument('doc-m', '...')
    const exportInto = vi.fn(async () => 'edit')
    installFakeBridge({ project: { exportInto } })

    await runAction('document.export', {})

    expect(exportInto).toHaveBeenCalledWith(expect.objectContaining({ folder: 'edit' }))
  })

  // The one way a montage cannot be encoded: its clips point at catalogue rows, and without a
  // project there is no path to resolve them to.
  it('refuses a montage when no project is open', async () => {
    installDocuments({ 'doc-m': 'video' }, 'doc-m')
    useProject.setState({ project: null, known: true })
    const exportInto = vi.fn(async () => null)
    installFakeBridge({ project: { exportInto } })

    expect(await runAction('document.export', {})).toMatchObject({
      ok: false,
      refusal: 'notRenderable',
    })
    expect(exportInto).not.toHaveBeenCalled()
  })

  // Every rendering throws rather than answering half an export — here, an engine that is not
  // mounted, which is what a headless test always is.
  it('refuses rather than writing half an export when the rendering fails', async () => {
    installDocuments({ 'doc-s': 'skyboxes' }, 'doc-s')
    const exportInto = vi.fn(async () => null)
    installFakeBridge({ project: { exportInto } })

    expect(await runAction('document.export', {})).toMatchObject({
      ok: false,
      refusal: 'notRenderable',
    })
    expect(exportInto).not.toHaveBeenCalled()
  })

  it('refuses with no document in front at all', async () => {
    installDocuments({}, '')

    expect(await runAction('document.export', {})).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })
})

/**
 * The two verbs an outside client had no way to reach. Creating one was already possible
 * (`workspace.open` with `createDocument`), and so was trashing a file (`files.trash`) — what was
 * missing is a save it can WAIT on, and a delete at all.
 */
describe('saving a document from outside the window', () => {
  it('saves the document it names, and says whether anything was written', async () => {
    installDocuments({ 'doc-a': '3d', 'doc-b': 'image' }, 'doc-b')

    expect(await runAction('document.save', { documentId: 'doc-a' })).toEqual({
      ok: true,
      data: { written: true },
    })
    expect(saveDocument).toHaveBeenCalledWith('doc-a')
  })

  // `command.run('document.save')` could only ever reach the tab in front, and answered before
  // the write landed. Naming one is the whole point of this action.
  it('falls back on the document in front when none is named', async () => {
    installDocuments({ 'doc-a': '3d', 'doc-b': 'image' }, 'doc-b')

    await runAction('document.save', {})

    expect(saveDocument).toHaveBeenCalledWith('doc-b')
  })

  // An untouched tab has nothing to write. A client told `failed` would retry it for ever.
  it('answers that nothing was written rather than refusing', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')
    saveDocument.mockResolvedValue(false)

    expect(await runAction('document.save', {})).toEqual({ ok: true, data: { written: false } })
  })

  it('refuses for a document no tab holds', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')

    expect(await runAction('document.save', { documentId: 'ghost' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(saveDocument).not.toHaveBeenCalled()
  })

  /**
   * An image whose engine is still booting its GPU context throws rather than writing a container
   * with no pixels. Across this boundary that has to be a refusal, and the same one an export
   * gives for the same cause.
   */
  it('refuses rather than throwing when the editor cannot hand its pixels over', async () => {
    installDocuments({ 'doc-b': 'image' }, 'doc-b')
    saveDocument.mockRejectedValue(new Error('its pixels cannot be read'))

    expect(await runAction('document.save', {})).toMatchObject({
      ok: false,
      refusal: 'notRenderable',
    })
  })
})

describe('deleting a document from outside the window', () => {
  /**
   * `dropDocument` and not `deleteDocument`: the tab menu's route raises a NATIVE dialog, which
   * nobody on the other side of the machine can answer — the call would stand there for good.
   * The assistant's own gate is what stands in front of this one.
   */
  it('deletes without raising a dialog nobody can answer', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')

    expect(await runAction('document.deleteFromDisk', { documentId: 'doc-a' })).toEqual({
      ok: true,
    })
    expect(dropDocument).toHaveBeenCalledWith('doc-a')
  })

  it('refuses for a document no tab holds', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')

    expect(await runAction('document.deleteFromDisk', { documentId: 'ghost' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(dropDocument).not.toHaveBeenCalled()
  })

  it('says it did not go through rather than reporting a deletion that never happened', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')
    dropDocument.mockResolvedValue(false)

    expect(await runAction('document.deleteFromDisk', { documentId: 'doc-a' })).toMatchObject({
      ok: false,
      refusal: 'failed',
    })
  })
})
