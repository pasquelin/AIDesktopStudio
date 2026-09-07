import type { JobProgress } from '@shared/domain/job'
import type { StudioEvent } from '@shared/domain/studioEvent'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { log } from '@main/log'
import { createStudioEventBus } from './eventBus'
import { createMissionJournal } from './journal'
import { createMissionManager, type MissionManager } from './manager'
import type { MissionRuntime } from './runtime'
import { createMissionStore } from './store'

async function resumeMissionsForJob(
  missions: MissionManager,
  runtime: MissionRuntime | null,
  jobId: string,
): Promise<void> {
  try {
    for (const mission of await missions.list({})) {
      if (mission.waits.some(wait => wait.kind === 'job' && wait.jobId === jobId)) {
        await runtime?.scheduler.resumeJob(mission.id, jobId)
      }
    }
  } catch (error) {
    log.warn('assistant', `could not resume missions for job ${jobId}: ${String(error)}`)
  }
}

async function publishMissionJobProgress(
  missions: MissionManager,
  events: ReturnType<typeof createStudioEventBus>,
  progress: JobProgress,
  now: () => string,
): Promise<void> {
  for (const mission of await missions.list({})) {
    for (const wait of mission.waits) {
      if (wait.kind !== 'job' || wait.jobId !== progress.id) continue
      events.publish(jobProgressEvent(mission.id, wait.stepId, progress, now))
    }
  }
}

function jobProgressEvent(
  missionId: string,
  stepId: string,
  progress: JobProgress,
  now: () => string,
): StudioEvent {
  const terminal = progress.status === 'succeeded' ? 'completed' : progress.status
  const state = terminal === 'queued' ? 'running' : terminal
  return {
    id: `event_${randomUUID()}`,
    at: now(),
    state,
    category: 'generation',
    type: 'mission.job.progress',
    priority: state === 'failed' ? 'important' : 'normal',
    missionId,
    stepId,
    messageKey: 'activity.missionStateChanged',
    params: { label: progress.id, ...(progress.error ? { error: progress.error } : {}) },
    progress: { ratio: progress.progress },
  }
}

export function createMissionServices(now: () => string) {
  const journal = createMissionJournal(() => app.getPath('userData'), now)
  const events = createStudioEventBus((error, event) =>
    log.warn('assistant', `studio event ${event.id} listener failed: ${String(error)}`),
  )
  const store = createMissionStore(journal, (error, mission) =>
    log.warn('assistant', `mission ${mission.id} listener failed: ${String(error)}`),
  )
  const clock = { now, newId: randomUUID }
  const missions = createMissionManager(store, events, clock)
  let runtime: MissionRuntime | null = null
  return {
    missions,
    studioEvents: events,
    missionClock: clock,
    connectMissionRuntime: (connected: MissionRuntime): void => {
      runtime = connected
      const start = async (): Promise<void> => {
        try {
          await connected.start()
        } catch (error) {
          log.warn('assistant', `could not resume missions: ${String(error)}`)
        }
      }
      void start()
    },
    onJobProgress: (progress: JobProgress): void => {
      const publish = async (): Promise<void> => {
        try {
          await publishMissionJobProgress(missions, events, progress, now)
        } catch (error) {
          log.warn('assistant', `could not publish mission job ${progress.id}: ${String(error)}`)
        }
      }
      void publish()
      if (progress.status !== 'queued' && progress.status !== 'running') {
        void resumeMissionsForJob(missions, runtime, progress.id)
      }
    },
  }
}
