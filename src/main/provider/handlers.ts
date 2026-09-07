import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { reducedBy } from './client'
import type { JobManager } from './jobManager'
import type { ModelRegistry } from './modelRegistry'
import type { PlanReader } from './plan'
import type { PromptAssist } from './promptAssist'
import type { AssetUploader } from './uploader'
import type { PromptContext } from './promptContext'
import type { CostEstimator } from './cost'
import type { UsageReader } from './usage'
import {
  parseAssetName,
  parseBase64,
  parseContextUse,
  parseGenerationBody,
  parseJobId,
  parseModelId,
  parseModelIds,
  parseModelQuery,
  parsePromptDraft,
  parseReferenceImages,
  parseSuggestPrompts,
  parseUsageCursors,
  parseJobTarget,
  parseUsagePeriod,
} from './validation'

export type ProviderHandlerDeps = {
  models: ModelRegistry
  jobs: JobManager
  prompts: PromptAssist
  uploads: AssetUploader
  usage: UsageReader
  /** The account's plan, so the picker can refuse a model before the API does. */
  plan: PlanReader
  /** What a run would cost, asked before it is run. */
  estimateCost: CostEstimator
  /**
   * The open project's context, joined to what is about to be sent.
   *
   * Here rather than in the `JobManager`, and the queue is why: a job waits minutes before it
   * runs, and a context edited in between would be added to a body somebody already read. It is
   * also the one place the estimate and the generation share, so what is priced is what is sent.
   */
  promptContext: PromptContext
}

const reduced = reducedBy('provider')

export function registerProviderHandlers({
  models,
  jobs,
  prompts,
  uploads,
  usage,
  plan,
  estimateCost,
  promptContext,
}: ProviderHandlerDeps): void {
  handle(CHANNELS.providerUsageReport, (_event, period) =>
    reduced(() => usage.report(parseUsagePeriod(period))),
  )

  handle(CHANNELS.providerUsageEvents, (_event, period, cursors) =>
    reduced(() => usage.events(parseUsagePeriod(period), parseUsageCursors(cursors))),
  )

  handle(CHANNELS.providerSearchModels, (_event, query) =>
    reduced(() => models.search(parseModelQuery(query))),
  )

  handle(CHANNELS.providerModelPreviews, (_event, assetIds) =>
    reduced(() => models.previews(parseModelIds(assetIds))),
  )

  handle(CHANNELS.providerDescribeModel, (_event, modelId) =>
    reduced(() => models.describe(parseModelId(modelId))),
  )

  handle(CHANNELS.providerPlan, () => reduced(() => plan.access()))

  handle(CHANNELS.providerSuggestPrompts, (_event, request) =>
    reduced(() => prompts.suggest(parseSuggestPrompts(request))),
  )

  handle(CHANNELS.providerTranslatePrompt, (_event, draft) =>
    reduced(() => prompts.translate(parsePromptDraft(draft))),
  )

  handle(CHANNELS.providerDescribeStyle, (_event, images) =>
    reduced(() => prompts.describeStyle(parseReferenceImages(images))),
  )

  // `describe` is warm after rendering the form; a missing cosmetic label must not refuse a job.
  handle(CHANNELS.providerGenerate, (_event, modelId, body, use) =>
    reduced(async () => {
      const id = parseModelId(modelId)
      let label = id
      try {
        label = (await models.describe(id)).name
      } catch {
        // Nothing to record: `describe` has already said what it could not read.
      }

      const sent = await promptContext(parseGenerationBody(body), { id }, parseContextUse(use))

      return jobs.submit({ id }, label, sent.body, sent.authored)
    }),
  )

  // Price the same context-enriched body that generation would submit.
  handle(CHANNELS.providerEstimateCost, (_event, target, body, use) =>
    reduced(async () => {
      const asked = parseJobTarget(target)
      const sent = await promptContext(parseGenerationBody(body), asked, parseContextUse(use))

      return estimateCost(asked, sent.body)
    }),
  )

  handle(CHANNELS.providerUploadAsset, (_event, name, image) =>
    reduced(() => uploads.upload(parseAssetName(name), parseBase64(image))),
  )

  handle(CHANNELS.providerCancelJob, (_event, jobId) =>
    reduced(() => jobs.cancel(parseJobId(jobId))),
  )

  handle(CHANNELS.providerListJobs, () => jobs.list())
}
