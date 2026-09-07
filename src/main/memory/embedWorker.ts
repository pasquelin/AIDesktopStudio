import { messageOf } from '@shared/guards'
import { createWorkerDispatch } from '@main/workerDispatch'
import { normalised } from './vectors'
import {
  isEmbedCancel,
  type EmbedCancel,
  type EmbedLoad,
  type EmbedRequest,
  type EmbedResponse,
  type EmbedTexts,
} from './embedProtocol'

/**
 * The embedder, in a process of its own — it opens the GPU and holds one model. Never throws out
 * of the loop: one that dies leaves the main process holding a promise nobody settles.
 */

type Engine = {
  documentPrefix: string
  queryPrefix: string
  embed: (text: string) => Promise<readonly number[]>
  dispose: () => Promise<void>
}

let engine: Engine | null = null

const reply = (response: EmbedResponse): void => {
  process.parentPort.postMessage(response)
}

/** 🛑 Imported here, not at the top: loading the addon opens the GPU, and this process is forked
 * before anyone has asked for a vector. */
async function open(request: EmbedLoad): Promise<Engine> {
  const { getLlama } = await import('node-llama-cpp')

  const llama = await getLlama()
  const model = await llama.loadModel({ modelPath: request.weights })
  // A CEILING, not a demand — `electronLlamaPort` spells the same reason: asking outright for
  // the window a manifest declares allocates a cache that fails on every turn.
  const context = await model.createEmbeddingContext({
    contextSize: { max: request.contextTokens },
  })

  return {
    documentPrefix: request.documentPrefix,
    queryPrefix: request.queryPrefix,
    embed: async text => (await context.getEmbeddingFor(text)).vector,
    dispose: async () => {
      await context.dispose()
      await model.dispose()
      await llama.dispose()
    },
  }
}

async function load(request: EmbedLoad): Promise<number> {
  // Whatever was held goes first: two models at once is what the addon cannot do, and the second
  // load fails rather than replacing the first.
  await forget()
  engine = await open(request)

  // The dimensions come from a real answer, never from the manifest: a manifest that said 768
  // where the weights give 384 would have every stored vector silently unusable.
  return (await engine.embed(request.documentPrefix)).length
}

/** One batch, in order: the context is one, so two of them inside it would share a sequence
 * built for one. */
async function embed(
  current: Engine,
  request: EmbedTexts,
  signal: AbortSignal,
): Promise<readonly Float32Array[]> {
  const prefix = request.asQuery ? current.queryPrefix : current.documentPrefix
  const vectors: Float32Array[] = []

  for (const text of request.texts) {
    // Read between texts — 9,7 ms each — so a batch stops without being waited out.
    if (signal.aborted) throw new Error('cancelled')
    // Normalised HERE, once: a comparison is then a dot product rather than two square roots
    // per candidate on every question asked.
    vectors.push(normalised(Float32Array.from(await current.embed(prefix + text))))
  }

  return vectors
}

async function forget(): Promise<void> {
  const held = engine
  engine = null
  try {
    await held?.dispose()
  } catch {
    // The weights are on their way out either way; a failed dispose must not stop the next load.
  }
}

async function answer(request: EmbedJob, signal: AbortSignal): Promise<unknown> {
  if (request.op === 'load') return await load(request)
  if (request.op === 'close') {
    await forget()
    return
  }

  const current = engine
  // Raised rather than answered empty: an empty batch reads as a model that found nothing to say.
  if (!current) throw new Error('no embedding model is loaded')

  return await embed(current, request, signal)
}

type EmbedJob = Exclude<EmbedRequest, EmbedCancel>

/**
 * 🛑 The shared loop, like the two other utility processes: it holds one `AbortController` per
 * run, so a cancel that arrives while `embed` is parked between texts still stops it. The hand
 * -rolled table this replaced had to keep an id until the RUN settled — a controller stays
 * aborted, so there is no such race left to describe.
 */
const dispatch = createWorkerDispatch<EmbedRequest, EmbedJob, EmbedResponse>({
  reply,
  isJob: (message): message is EmbedJob => !isEmbedCancel(message),
  run: async (job, signal): Promise<EmbedResponse> => ({
    id: job.id,
    ok: true,
    value: await answer(job, signal),
  }),
  failed: (id, error): EmbedResponse => ({ id, ok: false, error: messageOf(error) }),
})

process.parentPort.on('message', event => dispatch(event.data))
