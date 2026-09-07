import { create } from 'zustand'
import type {
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitRemote,
  GitRepository,
  GitStashEntry,
} from '@shared/domain/git'
import type { GitDiff } from '@shared/domain/gitDiff'
import { gitBridge } from '@/services/bridge'

/**
 * How much history one round trip brings back.
 *
 * A band shows a dozen rows and scrolls; this is several screens of them, so scrolling does not
 * hit the bottom on the first flick. A project of two years is tens of thousands of commits, and
 * reading them whole to draw twenty is what paging exists to avoid.
 */
export const HISTORY_PAGE = 60

type GitState = {
  repository: GitRepository
  /** Whether a command is in flight. What greys the buttons, so nothing is asked for twice. */
  busy: boolean
  /**
   * The commit message being written, held here rather than in the panel.
   *
   * A panel that is switched away from and back — one click on the rail — remounts, and a
   * message typed into component state would be gone. It survives a project change too, which
   * is wrong for exactly nobody: it is emptied when a commit lands.
   */
  message: string
  amend: boolean

  /**
   * The history, as far down as it has been read. Held beside the working tree rather than in a
   * store of its own: the two are one repository, and a commit made in the Git panel has to
   * appear in the History panel without either of them knowing the other exists.
   */
  commits: readonly GitCommit[]
  /** Whether the last page came back short, which is the only way to know there is no more. */
  historyEnded: boolean
  /** The version being looked at, or nothing. Its files are read when it is picked. */
  picked: string | null
  pickedFiles: readonly GitCommitFile[]

  /**
   * The file being compared, and against which version — `null` meaning the last recorded one.
   *
   * Held in the store rather than in the panel that draws it, because the two panels BOTH set it:
   * the Git panel compares a file one is about to record, the History panel a file inside a
   * version. Only the band is wide enough to draw the answer, so the narrow one asks and the wide
   * one shows.
   */
  compared: { path: string; commit: string | null } | null
  diff: GitDiff | null

  refresh: () => Promise<void>
  initRepository: () => Promise<void>
  stage: (paths: readonly string[]) => Promise<void>
  unstage: (paths: readonly string[]) => Promise<void>
  restore: (paths: readonly string[]) => Promise<void>
  commit: () => Promise<void>
  branches: () => Promise<GitBranch[]>
  createBranch: (name: string) => Promise<void>
  checkout: (name: string) => Promise<void>
  writeMessage: (message: string) => void
  setAmend: (amend: boolean) => void
  /** Reads the first page afresh, or the next one under it. */
  readHistory: (more: boolean) => Promise<void>
  pick: (hash: string | null) => Promise<void>
  compare: (path: string, commit: string | null) => Promise<void>
  stopComparing: () => void
  /**
   * The server this project talks to, or nothing.
   *
   * The FIRST one, and the studio offers no way to make a second: a project with two servers is
   * a situation git handles and a version panel would only obscure. Somebody who has one has a
   * terminal too, and the panel goes on working around it.
   */
  remote: GitRemote | null
  readRemotes: () => Promise<void>
  addRemote: (name: string, url: string) => Promise<void>
  fetch: () => Promise<void>
  pull: () => Promise<void>
  push: (setUpstream: boolean) => Promise<void>
  /**
   * Runs the last command that talked to a server again — what the token field takes once the
   * token is in. Answers nothing where none has been run, which is not a state the panel reaches:
   * it is only offered after a server refused one.
   */
  retryRemote: () => Promise<void>
  resolve: (paths: readonly string[], side: 'ours' | 'theirs') => Promise<void>
  abortMerge: () => Promise<void>
  stash: (message: string) => Promise<void>
  stashes: () => Promise<GitStashEntry[]>
  stashPop: (index: number) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  tag: (name: string, commit: string) => Promise<void>
  /** Whether a token is held for a host. The token itself never comes back this way. */
  hasCredentials: (host: string) => Promise<boolean>
  setCredentials: (host: string, user: string, token: string) => Promise<void>
  clearCredentials: (host: string) => Promise<void>
}

/**
 * The repository, as this window sees it.
 *
 * A store rather than a read per panel: the Git panel and the History panel look at the same
 * folder, and two copies of one answer is two panels disagreeing about which branch is out.
 *
 * Nothing is polled. What refreshes it is `useGitStatus`, off the events the studio already
 * publishes — the project changing, its folder changing on disk, the window coming back to the
 * front. A watcher of its own over a hundred thousand files is exactly what invariant 6 forbids,
 * and the studio has one already.
 */
let running = 0
/** The status read that is out, shared by every panel that asks while it is. */
let reading: Promise<GitRepository> | null = null
/** The same for the server, which three mounts of the git watch ask for on one event. */
let readingRemotes: Promise<GitRemote[]> | null = null
/** Which remote read is current, so one that lands late does not overwrite the one after it. */
let remotesRead = 0
/** Whether a page of history is already on its way. */
let paging = false
/**
 * The last command that talked to a server, kept so the token field can run THAT one again.
 *
 * A refusal is answered by asking for a token, and what asked was a fetch, a pull, or a push
 * that may have carried `--set-upstream` — the first push of a branch, which is precisely the
 * one that meets a refusal. Replayed as a plain push, it fails on a branch with nothing to
 * track, and the panel shows a failure where the token had just been accepted.
 */
let lastRemote: (() => Promise<void>) | null = null

/** Answers whether the command came BACK — false where the channel itself failed. */
const runAnswering = async (answer: Promise<GitRepository> | undefined): Promise<boolean> => {
  if (!answer) return false

  running += 1
  useGit.setState({ busy: true })
  try {
    const read = await answer

    // Published only when it says something new. Every answer is a fresh object — the IPC clone
    // rebuilds it — so an unconditional `set` re-renders both panels on every refresh, which is
    // several a minute on a folder the studio itself writes to. Stringified rather than compared
    // field by field: one side builds all of these, so the key order is its own, and a signature
    // written by hand is a field forgotten the day one is added.
    if (JSON.stringify(useGit.getState().repository) !== JSON.stringify(read))
      useGit.setState({ repository: read })
    return true
  } catch {
    // The main process answers a union for every git failure, so a rejection here means the
    // channel itself failed. What was on screen is the last thing known to be true about the
    // folder — better than a state invented from an error that says nothing about git.
    return false
  } finally {
    running -= 1
    // Only the LAST one lifts it: two panels refreshing together would otherwise have the
    // first to land clear the flag while the second is still running.
    if (running === 0) useGit.setState({ busy: false })
  }
}

/** The same for the commands whose answer is the state itself, which is most of them. */
const run = async (answer: Promise<GitRepository> | undefined): Promise<void> => {
  await runAnswering(answer)
}

/** A command that talks to a server, remembered so a token can send the same one again. */
const reachOut = (ask: () => Promise<GitRepository> | undefined): Promise<void> => {
  lastRemote = () => run(ask())
  return lastRemote()
}

const gitState: GitState = {
  repository: { kind: 'no-project' },
  busy: false,
  message: '',
  amend: false,
  commits: [],
  historyEnded: false,
  remote: null,
  picked: null,
  pickedFiles: [],
  compared: null,
  diff: null,

  refresh: async () => {
    // One `git status` for however many panels ask. Both mount `useGitStatus` and both are woken
    // by the same event, and dockview keeps the one behind mounted — so without this, every
    // signal starts two git processes to read the same folder twice.
    if (!reading) {
      const answer = gitBridge()?.read()
      if (!answer) return
      reading = answer.finally(() => {
        reading = null
      })
    }

    await run(reading)
  },
  initRepository: () => run(gitBridge()?.init()),
  stage: paths => run(gitBridge()?.stage(paths)),
  unstage: paths => run(gitBridge()?.unstage(paths)),
  restore: paths => run(gitBridge()?.restore(paths)),

  commit: async () => {
    const { message, amend } = useGit.getState()
    const answered = await runAnswering(gitBridge()?.commit(message, amend))

    // Emptied only where the commit actually landed. A message cleared after a refusal — no
    // identity configured is the one everybody meets first — would lose what was typed at the
    // exact moment the user has to fix something and try again.
    //
    // `answered` and not the state alone: a channel that fails outright leaves the repository
    // as it was, and it was `ready` — so the message was thrown away for a commit that never
    // reached git at all.
    if (answered && useGit.getState().repository.kind === 'ready')
      useGit.setState({ message: '', amend: false })
  },

  branches: async () => (await gitBridge()?.branches()) ?? [],
  createBranch: name => run(gitBridge()?.createBranch(name)),
  checkout: name => run(gitBridge()?.checkout(name)),

  writeMessage: message => useGit.setState({ message }),
  setAmend: amend => useGit.setState({ amend }),

  readHistory: async more => {
    // One page at a time. Two clicks on "show more" inside one round trip both read the same
    // `commits`, both ask git to skip the same number, and both append the same sixty — which
    // hands the list duplicate keys and the graph a history holding each commit twice.
    if (paging) return
    paging = true

    try {
      const held = more ? useGit.getState().commits : []
      const page = (await gitBridge()?.log(HISTORY_PAGE, held.length)) ?? []

      useGit.setState({
        commits: [...held, ...page],
        // A page that came back short is the end. Asking again to find out would cost a command
        // per scroll for the rest of the session, on a history that is not going to grow.
        historyEnded: page.length < HISTORY_PAGE,
      })
    } finally {
      paging = false
    }
  },

  pick: async hash => {
    // Cleared FIRST: the files of the version one has just left would otherwise stay on screen
    // under the name of the one just picked, for as long as git takes to answer.
    useGit.setState({ picked: hash, pickedFiles: [] })
    if (hash === null) return

    const files = (await gitBridge()?.commitFiles(hash)) ?? []

    // Only if it is still the one being looked at. Two quick clicks race, and the slower answer
    // would otherwise land last and fill the row that is no longer picked.
    if (useGit.getState().picked === hash) useGit.setState({ pickedFiles: files })
  },

  compare: async (path, commit) => {
    useGit.setState({ compared: { path, commit }, diff: null })

    const diff = (await gitBridge()?.diff(path, commit)) ?? { kind: 'empty' }

    // The same race as `pick`, and it bites harder here: a diff is the slowest thing git is
    // asked for, so a second file clicked while the first is still out is the ordinary case.
    const still = useGit.getState().compared
    if (still?.path === path && still.commit === commit) useGit.setState({ diff })
  },

  stopComparing: () => useGit.setState({ compared: null, diff: null }),

  readRemotes: async () => {
    if (!readingRemotes) {
      const answer = gitBridge()?.remotes()
      if (!answer) {
        useGit.setState({ remote: null })
        return
      }
      const started = (remotesRead += 1)
      readingRemotes = answer.finally(() => {
        // Only while it is still the current one: an older read landing late would otherwise
        // clear the handle of the read that replaced it, and the sharing above with it.
        if (remotesRead === started) readingRemotes = null
      })
    }

    const asked = remotesRead
    const [first] = await readingRemotes
    // A later read has been started since. This answer describes the folder as it was before
    // it, and writing it would put « no server » back under one just named.
    if (remotesRead !== asked) return
    useGit.setState({ remote: first ?? null })
  },

  addRemote: async (name, url) => {
    await run(gitBridge()?.addRemote(name, url))
    // A read still out was taken before this remote existed, so it is not the answer to it.
    readingRemotes = null
    await useGit.getState().readRemotes()
  },
  fetch: () => reachOut(() => gitBridge()?.fetch()),
  pull: () => reachOut(() => gitBridge()?.pull()),
  push: setUpstream => reachOut(() => gitBridge()?.push(setUpstream)),
  retryRemote: async () => {
    await lastRemote?.()
  },

  resolve: (paths, side) => run(gitBridge()?.resolve(paths, side)),
  abortMerge: () => run(gitBridge()?.abortMerge()),
  stash: message => run(gitBridge()?.stash(message)),
  stashes: async () => (await gitBridge()?.stashes()) ?? [],
  stashPop: index => run(gitBridge()?.stashPop(index)),
  stashDrop: index => run(gitBridge()?.stashDrop(index)),

  tag: async (name, commit) => {
    await run(gitBridge()?.tag(name, commit))
    // The log carries the names pointing at each commit, so a tag that is not read back is a
    // tag the user made and cannot see.
    await useGit.getState().readHistory(false)
  },

  hasCredentials: async host => (await gitBridge()?.hasCredentials(host)) ?? false,
  setCredentials: async (host, user, token) => {
    await gitBridge()?.setCredentials(host, user, token)
  },
  clearCredentials: async host => {
    await gitBridge()?.clearCredentials(host)
  },
}

export const useGit = create<GitState>()(() => gitState)
