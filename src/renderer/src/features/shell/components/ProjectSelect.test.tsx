import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project, RecentProject } from '@shared/domain/project'
import { NO_BREAK_SPACE } from '@shared/i18n/typography'
import { installFakeBridge } from '@/services/fakeBridge'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { revealTool } from '@/helpers/revealPanel'
import { ProjectSelect } from './ProjectSelect'

vi.mock('@/helpers/revealPanel', () => ({ revealTool: vi.fn(() => true) }))

const summer: Project = {
  path: '/projects/Summer',
  manifest: {
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
}

const recent = (...names: string[]): RecentProject[] =>
  names.map(name => ({
    path: `/projects/${name}`,
    name,
    openedAt: '2026-08-01T00:00:00Z',
  }))

const given = (project: Project | null, projects: RecentProject[] = []): void => {
  useProject.setState({ project, known: true })
  useSettings.setState(state => ({
    settings: {
      ...state.settings,
      storage: { ...state.settings.storage, recentProjects: projects },
    },
  }))
}

const buttonFor = (name: string): HTMLElement =>
  screen.getByRole('button', { name: `Projet${NO_BREAK_SPACE}: ${name}` })

const openMenu = async (name: string): Promise<void> => {
  await userEvent.click(buttonFor(name))
}

beforeEach(() => {
  installFakeBridge()
  given(null)
})

describe('ProjectSelect current project', () => {
  it('shows the name of the project that is open', () => {
    given(summer)
    render(<ProjectSelect />)

    expect(buttonFor('Summer')).toHaveTextContent('Summer')
  })

  it('says none is open before one has been chosen', () => {
    render(<ProjectSelect />)

    expect(buttonFor('Aucun projet ouvert')).toHaveTextContent('Aucun projet ouvert')
  })

  /**
   * One project is open at a time, so the list is what has been opened before and the tick is
   * which of them is in front. Anything else on that button would be a list of things that are
   * all equally open, which the studio has no such thing as.
   */
  it('lists what has been opened before, ticking the one in front', async () => {
    given(summer, recent('Summer', 'Winter'))
    render(<ProjectSelect />)
    await openMenu('Summer')

    const projects = screen.getAllByRole('menuitemradio')
    expect(projects.map(row => row.textContent)).toEqual(['Summer', 'Winter'])
    expect(projects[0]).toHaveAttribute('aria-checked', 'true')
    expect(projects[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('switches to the project that was picked', async () => {
    const open = vi.fn(() => Promise.resolve(summer))
    installFakeBridge({ project: { open } })
    given(summer, recent('Summer', 'Winter'))

    render(<ProjectSelect />)
    await openMenu('Summer')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Winter' }))

    expect(open).toHaveBeenCalledWith('/projects/Winter')
  })
})

describe('ProjectSelect menu actions', () => {
  // Reopening the open one drops every panel's state and reloads the catalogue to land on the
  // folder already in front.
  it('does not reopen the project already in front', async () => {
    const open = vi.fn(() => Promise.resolve(summer))
    installFakeBridge({ project: { open } })
    given(summer, recent('Summer', 'Winter'))

    render(<ProjectSelect />)
    await openMenu('Summer')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Summer' }))

    expect(open).not.toHaveBeenCalled()
  })

  /**
   * The two ways to a project the list has never held. They are what makes this a menu on a fresh
   * install: with nothing opened yet there is still somewhere to go, and a button whose menu
   * would be empty is a button that leads nowhere.
   */
  it('offers a way to a project it has never opened, with nothing in the list', async () => {
    render(<ProjectSelect />)
    await openMenu('Aucun projet ouvert')

    expect(screen.queryAllByRole('menuitemradio')).toEqual([])
    expect(screen.getByRole('menuitem', { name: 'Créer un projet' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Ouvrir un projet' })).toBeInTheDocument()
  })

  /**
   * The one row that acts on the project rather than switching away from it — and the only way in
   * from the title bar, where the panel it opens is two clicks down a rail.
   */
  it('opens the context panel of the project in front', async () => {
    given(summer)
    render(<ProjectSelect />)
    await openMenu('Summer')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Contexte du projet' }))

    expect(revealTool).toHaveBeenCalledWith('context')
  })

  /**
   * The gesture the shelf's « retirer de la liste » is NOT: that one drops a row and leaves the
   * project open, which is what made the explorer go on showing a project no longer on the shelf.
   * What the closing writes to the settings is held in the store's own tests.
   */
  it('closes the project in front', async () => {
    const close = vi.fn(() => Promise.resolve())
    installFakeBridge({ project: { close } })
    given(summer, recent('Summer', 'Winter'))
    render(<ProjectSelect />)
    await openMenu('Summer')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Fermer le projet' }))

    await waitFor(() => expect(close).toHaveBeenCalled())
  })

  it('offers nothing to close while no project is open', async () => {
    render(<ProjectSelect />)
    await openMenu('Aucun projet ouvert')

    expect(screen.queryByRole('menuitem', { name: 'Fermer le projet' })).toBeNull()
  })

  it('offers no context to edit while no project is open', async () => {
    render(<ProjectSelect />)
    await openMenu('Aucun projet ouvert')

    expect(screen.queryByRole('menuitem', { name: 'Contexte du projet' })).toBeNull()
  })

  it('makes a project in the folder the dialog picked', async () => {
    const pickPath = vi.fn(() => Promise.resolve('/projects/autumn'))
    const create = vi.fn(() => Promise.resolve(summer))
    installFakeBridge({ dialog: { pickPath }, project: { create } })

    render(<ProjectSelect />)
    await openMenu('Aucun projet ouvert')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Créer un projet' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith('/projects/autumn'))
  })

  it('opens the folder the dialog picked', async () => {
    const pickPath = vi.fn(() => Promise.resolve('/projects/autumn'))
    const open = vi.fn(() => Promise.resolve(summer))
    installFakeBridge({ dialog: { pickPath }, project: { open } })

    render(<ProjectSelect />)
    await openMenu('Aucun projet ouvert')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ouvrir un projet' }))

    await waitFor(() => expect(open).toHaveBeenCalledWith('/projects/autumn'))
  })

  /**
   * The open project is always a row of this menu — the main process writes it to the recent list
   * on every change — and choosing it does nothing, since the store refuses it. So it must not be
   * the row that promises to close what is open and take its place.
   */
  it('explains each row instead of repeating the name it already shows', async () => {
    given(summer, recent('Summer', 'Winter'))
    render(<ProjectSelect />)
    await openMenu('Summer')

    const current = screen.getByRole('menuitemradio', { name: 'Summer' })
    expect(current).toHaveAttribute('data-tooltip-content', 'Ce projet est déjà ouvert')

    expect(screen.getByRole('menuitemradio', { name: 'Winter' })).toHaveAttribute(
      'data-tooltip-content',
      'Ferme le projet ouvert et ouvre celui-ci à sa place',
    )
    // A visible label answers for itself: an `aria-label` here would replace it (WCAG 2.5.3).
    expect(current).not.toHaveAttribute('aria-label')
  })

  /**
   * The initial `null` of the store is "not asked yet", not "none", and the studio reopens the
   * last project on launch. Drawn straight away, the chrome would state that no project is open
   * to everyone who has one — and a screen reader would read it out before it was taken back.
   */
  it('says nothing at all until it has been told which project is open', () => {
    useProject.setState({ project: null, known: false })
    const { container } = render(<ProjectSelect />)

    expect(container).toBeEmptyDOMElement()
  })

  // The name a screen reader hears has to CONTAIN what the eye reads, or the button answers to a
  // word that is nowhere on it (WCAG 2.5.3).
  it('names itself with the project it is showing', () => {
    given(summer)
    render(<ProjectSelect />)

    expect(buttonFor('Summer')).toHaveAttribute(
      'data-tooltip-content',
      'Ouvrir un autre projet de cette machine, ou en créer un',
    )
  })
})
