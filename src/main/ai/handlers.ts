import type { AiOverview, OwnModelProfile } from '@shared/domain/aiOverview'
import { taskRatio, type TaskWatch } from '@shared/domain/taskProgress'
import type { RunningTasks } from '@main/task/runningTasks'
import { sendToSender } from '@main/ipc/broadcast'
import { EVENTS, CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import type { AiManager } from './manager'
import { parseChoice, parseChoices, parseAiModelId } from './validation'

export type AiHandlerDeps = {
  manager: AiManager
  running: RunningTasks
  /**
   * Rank 3's gesture, whole. It REJECTS on a file the studio cannot read, and that crosses to the
   * window: the gesture was theirs, so the refusal is theirs to see.
   */
  addOwnModel: (profile?: OwnModelProfile, watch?: TaskWatch) => Promise<AiOverview>
}

export function registerAiHandlers({ manager, addOwnModel, running }: AiHandlerDeps): void {
  handle(CHANNELS.aiOverview, () => manager.overview())

  handle(CHANNELS.aiChoose, (_event, role, provider, scope) => {
    // The channel is typed, but TypeScript is gone at runtime and the sender is a renderer:
    // what arrives is `unknown` until this says otherwise.
    const choice = parseChoice(role, provider, scope)
    return manager.choose(choice.role, choice.provider, choice.scope)
  })

  handle(CHANNELS.aiChooseMany, (_event, writes, scope) => {
    const parsed = parseChoices(writes, scope)
    return manager.chooseMany(parsed.writes, parsed.scope)
  })

  handle(CHANNELS.aiInstall, (_event, modelId) => manager.install(parseAiModelId(modelId)))
  handle(CHANNELS.aiCancelInstall, () => manager.cancelInstall())
  handle(CHANNELS.aiInstallOllama, () => manager.installOllama())
  handle(CHANNELS.aiCancelInstallOllama, () => manager.cancelInstallOllama())
  handle(CHANNELS.aiReadEngine, (_event, profile) => manager.readEngine(parseProfile(profile)))
  handle(CHANNELS.aiInstallEngine, (_event, profile) =>
    manager.installEngine(parseProfile(profile)),
  )
  handle(CHANNELS.aiCancelInstallEngine, () => manager.cancelInstallEngine())
  handle(CHANNELS.aiRemove, (_event, modelId) => manager.remove(parseAiModelId(modelId)))
  handle(CHANNELS.aiLoad, (_event, modelId) => manager.load(parseAiModelId(modelId)))
  handle(CHANNELS.aiCancelLoad, () => manager.cancelLoad())
  handle(CHANNELS.aiUnload, (_event, modelId) => manager.unload(parseAiModelId(modelId)))

  handle(CHANNELS.aiAddOwnModel, (event, profile, taskId) => {
    const parsed = parseProfile(profile)
    if (taskId === undefined) return addOwnModel(parsed)
    if (typeof taskId !== 'string' || !taskId) throw new Error('invalid task id')
    return running.run(taskId, signal =>
      addOwnModel(parsed, {
        signal,
        onStep: (done, total) =>
          sendToSender(event.sender, EVENTS.taskProgress, {
            id: taskId,
            ratio: taskRatio(done, total),
          }),
      }),
    )
  })
}

function parseProfile(value: unknown): OwnModelProfile | undefined {
  if (value === undefined || value === 'motion') return value
  throw new Error('invalid local model profile')
}
