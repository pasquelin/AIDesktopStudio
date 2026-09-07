import { join } from 'node:path'
import { CheckRepoActions, simpleGit, type SimpleGit } from 'simple-git'
import {
  defaultIgnore,
  type GitBranch,
  type GitCommit,
  type GitCommitFile,
  type GitIdentity,
  type GitRemote,
  type GitStashEntry,
  type GitStatus,
} from '@shared/domain/git'
import type { GitDiff } from '@shared/domain/gitDiff'
import { parseUnifiedDiff } from '@shared/domain/gitDiff'
import { exists, writeAtomic, writeQueue } from '@main/persistence'
import { blobAt, workingBlob } from './blob'
import type { GitCredential } from './credentials'
import { filesOf, LOG_FORMAT, parseLog, parseNameStatus, parseStashList } from './parse'

export const GITIGNORE_FILE = '.gitignore'

/**
 * One project folder, as the version panels speak to it.
 *
 * A port rather than the library: everything above this line works in the studio's own shapes,
 * and the one place that knows simple-git exists is here. That is what lets `parse.ts` — where
 * every decision actually lives — be checked without a repository on disk.
 */
export type Repository = {
  root: string
  isRepository: () => Promise<boolean>
  init: () => Promise<void>
  status: () => Promise<GitStatus>
  stage: (paths: readonly string[]) => Promise<void>
  unstage: (paths: readonly string[]) => Promise<void>
  /** Puts files back the way HEAD has them, index and worktree alike. */
  restore: (paths: readonly string[]) => Promise<void>
  commit: (message: string, amend: boolean, identity?: GitIdentity) => Promise<void>
  branches: () => Promise<GitBranch[]>
  createBranch: (name: string) => Promise<void>
  checkout: (name: string) => Promise<void>
  /** A page of the history, newest first. `skip` is how many the caller already holds. */
  log: (limit: number, skip: number) => Promise<GitCommit[]>
  /** What one recorded version changed. */
  commitFiles: (hash: string) => Promise<GitCommitFile[]>
  /** What changed in one file — inside a commit, or against the last version when `null`. */
  diff: (path: string, commit: string | null) => Promise<GitDiff>
  /** The bytes of a file at one version, or as it stands on disk when `ref` is `null`. */
  bytes: (path: string, ref: string | null) => Promise<Uint8Array | null>
  remotes: () => Promise<GitRemote[]>
  addRemote: (name: string, url: string) => Promise<void>
  /** Takes what the server has without touching the working tree. */
  fetch: () => Promise<void>
  pull: () => Promise<void>
  /** `setUpstream` on the first push of a branch, which is the one that has nothing to track. */
  push: (setUpstream: boolean) => Promise<void>
  /** Settles a conflict by keeping one side whole, and marks it settled. */
  resolve: (paths: readonly string[], side: 'ours' | 'theirs') => Promise<void>
  /** Puts everything back the way it was before the merge started. */
  abortMerge: () => Promise<void>
  stash: (message: string) => Promise<void>
  stashes: () => Promise<GitStashEntry[]>
  /** Brings one back and takes it off the stack — the gesture nobody means to split in two. */
  stashPop: (index: number) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  tag: (name: string, commit: string) => Promise<void>
}

/**
 * How git is handed a token: a helper that reads two variables out of its own environment.
 *
 * The environment and NOT the command line, which is the whole of the design. An argument is
 * visible to every process listing on the machine and lands in whatever shell history or crash
 * report happens to be watching; an environment variable of a child process is neither.
 *
 * The string is a constant — nothing from the user is interpolated into it — so the `!` that
 * sends it through a shell adds no surface. `credential.helper=` empty first, on purpose: it
 * clears whatever the machine has configured, so a system helper cannot answer before this one
 * and hand git a credential for a different account.
 */
const CREDENTIAL_ARGS: readonly string[] = [
  '-c',
  'credential.helper=',
  '-c',
  'credential.helper=!f() { echo "username=${GIT_STUDIO_USER}"; echo "password=${GIT_STUDIO_TOKEN}"; }; f',
]

/**
 * Builds the port. THROWS when the binary named cannot be used — simple-git validates a custom
 * binary as the instance is built, and refuses any path holding a character outside its own list.
 * The caller turns that into the ordinary "no git" answer.
 */
export type RepositoryDeps = {
  /** The token held for the host a remote lives on, or nothing — SSH answers nothing. */
  credentials: (url: string) => GitCredential | null
}

/** The three git reads without a `GIT_` in front of them. Everything else it takes is prefixed. */
const UNPREFIXED_GIT_SETTINGS: readonly string[] = ['PAGER', 'EDITOR', 'SSH_ASKPASS']

function configuresGit(name: string): boolean {
  return name.startsWith('GIT_') || UNPREFIXED_GIT_SETTINGS.includes(name)
}

function createGitClient(root: string, binary?: string): SimpleGit {
  return simpleGit({
    baseDir: root,
    /**
     * One git at a time, per project. Git takes `.git/index.lock` for the duration of any command
     * that writes, and a second one arriving meanwhile dies rather than waiting — two windows
     * refreshing together is enough to produce it. simple-git's own scheduler queues in order,
     * which is why the studio does not carry a second queue of its own.
     */
    maxConcurrentProcesses: 1,
    /**
     * simple-git refuses a handful of settings outright, and the three the studio needs are among
     * them: it cannot tell a value written here from one an attacker slipped in. These three are
     * CONSTANTS of this file — the credential helper is a fixed string, `GIT_ASKPASS` is empty,
     * and the ssh command carries one flag — and nothing from a project, a URL or a user reaches
     * any of them. Left off, every remote command fails before it spawns.
     */
    unsafe: {
      allowUnsafeCredentialHelper: true,
      allowUnsafeAskPass: true,
      allowUnsafeSshCommand: true,
    },
    ...(binary === undefined ? {} : { binary }),
  })
}

function gitEnvironment(): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && !configuresGit(entry[0]),
      ),
    ),
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  }
}

function remoteRunner(
  git: SimpleGit,
  baseEnv: Record<string, string>,
  deps?: RepositoryDeps,
): (args: readonly string[]) => Promise<void> {
  const queue = writeQueue()
  return async args => {
    await queue.next(async () => {
      const credential = deps?.credentials((await firstRemoteUrl(git)) ?? '') ?? null
      if (credential) {
        git.env({
          ...baseEnv,
          GIT_STUDIO_USER: credential.user,
          GIT_STUDIO_TOKEN: credential.token,
        })
      }
      try {
        await git.raw([...(credential ? CREDENTIAL_ARGS : []), ...args])
      } finally {
        if (credential) git.env(baseEnv)
      }
    })
  }
}

async function stageFiles(git: SimpleGit, paths: readonly string[]): Promise<void> {
  await git.raw(['add', '--', ...paths])
}

async function restoreFiles(git: SimpleGit, paths: readonly string[]): Promise<void> {
  await git.raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...paths])
}

async function localBranches(git: SimpleGit): Promise<GitBranch[]> {
  const summary = await git.branchLocal()
  return summary.all.map(name => ({ name, current: name === summary.current }))
}

function historyReads(
  git: SimpleGit,
  root: string,
  binary?: string,
): Pick<Repository, 'log' | 'commitFiles' | 'diff' | 'bytes' | 'remotes'> {
  return {
    log: async (limit, skip) =>
      parseLog(
        await git.raw([
          'log',
          '--all',
          '--topo-order',
          `--max-count=${limit}`,
          `--skip=${skip}`,
          `--format=${LOG_FORMAT}`,
        ]),
      ),
    commitFiles: async hash =>
      parseNameStatus(
        await git.raw(['show', '--name-status', '--format=', '-m', '--first-parent', hash]),
      ),
    diff: async (path, commit) =>
      parseUnifiedDiff(
        commit === null
          ? await git.raw(['diff', 'HEAD', '--', path])
          : await git.raw(['show', '--format=', '-m', '--first-parent', commit, '--', path]),
      ),
    bytes: (path, ref) =>
      ref === null ? workingBlob(root, path) : blobAt(root, ref, path, binary ?? 'git'),
    remotes: async () =>
      (await git.getRemotes(true)).map(remote => ({
        name: remote.name,
        url: remote.refs.fetch || remote.refs.push,
      })),
  }
}

export function openRepository(root: string, binary?: string, deps?: RepositoryDeps): Repository {
  const git = createGitClient(root, binary)
  const baseEnv = gitEnvironment()

  git.env(baseEnv)

  const reachOut = remoteRunner(git, baseEnv, deps)

  return {
    root,
    isRepository: () => isRepositoryRoot(git),
    init: () => initialise(git, root),
    status: () => statusOf(git),
    stage: paths => stageFiles(git, paths),
    unstage: paths => unstage(git, paths),
    restore: paths => restoreFiles(git, paths),
    commit: (message, amend, identity) => commit(git, message, amend, identity),
    branches: () => localBranches(git),
    createBranch: async name => {
      await git.checkoutLocalBranch(name)
    },
    checkout: async name => {
      await git.checkout(name)
    },

    /**
     * `--all` rather than the branch that is out: a version panel that hid the branch one is
     * about to switch to would be hiding the reason for switching. It is also what makes the
     * graph a graph — a single branch has nothing to draw.
     *
     * `--topo-order` rather than by date, and the layout below depends on it: a child must be
     * reached before its parents, and clocks on two machines do not guarantee that.
     */
    ...historyReads(git, root, binary),

    addRemote: async (name, url) => {
      await git.addRemote(name, url)
    },

    fetch: () => reachOut(['fetch', '--prune']),
    pull: () => reachOut(['pull', '--ff-only']),
    push: setUpstream =>
      reachOut(['push', ...(setUpstream ? ['--set-upstream', 'origin', 'HEAD'] : [])]),

    /**
     * Keeping one whole side of a conflict, then marking it settled.
     *
     * `git add` in the same breath, because those two are one decision: a file checked out from
     * one side and left unstaged still reads as conflicted, and the panel would go on offering
     * the buttons for a conflict the user has just settled.
     *
     * Which side is which is worth stating, since the words swap with the operation: during a
     * MERGE, `ours` is the branch that is out and `theirs` is what is being brought in. During a
     * rebase they are the other way round — which is one reason the studio pulls with
     * `--ff-only` and offers no rebase.
     */
    resolve: async (paths, side) => {
      await git.raw(['checkout', `--${side}`, '--', ...paths])
      await git.add([...paths])
    },

    abortMerge: async () => {
      await git.raw(['merge', '--abort'])
    },

    stash: async message => {
      // `--include-untracked`, so setting work aside actually sets it all aside. Without it a new
      // file stays in the folder, and the tree the user was promised is not the tree they get.
      await git.raw(['stash', 'push', '--include-untracked', '-m', message])
    },

    stashes: async () => parseStashList(await git.raw(['stash', 'list', '--format=%gs'])),

    stashPop: async index => {
      await git.raw(['stash', 'pop', `stash@{${index}}`])
    },

    stashDrop: async index => {
      await git.raw(['stash', 'drop', `stash@{${index}}`])
    },

    tag: async (name, commit) => {
      await git.raw(['tag', '--', name, commit])
    },
  }
}

/** Where this project talks to, as far as a token is concerned. Nothing when it talks nowhere. */
async function firstRemoteUrl(git: SimpleGit): Promise<string | null> {
  try {
    const [first] = await git.getRemotes(true)
    return first ? first.refs.fetch || first.refs.push : null
  } catch {
    return null
  }
}

/**
 * Takes files back out of the index.
 *
 * Two commands for one gesture, and which one applies is decided by whether there is a first
 * commit yet. `git reset` resolves HEAD, so on a repository that has none — exactly the state
 * `git init` leaves, and exactly where a user first ticks something by mistake — it fails with a
 * message about an ambiguous argument. `git rm --cached` is the answer there, and only there: on
 * a repository with a history it would stage a DELETION of a file the user only wanted to untick.
 */
async function unstage(git: SimpleGit, paths: readonly string[]): Promise<void> {
  if ((await headOf(git)) === null) await git.raw(['rm', '--cached', '--', ...paths])
  else await git.reset(['--', ...paths])
}

/**
 * Records a version.
 *
 * The identity is passed per command rather than configured on the instance, because it is a
 * preference the user can change between two commits — and because leaving it out is the normal
 * case: git then reads the `user.name` this machine already has, which is the right answer for
 * anyone who already uses git and the wrong one to overwrite.
 */
async function commit(
  git: SimpleGit,
  message: string,
  amend: boolean,
  identity?: GitIdentity,
): Promise<void> {
  await git.raw([
    ...(identity ? ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`] : []),
    'commit',
    '-m',
    message,
    ...(amend ? ['--amend'] : []),
  ])
}

/**
 * Whether the project folder is the ROOT of a repository, rather than merely inside one.
 *
 * The distinction decides which folder every command lands on. A project sitting somewhere under
 * an unrelated repository — a home directory somebody versioned once — would otherwise have its
 * panel show that repository's thousands of files, and its first commit would write into it.
 */
async function isRepositoryRoot(git: SimpleGit): Promise<boolean> {
  try {
    return await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)
  } catch {
    // Not a repository is not a failure worth a screen of its own: it is the answer.
    return false
  }
}

/**
 * `git init`, plus the ignore file the studio owes a project.
 *
 * The branch name is left to git, which reads the user's own `init.defaultBranch`. Forcing `main`
 * would quietly overrule a setting somebody chose, and the panel shows whatever name comes back.
 *
 * An ignore file already there is left ALONE. A project being brought under version control for
 * the second time — or one cloned from elsewhere — has rules somebody wrote, and overwriting
 * them to add one line is not a trade the studio gets to make.
 */
async function initialise(git: SimpleGit, root: string): Promise<void> {
  await git.init()

  const file = join(root, GITIGNORE_FILE)
  if (!(await exists(file))) await writeAtomic(file, defaultIgnore())
}

async function statusOf(git: SimpleGit): Promise<GitStatus> {
  const status = await git.status()

  return {
    // A detached HEAD has no branch to name, and `current` still answers the last one it was on.
    branch: status.detached ? null : status.current,
    head: await headOf(git),
    upstream: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    files: filesOf(status.files),
  }
}

/**
 * The short hash HEAD points at, or nothing before the first commit.
 *
 * A repository with no commit is an ordinary state — it is what `git init` leaves — and
 * `rev-parse` fails there rather than answering empty. Catching is how that state reaches the
 * panel as a screen rather than as an error.
 */
async function headOf(git: SimpleGit): Promise<string | null> {
  try {
    return (await git.revparse(['--short', 'HEAD'])).trim()
  } catch {
    return null
  }
}
