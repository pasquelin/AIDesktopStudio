import { scenarioAccount, type AccountSummary } from '@shared/domain/account'
import {
  planProjectAccount,
  withRecentProject,
  type Project,
  type ProjectAccountPlan,
} from '@shared/domain/project'
import { EVENTS } from '@shared/ipc'
import { app } from 'electron'
import { createActivityLog, type ActivityLog } from './project/activityLog'
import { openCatalogThread } from './project/catalogThread'
import { createProjectContext } from './project/context'
import { createReconciler } from './project/reconcile'
import { createProjectStore } from './project/store'
import { watchProjectFolder, type FolderWatch } from './project/folder'
import { createMemoryHost } from './memory/memoryHost'
import { openMemoryThread } from './memory/memoryThread'
import { createSaid } from './assistant/said'
import { createTranscript } from './assistant/transcript'
import { logsFolder } from './logFile'
import { broadcast } from './ipc/broadcast'
import { noteProjectOpen } from './menu'
import { recordFailuresTo } from './provider/client'
import type { AccountChange, SettingsStore } from './settings/store'
import { log } from './log'

type Relink = { kind: 'unchanged' | 'adopted' | 'moved'; active: AccountSummary | null }

type ProjectDeps = {
  settings: SettingsStore
  credentialsChanged: () => void
  now: () => string
  refreshAi: () => Promise<void>
  resumeJobs: (projectPath: string) => Promise<void>
  catchUpMedia: () => Promise<void>
  releaseMemoryVectors: () => void
  flushJobs: () => Promise<void>
}

export function createProjectServices(deps: ProjectDeps) {
  let opened: ActivityLog | null = null
  let folderWatch: FolderWatch | null = null
  const memory = createMemoryHost({
    userData: app.getPath('userData'),
    open: openMemoryThread,
    onTrouble: why => log.warn('memory', why),
  })
  const republishAi = (after: string): void => void refreshAi(deps.refreshAi, after)
  const applyProjectAccount = createAccountRestorer(deps, () => opened, republishAi)
  const settleOpenedProject = (current: Project): void =>
    settleProject(deps, current, applyProjectAccount)
  const project = createProjectStore({
    openCatalog: openCatalogThread,
    now: deps.now,
    onRoles: roles => broadcast(EVENTS.projectFolderRoles, roles),
    onChange: current => {
      if (current) settleOpenedProject(current)
      broadcast(EVENTS.projectChanged, current)
      noteProjectOpen(current?.path ?? null)
      if (current) void deps.resumeJobs(current.path)
      if (current) void deps.catchUpMedia()
      memory.follow(current?.path ?? null)
      deps.releaseMemoryVectors()
      folderWatch?.stop()
      folderWatch = current
        ? watchProjectFolder(current.path, () => broadcast(EVENTS.projectFolderChanged))
        : null
      if (current) reconciler.request()
      republishAi('a project change')
    },
    settle: async () => {
      await Promise.all([opened?.flush(), deps.flushJobs()])
    },
  })
  const context = createProjectContext({ rootOf: () => project.current()?.path ?? null })
  const reconciler = createProjectReconciler(project, () => journal)
  app.on('browser-window-focus', () => reconciler.request())
  const journal = createActivityLog({
    catalog: () => (project.current() ? project.catalog() : null),
    broadcast: entries => broadcast(EVENTS.activity, entries),
    now: deps.now,
  })
  opened = journal
  // Kept beside the journal: a briefing measured 90,505 characters and both stores are bounded
  // well below one turn, so neither can safely stand in for the transcript.
  const transcribe = createTranscript(logsFolder)
  const said = createSaid()
  recordFailuresTo((scope, detail) =>
    journal.record({
      level: 'error',
      topic: scope === 'provider' ? 'generation' : 'library',
      messageKey: 'activity.apiRefused',
      detail,
    }),
  )
  const linkOpenProject = (): Relink => linkProject(deps.settings, project)
  return {
    memory,
    project,
    context,
    reconciler,
    journal,
    transcribe,
    said,
    republishAi,
    linkOpenProject,
  }
}

async function refreshAi(refresh: () => Promise<void>, after: string): Promise<void> {
  try {
    await refresh()
  } catch (error) {
    log.warn('ai', `republishing after ${after} failed: ${String(error)}`)
  }
}

function linkProject(
  settings: SettingsStore,
  project: ReturnType<typeof createProjectStore>,
): Relink {
  const current = project.current()
  const accounts = settings.accounts()
  const active = scenarioAccount(accounts)
  if (!current || !active) return { kind: 'unchanged', active }
  const links = settings.read().storage.projectAccounts
  const before = links[current.path]
  if (before === active.id) return { kind: 'unchanged', active }
  settings.write({ storage: { projectAccounts: { ...links, [current.path]: active.id } } })
  return { kind: before === undefined ? 'adopted' : 'moved', active }
}

function createAccountRestorer(
  deps: ProjectDeps,
  journal: () => ActivityLog | null,
  republishAi: (after: string) => void,
) {
  return (plan: ProjectAccountPlan, active: AccountSummary | null, projectPath: string): void => {
    if (plan.kind === 'restore') {
      let change: AccountChange
      try {
        change = deps.settings.activateAccount(plan.account.id)
      } catch (error) {
        log.warn('project', `restoring the account of ${projectPath} failed: ${String(error)}`)
        return
      }
      if (change.credentialsChanged) deps.credentialsChanged()
      broadcast(EVENTS.accountsChanged, change.accounts)
      republishAi('an account change')
      journal()?.record({
        level: 'info',
        topic: 'project',
        messageKey: 'activity.projectAccountRestored',
        params: { name: plan.account.name },
      })
      return
    }
    if (plan.kind === 'missing' && active)
      journal()?.record({
        level: 'warn',
        topic: 'project',
        messageKey: 'activity.projectAccountMissing',
        params: { name: active.name },
      })
  }
}

function settleProject(
  deps: ProjectDeps,
  current: Project,
  applyAccount: (plan: ProjectAccountPlan, active: AccountSummary | null, path: string) => void,
): void {
  const stored = deps.settings.read()
  const accounts = deps.settings.accounts()
  const active = scenarioAccount(accounts)
  const links = stored.storage.projectAccounts
  const plan = planProjectAccount(links[current.path], accounts)
  const adopted = plan.kind === 'adopt' ? active?.id : undefined
  deps.settings.write({
    storage: {
      lastProject: current.path,
      recentProjects: withRecentProject(stored.storage.recentProjects, current, deps.now()),
      ...(adopted ? { projectAccounts: { ...links, [current.path]: adopted } } : {}),
    },
  })
  applyAccount(plan, active, current.path)
}

function createProjectReconciler(
  project: ReturnType<typeof createProjectStore>,
  journal: () => ActivityLog,
) {
  return createReconciler({
    rootOf: () => project.current()?.path ?? null,
    catalogOf: () => (project.current() ? project.catalog() : null),
    announce: state => broadcast(EVENTS.projectRescan, state),
    report: found => {
      if (found.moved + found.missing + found.returned > 0) {
        broadcast(EVENTS.assetsChanged, [])
        broadcast(EVENTS.projectFolderChanged)
      }
      if (found.moved > 0)
        journal().record({
          level: 'info',
          topic: 'project',
          messageKey: 'activity.filesFound',
          params: { count: found.moved },
        })
      if (found.missing > 0)
        journal().record({
          level: 'warn',
          topic: 'project',
          messageKey: 'activity.filesMissing',
          params: { count: found.missing },
        })
    },
    warn: error => log.warn('project', `reconciling the project folder failed: ${String(error)}`),
  })
}
