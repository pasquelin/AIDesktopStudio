import type { AuthoredPrompt } from '@shared/domain/projectContext'
import type { Job, JobTarget } from '@shared/domain/job'
import type { Entry, JobAccount } from './jobManagerContract'
import type { PersistedJob } from './persistedJob'

type NewEntryOptions = {
  target: JobTarget
  label: string
  body: Record<string, unknown>
  discreet: boolean
  settled: ((job: Job) => void) | null
  authored: AuthoredPrompt | null
  account: { id: string; account: JobAccount } | null
  projectPath: string | null
  cancellable: boolean
  id: string
  createdAt: string
}

export function newEntryOf(options: NewEntryOptions): Entry {
  const job: Job = {
    id: options.id,
    targetId: options.target.id,
    label: options.label,
    status: 'queued',
    progress: 0,
    createdAt: options.createdAt,
    assetIds: [],
    ...(options.cancellable ? {} : { cancellable: false }),
  }
  return {
    job,
    discreet: options.discreet,
    resumes: 0,
    settled: options.settled,
    account: options.account?.account ?? null,
    accountId: options.account?.id ?? null,
    projectPath: options.projectPath,
    body: options.body,
    authored: options.authored,
    remoteId: null,
    cancelled: false,
    done: false,
  }
}

export function resumedEntryOf(
  remembered: PersistedJob,
  account: JobAccount | null,
  cancellable: boolean,
): Entry {
  return {
    job: {
      id: remembered.id,
      targetId: remembered.targetId,
      label: remembered.label,
      status: 'queued',
      progress: 0,
      createdAt: remembered.createdAt,
      assetIds: [],
      ...(cancellable ? {} : { cancellable: false }),
    },
    discreet: false,
    authored: remembered.authored ?? null,
    resumes: 0,
    settled: null,
    account,
    accountId: remembered.accountId,
    projectPath: remembered.projectPath,
    body: {},
    remoteId: remembered.remoteId,
    cancelled: false,
    done: false,
  }
}
