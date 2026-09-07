import { describe, expect, it, vi } from 'vitest'
import { localModel } from '@shared/domain/localModel-fixtures'
import { createLocalJobRunner, type LocalJobDeps } from './localJobRunner'
import type { ChatRequest } from './localRuntimes'

const MODEL = localModel({ id: 'local_one', loader: 'llamacpp', contextTokens: 4_096 })

/** This runner reads the id it minted and never the target; one stands for every case. */
const TARGET = { id: MODEL.id }

/** A manifest that declares the code employments — what tells the runner which prompt to compose. */
const CODER = localModel({
  id: 'local_coder',
  loader: 'llamacpp',
  contextTokens: 4_096,
  family: 'code',
  capabilities: ['txt2code', 'code2code'],
})

const runnerWith = (over: Partial<LocalJobDeps> = {}) => {
  let count = 0

  return createLocalJobRunner({
    chat: () => Promise.resolve('a picture of a cat'),
    generate: () => Promise.resolve({ path: '/tmp/out.png', device: 'mps', backend: 'pytorch' }),
    modelOf: id => [MODEL, CODER].find(one => one.id === id) ?? null,
    newId: () => `${(count += 1)}`,
    log: () => {},
    ...over,
  })
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0))

describe('a script written on this machine', () => {
  /** 🛑 Read off the MANIFEST: an Ollama tag declares the code employments it serves. */
  it('shows the model what a script may reach, and answers the script on the job', async () => {
    const asked: ChatRequest[] = []
    const runner = runnerWith({
      chat: request => {
        asked.push(request)
        return Promise.resolve('```ts\nexport const x = 1\n```')
      },
    })

    const submitted = await runner.submit(
      { id: CODER.id },
      { prompt: 'a spin', source: 'export const x = 0', api: 'declare module "@studio"' },
    )
    await settled()

    expect(asked[0]?.messages[0]?.content).toContain('declare module')
    expect(asked[0]?.messages[1]?.content).toContain('export const x = 0')
    // The fence off, and on the JOB — there is no asset to read a script back off.
    expect((await runner.poll(submitted.jobId, TARGET)).text).toBe('export const x = 1')
  })

  /**
   * 🛑 The form publishes a temperature, a nucleus and a ceiling — a panel showing a control that
   * changes nothing is a control that lies, and the cloud runner honours all three.
   */
  it('sends the knobs the form filled', async () => {
    const asked: ChatRequest[] = []
    const runner = runnerWith({
      chat: request => {
        asked.push(request)
        return Promise.resolve('export const x = 1')
      },
    })

    await runner.submit(
      { id: CODER.id },
      { prompt: 'a spin', api: 'declare module', temperature: 0.1, topP: 0.5, maxTokens: 4096 },
    )
    await settled()

    expect(asked[0]).toMatchObject({ temperature: 0.1, topP: 0.5, maxTokens: 4096 })
  })

  /** A conversation is prose: its backticks are the person's, and nothing strips them. */
  it('leaves an ordinary conversation alone', async () => {
    const asked: ChatRequest[] = []
    const runner = runnerWith({
      chat: request => {
        asked.push(request)
        return Promise.resolve('```\nsome prose\n```')
      },
    })

    const submitted = await runner.submit({ id: MODEL.id }, { prompt: 'a cat' })
    await settled()

    expect(asked[0]?.messages).toHaveLength(1)
    expect((await runner.poll(submitted.jobId, TARGET)).text).toBe('```\nsome prose\n```')
  })
})

describe('the local job runner', () => {
  /**
   * `poll` is a remote form, kept rather than worked around: the manager holds the queue, the
   * concurrency bound and the retries, and giving it a second implementation to grow was the
   * alternative. So the work happens here and the poll reads the state it left.
   */
  it('answers a submission at once and finishes under the poll', async () => {
    const runner = runnerWith()

    // Already working when the submission answers: nothing queues on this machine, the runtime
    // is right here, and the manager's own queue is what bounds how many run at once.
    const submitted = await runner.submit({ id: MODEL.id }, { prompt: 'a cat' })
    expect(submitted.status).toBe('in-progress')

    await settled()
    expect((await runner.poll(submitted.jobId, TARGET)).status).toBe('success')
    expect(runner.outputOf(submitted.jobId)).toBe('a picture of a cat')
  })

  // Nothing was billed, and saying zero keeps a local run out of the usage report as a figure
  // rather than as a hole.
  it('prices a run on this machine at nothing', async () => {
    const submitted = await runnerWith().submit({ id: MODEL.id }, {})

    expect(submitted.cost).toBe(0)
  })

  it('stops a run it is asked to cancel, and files it as failed', async () => {
    const chat = vi.fn(
      (request: ChatRequest) =>
        new Promise<string>((_ok, no) => {
          request.signal?.addEventListener('abort', () => no(new Error('aborted')))
        }),
    )
    const runner = runnerWith({ chat })

    const submitted = await runner.submit({ id: MODEL.id }, {})
    await settled()
    await runner.cancel(submitted.jobId, TARGET)
    await settled()

    expect((await runner.poll(submitted.jobId, TARGET)).status).toBe('failure')
  })

  // A target this runner does not own reaching it is a routing defect, and answering `failure`
  // would hide the defect behind an ordinary-looking outcome.
  it('files a model it does not hold as a failure, and refuses a poll it never issued', async () => {
    const runner = runnerWith()

    expect((await runner.submit({ id: 'model_flux' }, {})).status).toBe('failure')
    await expect(runner.poll('local_nobody', TARGET)).rejects.toThrow(/this machine/)
  })

  // Which of the two runners owns a poll is read off the id, so it has to be readable as one.
  it('owns the jobs it issued and none of the others', async () => {
    const runner = runnerWith()
    const submitted = await runner.submit({ id: MODEL.id }, {})

    expect(runner.owns(submitted.jobId)).toBe(true)
    expect(runner.owns('job_from_the_cloud')).toBe(false)
  })
})

const IMAGE_MODEL = localModel({
  id: 'local_image',
  loader: 'diffusers',
  format: 'safetensors',
  modality: 'image',
})

describe('a model that produces something other than a sentence', () => {
  const imageRunner = (over: Partial<LocalJobDeps> = {}) =>
    runnerWith({ modelOf: id => (id === IMAGE_MODEL.id ? IMAGE_MODEL : null), ...over })

  /** An image is not a sentence, and calling `chat` for one answered an empty string. */
  it('is generated rather than conversed with', async () => {
    const conversed = vi.fn()
    const runner = imageRunner({ chat: conversed })

    const { jobId } = await runner.submit({ id: IMAGE_MODEL.id }, { prompt: 'a red cube' })
    await settled()

    expect(conversed).not.toHaveBeenCalled()
    // The prompt and the shelf travel WITH the file: the collector runs turns later, when the
    // body that carried them is gone.
    expect(runner.producedBy(jobId)).toEqual({
      path: '/tmp/out.png',
      device: 'mps',
      backend: 'pytorch',
      type: 'image',
      prompt: 'a red cube',
    })
  })

  it('is handed the prompt and the rest of the form', async () => {
    const generate = vi.fn(() =>
      Promise.resolve({ path: '/tmp/out.png', device: 'mps', backend: 'pytorch' }),
    )
    const runner = imageRunner({ generate })

    await runner.submit({ id: IMAGE_MODEL.id }, { prompt: 'a red cube', steps: 8 })
    await settled()

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'a red cube', fields: { prompt: 'a red cube', steps: 8 } }),
    )
  })

  /** A denoise counts its steps, where a sentence has no fraction of a whole to report. */
  it('reports the fraction the door pushed rather than a half', async () => {
    const runner = imageRunner({
      generate: request => {
        request.onProgress(0.75)
        return Promise.resolve({ path: '/tmp/out.png', device: 'mps', backend: 'pytorch' })
      },
    })

    const { jobId } = await runner.submit({ id: IMAGE_MODEL.id }, { prompt: 'x' })
    expect((await runner.poll(jobId, TARGET)).progress).toBe(0.75)
  })

  it('fails readably when nothing here generates for that model', async () => {
    const runner = imageRunner({
      generate: () => Promise.reject(new Error('nothing here generates with local_image')),
    })

    const { jobId } = await runner.submit({ id: IMAGE_MODEL.id }, { prompt: 'x' })
    await settled()

    expect((await runner.poll(jobId, TARGET)).status).toBe('failure')
    expect((await runner.poll(jobId, TARGET)).error).toBe('rejected')
    expect(runner.producedBy(jobId)).toBeNull()
  })

  it('names a missing engine so the jobs row can say to install it', async () => {
    const runner = imageRunner({
      generate: () => Promise.reject(new Error('loading local_image failed: engine-missing')),
    })

    const { jobId } = await runner.submit({ id: IMAGE_MODEL.id }, { prompt: 'x' })
    await settled()

    expect((await runner.poll(jobId, TARGET)).error).toBe('engine-missing')
  })

  it('names an incomplete model so the jobs row can say to reinstall', async () => {
    const runner = imageRunner({
      generate: () => Promise.reject(new Error('incomplete-model')),
    })

    const { jobId } = await runner.submit({ id: IMAGE_MODEL.id }, { prompt: 'x' })
    await settled()

    expect((await runner.poll(jobId, TARGET)).error).toBe('incomplete-model')
  })

  it('leaves a conversation producing nothing to file', async () => {
    const runner = runnerWith()
    const { jobId } = await runner.submit({ id: MODEL.id }, { prompt: 'hello' })
    await settled()

    expect(runner.producedBy(jobId)).toBeNull()
    expect(runner.outputOf(jobId)).toBe('a picture of a cat')
  })
})

describe('what a modality decides', () => {
  const generating = (modality: 'video' | 'mesh') => {
    const model = localModel({ id: 'local_one', loader: 'diffusers', modality })
    const generate = vi.fn(() =>
      Promise.resolve({ path: '/tmp/out', device: 'mps', backend: 'pytorch' }),
    )

    return { generate, runner: runnerWith({ generate, modelOf: () => model }) }
  }

  /** The door that answers and the extension the file lands under both follow from it. */
  it('hands the runtime the modality its manifest declares', async () => {
    const { generate, runner } = generating('video')

    await runner.submit({ id: MODEL.id }, { prompt: 'a wave' })
    await settled()

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ modality: 'video' }))
  })

  it('files what came back on the shelf that modality lands on', async () => {
    const { runner } = generating('mesh')

    const submitted = await runner.submit({ id: MODEL.id }, { prompt: 'a shark' })
    await settled()

    expect(runner.producedBy(submitted.jobId)?.type).toBe('mesh')
  })
})

describe('unavailable local model', () => {
  it('refuses a blocked distribution before invoking any runtime', async () => {
    const generate = vi.fn()
    const runner = runnerWith({
      modelOf: () => localModel({ modality: 'mesh', distributionStatus: 'blocked' }),
      generate,
    })
    const job = await runner.submit(TARGET, { prompt: 'walk' })
    await settled()
    expect((await runner.poll(job.jobId, TARGET)).status).toBe('failure')
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('generated motion collection', () => {
  it('files a motion model output as animation in the existing collector contract', async () => {
    const model = localModel({
      id: 'motion',
      loader: 'plugin',
      modality: 'motion',
      family: '3d',
      capabilities: ['motion'],
    })
    const runner = runnerWith({
      modelOf: () => model,
      generate: async () => ({ path: '/tmp/motion.glb', device: 'cpu', backend: 'pytorch' }),
    })
    const job = await runner.submit({ id: model.id }, { prompt: 'walk' })
    await settled()
    expect(runner.producedBy(job.jobId)).toMatchObject({
      type: 'animation',
      path: '/tmp/motion.glb',
    })
  })
})
