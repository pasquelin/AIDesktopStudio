import type { StudioBridge } from '@shared/ipc'

export function fakeBridgeGit(
  overrides: Partial<StudioBridge['git']> | undefined,
): StudioBridge['git'] {
  return {
    read: () => Promise.resolve({ kind: 'no-project' }),
    init: () => Promise.resolve({ kind: 'no-project' }),
    stage: () => Promise.resolve({ kind: 'no-project' }),
    unstage: () => Promise.resolve({ kind: 'no-project' }),
    restore: () => Promise.resolve({ kind: 'no-project' }),
    commit: () => Promise.resolve({ kind: 'no-project' }),
    branches: () => Promise.resolve([]),
    createBranch: () => Promise.resolve({ kind: 'no-project' }),
    checkout: () => Promise.resolve({ kind: 'no-project' }),
    log: () => Promise.resolve([]),
    commitFiles: () => Promise.resolve([]),
    diff: () => Promise.resolve({ kind: 'empty' }),
    bytes: () => Promise.resolve(null),
    remotes: () => Promise.resolve([]),
    addRemote: () => Promise.resolve({ kind: 'no-project' }),
    fetch: () => Promise.resolve({ kind: 'no-project' }),
    pull: () => Promise.resolve({ kind: 'no-project' }),
    push: () => Promise.resolve({ kind: 'no-project' }),
    resolve: () => Promise.resolve({ kind: 'no-project' }),
    abortMerge: () => Promise.resolve({ kind: 'no-project' }),
    stash: () => Promise.resolve({ kind: 'no-project' }),
    stashes: () => Promise.resolve([]),
    stashPop: () => Promise.resolve({ kind: 'no-project' }),
    stashDrop: () => Promise.resolve({ kind: 'no-project' }),
    tag: () => Promise.resolve({ kind: 'no-project' }),
    hasCredentials: () => Promise.resolve(false),
    setCredentials: () => Promise.resolve(),
    clearCredentials: () => Promise.resolve(),
    ...overrides,
  }
}
