import {
  canCommit,
  type GitBranch,
  type GitCommit,
  type GitCommitFile,
  type GitFile,
  type GitRemote,
  type GitRepository,
  type GitStashEntry,
} from '@shared/domain/git'
import type { StudioBridge } from '@shared/ipc'
import { WHEN } from './project'

/**
 * GIT, and nothing else. `gitHandlers.ts` is a pure pass-through, so what a gesture MEANS comes
 * from the application; what is written here is what git would answer, refusals included.
 */
export type MemoryGit = StudioBridge['git'] & {
  /** What the bench reads back, and writes when a decor says a file was edited outside git. */
  repo: () => Repo
}

type Repo = {
  tracked: boolean
  branch: string
  branches: string[]
  files: GitFile[]
  commits: { hash: string; message: string; files: GitCommitFile[] }[]
  stashes: { message: string; files: GitFile[] }[]
  remotes: GitRemote[]
  tags: string[]
  merging: boolean
  fetched: boolean
  pulled: boolean
  pushed: boolean
}

const staged = (repo: Repo): GitFile[] => repo.files.filter(one => one.stage === 'staged')

const emptyRepo = (): Repo => ({
  tracked: false,
  branch: 'main',
  branches: ['main'],
  files: [],
  commits: [],
  stashes: [],
  remotes: [],
  tags: [],
  merging: false,
  fetched: false,
  pulled: false,
  pushed: false,
})

export function createMemoryGit(): MemoryGit {
  const repo = emptyRepo()

  const state = (): GitRepository =>
    repo.tracked
      ? {
          kind: 'ready',
          status: {
            branch: repo.branch,
            head: repo.commits.at(-1)?.hash ?? null,
            upstream: repo.remotes.length > 0 ? `origin/${repo.branch}` : null,
            ahead: 0,
            behind: 0,
            files: repo.files,
          },
        }
      : { kind: 'uninitialised' }

  /** Everything but `init` needs a repository — the refusal git itself answers. */
  const acting = (change: () => void): Promise<GitRepository> => {
    if (!repo.tracked) return Promise.resolve({ kind: 'uninitialised' })

    change()
    return Promise.resolve(state())
  }

  const restage = (paths: readonly string[], stage: GitFile['stage']): void => {
    repo.files = repo.files.map(one => (paths.includes(one.path) ? { ...one, stage } : one))
  }

  return {
    repo: () => repo,

    read: () => Promise.resolve(state()),

    init: () => {
      repo.tracked = true
      return Promise.resolve(state())
    },

    stage: paths => acting(() => restage(paths, 'staged')),
    unstage: paths => acting(() => restage(paths, 'unstaged')),

    // 🛑 What was not recorded is GONE, where unstaging only moves a file across the index. The
    // two read identically to a model unless the state says so.
    restore: paths =>
      acting(() => {
        repo.files = repo.files.filter(one => !paths.includes(one.path))
      }),

    commit: (message, amend) =>
      acting(() => {
        if (!canCommit(repo.files, message, amend)) return
        if (amend) repo.commits.pop()

        repo.commits.push({
          hash: `commit-${repo.commits.length + 1}`,
          message,
          files: staged(repo).map(({ path, change }) => ({ path, change })),
        })
        repo.files = repo.files.filter(one => one.stage !== 'staged')
      }),

    branches: () =>
      Promise.resolve(
        repo.branches.map((name): GitBranch => ({ name, current: name === repo.branch })),
      ),

    createBranch: name =>
      acting(() => {
        if (name !== '' && !repo.branches.includes(name)) repo.branches.push(name)
      }),

    checkout: name =>
      acting(() => {
        if (repo.branches.includes(name)) repo.branch = name
      }),

    log: (limit, skip) =>
      Promise.resolve(
        [...repo.commits]
          .reverse()
          .slice(skip, skip + limit)
          .map((one): GitCommit => ({
            hash: one.hash,
            parents: [],
            message: one.message,
            author: 'Bench',
            at: WHEN,
            refs: [],
          })),
      ),

    commitFiles: hash => Promise.resolve(repo.commits.find(one => one.hash === hash)?.files ?? []),

    // Binary, which is the ordinary answer for a studio project: a picture has no hunks.
    diff: path =>
      Promise.resolve(
        repo.files.some(one => one.path === path) ? { kind: 'binary' } : { kind: 'empty' },
      ),

    bytes: () => Promise.resolve(null),
    remotes: () => Promise.resolve(repo.remotes),

    addRemote: (name, url) =>
      acting(() => {
        if (name !== '' && url !== '') repo.remotes.push({ name, url })
      }),

    fetch: () =>
      acting(() => {
        repo.fetched = true
      }),

    pull: () =>
      acting(() => {
        repo.pulled = true
      }),

    push: () =>
      acting(() => {
        repo.pushed = true
      }),

    resolve: paths =>
      acting(() => {
        restage(paths, 'staged')
        repo.files = repo.files.map(one =>
          paths.includes(one.path) && one.change === 'conflicted'
            ? { ...one, change: 'modified' }
            : one,
        )
        if (!repo.files.some(one => one.stage === 'conflicted')) repo.merging = false
      }),

    abortMerge: () =>
      acting(() => {
        repo.merging = false
        repo.files = repo.files.filter(one => one.stage !== 'conflicted')
      }),

    stash: message =>
      acting(() => {
        repo.stashes.unshift({ message: message || 'Travail en cours', files: repo.files })
        repo.files = []
      }),

    stashes: () =>
      Promise.resolve(
        repo.stashes.map((one, index): GitStashEntry => ({ index, message: one.message })),
      ),

    // Popping BRINGS THE WORK BACK; dropping throws it away. Only the second half tells them
    // apart, and a port splicing the list for both scored either one on the other.
    stashPop: index =>
      acting(() => {
        const taken = repo.stashes[index]
        if (!taken) return

        repo.stashes.splice(index, 1)
        repo.files = [...repo.files, ...taken.files]
      }),

    stashDrop: index =>
      acting(() => {
        if (repo.stashes[index]) repo.stashes.splice(index, 1)
      }),

    tag: (name, commit) =>
      acting(() => {
        if (name !== '' && commit !== '') repo.tags.push(name)
      }),

    hasCredentials: () => Promise.resolve(false),
    setCredentials: () => Promise.resolve(),
    clearCredentials: () => Promise.resolve(),
  }
}
