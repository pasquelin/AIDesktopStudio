import { action, type ActionField, type AssistantAction } from './assistantAction'

/**
 * The project's repository, the remote it talks to included.
 *
 * The panel's own channels, published: every one answers with the state it LEFT, so a client
 * never has to read the status back after acting.
 *
 * The three that cross the wire are graded by what they cannot take back. `fetch` reads and
 * writes nothing anyone would miss; `pull` rewrites the working copy, like `checkout` and
 * `restore`; `push` PUBLISHES, and carries `remote` — the level that exists for it, because
 * nothing on this machine reaches what has already left it.
 *
 * The credential channels stay out, all three of them: `setCredentials` takes a token and
 * `hasCredentials` would let a client map which hosts hold one. A secret the renderer may not
 * read back is a secret an outside client may not probe either — see invariant 1.
 */

const PATHS: ActionField = {
  key: 'paths',
  kind: 'text',
  labelKey: 'assistant.fields.gitPaths',
  required: true,
  repeated: true,
}

export const GIT_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'git.status',
    titleKey: 'assistant.actions.gitStatus.title',
    descriptionKey: 'assistant.actions.gitStatus.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['project'] },
    fields: [],
  }),
  action({
    name: 'git.log',
    titleKey: 'assistant.actions.gitLog.title',
    descriptionKey: 'assistant.actions.gitLog.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'limit',
        kind: 'integer',
        labelKey: 'assistant.fields.limit',
        required: false,
        min: 1,
        max: 200,
      },
      { key: 'skip', kind: 'integer', labelKey: 'assistant.fields.skip', required: false, min: 0 },
    ],
  }),
  action({
    name: 'git.listCommitFiles',
    titleKey: 'assistant.actions.gitListCommitFiles.title',
    descriptionKey: 'assistant.actions.gitListCommitFiles.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'hash', kind: 'text', labelKey: 'assistant.fields.commitHash', required: true },
    ],
  }),
  action({
    name: 'git.diff',
    titleKey: 'assistant.actions.gitDiff.title',
    descriptionKey: 'assistant.actions.gitDiff.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'path', kind: 'text', labelKey: 'assistant.fields.gitPath', required: true },
      { key: 'commit', kind: 'text', labelKey: 'assistant.fields.commitHash', required: false },
    ],
  }),
  action({
    name: 'git.branches',
    titleKey: 'assistant.actions.gitBranches.title',
    descriptionKey: 'assistant.actions.gitBranches.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'git.stashes',
    titleKey: 'assistant.actions.gitStashes.title',
    descriptionKey: 'assistant.actions.gitStashes.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'git.init',
    titleKey: 'assistant.actions.gitInit.title',
    descriptionKey: 'assistant.actions.gitInit.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'git.stage',
    titleKey: 'assistant.actions.gitStage.title',
    descriptionKey: 'assistant.actions.gitStage.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [PATHS],
  }),
  action({
    name: 'git.unstage',
    titleKey: 'assistant.actions.gitUnstage.title',
    descriptionKey: 'assistant.actions.gitUnstage.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [PATHS],
  }),
  action({
    // The one git gesture that destroys work outright: what was not recorded is gone, and no
    // Explorer undo reaches it.
    name: 'git.restore',
    titleKey: 'assistant.actions.gitRestore.title',
    descriptionKey: 'assistant.actions.gitRestore.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [PATHS],
  }),
  action({
    name: 'git.commit',
    titleKey: 'assistant.actions.gitCommit.title',
    descriptionKey: 'assistant.actions.gitCommit.description',
    commitment: 'none',
    repeatable: true,
    // Recording a version adds one; amending REPLACES the one already recorded, and its message
    // and its parent are gone with it. That is the same loss `git.restore` is asked about.
    raises: input => (input.amend === true ? 'files' : 'none'),
    reach: 'mcp',
    fields: [
      { key: 'message', kind: 'longText', labelKey: 'assistant.fields.message', required: true },
      { key: 'amend', kind: 'boolean', labelKey: 'assistant.fields.amend', required: false },
    ],
  }),
  action({
    name: 'git.createBranch',
    titleKey: 'assistant.actions.gitCreateBranch.title',
    descriptionKey: 'assistant.actions.gitCreateBranch.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.branchName', required: true },
    ],
  }),
  action({
    // Rewrites the working tree, and a document open in a tab is then a document whose file has
    // changed under it.
    name: 'git.checkout',
    titleKey: 'assistant.actions.gitCheckout.title',
    descriptionKey: 'assistant.actions.gitCheckout.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.branchName', required: true },
    ],
  }),
  action({
    name: 'git.stash',
    titleKey: 'assistant.actions.gitStash.title',
    descriptionKey: 'assistant.actions.gitStash.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'message', kind: 'text', labelKey: 'assistant.fields.message', required: false },
    ],
  }),
  action({
    name: 'git.stashPop',
    titleKey: 'assistant.actions.gitStashPop.title',
    descriptionKey: 'assistant.actions.gitStashPop.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'index',
        kind: 'integer',
        labelKey: 'assistant.fields.stashIndex',
        required: true,
        min: 0,
      },
    ],
  }),
  action({
    name: 'git.tag',
    titleKey: 'assistant.actions.gitTag.title',
    descriptionKey: 'assistant.actions.gitTag.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.tagName', required: true },
      { key: 'commit', kind: 'text', labelKey: 'assistant.fields.commitHash', required: true },
    ],
  }),
  action({
    name: 'git.stashDrop',
    titleKey: 'assistant.actions.gitStashDrop.title',
    descriptionKey: 'assistant.actions.gitStashDrop.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'index',
        kind: 'integer',
        labelKey: 'assistant.fields.stashIndex',
        required: true,
        min: 0,
      },
    ],
  }),
  action({
    /** Which side of a conflict wins. What the other side held is gone from the working copy. */
    name: 'git.resolve',
    titleKey: 'assistant.actions.gitResolve.title',
    descriptionKey: 'assistant.actions.gitResolve.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      PATHS,
      {
        key: 'side',
        kind: 'choice',
        labelKey: 'assistant.fields.conflictSide',
        required: true,
        options: ['ours', 'theirs'],
      },
    ],
  }),
  action({
    name: 'git.abortMerge',
    titleKey: 'assistant.actions.gitAbortMerge.title',
    descriptionKey: 'assistant.actions.gitAbortMerge.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'git.remotes',
    titleKey: 'assistant.actions.gitRemotes.title',
    descriptionKey: 'assistant.actions.gitRemotes.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'git.addRemote',
    titleKey: 'assistant.actions.gitAddRemote.title',
    descriptionKey: 'assistant.actions.gitAddRemote.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.remoteName', required: true },
      { key: 'url', kind: 'text', labelKey: 'assistant.fields.remoteUrl', required: true },
    ],
  }),
  action({
    /** Reads the remote and writes nothing anyone would miss, so it asks nothing. */
    name: 'git.fetch',
    titleKey: 'assistant.actions.gitFetch.title',
    descriptionKey: 'assistant.actions.gitFetch.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /** `files` for the same reason `checkout` carries it: the working copy is rewritten. */
    name: 'git.pull',
    titleKey: 'assistant.actions.gitPull.title',
    descriptionKey: 'assistant.actions.gitPull.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * The one action of the studio that publishes off this machine, and the reason `remote`
     * exists as a level at all: no undo here reaches what has already left.
     */
    name: 'git.push',
    titleKey: 'assistant.actions.gitPush.title',
    descriptionKey: 'assistant.actions.gitPush.description',
    commitment: 'remote',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'setUpstream',
        kind: 'boolean',
        labelKey: 'assistant.fields.setUpstream',
        required: false,
      },
    ],
  }),
]
