import { describe, expect, it } from 'vitest'
import type { SnapshotDocument, StudioSnapshot } from '@shared/domain/studioSnapshot'
import { describeStudio } from './studioState'

const WHEN = '2026-08-25T10:00:00.000Z'

const document = (over: Partial<SnapshotDocument> = {}): SnapshotDocument => ({
  id: 'doc-a',
  title: 'Plage',
  kind: 'image',
  workspace: 'image',
  path: null,
  active: true,
  modified: false,
  ...over,
})

/**
 * 🛑 Typed as the shared contract rather than composed loose: the schema behind `describeStudio`
 * refuses anything else, so a fixture that drifts from what the window actually sends stops
 * compiling instead of quietly describing a studio nobody has.
 */
const studio = (over: Partial<StudioSnapshot> = {}): StudioSnapshot => ({
  project: {
    path: '/tmp/Film',
    manifest: { version: 1, createdAt: WHEN, updatedAt: WHEN },
  },
  projectKnown: true,
  play: 'edit',
  tasks: [],
  workspace: 'image',
  surface: 'image',
  commandScope: 'canvas',
  documents: [document()],
  selection: null,
  armedModels: { 'image/txt2img': 'model_ssd1b' },
  authenticated: true,
  authKnown: true,
  ...over,
})

describe('what the studio is, said to the model', () => {
  /**
   * The four facts the reported defect turned on: with none of them, "make me a bicycle" met a
   * model that did not know an image document was already in front, and made a second one.
   */
  it('names the space, the document in front and the model armed for it', () => {
    const said = describeStudio(studio())

    expect(said).toContain('Space: image.')
    expect(said).toContain('In front: "Plage"')
    expect(said).toContain('Armed for image: model_ssd1b.')
  })

  it('says a document holds unsaved work', () => {
    const said = describeStudio(studio({ documents: [document({ modified: true })] }))

    expect(said).toContain('unsaved changes')
  })

  /** Said rather than left out: a model that cannot generate has to say so before promising. */
  it('says when no model is armed for the space in front', () => {
    const said = describeStudio(studio({ armedModels: {} }))

    expect(said).toContain('No model is armed for image')
  })

  /**
   * 🛑 "No document is open" beside a list of open ones is what the new rule about making one
   * would act on — the very defect this file exists to fix, said the other way round.
   */
  it('does not call open documents absent when none of them is active', () => {
    const said = describeStudio(
      studio({
        documents: [
          document({ id: 'a', title: 'A', active: false }),
          document({ id: 'b', title: 'B', kind: 'scene', workspace: '3d', active: false }),
        ],
      }),
    )

    expect(said).not.toContain('No document is open')
    expect(said).toContain('none of them is active')
    expect(said).toContain('Also open: "A" (image), "B" (3d).')
  })

  it('says when no project is open, which is what stops a document being created', () => {
    expect(describeStudio(studio({ project: null }))).toContain('No project is open')
  })

  /**
   * 🛑 The window's `project` starts `null` meaning "not asked yet". Read as an answer, a turn
   * fired before it landed tells the model there is no project over an open one — and the model
   * then refuses to make a document in a project that is right there.
   */
  it('says nothing about the project while the window has not answered', () => {
    const said = describeStudio(studio({ project: null, projectKnown: false }))

    expect(said).not.toContain('No project is open')
    expect(said).toContain('Space: image.')
  })
})

describe('what the studio selection says to the model', () => {
  it('names what is selected, so a request about "it" lands on the right thing', () => {
    const said = describeStudio(
      studio({ selection: { kind: 'node', items: [{ id: 'n1', name: 'Caisse' }] } }),
    )

    expect(said).toContain('Selected: one node — "Caisse".')
  })

  /**
   * A layer is not designated the way a node is: the studio always has an active one, and
   * calling that "selected" aims "delete it" at a layer nobody chose.
   */
  it('says an active layer is where edits land, not what was chosen', () => {
    const said = describeStudio(
      studio({ selection: { kind: 'layer', items: [{ id: 'l1', name: 'Fond' }] } }),
    )

    expect(said).toContain('Edits land on: one layer — "Fond".')
  })

  /**
   * 🛑 The scope, not the kind: `command.runStudioCommand` reads `<scope>.<verb>`, and an image
   * document is kind `image` and scope `canvas` — a model reading the kind composed `image.undo`.
   */
  it('names the scope a command of the surface in front is written in', () => {
    expect(describeStudio(studio({ commandScope: 'canvas' }))).toContain('canvas.<verb>')
  })

  /**
   * 🛑 Nothing else in the briefing announces a game, so a model asked « reprends la partie »
   * answered « Reprise de la partie. » without a single call — measured 2026-08-31.
   */
  it('says a game is under way, and names the call that reads it', () => {
    expect(describeStudio(studio({ play: 'playing' }))).toContain('runtime.report')
    expect(describeStudio(studio({ play: 'paused' }))).toContain('play.resume')
  })

  it('says nothing about a game while the studio is being edited', () => {
    const shown = describeStudio(studio({ play: 'edit' }))

    expect(shown).not.toContain('game')
  })

  /**
   * 🛑 The ID, which `task.cancelLocalTask` takes: nothing else in a briefing publishes one, and
   * « arrête la tâche d'indexation » read `jobs.list`, which holds cloud generations alone.
   */
  it('names a running task by the id that stops it', () => {
    const said = describeStudio(
      studio({ tasks: [{ id: 'task-7', label: 'Indexing', ratio: 0.4 }] }),
    )

    expect(said).toContain('"Indexing" (task-7, 40%)')
    expect(said).toContain('task.cancelLocalTask')
  })

  /**
   * Nothing at all rather than half a studio: the briefing then reads exactly as it did before
   * any of this existed, where a partial state would have the model act on what it half knows.
   */
  it('says nothing when the window answered nothing readable', () => {
    expect(describeStudio(null)).toBe('')
  })

  /** And the same for an answer whose shape drifted — the contract is what makes that visible. */
  it('says nothing when a field the window sends has gone', () => {
    const { workspace, ...missing } = studio()

    expect(workspace).toBe('image')
    expect(describeStudio(missing)).toBe('')
  })

  /**
   * 🛑 Bounded, because its twin `context` is and this one is not composed from anything that
   * bounds itself: titles, node names and model ids a person chose. On Scenario's door every
   * character here is one the sentence does not get.
   */
  it('stays inside its own budget, however much the studio holds', () => {
    const said = describeStudio(
      studio({
        documents: Array.from({ length: 40 }, (_, index) =>
          document({ id: `d${index}`, title: 'A very long document title indeed', active: false }),
        ),
        selection: {
          kind: 'node',
          items: Array.from({ length: 40 }, (_, index) => ({
            id: `n${index}`,
            name: 'A node with a rather long name',
          })),
        },
      }),
    )

    expect(said.length).toBeLessThanOrEqual(700)
    expect(said).toContain('Studio now:')
  })
})
