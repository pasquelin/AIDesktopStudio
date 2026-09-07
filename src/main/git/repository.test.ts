import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { GIT_FOLDER, type GitStatus } from '@shared/domain/git'
import { exists } from '@main/persistence'
import { detectGit, gitVersionProbe } from './binary'
import { GITIGNORE_FILE, openRepository, type Repository } from './repository'

let hasGit = false

beforeAll(async () => {
  hasGit = await detectGit(gitVersionProbe())
})

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scenario-git-'))
  await writeFile(join(root, '.project.json'), '{}')
  await writeFile(join(root, 'notes.txt'), 'hello')
  return root
}

describe('a project folder under version control', () => {
  it('is not a repository until it is initialised', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = openRepository(await project())

    expect(await repository.isRepository()).toBe(false)
    await repository.init()
    expect(await repository.isRepository()).toBe(true)
  })

  /**
   * The catalogue is a SQLite file the studio rewrites on every open. Tracked, it would land a
   * fresh copy in every commit and an unresolvable binary conflict in every pull.
   */
  it('writes an ignore file that excludes the catalogue', async ({ skip }) => {
    if (!hasGit) return skip()

    const root = await project()
    await openRepository(root).init()

    expect(await readFile(join(root, GITIGNORE_FILE), 'utf8')).toContain('.index/')
  })

  /**
   * A project brought under version control for the second time, or cloned from elsewhere, has
   * rules somebody wrote. Overwriting them to add one line is not a trade the studio gets to make.
   */
  it('leaves an ignore file that was already there alone', async ({ skip }) => {
    if (!hasGit) return skip()

    const root = await project()
    await writeFile(join(root, GITIGNORE_FILE), '*.mp4\n')

    await openRepository(root).init()

    expect(await readFile(join(root, GITIGNORE_FILE), 'utf8')).toBe('*.mp4\n')
  })

  it('reports a fresh repository as all untracked, with no head yet', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = openRepository(await project())
    await repository.init()

    const status = await repository.status()

    expect(status.head).toBeNull()
    expect(status.files.map(file => file.path).sort()).toEqual([
      '.gitignore',
      '.project.json',
      'notes.txt',
    ])
    expect(status.files.every(file => file.stage === 'untracked')).toBe(true)
  })

  /**
   * A project sitting UNDER an unrelated repository — a home directory somebody versioned once —
   * must read as its own uninitialised folder. Answering "yes, a repository" there would show
   * that repository's thousands of files and write the project's first commit into it.
   */
  it('refuses a repository it merely sits inside', async ({ skip }) => {
    if (!hasGit) return skip()

    const outer = await project()
    await openRepository(outer).init()

    const inner = join(outer, 'a-project-of-its-own')
    await mkdir(inner)

    expect(await openRepository(inner).isRepository()).toBe(false)
  })
})

/** Somebody, so `git commit` does not stop on a machine where git was never configured. */
const AUTHOR = { name: 'Suite', email: 'suite@example.com' }

async function repositoryWithACommit(): Promise<Repository> {
  const repository = openRepository(await project())
  await repository.init()
  await repository.stage(['notes.txt', '.project.json'])
  await repository.commit('premiere version', false, AUTHOR)
  return repository
}

/** Git itself, on a repository this file built — for what the port does not carry. */
const gitAt = (repository: Repository): SimpleGit =>
  simpleGit({ baseDir: repository.root, maxConcurrentProcesses: 1 })

describe('what the tick does', () => {
  it('moves a file into what the next version will record', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = openRepository(await project())
    await repository.init()
    await repository.stage(['notes.txt'])

    expect(stageOf(await repository.status(), 'notes.txt')).toBe('staged')
  })

  /**
   * The case a single command gets wrong. `git reset` resolves HEAD, so on a repository that has
   * no first commit — exactly what `git init` leaves, and exactly where somebody first ticks
   * something by mistake — it fails on an ambiguous argument instead of unticking.
   */
  it('takes one back out on a repository that has no first commit yet', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = openRepository(await project())
    await repository.init()
    await repository.stage(['notes.txt'])
    await repository.unstage(['notes.txt'])

    expect(stageOf(await repository.status(), 'notes.txt')).toBe('untracked')
  })

  /** And on one that has: here `git rm --cached` would stage a DELETION rather than untick. */
  it('takes one back out on a repository with a history, without deleting it', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'edited')
    await repository.stage(['notes.txt'])
    await repository.unstage(['notes.txt'])

    const status = await repository.status()
    expect(stageOf(status, 'notes.txt')).toBe('unstaged')
    expect(status.files.find(file => file.path === 'notes.txt')?.change).toBe('modified')
  })
})

describe('recording a version', () => {
  it('leaves a head, a branch and nothing waiting', async ({ skip }) => {
    if (!hasGit) return skip()

    const status = await (await repositoryWithACommit()).status()

    expect(status.head).not.toBeNull()
    expect(status.branch).not.toBeNull()
    expect(status.files.map(file => file.path)).toEqual(['.gitignore'])
  })

  it('puts a modified file back the way the last version has it', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'edited')

    await repository.restore(['notes.txt'])

    expect(await readFile(join(repository.root, 'notes.txt'), 'utf8')).toBe('hello')
  })

  /** A file staged AND edited again would otherwise need the button twice to come back. */
  it('puts one back from both halves at once', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'staged edit')
    await repository.stage(['notes.txt'])
    await writeFile(join(repository.root, 'notes.txt'), 'second edit')

    await repository.restore(['notes.txt'])

    const status = await repository.status()
    expect(status.files.map(file => file.path)).toEqual(['.gitignore'])
  })
})

describe('branches', () => {
  it('names the one that is out among those there are', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await repository.createBranch('essai-lumiere')

    expect(await repository.branches()).toContainEqual({ name: 'essai-lumiere', current: true })
  })

  it('swings the folder over to another, and back', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    const first = (await repository.status()).branch ?? ''
    await repository.createBranch('essai-lumiere')

    await repository.checkout(first)

    expect((await repository.status()).branch).toBe(first)
  })
})

describe('the history', () => {
  it('answers with the versions recorded, newest first', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'edited')
    await repository.stage(['notes.txt'])
    await repository.commit('deuxieme version', false, AUTHOR)

    expect((await repository.log(10, 0)).map(entry => entry.message)).toEqual([
      'deuxieme version',
      'premiere version',
    ])
  })

  /** The layout depends on it: a child has to be reached before the commits it came from. */
  it('gives the first commit no parent, and the next one the first', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'edited')
    await repository.stage(['notes.txt'])
    await repository.commit('deuxieme version', false, AUTHOR)

    const [second, first] = await repository.log(10, 0)
    expect(first?.parents).toEqual([])
    expect(second?.parents).toEqual([first?.hash])
  })

  it('skips what the caller already holds', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'edited')
    await repository.stage(['notes.txt'])
    await repository.commit('deuxieme version', false, AUTHOR)

    expect((await repository.log(10, 1)).map(entry => entry.message)).toEqual(['premiere version'])
  })

  /** A branch nobody is standing on still belongs on the graph — `--all` is what puts it there. */
  it('carries a branch that is not the one checked out', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    const first = (await repository.status()).branch ?? ''
    await repository.createBranch('essai-lumiere')
    await writeFile(join(repository.root, 'notes.txt'), 'on the branch')
    await repository.stage(['notes.txt'])
    await repository.commit('essai', false, AUTHOR)
    await repository.checkout(first)

    expect((await repository.log(10, 0)).map(entry => entry.message)).toContain('essai')
  })

  it('names the files one version changed', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    const [head] = await repository.log(1, 0)

    expect((await repository.commitFiles(head?.hash ?? '')).map(file => file.path).sort()).toEqual([
      '.project.json',
      'notes.txt',
    ])
  })
})

/**
 * Two branches that changed the same line, brought together. The one setup worth building on a
 * real repository: what a conflict IS cannot be faked, and everything the panel offers there
 * depends on git having actually refused.
 */
async function repositoryInConflict(): Promise<Repository> {
  const repository = await repositoryWithACommit()
  const trunk = (await repository.status()).branch ?? ''

  await repository.createBranch('essai-lumiere')
  await writeFile(join(repository.root, 'notes.txt'), THEIRS)
  await repository.stage(['notes.txt'])
  await repository.commit('sur la branche', false, AUTHOR)

  await repository.checkout(trunk)
  await writeFile(join(repository.root, 'notes.txt'), OURS)
  await repository.stage(['notes.txt'])
  await repository.commit('sur le tronc', false, AUTHOR)

  // `merge` is not on the port — the studio pulls, and a pull is what produces one of these — so
  // it is run straight at git here. It REFUSES, and that refusal is the whole setup. The identity
  // travels per command, as `commit` does: a runner has no global one and cannot guess a mail
  // address from a hostname with no domain, so `merge` stopped on that instead of on the conflict.
  const outcome = await gitAt(repository)
    .raw([
      '-c',
      `user.name=${AUTHOR.name}`,
      '-c',
      `user.email=${AUTHOR.email}`,
      'merge',
      'essai-lumiere',
    ])
    .then(() => 'the merge went through', String)

  // A merge that failed for any OTHER reason leaves no conflict, and the cases below then read a
  // settled repository and pass on nothing — said here, where git's own sentence is still to hand.
  // Read off `MERGE_HEAD` and not off `status()`: the port is what the cases measure, so a decor
  // built on it would make the first of them tautological.
  if (!(await exists(join(repository.root, GIT_FOLDER, 'MERGE_HEAD')))) {
    throw new Error(`the setup left no conflict to look at: ${outcome}`)
  }

  return repository
}

/**
 * Which side is which, named once. Standing on the trunk with the branch being merged IN, `ours`
 * is the trunk and `theirs` is the branch — and the two swap during a rebase, which is one reason
 * the studio pulls with `--ff-only` and offers no rebase at all.
 */
const OURS = 'la version principale'
const THEIRS = 'la version de la branche'

describe('two sides that disagree', () => {
  it('reads the file as conflicted rather than as modified', async ({ skip }) => {
    if (!hasGit) return skip()

    const status = await (await repositoryInConflict()).status()

    expect(stageOf(status, 'notes.txt')).toBe('conflicted')
  })

  /**
   * The two halves of one decision. A file checked out from one side and left unstaged still
   * reads as conflicted, and the panel would go on offering buttons for a settled conflict —
   * which is the whole reason `resolve` stages in the same breath.
   *
   * Keeping OUR side leaves the file exactly as HEAD has it, so git stops listing it at all.
   * That is the right answer and not an omission: nothing is waiting on that file any more.
   */
  it('keeps our whole side, and stops calling it conflicted', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryInConflict()
    await repository.resolve(['notes.txt'], 'ours')

    expect(stageOf(await repository.status(), 'notes.txt')).not.toBe('conflicted')
    expect(await readFile(join(repository.root, 'notes.txt'), 'utf8')).toBe(OURS)
  })

  /** Theirs differs from HEAD, so it is what the merge commit will actually record. */
  it('takes their whole side, staged and ready to record', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryInConflict()
    await repository.resolve(['notes.txt'], 'theirs')

    expect(stageOf(await repository.status(), 'notes.txt')).toBe('staged')
    expect(await readFile(join(repository.root, 'notes.txt'), 'utf8')).toBe(THEIRS)
  })

  it('puts the folder back the way it was before the merge started', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryInConflict()
    await repository.abortMerge()

    const status = await repository.status()
    expect(status.files.filter(file => file.stage === 'conflicted')).toEqual([])
  })
})

describe('work set aside', () => {
  it('leaves the folder clean and gives it back whole', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'en cours')

    await repository.stash('essai de lumière')
    expect(await readFile(join(repository.root, 'notes.txt'), 'utf8')).toBe('hello')

    await repository.stashPop(0)
    expect(await readFile(join(repository.root, 'notes.txt'), 'utf8')).toBe('en cours')
  })

  /** Without `--include-untracked`, a new file stays behind and the tree promised is not given. */
  it('takes a file git has never seen with it', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'idee.txt'), 'une idée')

    await repository.stash('essai')

    expect((await repository.status()).files.map(file => file.path)).not.toContain('idee.txt')
  })

  it('names each pile on the stack', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    await writeFile(join(repository.root, 'notes.txt'), 'en cours')
    await repository.stash('essai de lumière')

    expect((await repository.stashes())[0]?.message).toContain('essai de lumière')
  })
})

describe('a version given a name', () => {
  /**
   * The name comes back through the LOG rather than through a list of its own: that is where the
   * panel reads it, on the row it belongs to. A list of tags nobody draws would be a second way
   * of asking the same question.
   */
  it('comes back on the commit it names', async ({ skip }) => {
    if (!hasGit) return skip()

    const repository = await repositoryWithACommit()
    const [head] = await repository.log(1, 0)
    await repository.tag('livraison-client', head?.hash ?? '')

    expect((await repository.log(1, 0))[0]?.refs).toContainEqual({
      kind: 'tag',
      name: 'livraison-client',
    })
  })
})

describe('talking to a server', () => {
  /**
   * The whole remote path, against a bare repository on disk: as far as this module is concerned
   * a folder IS a server, and nothing here needs a network.
   *
   * Worth a real repository because of what it caught: simple-git refuses a credential helper, an
   * empty `GIT_ASKPASS` and an `ssh` command unless the instance allows them, and it refuses them
   * BEFORE spawning git — so every fetch, pull and push failed on a message about
   * `allowUnsafeCredentialHelper` rather than on anything git had to say. Nothing above the port
   * could see it: the panel showed the failure the same way it shows a rejected push.
   */
  it('pushes to a server it holds a token for', async ({ skip }) => {
    if (!hasGit) return skip()

    const server = await mkdtemp(join(tmpdir(), 'scenario-git-server-'))
    await simpleGit(server).init(true)

    const repository = openRepository(await project(), undefined, {
      credentials: () => ({ user: 'studio', token: 'jeton' }),
    })
    await repository.init()
    await repository.stage(['notes.txt'])
    await repository.commit('premiere version', false, AUTHOR)
    await repository.addRemote('origin', server)
    await repository.push(true)

    expect(await simpleGit(server).raw(['log', '--oneline'])).toContain('premiere version')
  })

  /**
   * A machine that exports `PAGER`, or an app launched from a shell that sets `GIT_EDITOR`. Both
   * are ordinary, both are settings the studio answers itself, and both are refused by simple-git
   * when they reach it — which would fail every command of a session on an environment the user
   * has no idea is in play.
   */
  it('ignores what the machine had to say about git', async ({ skip }) => {
    if (!hasGit) return skip()

    process.env.PAGER = 'less'
    process.env.GIT_EDITOR = 'vim'
    onTestFinished(() => {
      delete process.env.PAGER
      delete process.env.GIT_EDITOR
    })

    // Opened AFTER them, which is when the environment is read.
    const repository = openRepository(await project())
    await repository.init()

    expect(await repository.isRepository()).toBe(true)
  })
})

/** Which half of git a path sits in, or nothing where it is not waiting at all. */
function stageOf(status: GitStatus, path: string): string | undefined {
  return status.files.find(file => file.path === path)?.stage
}
