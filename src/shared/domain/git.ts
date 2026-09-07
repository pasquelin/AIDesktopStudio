/**
 * Version control over the PROJECT folder — the user's files, never this repository's code.
 *
 * Shared because both processes read the same shapes: the main process produces them by running
 * git, and the two panels draw them. Nothing here runs git or touches a disk; every function is
 * arithmetic over what git already said, which is what lets the whole of it be tested without a
 * binary, a repository, or a browser.
 */
import { byCodeUnit } from '../text'
import { INDEX_FOLDER } from './project'

/**
 * Which half of git a change sits in. This is what the panel GROUPS by, and it is the one thing
 * `change` cannot answer: the same modification reads `staged` or `unstaged` depending only on
 * whether it has been added to the index.
 */
export type GitStage = 'staged' | 'unstaged' | 'untracked' | 'conflicted'

export const GIT_STAGES: readonly GitStage[] = ['conflicted', 'staged', 'unstaged', 'untracked']

/**
 * What happened to the file. This is what the row's BADGE reads.
 *
 * `untracked` and `conflicted` appear here as well as in `GitStage`, and the overlap is
 * deliberate rather than redundant: a file in those two states has a badge of its own — `?` and
 * `U` — that no other value produces, so deriving the badge from `stage` would leave every
 * other row without one.
 */
export type GitChange =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted'

export const GIT_CHANGES: readonly GitChange[] = [
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'untracked',
  'conflicted',
]

/**
 * A file as a recorded version holds it. No stage: everything in a commit is already recorded.
 *
 * Declared before the working-tree file rather than beside the commit, because the working-tree
 * one IS this plus a stage — the panels draw both from one row, and two shapes free to drift is
 * how the same file ends up described twice.
 */
export type GitCommitFile = {
  /** Slash-joined and relative to the repository root, as git writes it on every platform. */
  path: string
  change: GitChange
  /** Where a rename came FROM. Absent for every other change. */
  from?: string
}

/** A file as the working tree holds it: what a commit holds, plus which half of git it is in. */
export type GitFile = GitCommitFile & { stage: GitStage }

/**
 * The repository as the panel draws it once a project is open and git answered.
 *
 * `branch` is null on a detached HEAD, and `head` is null before the first commit — a fresh
 * `git init` is a perfectly ordinary state the panel has to show, not an error to hide.
 */
export type GitStatus = {
  branch: string | null
  head: string | null
  /** The remote branch being tracked, `origin/main` shape, or null when none is. */
  upstream: string | null
  ahead: number
  behind: number
  files: readonly GitFile[]
}

/**
 * Why a git command did not answer. A union rather than a message, for the reason every union in
 * this repository is one: the panel owes the user a different sentence for each, and a string
 * from git is not a sentence anybody chose.
 *
 * `locked` is the one worth naming on its own — git holds `index.lock` for the duration of a
 * command, and two commands at once is the failure a serialised queue exists to prevent. Seeing
 * it means something outside the studio is running git on the same folder.
 */
export type GitFailure =
  | 'binary-missing'
  | 'not-a-repository'
  | 'locked'
  | 'no-identity'
  | 'authentication'
  | 'network'
  | 'conflict'
  | 'unknown'

/**
 * The sentence each failure earns, named here rather than composed from the value.
 *
 * A record rather than a template, and the compiler is the reason: it holds one entry per member
 * or it does not build, so a failure added without a sentence never reaches a screen. Composing
 * `git.failure.${reason}` would take a hyphenated key and, worse, would go missing in silence.
 */
export const GIT_FAILURE_KEYS: Record<GitFailure, string> = {
  'binary-missing': 'git.failure.binaryMissing',
  'not-a-repository': 'git.failure.notARepository',
  locked: 'git.failure.locked',
  'no-identity': 'git.failure.noIdentity',
  authentication: 'git.failure.authentication',
  network: 'git.failure.network',
  conflict: 'git.failure.conflict',
  unknown: 'git.failure.unknown',
}

/**
 * Everything the Git panel can be looking at. One union rather than a status plus three booleans:
 * the four states before `ready` each want their own screen, and a shape that can be "no project
 * open AND has files" is a shape somebody eventually renders.
 */
export type GitRepository =
  | { kind: 'no-project' }
  | { kind: 'no-binary' }
  | { kind: 'uninitialised' }
  | { kind: 'ready'; status: GitStatus }
  /**
   * `detail` is git's OWN line, credentials stripped, shown under the translated sentence. It is
   * the only thing there is to show for `unknown`, and even for a reason we did name it says
   * which file or which remote — which the sentence cannot.
   */
  | { kind: 'failed'; reason: GitFailure; detail: string }

/**
 * Whether git holds this folder at all, which is what decides that the studio has versions to
 * READ. The three states before `ready` each mean there is nothing to read — no project, no
 * binary, no repository — while `failed` is a COMMAND that was refused and says nothing about the
 * folder: `no-identity` is what everybody meets on their first commit, over a history intact
 * behind it.
 */
export function gitHoldsFolder(repository: GitRepository): boolean {
  return repository.kind === 'ready' || repository.kind === 'failed'
}

/**
 * The letter each change wears, which is git's own vocabulary and not a language.
 *
 * Here rather than in the bundles: `M` is `M` in French, and putting it there put seven values
 * in two files that a translator would be right to leave alone and wrong to touch. `GIT_FAILURE_KEYS`
 * above applies the same shape the other way round — what a reader's language DOES decide.
 */
export const GIT_CHANGE_BADGES: Record<GitChange, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: '?',
  conflicted: 'U',
}

/** A local branch. What it tracks belongs to the remote, and arrives with it. */
export type GitBranch = { name: string; current: boolean }

/** A server this project can send to and take from. `origin` in all but the odd case. */
export type GitRemote = { name: string; url: string }

/**
 * The host a remote lives on, or nothing where the question does not arise.
 *
 * What it is FOR is deciding where a token belongs: one token per host, so a project on GitHub
 * and one on a company server never see each other's. An SSH remote answers nothing on purpose —
 * its credentials are the machine's own key and agent, which the studio neither holds nor should.
 *
 * `git@host:owner/repo` is SSH written the short way, and it is the shape most people paste. It
 * has no scheme, so `URL` cannot read it and the studio must not try.
 */
export function remoteHost(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null

  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * One recorded version.
 *
 * `parents` carries the FULL hashes git wrote, and it is what the graph is laid out from — a
 * merge has two, the very first commit has none. `hash` is full for the same reason: the short
 * form is an abbreviation git chooses per repository, and two of them can collide.
 */
export type GitCommit = {
  hash: string
  parents: readonly string[]
  /** The subject line alone. A body is not what a list of versions is read for. */
  message: string
  author: string
  /** ISO 8601, as git wrote it — formatted where it is drawn, never here. */
  at: string
  /** The names pointing here — what turns a row of hashes into a history one can read. */
  refs: readonly GitRef[]
}

/**
 * A name pointing at a commit.
 *
 * The three are told apart because they mean different things to a reader: a branch is where
 * work is happening, a remote branch is where the server had got to, and a TAG is a decision
 * somebody made — a delivery, a version shown to a client. Only the last is worth a badge that
 * catches the eye.
 */
export type GitRefKind = 'branch' | 'remote' | 'tag'

export type GitRef = { kind: GitRefKind; name: string }

export const GIT_REF_KINDS: readonly GitRefKind[] = ['branch', 'remote', 'tag']

/** One set-aside pile of changes. `index` is its place in the stack, newest first. */
export type GitStashEntry = { index: number; message: string }

/** The short form of a hash, for a column that has to stay narrow. */
export function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

/** Who a commit is recorded under, when the studio has been told rather than left to git. */
export type GitIdentity = { name: string; email: string }

/**
 * Whether a commit would be accepted.
 *
 * An amend needs no staged file — rewording the last message is the commonest reason to reach
 * for it, and refusing that would leave a typo permanent. Everything else needs both.
 */
export function canCommit(files: readonly GitFile[], message: string, amend: boolean): boolean {
  return message.trim() !== '' && (amend || hasStagedFiles(files))
}

/**
 * Whether a file can be put back the way the last recorded version has it.
 *
 * Two changes and no more, and what rules the others out is that there is nothing to put back:
 * a file git has never seen, and a file being ADDED for the first time, have no earlier version
 * anywhere. Deleting them would be the only other reading of the gesture, and that belongs to
 * the Explorer one icon along — where it goes through the system's own wastebasket rather than
 * vanishing out of a version panel.
 *
 * A rename is left out for the same reason read the other way round: putting one back means
 * restoring two paths, and a gesture that silently touches a file the user did not click is a
 * gesture nobody can predict.
 */
export function canRestore(file: GitFile): boolean {
  return file.change === 'modified' || file.change === 'deleted'
}

/**
 * Whether git would accept the name as a REF — a branch, a tag, or a remote.
 *
 * One predicate for the three because git has one rule for all three, and the studio names all
 * three: `check-ref-format` is what it comes from. Calling it after the branch alone was three
 * borrowings from the neighbour's name for a generality that was already there.
 *
 * Asked BEFORE the command rather than after, because git's own refusal is a `check-ref-format`
 * message written for someone reading a manual page. This is not the whole of git's rule — it
 * cannot be, the rule mentions the reflog — and it does not need to be: git still refuses what
 * gets past, and what gets past is no longer the ordinary mistakes.
 */
export function isRefName(name: string): boolean {
  if (name.trim() !== name || name === '') return false
  if (/[\s~^:?*[\\]/.test(name)) return false
  if (name.includes('..') || name.includes('@{')) return false
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) {
    return false
  }

  // A LEADING DASH, and this one is not a naming rule — it is the whole of an attack. The name
  // reaches `git checkout <name>` as an argument, and git reads an argument beginning with `-`
  // as an OPTION: `--upload-pack=…` runs a command of the caller's choosing. Git refuses such a
  // branch name itself, so nothing legitimate is lost by refusing it one step earlier.
  return !name.startsWith('-')
}

/**
 * The files of one stage, in a stable order.
 *
 * Sorted by path rather than left in git's order because git's order is its own — porcelain
 * walks the index and the worktree separately, so a file edited twice can move between two runs
 * that found the same thing. A list that reshuffles under a refresh is a list nobody can click.
 */
export function filesInStage(files: readonly GitFile[], stage: GitStage): GitFile[] {
  return files
    .filter(file => file.stage === stage)
    .sort((one, other) => byCodeUnit(one.path, other.path))
}

/**
 * Whether a commit would record anything.
 *
 * Conflicts count: resolving one and staging it is exactly how a merge is finished, and a
 * commit button greyed out at that moment is the one moment it must not be.
 */
export function hasStagedFiles(files: readonly GitFile[]): boolean {
  return files.some(file => file.stage === 'staged')
}

/** Whether anything at all is waiting — what decides between the empty state and the tree. */
export function hasChanges(status: GitStatus): boolean {
  return status.files.length > 0
}

/**
 * Paths a gesture applies to, deduplicated.
 *
 * A path appears TWICE when the same file is modified both in the index and in the worktree, and
 * git refuses `git add` twice in one command with an "unable to lock" that reads like a bug in
 * the studio. Callers pass whatever the tree had selected; this is what makes that safe.
 */
export function pathsOf(files: readonly GitFile[]): string[] {
  return [...new Set(files.map(file => file.path))]
}

/**
 * What the studio writes into `.gitignore` when it initialises a repository.
 *
 * ONE folder, and the reasoning is worth keeping next to it. `.index/` holds `catalog.db`, a
 * SQLite database the studio rewrites on every open: git would store a fresh copy of the whole
 * file at each commit, and — far worse — a pull from a second machine would land an unresolvable
 * binary conflict. Nothing is lost, because the catalogue is rebuilt by the rescan from the files
 * themselves.
 *
 * `.ai-desktop-studio/items.json` is deliberately NOT here. It is JSON, it is small, and it holds the one
 * thing no rescan can recover: which prompt, model and seed produced each asset. A project cloned
 * back without it comes home with its pictures and none of their history.
 *
 * English, like the rest of a file collaborators read.
 */
export function defaultIgnore(): string {
  return `# Rebuilt by AI Desktop Studio from the project's own files — never versioned.\n${INDEX_FOLDER}/\n`
}

/** Git's own folder. Named because two sides ignore it, and neither should spell it itself. */
export const GIT_FOLDER = '.git'

/**
 * The one file inside it worth hearing about: it names what is checked out, so it changes on a
 * commit, a checkout and a merge — and on nothing a mere `git status` does, which is what keeps
 * this from being the loop the filter exists to break.
 */
const GIT_HEAD = `${GIT_FOLDER}/HEAD`

/**
 * Whether a path is one nothing needs to hear about — git's own bookkeeping, and the index the
 * studio rebuilds. Both are written constantly and neither is versioned: a single git command
 * writes half a dozen files under `.git/`, and announcing them makes the panel run git again.
 *
 * Exactly these two, and not "anything under a dot", which is the rule the explorer HIDES by:
 * `.ai-desktop-studio/items.json` sits under a dot and is deliberately versioned, so a folder watch that
 * skipped it would leave the panel unaware of the one file no rescan can rebuild.
 *
 * `HEAD` is the exception, and it was measured: a commit made in a terminal moves no file the
 * studio can see, so with `.git/` skipped whole the panel went on offering to record seven files
 * that had just been recorded, until something else woke it.
 */
export function isUnwatchedByGit(path: string): boolean {
  if (path === GIT_HEAD) return false
  return path.split('/').some(segment => segment === GIT_FOLDER || segment === INDEX_FOLDER)
}
