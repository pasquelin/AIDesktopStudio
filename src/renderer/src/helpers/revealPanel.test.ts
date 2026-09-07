import { beforeEach, describe, expect, it } from 'vitest'
import { shownIn } from '@pasquelin/panels'
import { chassisFor } from '@/stores/panels-fixtures'
import { panelsStore } from '@/stores/panels'
import { useLayouts } from '@/stores/layouts'
import { useDocuments } from '@/stores/documents'
import { useProject } from '@/stores/project'
import { trackByGit } from '@/stores/git-fixtures'
import { installDocument } from '@/stores/document-fixtures'
import { closeTool, revealAssets, revealTool, toolIsShown } from './revealPanel'

beforeEach(() => {
  useLayouts.setState({ activeWorkspace: 'image', home: false })
  chassisFor('image')
})

/** What the zone DRAWS on the surface in front — never what the half merely holds. */
const drawn = (zone: Parameters<typeof shownIn>[1]) => shownIn(panelsStore.getState(), zone)

/**
 * The shelf is the upper left in every space, which it was not until 17 August — it lay in the
 * band or the right column depending on the space. A half whose placement does not match its
 * zone renders a different panel altogether, so opening it in the wrong one shows the layers
 * instead — and quietly rewrites the user's layout on the way.
 */
describe('revealing the shelf', () => {
  it('opens it in the upper left, leaving the other zones alone', () => {
    revealAssets()

    expect(drawn('left').primary).toBe('assets')
    // The other zones are as the studio opened them: revealing a panel moves ONE half.
    expect(drawn('bottomRight').primary).toBeUndefined()
    expect(drawn('right').primary).toBe('layers')
  })

  // It used to move with the space, and the test that said so is the one this replaces: the
  // shelf answers the same question everywhere, so it no longer changes corner on the way.
  it('opens it in the same half whatever the workspace', () => {
    useLayouts.setState({ activeWorkspace: 'video' })
    chassisFor('video')

    revealAssets()

    expect(drawn('left').primary).toBe('assets')
  })

  it('focuses the column rather than reopening it when it is already there', () => {
    chassisFor('image', { left: { primary: 'assets' } })

    revealAssets()

    expect(panelsStore.getState().focusedZone).toBe('left')
  })

  /**
   * A default layout IS rewritten now, and that is the change of moving in beside the models:
   * a half left on its default opens on the FIRST tool the registry declares there, which is
   * the models — so the shelf has to be named to come up, where the band used to show it
   * without anyone asking.
   */
  it('names the shelf in a default layout, the half being the generator until it does', () => {
    // A half left on its default draws the FIRST panel declared for it, which is the generator
    // — so the shelf has to be named to come up.
    chassisFor('image', { left: { primary: null } })
    expect(drawn('left').primary).toBe('generator')

    revealAssets()

    expect(panelsStore.getState().views.workspaces?.left?.primary).toBe('assets')
    expect(panelsStore.getState().focusedZone).toBe('left')
  })
})

/**
 * A panel is not reachable simply because the surface declares one somewhere: the assistant is
 * withheld while the empty centre stages the same conversation, and naming it in the half anyway
 * wrote a layout the reader never asked for — then resolved it away and opened the column on the
 * layers instead. Silently, since every gate is green on a store write nothing draws.
 */
describe('revealing a panel the surface is not offering', () => {
  it('refuses rather than writing it into the half', () => {
    useDocuments.setState({ documents: {}, activeId: null })
    chassisFor('image')

    expect(revealTool('assistant')).toBe(false)
    // The half keeps what the surface does declare, rather than a panel nobody can reach.
    expect(drawn('right').primary).toBe('layers')
  })

  it('opens it once a document holds the centre', () => {
    installDocument('doc-1', 'image')
    chassisFor('image')

    expect(revealTool('assistant')).toBe(true)
    expect(drawn('right').primary).toBe('assistant')
  })
})

/**
 * 🛑 `offeredPlacement` reads the STORES; the chassis registry is filled by the shell's render.
 * The two are a tick apart whenever an answer a `requires` asks about has just landed — a project
 * opening, `git init` finishing — and `show` does nothing at all for an id it cannot find.
 */
describe('revealing a panel the chassis has not been told about yet', () => {
  it('answers no rather than yes over a half that never moved', () => {
    // Declared with no project, so the Git panel is not in the registry...
    useProject.setState({ project: null })
    chassisFor('image')

    // ...and now there is one, which is what `offeredPlacement` reads.
    trackByGit()
    useProject.setState({
      project: { path: '/projects/one', manifest: { version: 1, createdAt: '', updatedAt: '' } },
    })

    expect(revealTool('git')).toBe(false)
    expect(drawn('left').secondary).toBe('explorer')
  })

  it('answers yes once the shell has declared it', () => {
    trackByGit()
    useProject.setState({
      project: { path: '/projects/one', manifest: { version: 1, createdAt: '', updatedAt: '' } },
    })
    chassisFor('image')

    expect(revealTool('git')).toBe(true)
    expect(drawn('left').secondary).toBe('git')
  })
})

/**
 * 🛑 The other axis of the same lag, and the costlier one: the chassis' VIEW follows the shell's
 * render too. Between the home coming forward and that render, `show` writes into the family the
 * chassis still holds — a panel named in the spaces' arrangement while the home is on screen.
 */
describe('revealing a panel while the chassis is still on the other view', () => {
  it('answers no, and writes into neither arrangement', () => {
    trackByGit()
    useProject.setState({
      project: { path: '/projects/one', manifest: { version: 1, createdAt: '', updatedAt: '' } },
    })
    chassisFor('image')
    useLayouts.setState({ home: true })

    expect(revealTool('git')).toBe(false)
    expect(panelsStore.getState().views.workspaces?.left?.secondary).toBeNull()
  })

  it('says the same of what is shown, rather than reading the other view', () => {
    chassisFor('image')
    useLayouts.setState({ home: true })

    // `explorer` leads the lower left of a SPACE; the home is in front and holds its own.
    expect(toolIsShown('explorer')).toBe(false)
  })
})

/**
 * 🛑 What answers ABOUT a panel reads where it STANDS, never where it was declared: on the
 * declaration, `closeTool` emptied the half it came FROM and `toolIsShown` looked in a zone it
 * had left — both are what the assistant and an MCP client are told.
 */
describe('a panel the reader has moved', () => {
  beforeEach(() => {
    chassisFor('image', {
      left: { primary: 'assets', secondary: null },
      right: { primary: 'layers', secondary: null },
    })
    panelsStore.getState().movePanel('layers', { zone: 'left', slot: 'secondary' }, 0)
  })

  it('is shown where it stands, not where it was declared', () => {
    expect(drawn('left').secondary).toBe('layers')
    expect(toolIsShown('layers')).toBe(true)
  })

  it('closes the half it stands in, leaving the one it was declared in alone', () => {
    const declared = drawn('right').primary

    expect(closeTool('layers')).toBe(true)
    expect(drawn('left').secondary).not.toBe('layers')
    expect(drawn('right').primary).toBe(declared)
  })
})
