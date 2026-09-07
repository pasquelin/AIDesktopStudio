import { createDefaultScene } from '@/engines/scene/defaultScene'
import { clipFixture, sequenceWith, trackFixture } from '@/engines/timeline/timeline-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { installDocuments, retitleDocument } from '@/stores/document-fixtures'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { usePlay } from '@/stores/play'
import { useProject } from '@/stores/project'
import { installScene } from '@/stores/scene-fixtures'
import { installSequence } from '@/stores/sequence-fixtures'
import { selectTrackIn, sequenceOf, useSequences } from '@/stores/sequences'
import { useTasks } from '@/stores/tasks'
import type { DocumentDescriptor } from '@shared/domain/document'
import { NOT_PLAYING } from '@shared/domain/gameRuntime'
import { SNAPSHOT_TASKS_MAX, type StudioSnapshot } from '@shared/domain/studioSnapshot'
import { TARGET_NAME_MAX } from '@shared/domain/target'
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

const stored = (id: string, path: string): DocumentDescriptor => ({
  id,
  kind: 'scene',
  workspace: '3d',
  title: id,
  path,
})

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

describe('reading what the studio is', () => {
  /**
   * The one action every other one depends on: `command.run` refuses anything whose surface is
   * not active, and before this there was no way to ask which one was. The scope is answered
   * beside the surface for exactly that reason — a refusal a client cannot act on is noise.
   */
  it('names the project, the surface it puts a command in, and which tab is in front', async () => {
    installDocuments({ 'doc-a': '3d', 'doc-b': 'image' }, 'doc-b')

    const outcome = await runAction('studio.state', {})

    expect(outcome).toMatchObject({
      ok: true,
      data: {
        project: { path: '/tmp/Film' },
        workspace: '3d',
        surface: '3d',
        commandScope: 'scene',
        authenticated: false,
      },
    })
    const state = outcome.ok
      ? (outcome.data as { documents: { id: string; active: boolean }[] })
      : null
    expect(state?.documents.find(one => one.id === 'doc-b')?.active).toBe(true)
    expect(state?.documents.find(one => one.id === 'doc-a')?.active).toBe(false)
  })

  /**
   * What a spoken request most often means by "it". Answered here rather than left to a second
   * call: the assistant's briefing reads this as a sentence, and a client that had to ask twice
   * would act between the two answers.
   */
  it('says what is designated on the surface in front', async () => {
    const base = createDefaultScene()
    const node = base.nodes[0]
    installScene('doc-scene', { ...base, selectedIds: node ? [node.id] : [] })

    const outcome = await runAction('studio.state', {})

    expect(outcome).toMatchObject({
      ok: true,
      data: { selection: { kind: 'node', items: [{ id: node?.id, name: node?.name }] } },
    })
  })

  it('names the long tasks this window is running', async () => {
    useTasks.getState().begin({ id: 'task-7', label: 'Indexing', ratio: 0.4 })

    expect(await runAction('studio.state', {})).toMatchObject({
      data: { tasks: [{ id: 'task-7', label: 'Indexing', ratio: 0.4 }] },
    })
  })

  /**
   * 🛑 The label is a document TITLE, unbounded, and the only field of the snapshot that could
   * fail `parseSnapshot` — which answers null, and takes the WHOLE studio block out of every
   * briefing. Cut and scrubbed here, as `narrowTargets` does for a target's name.
   */
  it('cuts, scrubs and clamps what a task publishes', async () => {
    useTasks.getState().begin({ id: 'task-7', label: `x"${'y'.repeat(60)}`, ratio: 1.4 })

    const outcome = await runAction('studio.state', {})
    const [task] = outcome.ok ? ((outcome.data as StudioSnapshot).tasks ?? []) : []

    expect(task?.label).toHaveLength(TARGET_NAME_MAX)
    expect(task?.label).not.toContain('"')
    expect(task?.ratio).toBe(1)
  })

  // Newest first: what a person has just started is what they ask about.
  it('publishes the newest tasks when more run than it names', async () => {
    for (let at = 0; at < SNAPSHOT_TASKS_MAX + 2; at += 1)
      useTasks.getState().begin({ id: `task-${at}`, label: `T${at}`, ratio: 0 })

    const outcome = await runAction('studio.state', {})
    const tasks = outcome.ok ? ((outcome.data as StudioSnapshot).tasks ?? []) : []

    expect(tasks).toHaveLength(SNAPSHOT_TASKS_MAX)
    expect(tasks[0]?.id).toBe(`task-${SNAPSHOT_TASKS_MAX + 1}`)
  })

  /**
   * 🛑 Off the scene IN FRONT: a game runs per document, and another tab's would aim « reprends
   * la partie » at a scene the person is not looking at.
   */
  it('says a game is under way on the scene in front', async () => {
    installScene('doc-scene', createDefaultScene())
    installDocuments({ 'doc-scene': '3d', 'doc-other': '3d' }, 'doc-scene')
    usePlay.setState({ reports: { 'doc-other': { ...NOT_PLAYING, state: 'playing' } } })

    expect(await runAction('studio.state', {})).toMatchObject({ data: { play: 'edit' } })

    usePlay.setState({ reports: { 'doc-scene': { ...NOT_PLAYING, state: 'paused' } } })

    expect(await runAction('studio.state', {})).toMatchObject({ data: { play: 'paused' } })
  })

  // Which TRACK is designated, not the clip that was designated before it: a briefing that read
  // the clip for ever left a spoken « mute this track » with nothing to aim at.
  it('says which track is designated', async () => {
    installSequence('doc-seq')
    installDocuments({ 'doc-seq': 'video' }, 'doc-seq')
    const track = sequenceOf(useSequences.getState(), 'doc-seq').tracks[0]
    selectTrackIn('doc-seq', track?.id ?? '')

    const outcome = await runAction('studio.state', {})

    expect(outcome).toMatchObject({
      ok: true,
      data: { selection: { kind: 'track', items: [{ id: track?.id, name: track?.name }] } },
    })
  })

  /**
   * 🛑 The same answer as the inspector, resolved by `designatedIn`. Written twice, the two
   * diverged on exactly this input: the panel fell back to the clip and the briefing said nothing,
   * so a model was told nothing was designated over a clip the user could see highlighted.
   */
  it('falls back to the clip when the designated row is no longer there', async () => {
    installSequence('doc-seq', {
      ...sequenceWith([trackFixture('V1', 'video', [clipFixture('clip-1', 0, 1_000_000)])]),
      selectedId: 'clip-1',
      selectedTrackId: 'gone',
    })
    installDocuments({ 'doc-seq': 'video' }, 'doc-seq')

    const outcome = await runAction('studio.state', {})

    expect(outcome).toMatchObject({
      ok: true,
      data: { selection: { kind: 'clip', items: [{ id: 'clip-1' }] } },
    })
  })

  it('says a document holds unsaved work, from the same predicate the tab bullet reads', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')
    documentIsDirty.mockReturnValue(true)

    const outcome = await runAction('studio.state', {})

    expect(outcome).toMatchObject({ ok: true, data: { documents: [{ modified: true }] } })
  })

  // The folder holds documents no tab shows, and those are exactly the ones a client needs
  // listed: it cannot open what it was never told about.
  it('lists what the folder holds as well as what is open, saying which is which', async () => {
    installDocuments({ 'doc-open': '3d' }, 'doc-open')
    useDocuments.setState({ stored: [stored('doc-shut', 'Repérages/Niveau.gltf')] })

    const outcome = await runAction('documents.list', {})
    const listed = outcome.ok ? (outcome.data as { id: string; open: boolean }[]) : []

    expect(listed.find(one => one.id === 'doc-shut')?.open).toBe(false)
    expect(listed.find(one => one.id === 'doc-open')?.open).toBe(true)
  })
})

describe('putting a document in front', () => {
  it('activates one that is open', async () => {
    installDocuments({ 'doc-a': '3d', 'doc-b': 'image' }, 'doc-a')

    expect(await runAction('document.activate', { documentId: 'doc-b' })).toEqual({ ok: true })
    expect(useDocuments.getState().activeId).toBe('doc-b')
  })

  // Naming the tab in the store alone left an image in front of a sky's panels.
  it('takes the section and the centre with it', async () => {
    installDocuments({ 'doc-a': '3d', 'doc-b': 'image' }, 'doc-a')

    await runAction('document.activate', { documentId: 'doc-b' })

    expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-b' }))
  })

  /**
   * 🛑 By TITLE, because the id is the one thing a caller may never have seen: the briefing names
   * open documents in quotes and nothing else, so a model told to bring one back to the front had
   * only its title to answer with — and the rule telling it to do so promised a refusal.
   */
  it('takes the title the studio shows, not the id alone', async () => {
    installDocuments({ 'doc-a': '3d', 'doc-b': 'image' }, 'doc-a')
    retitleDocument('doc-b', 'Planche du château')

    expect(await runAction('document.activate', { documentId: 'Planche du château' })).toEqual({
      ok: true,
    })
    expect(useDocuments.getState().activeId).toBe('doc-b')
  })

  // Guessing between two would activate the wrong one in silence, where a refusal sends the
  // caller to `documents.list` for the id that tells them apart.
  it('refuses a title two documents share rather than picking one', async () => {
    installDocuments({ 'doc-a': '3d', 'doc-b': 'image' }, 'doc-a')
    retitleDocument('doc-a', 'Château')
    retitleDocument('doc-b', 'Château')

    expect(await runAction('document.activate', { documentId: 'Château' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(useDocuments.getState().activeId).toBe('doc-a')
  })

  it('refuses an id no tab holds rather than clearing the centre', async () => {
    installDocuments({ 'doc-a': '3d' }, 'doc-a')

    expect(await runAction('document.activate', { documentId: 'doc-z' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(useDocuments.getState().activeId).toBe('doc-a')
    expect(openDocument).not.toHaveBeenCalled()
  })

  it('opens a document of the folder by its path', async () => {
    installDocuments({}, '')
    useDocuments.setState({ stored: [stored('doc-shut', 'Repérages/Niveau.gltf')] })

    expect(await runAction('document.open', { path: 'Repérages/Niveau.gltf' })).toEqual({
      ok: true,
      data: { documentId: 'doc-shut' },
    })
    expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-shut' }))
  })

  /**
   * A listing a client holds may predate a file that has since arrived — its own generation, or
   * another program's. Answering "no such document" for one sitting on the disk is the least
   * useful refusal there is, so the folder is re-read before refusing.
   */
  it('re-reads the folder before refusing a path it has not heard of', async () => {
    installDocuments({}, '')
    const relist = vi.fn(async () => {
      useDocuments.setState({ stored: [stored('doc-new', 'Sorties/Rendu.gltf')] })
    })
    useDocuments.setState({ relist })

    expect(await runAction('document.open', { path: 'Sorties/Rendu.gltf' })).toMatchObject({
      ok: true,
    })
    expect(relist).toHaveBeenCalled()
  })

  // `badInput` sent a client back to check a path that was well formed all along, when the only
  // true answer was that nothing sits there.
  it('says the document is not there rather than blaming the parameters', async () => {
    installDocuments({}, '')

    expect(await runAction('document.open', { path: 'Nowhere/Absent.ora' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})
