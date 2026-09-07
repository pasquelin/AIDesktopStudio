import { render, screen } from '@testing-library/react'
import { shownIn } from '@pasquelin/panels'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountedConfirmer } from '@/features/assistant/confirm'
import { installFakeBridge } from '@/services/fakeBridge'
import { installDocument } from '@/stores/document-fixtures'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { trackByGit } from '@/stores/git-fixtures'
import { useProject } from '@/stores/project'
import { homeIsVisible, useLayouts } from '@/stores/layouts'
import { panelsStore } from '@/stores/panels'
import { chassisFor, resetChassis } from '@/stores/panels-fixtures'
import { useSettings } from '@/stores/settings'
import { withQueries } from '../query-fixtures'
import { Shell } from './Shell'

vi.mock('../Document/DocumentArea', () => ({ DocumentArea: () => null }))

/**
 * What the frame DRAWS, by the panels on screen.
 *
 * `region` and not the label: the rail carries a button of the same name for every panel it
 * offers, open or not, so a query by label alone can no longer tell a panel from its icon.
 */
function drawn(): string[] {
  return screen.queryAllByRole('region').map(node => node.getAttribute('aria-label') ?? '')
}

function renderShell() {
  return render(withQueries(<Shell />))
}

beforeEach(() => {
  installFakeBridge()
  // Every test below is about the docks, which the home covers entirely — see its own block.
  useLayouts.setState({ activeWorkspace: 'image', layout: null, home: false })
  // Shared with every other file: a case that opens one leaves the studio holding it, and the
  // panels asking for a project are then offered where the case beside it says they are not.
  useProject.setState({ project: null })
  resetChassis()
  // The store is shared across files: one test turns the home off, and every later one would
  // inherit a studio whose entry point does not exist.
  useSettings.setState(state => ({
    settings: { ...state.settings, home: { ...state.settings.home, enabled: true } },
  }))
})

/**
 * 🛑 What the STUDIO decides, and nothing the chassis already owns.
 *
 * The geometry — a column running past the band, a divider drawn only between two open halves,
 * a zone taking no room while empty — moved into `@pasquelin/panels` with its own suite. Kept
 * here it would have described the same behaviour twice, and the copy would have been the one
 * to rot.
 *
 * What is left is what the registry says: which panel each space puts where, and which panels a
 * surface offers at all.
 */
describe('the default layout', () => {
  it('opens Image on the layers, the inspector, the generator and the Explorer', () => {
    renderShell()

    expect(drawn()).toEqual(
      expect.arrayContaining(['Calques', 'Inspecteur', 'Génération', 'Explorateur']),
    )
  })

  it('opens Video on the montage, with the same left column as Image', () => {
    useLayouts.setState({ activeWorkspace: 'video' })
    renderShell()

    expect(drawn()).toEqual(expect.arrayContaining(['Timeline', 'Génération', 'Explorateur']))
    // The layer stack means nothing here, and no placement gives it this space.
    expect(drawn()).not.toContain('Calques')
  })

  it('opens Skyboxes on the inspector alone, its own upper right being empty', () => {
    useLayouts.setState({ activeWorkspace: 'skyboxes' })
    renderShell()

    expect(drawn()).toContain('Inspecteur')
    expect(drawn()).not.toContain('Calques')
    expect(drawn()).not.toContain('Timeline')
  })
})

/**
 * 🛑 Which halves a surface STARTS with is the studio's decision, and it is made once per view.
 * Read off "whatever happens to be declared the second the chassis settles", a half whose panels
 * all wait on something — a project being read, git answering — stays shut for good.
 */
describe('the halves a surface starts with', () => {
  it('opens the band in Video, on a studio entered through Image', () => {
    const { rerender } = renderShell()

    useLayouts.setState({ activeWorkspace: 'video' })
    rerender(withQueries(<Shell />))

    expect(drawn()).toContain('Timeline')
  })

  it('gives the home’s lower left to the Explorer when the project it waited for opens', () => {
    useLayouts.setState({ home: true })
    const { rerender } = renderShell()

    useProject.setState({
      project: { path: '/projects/one', manifest: { version: 1, createdAt: '', updatedAt: '' } },
    })
    rerender(withQueries(<Shell />))

    expect(drawn()).toContain('Explorateur')
  })
})

// A panel a surface cannot offer is a panel NOT DECLARED. The half it would have taken falls
// back to what this surface does declare — and gives it back the day the panel returns.
describe('a panel the surface cannot offer', () => {
  it('is absent from the frame and from the rail, with no project open', () => {
    renderShell()

    expect(drawn()).not.toContain('Git')
    expect(screen.queryByRole('button', { name: 'Git' })).not.toBeInTheDocument()
  })

  it('leaves the half to the Explorer rather than closing it', () => {
    renderShell()

    // The lower left is the Explorer's, the Git panel's and the context's; two of the three ask
    // for a project, so the half draws the one that does not.
    expect(drawn()).toContain('Explorateur')
  })
})

describe('the home', () => {
  beforeEach(() => {
    useLayouts.setState({ home: true })
  })

  /**
   * Two columns and no band: the montage and the asset shelf act on an open document, and the
   * home has none. Those zones are not declared here, so nothing draws them.
   */
  it('draws its own panels and neither band', () => {
    renderShell()

    expect(drawn()).toContain('Vos projets')
    expect(drawn()).not.toContain('Timeline')
    expect(drawn()).not.toContain('Bibliothèque')
  })

  it('opens on the projects, and on none of what the spaces put there', () => {
    renderShell()

    // The upper left, which the home alone gives to something other than generation.
    expect(drawn()).toContain('Vos projets')
    expect(drawn()).not.toContain('Génération')
    // Gone with the eight readings of the studio that came down on 13 August.
    expect(drawn()).not.toContain('Votre bibliothèque')
    expect(drawn()).not.toContain('Activité récente')
  })

  it('keeps the status line under it', () => {
    renderShell()

    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  /**
   * The home and the spaces are two VIEWS of one chassis: each keeps the panels it had open,
   * and neither can close the other's. One shared arrangement made a click on the Explorer a
   * click on the generation panel.
   */
  it('gives back the workspace and its panels when it is left', () => {
    const { rerender } = renderShell()
    expect(drawn()).toContain('Vos projets')

    useLayouts.setState({ home: false })
    rerender(withQueries(<Shell />))

    expect(drawn()).toContain('Calques')
    expect(drawn()).not.toContain('Vos projets')
  })

  it('shares the column widths with the spaces, which are the studio’s', () => {
    const { rerender } = renderShell()
    panelsStore.getState().resize('left', 420, 1600)

    useLayouts.setState({ home: false })
    rerender(withQueries(<Shell />))

    // A column that changed width on the way out of the home would read as another window.
    expect(panelsStore.getState().lengths.sizes.left).toBe(420)
  })

  it('takes the home button out of the bar when the setting turns it off', () => {
    useSettings.setState(state => ({
      settings: { ...state.settings, home: { ...state.settings.home, enabled: false } },
    }))
    renderShell()

    expect(screen.queryByRole('button', { name: 'Accueil' })).not.toBeInTheDocument()
    // And the studio is on its workspace rather than on a home nothing can reach.
    expect(drawn()).toContain('Calques')
  })
})

/**
 * `home` starts true on every launch — it is session state, deliberately not persisted. The
 * setting is what decides whether that means anything, and every reader has to ask the same
 * question: the native menu asked a different one and published its context as if the home
 * were up while the docks were on screen.
 */
describe('who is in front', () => {
  it('answers the same to the shell and to the native menu', () => {
    useSettings.setState(state => ({
      settings: { ...state.settings, home: { ...state.settings.home, enabled: false } },
    }))
    useLayouts.setState({ home: true })

    expect(homeIsVisible()).toBe(false)

    useSettings.setState(state => ({
      settings: { ...state.settings, home: { ...state.settings.home, enabled: true } },
    }))

    expect(homeIsVisible()).toBe(true)
  })
})

/**
 * The confirmer is what every action with a commitment asks before spending, and it used to be
 * the modal — mounted whether or not it showed. The modal is gone, so nothing but this says the
 * studio still has one: without it `executor` refuses every such action as `noConfirmer`, and
 * the whole gate stays green on it.
 */
describe('the question asked before anything is engaged', () => {
  it('has somewhere to be asked for as long as the shell is up', () => {
    expect(mountedConfirmer()).toBeNull()

    const { unmount } = renderShell()
    expect(mountedConfirmer()).not.toBeNull()

    unmount()
    expect(mountedConfirmer()).toBeNull()
  })
})

/**
 * The shape the frame takes IN WORK, which every case above misses: they run with no document
 * open, the one configuration where the right column still has two halves. With a document in
 * front the assistant is offered, and it takes the column whole.
 */
describe('the right column with a document in front', () => {
  beforeEach(() => {
    installDocument('doc-1', 'image')
  })

  it('is the assistant alone, on an untouched layout', () => {
    renderShell()

    expect(drawn()).toContain('Assistant')
    expect(drawn()).not.toContain('Inspecteur')
    expect(drawn()).not.toContain('Calques')
  })

  it('gives the column back to the panel asked for, and keeps the inspector beside it', () => {
    chassisFor('image', { right: { primary: 'layers', secondary: null } })
    renderShell()

    expect(drawn()).not.toContain('Assistant')
    expect(drawn()).toContain('Inspecteur')
    expect(drawn()).toContain('Calques')
  })
})

describe('the tools beside a standalone model', () => {
  it('offers its mesh hierarchy without offering scene-only editors', () => {
    useLayouts.setState({ activeWorkspace: '3d' })
    installCharacterDocument('character-1', 'asset-hero')
    renderShell()

    expect(screen.getByRole('button', { name: 'Scène' })).toBeInTheDocument()
    for (const name of ['Interface', 'Lumières', 'Mailles']) {
      expect(drawn()).not.toContain(name)
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Inspecteur' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument()
  })
})

/**
 * The montage carries a whole bar on its title row and wants the width; every other band panel
 * wants its buttons at the end. The chassis guesses from "publishes actions in a horizontal
 * zone", which is why the registry has to say.
 */
describe('a panel of the band', () => {
  it('gives the row’s free width to the montage, and to it alone', () => {
    useLayouts.setState({ activeWorkspace: 'video' })
    renderShell()

    expect(screen.getByText('Timeline')).toHaveClass('pnl-header__title--fixed')
  })

  it('leaves the history’s actions at the end of its row', () => {
    trackByGit()
    useProject.setState({
      project: {
        path: '/projects/one',
        manifest: { version: 1, createdAt: '', updatedAt: '' },
      },
    })
    renderShell()
    panelsStore.getState().show('history')

    expect(screen.getByText('Historique')).not.toHaveClass('pnl-header__title--fixed')
  })
})

/**
 * 🛑 The arrangement is kept per SECTION, `view` naming only the family: left to follow `view`,
 * one panel dragged in Image reordered the rail of all six spaces.
 */
describe('moving a panel', () => {
  it('hands the rail buttons to a drag', () => {
    renderShell()

    expect(document.body.querySelectorAll('[data-pnl-panel]').length).toBeGreaterThan(0)
  })

  it('keeps one section’s arrangement out of the others', () => {
    const { rerender } = renderShell()
    const showing = (zone: 'left' | 'right') => shownIn(panelsStore.getState(), zone)

    // The Explorer, from the lower left of Image to the lower right — a half every space
    // declares, so the two sections can disagree about it at all.
    panelsStore.getState().movePanel('explorer', { zone: 'right', slot: 'secondary' }, 0)
    expect(showing('right').secondary).toBe('explorer')

    useLayouts.setState({ activeWorkspace: 'video' })
    rerender(withQueries(<Shell />))

    // Nobody dragged anything in Video: it holds what the registry declares.
    expect(showing('right').secondary).toBe('inspector')
    expect(showing('left').secondary).toBe('explorer')

    useLayouts.setState({ activeWorkspace: 'image' })
    rerender(withQueries(<Shell />))

    expect(showing('right').secondary).toBe('explorer')
  })
})

/**
 * 🛑 The listener sits on `window`, above the whole tree. Cancelling every drop took the native
 * insertion away from any editable field a selection was dragged into.
 */
describe('a drop that carries no file', () => {
  it('is left to whatever is under it', () => {
    renderShell()
    const drop = new Event('drop', { bubbles: true, cancelable: true })

    window.dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(false)
  })
})
