import { createMission, createMissionStep, type Mission } from '@shared/domain/mission'
import type { Memory } from '@shared/domain/assistantMemory'
import type { Job } from '@shared/domain/job'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import type { AssistantContextBuilderDeps } from './contextBuilder'

export const clock = { now: () => '2026-09-04T10:00:00.000Z', newId: () => 'one' }

export function missionOf(projectId?: string): {
  mission: Mission
  step: Mission['plan']['steps'][number]
} {
  const made = createMission('Create a project image', clock)
  const mission = projectId ? { ...made, projectId } : made
  const step = createMissionStep(mission.id, 'Choose the correct action', { kind: 'reason' }, clock)
  return { mission: { ...mission, plan: { steps: [step] } }, step }
}

export function snapshotOf(path = '/projects/alpha'): StudioSnapshot {
  return {
    project: {
      path,
      manifest: { version: 1, createdAt: clock.now(), updatedAt: clock.now() },
    },
    projectKnown: true,
    workspace: 'image',
    surface: 'image',
    commandScope: 'canvas',
    documents: [
      {
        id: 'document_1',
        title: 'Boat',
        kind: 'image',
        workspace: 'image',
        path: 'documents/Boat.ora',
        active: true,
        modified: true,
      },
    ],
    selection: { kind: 'layer', items: [{ id: 'layer_1', name: 'Hull' }] },
    armedModels: {},
    play: 'edit',
    tasks: [],
    authenticated: true,
    authKnown: true,
  }
}

export const memory: Memory = {
  id: 'memory_1',
  type: 'decision',
  summary: 'Use the selected layer',
  body: '',
  importance: 4,
  createdAt: clock.now(),
  source: { kind: 'assistant' },
  refs: [],
  links: [],
  state: 'live',
}

export const job: Job = {
  id: 'job_1',
  targetId: 'model_1',
  label: 'Boat',
  status: 'running',
  progress: 0.5,
  createdAt: clock.now(),
  assetIds: [],
}

export function dependencies(
  overrides: Partial<AssistantContextBuilderDeps> = {},
): AssistantContextBuilderDeps {
  return {
    snapshot: async () => snapshotOf(),
    actions: { search: async () => [] },
    memories: { recall: async () => [] },
    jobs: { list: () => [] },
    projectContext: { read: async () => ({ cards: [], trouble: null }) },
    ...overrides,
  }
}
