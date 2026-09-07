import { action, type AssistantAction } from './assistantAction'
import { USAGE_PERIODS } from './usage'

/**
 * A generation followed from the outside, from what a model accepts to what came out of it.
 *
 * `jobs.list` said `id`, `label`, `status` and `progress` and stopped there, which made a client
 * able to START a generation and unable to learn what it produced — the one thing it was
 * generating for. The four here close that: the schema before, the estimate before, the wait,
 * and the asset ids after.
 */
export const JOB_ACTIONS: readonly AssistantAction[] = [
  action({
    /**
     * The shape `generator.prepare` fills, whose `parameters` field is `raw` precisely because
     * only `GET /models/{id}` knows it. Without this a client guesses at a model's own inputs, or
     * goes and asks Scenario's own MCP — which is not this studio, and would not see what the
     * form on screen already holds.
     */
    name: 'models.readGenerationModelFields',
    titleKey: 'assistant.actions.modelsReadGenerationModelFields.title',
    descriptionKey: 'assistant.actions.modelsReadGenerationModelFields.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    inputs: ['generationModelCandidates'],
    returns: ['generationModelCandidates'],
    fields: [
      {
        key: 'modelId',
        kind: 'text',
        labelKey: 'assistant.fields.modelId',
        required: true,
        reference: 'model',
      },
    ],
  }),
  action({
    name: 'cost.estimate',
    titleKey: 'assistant.actions.costEstimate.title',
    descriptionKey: 'assistant.actions.costEstimate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'modelId', kind: 'text', labelKey: 'assistant.fields.modelId', required: true },
      { key: 'parameters', kind: 'raw', labelKey: 'assistant.fields.parameters', required: true },
    ],
  }),
  action({
    name: 'job.readCloudGeneration',
    titleKey: 'assistant.actions.jobReadCloudGeneration.title',
    descriptionKey: 'assistant.actions.jobReadCloudGeneration.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ key: 'jobId', kind: 'text', labelKey: 'assistant.fields.jobId', required: true }],
  }),
  action({
    /**
     * Bounded under the two minutes a remote call is given: a wait that outlived its own answer
     * would hand the client a timeout instead of the job it was watching.
     */
    name: 'job.waitForCloudGeneration',
    titleKey: 'assistant.actions.jobWaitForCloudGeneration.title',
    descriptionKey: 'assistant.actions.jobWaitForCloudGeneration.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'jobId', kind: 'text', labelKey: 'assistant.fields.jobId', required: true },
      {
        key: 'timeoutMs',
        kind: 'integer',
        labelKey: 'assistant.fields.timeoutMs',
        required: false,
        min: 1_000,
        max: 110_000,
      },
    ],
  }),
  action({
    name: 'job.cancelCloudGeneration',
    titleKey: 'assistant.actions.jobCancelCloudGeneration.title',
    descriptionKey: 'assistant.actions.jobCancelCloudGeneration.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ key: 'jobId', kind: 'text', labelKey: 'assistant.fields.jobId', required: true }],
  }),
  action({
    /**
     * The studio's OWN long tasks — an ffmpeg render, an ingest, an index — which are not jobs:
     * a job runs on Scenario's side and is cancelled there. Both are followed by a task id.
     */
    name: 'task.cancelLocalTask',
    titleKey: 'assistant.actions.taskCancelLocalTask.title',
    descriptionKey: 'assistant.actions.taskCancelLocalTask.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ key: 'taskId', kind: 'text', labelKey: 'assistant.fields.taskId', required: true }],
  }),
  action({
    name: 'usage.report',
    titleKey: 'assistant.actions.usageReport.title',
    descriptionKey: 'assistant.actions.usageReport.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'days',
        kind: 'choice',
        labelKey: 'assistant.fields.days',
        required: false,
        options: USAGE_PERIODS,
      },
    ],
  }),
]
