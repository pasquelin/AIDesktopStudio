import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitRepository } from '@shared/domain/git'
import { installFakeBridge } from '@/services/fakeBridge'
import { useGit } from '@/stores/git'
import { gitReadyRepository, gitStatus } from '@/stores/git-fixtures'
import { useProject } from '@/stores/project'
import { Git } from './Git'

const CLEAN = gitStatus()
const CLEAN_READY = gitReadyRepository()

beforeEach(() => {
  useGit.setState({ repository: { kind: 'no-project' }, busy: false, message: '', amend: false })
  // `NoProject` says "loading" until the main process has answered, so a panel drawn on the
  // initial state would never reach the sentence these cases are about.
  useProject.setState({ known: true })
})

function panelOn(repository: GitRepository, init = vi.fn(() => Promise.resolve(repository))) {
  installFakeBridge({ git: { read: () => Promise.resolve(repository), init } })
  render(<Git />)
  return init
}

describe('the version panel before there is anything to version', () => {
  it('asks for a project when none is open', async () => {
    panelOn({ kind: 'no-project' })

    expect(await screen.findByText(/Ouvrez un projet/)).toBeTruthy()
  })

  /**
   * simple-git spawns the binary rather than speaking the protocol, and a plain Windows install
   * has none. Discovering it at the first commit would let a user arrange one that cannot happen.
   */
  it('says git is missing rather than offering a button that cannot work', async () => {
    panelOn({ kind: 'no-binary' })

    expect(await screen.findByText(/Git n’est pas installé/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('bringing a project under version control', () => {
  it('offers the way in, and takes it', async () => {
    const init = panelOn({ kind: 'uninitialised' })

    await userEvent.click(await screen.findByRole('button', { name: 'Suivre les versions' }))

    expect(init).toHaveBeenCalledTimes(1)
  })

  /** A button that greys out and comes back inside a second reads as a flicker, not as progress. */
  it('withdraws the button while the command runs', async () => {
    panelOn({ kind: 'uninitialised' })
    await screen.findByRole('button', { name: 'Suivre les versions' })

    useGit.setState({ busy: true })

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
  })
})

describe('the folder as git sees it', () => {
  it('names the branch, and says nothing has moved', async () => {
    panelOn({ kind: 'ready', status: CLEAN })

    expect(await screen.findByRole('button', { name: 'main' })).toBeTruthy()
    expect(screen.getByText(/Rien n’a changé/)).toBeTruthy()
  })

  /** `git init` leaves exactly this, and it is a state the panel has to show rather than hide. */
  it('says so when no version has been recorded yet', async () => {
    panelOn({ kind: 'ready', status: { ...CLEAN, head: null } })

    expect(await screen.findByText('Aucune version enregistrée')).toBeTruthy()
  })

  it('groups what changed under the half of git it sits in', async () => {
    panelOn({
      kind: 'ready',
      status: {
        ...CLEAN,
        files: [
          { path: 'documents/board.scimg', stage: 'staged', change: 'modified' },
          { path: 'Images/hero.png', stage: 'untracked', change: 'untracked' },
        ],
      },
    })

    expect(await screen.findByText('Retenus')).toBeTruthy()
    expect(screen.getByText('Nouveaux')).toBeTruthy()
    // The PATH is what a row is named by: which `hero.png` moved is the question this panel is
    // read for, and the folder used to sit on a second line under the name.
    expect(screen.getByText('documents/board.scimg')).toBeTruthy()
    expect(screen.getByText('Images/hero.png')).toBeTruthy()
  })

  /**
   * A file modified, staged, then modified again belongs under both headings — and React is
   * handed the same path twice on the same list, which is what the stage in the key is for.
   */
  it('shows a file touched on both sides under both headings', async () => {
    panelOn({
      kind: 'ready',
      status: {
        ...CLEAN,
        files: [
          { path: 'documents/board.scimg', stage: 'staged', change: 'modified' },
          { path: 'documents/board.scimg', stage: 'unstaged', change: 'modified' },
        ],
      },
    })

    expect(await screen.findAllByText('documents/board.scimg')).toHaveLength(2)
  })
})

const CHANGED: GitRepository = {
  kind: 'ready',
  status: {
    ...CLEAN,
    files: [
      { path: 'documents/board.scimg', stage: 'staged', change: 'modified' },
      { path: 'Images/hero.png', stage: 'unstaged', change: 'modified' },
      { path: 'Videos/take.mp4', stage: 'untracked', change: 'untracked' },
    ],
  },
}

describe('the tick, which is the index', () => {
  it('adds a file to the next version when it is ticked', async () => {
    const stage = vi.fn(() => Promise.resolve(CHANGED))
    installFakeBridge({ git: { read: () => Promise.resolve(CHANGED), stage } })
    render(<Git />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Images/hero.png' }))

    expect(stage).toHaveBeenCalledWith(['Images/hero.png'])
  })

  it('takes one back out when it is unticked', async () => {
    const unstage = vi.fn(() => Promise.resolve(CHANGED))
    installFakeBridge({ git: { read: () => Promise.resolve(CHANGED), unstage } })
    render(<Git />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'documents/board.scimg' }))

    expect(unstage).toHaveBeenCalledWith(['documents/board.scimg'])
  })

  /** A project touched by an import has as many changed files as the import wrote. */
  it('takes a whole group in one gesture', async () => {
    const stage = vi.fn(() => Promise.resolve(CHANGED))
    installFakeBridge({ git: { read: () => Promise.resolve(CHANGED), stage } })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'Tout cocher dans Modifiés' }))

    expect(stage).toHaveBeenCalledWith(['Images/hero.png'])
  })
})

describe('putting a file back', () => {
  /**
   * A file git has never seen has no earlier version to go back to. The only other reading of
   * the gesture is a deletion, and that belongs to the Explorer, one icon along.
   */
  it('is offered for a file with an earlier version, and withheld for one without', async () => {
    panelOn(CHANGED)

    expect(await screen.findByRole('button', { name: 'Restaurer Images/hero.png' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restaurer Videos/take.mp4' })).toBeNull()
  })

  it('restores the one path it was clicked on', async () => {
    const restore = vi.fn(() => Promise.resolve(CHANGED))
    installFakeBridge({ git: { read: () => Promise.resolve(CHANGED), restore } })
    render(<Git />)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restaurer documents/board.scimg' }),
    )

    expect(restore).toHaveBeenCalledWith(['documents/board.scimg'])
  })
})

describe('recording a version', () => {
  it('refuses until something is both ticked and said', async () => {
    panelOn(CHANGED)
    const button = await screen.findByRole('button', { name: 'Commit' })

    expect(button).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox', { name: 'Ce que dit cette version' }), 'plan')
    expect(button).toBeEnabled()
  })

  it('hands git the message that was typed', async () => {
    const commit = vi.fn(() => Promise.resolve(CHANGED))
    installFakeBridge({ git: { read: () => Promise.resolve(CHANGED), commit } })
    render(<Git />)

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Ce que dit cette version' }),
      'un plan large',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Commit' }))

    expect(commit).toHaveBeenCalledWith('un plan large', false)
  })

  /**
   * No identity configured is the refusal everybody meets first. Clearing the field there would
   * lose what was typed at the exact moment the user has to fix something and try again.
   */
  it('keeps the message when git refused, and clears it when it landed', async () => {
    const refused: GitRepository = { kind: 'failed', reason: 'no-identity', detail: 'who are you' }
    installFakeBridge({
      git: { read: () => Promise.resolve(CHANGED), commit: () => Promise.resolve(refused) },
    })
    render(<Git />)

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Ce que dit cette version' }),
      'un plan large',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Commit' }))

    await waitFor(() => expect(useGit.getState().repository).toEqual(refused))
    expect(useGit.getState().message).toBe('un plan large')
  })

  /** Rewording the last message stages nothing, so the box has to stand on its own. */
  it('lets an amend through with nothing ticked', async () => {
    const commit = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({ git: { read: () => Promise.resolve(CLEAN_READY), commit } })
    render(<Git />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Corriger la dernière' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Ce que dit cette version' }),
      'meilleur titre',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Commit' }))

    expect(commit).toHaveBeenCalledWith('meilleur titre', true)
  })

  /** Before the first commit there is no last version to correct, so the box promises nothing. */
  it('offers no amend on a repository with no history', async () => {
    panelOn({ kind: 'ready', status: { ...CLEAN, head: null } })
    await screen.findByRole('button', { name: 'Commit' })

    expect(screen.queryByRole('checkbox', { name: 'Corriger la dernière' })).toBeNull()
  })
})

describe('the branch button', () => {
  it('lists what there is and swings the folder over to the one chosen', async () => {
    const checkout = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({
      git: {
        read: () => Promise.resolve(CLEAN_READY),
        branches: () =>
          Promise.resolve([
            { name: 'main', current: true },
            { name: 'essai-lumiere', current: false },
          ]),
        checkout,
      },
    })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'main' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'essai-lumiere' }))

    expect(checkout).toHaveBeenCalledWith('essai-lumiere')
  })

  /**
   * A branch made in a terminal moves neither the head nor the current branch, so nothing tells
   * the app it exists. Without a read on each open it would stay out of the menu for as long as
   * the panel is mounted.
   */
  it('lists a branch made outside the app on the next opening', async () => {
    let outside = false
    installFakeBridge({
      git: {
        read: () => Promise.resolve(CLEAN_READY),
        branches: () =>
          Promise.resolve(
            outside
              ? [
                  { name: 'main', current: true },
                  { name: 'faite-au-terminal', current: false },
                ]
              : [{ name: 'main', current: true }],
          ),
      },
    })
    render(<Git />)

    const button = await screen.findByRole('button', { name: 'main' })
    await userEvent.click(button)
    expect(screen.queryByRole('menuitemradio', { name: 'faite-au-terminal' })).toBeNull()

    outside = true
    await userEvent.keyboard('{Escape}')
    await userEvent.click(button)

    expect(await screen.findByRole('menuitemradio', { name: 'faite-au-terminal' })).toBeVisible()
  })

  /**
   * A repository with no first commit lists no branch at all — git has none until something is
   * recorded — so the menu would hold the single row that makes one. The click goes straight to
   * the field instead of opening a list of one.
   */
  it('opens a field for a new one, and refuses a name git would not take', async () => {
    const createBranch = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({ git: { read: () => Promise.resolve(CLEAN_READY), createBranch } })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'main' }))

    const field = await screen.findByRole('textbox', { name: 'Nouvelle branche' })
    await userEvent.type(field, 'essai lumiere{Enter}')
    expect(createBranch).not.toHaveBeenCalled()

    await userEvent.clear(field)
    await userEvent.type(field, 'essai-lumiere{Enter}')
    expect(createBranch).toHaveBeenCalledWith('essai-lumiere')
  })
})
