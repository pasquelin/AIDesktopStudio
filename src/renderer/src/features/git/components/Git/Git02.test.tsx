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

describe('the server this project talks to', () => {
  const AHEAD: GitRepository = {
    kind: 'ready',
    status: { ...CLEAN, upstream: 'origin/main', ahead: 2, behind: 1 },
  }

  const withRemote = (repository: GitRepository, overrides = {}) =>
    installFakeBridge({
      git: {
        read: () => Promise.resolve(repository),
        remotes: () => Promise.resolve([{ name: 'origin', url: 'https://github.com/a/b.git' }]),
        ...overrides,
      },
    })

  it('says what is waiting each way, and moves it', async () => {
    const push = vi.fn(() => Promise.resolve(AHEAD))
    withRemote(AHEAD, { push })
    render(<Git />)

    expect(await screen.findByText('2 à envoyer')).toBeTruthy()
    expect(screen.getByText('1 à recevoir')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(push).toHaveBeenCalledWith(false)
  })

  /**
   * The first push of a branch has nothing ahead to send and nothing to track. Refusing it there
   * would leave no way to make the branch on the server at all.
   */
  it('offers the first push of a branch that tracks nothing', async () => {
    const push = vi.fn(() => Promise.resolve(CLEAN_READY))
    withRemote(CLEAN_READY, { push })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer' }))

    expect(push).toHaveBeenCalledWith(true)
  })

  it('asks where to send once there is a version and no server', async () => {
    const addRemote = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({ git: { read: () => Promise.resolve(CLEAN_READY), addRemote } })
    render(<Git />)

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Adresse du serveur' }),
      'https://github.com/a/b.git',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Relier' }))

    expect(addRemote).toHaveBeenCalledWith('origin', 'https://github.com/a/b.git')
  })
})

describe('a server that refused', () => {
  const REFUSED: GitRepository = {
    kind: 'failed',
    reason: 'authentication',
    detail: 'fatal: Authentication failed',
  }

  /**
   * The token goes DOWN and never comes back: there is no channel that answers with one. Asked at
   * the moment of the refusal rather than up front, which would be asking for a secret before it
   * is needed, from somebody who may never push at all.
   */
  it('asks for a token, keeps it, and runs the refused send again', async () => {
    const setCredentials = vi.fn(() => Promise.resolve())
    const push = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({
      git: {
        read: () => Promise.resolve(REFUSED),
        remotes: () => Promise.resolve([{ name: 'origin', url: 'https://github.com/a/b.git' }]),
        setCredentials,
        push,
      },
    })
    render(<Git />)

    await userEvent.type(await screen.findByRole('textbox', { name: 'Nom d’utilisateur' }), 'alban')
    await userEvent.type(screen.getByLabelText('Jeton'), 'ghp_secret')
    await userEvent.click(screen.getByRole('button', { name: 'Retenir et réessayer' }))

    await waitFor(() =>
      expect(setCredentials).toHaveBeenCalledWith('github.com', 'alban', 'ghp_secret'),
    )
    await waitFor(() => expect(push).toHaveBeenCalled())
  })

  /**
   * A token that is already held and is still refused is the one case where pasting another is
   * not obviously the answer — the one on file may be a revoked token, or one for the wrong
   * account. Said plainly, and erasable: otherwise nothing on this screen acknowledges that a
   * token is in play at all.
   */
  it('says when a token is already held, and lets it be forgotten', async () => {
    const clearCredentials = vi.fn(() => Promise.resolve())
    installFakeBridge({
      git: {
        read: () => Promise.resolve(REFUSED),
        remotes: () => Promise.resolve([{ name: 'origin', url: 'https://github.com/a/b.git' }]),
        hasCredentials: () => Promise.resolve(true),
        clearCredentials,
      },
    })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'Oublier le jeton' }))

    expect(clearCredentials).toHaveBeenCalledWith('github.com')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Oublier le jeton' })).toBeNull(),
    )
  })

  /** A screen being recorded is what a studio's screen often is. */
  it('hides the token as it is typed', async () => {
    installFakeBridge({
      git: {
        read: () => Promise.resolve(REFUSED),
        remotes: () => Promise.resolve([{ name: 'origin', url: 'https://github.com/a/b.git' }]),
      },
    })
    render(<Git />)

    expect(await screen.findByLabelText('Jeton')).toHaveAttribute('type', 'password')
  })

  /**
   * An SSH remote is answered by the machine's own key and agent. A token field there would be a
   * question nothing does anything with.
   */
  it('offers no token field for a server reached over ssh', async () => {
    installFakeBridge({
      git: {
        read: () => Promise.resolve(REFUSED),
        remotes: () => Promise.resolve([{ name: 'origin', url: 'git@github.com:a/b.git' }]),
      },
    })
    render(<Git />)

    expect(await screen.findByText(/Le serveur distant a refusé vos identifiants/)).toBeTruthy()
    expect(screen.queryByLabelText('Jeton')).toBeNull()
  })

  /**
   * Half of these refusals are over by the time they are read — a lock file left by a command
   * that has since finished, a folder that was busy. Without a way to ask again, the panel has to
   * be left and come back to, and the line git wrote is what says which file was in the way.
   */
  it('leaves a way to ask again, and shows what git said', async () => {
    const read = vi.fn(() =>
      Promise.resolve<GitRepository>({
        kind: 'failed',
        reason: 'locked',
        detail: 'fatal: Unable to create .git/index.lock: File exists',
      }),
    )
    installFakeBridge({ git: { read } })
    render(<Git />)

    expect(await screen.findByText(/index\.lock/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(read.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('two sides that disagree', () => {
  const CONFLICTED: GitRepository = {
    kind: 'ready',
    status: {
      ...CLEAN,
      files: [{ path: 'documents/board.scimg', stage: 'conflicted', change: 'conflicted' }],
    },
  }

  it('offers one side or the other, and settles on the one clicked', async () => {
    const resolve = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({ git: { read: () => Promise.resolve(CONFLICTED), resolve } })
    render(<Git />)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Garder ma version de documents/board.scimg' }),
    )

    expect(resolve).toHaveBeenCalledWith(['documents/board.scimg'], 'ours')
  })

  /** A file holding both versions at once compares to nothing. */
  it('withholds the comparison on a conflicted file', async () => {
    panelOn(CONFLICTED)
    await screen.findByRole('button', { name: /Garder ma version/ })

    expect(screen.queryByRole('button', { name: /^Comparer/ })).toBeNull()
  })

  /** What it undoes is the whole operation, not one file — so it sits on the heading. */
  it('offers a way out of the merge itself', async () => {
    const abortMerge = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({ git: { read: () => Promise.resolve(CONFLICTED), abortMerge } })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'Abandonner la fusion' }))

    expect(abortMerge).toHaveBeenCalled()
  })
})

describe('work set aside', () => {
  const DIRTY: GitRepository = {
    kind: 'ready',
    status: {
      ...CLEAN,
      files: [{ path: 'Images/hero.png', stage: 'unstaged', change: 'modified' }],
    },
  }

  /**
   * With nothing on the stack the menu would hold the single row that fills it, so the click
   * does that outright rather than opening a list of one.
   */
  it('sets the whole tree aside in one click when the stack is empty', async () => {
    const stash = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({ git: { read: () => Promise.resolve(DIRTY), stash } })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'Mettre de côté' }))

    expect(stash).toHaveBeenCalledWith('Travail en cours sur main')
  })

  it('refuses to set aside a folder where nothing has changed', async () => {
    installFakeBridge({ git: { read: () => Promise.resolve(CLEAN_READY) } })
    render(<Git />)

    expect(await screen.findByRole('button', { name: 'Mettre de côté' })).toBeDisabled()
  })

  /** Bringing a pile back and leaving a copy on the stack is the one nobody remembers to drop. */
  it('brings a pile back and takes it off the stack', async () => {
    const stashPop = vi.fn(() => Promise.resolve(CLEAN_READY))
    installFakeBridge({
      git: {
        read: () => Promise.resolve(DIRTY),
        stashes: () => Promise.resolve([{ index: 0, message: 'essai de lumière' }]),
        stashPop,
      },
    })
    render(<Git />)

    await userEvent.click(await screen.findByRole('button', { name: 'Mettre de côté' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'essai de lumière' }))

    expect(stashPop).toHaveBeenCalledWith(0)
  })
})

describe('a command git refused', () => {
  it('says why in the studio own words, and shows git line under it', async () => {
    panelOn({
      kind: 'failed',
      reason: 'locked',
      detail: 'fatal: Unable to create .git/index.lock: File exists',
    })

    expect(await screen.findByText(/Une autre commande git occupe ce dossier/)).toBeTruthy()
    expect(screen.getByText(/index\.lock/)).toBeTruthy()
  })
})
