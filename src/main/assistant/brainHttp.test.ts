import { describe, expect, it, vi } from 'vitest'
import type { HttpChat } from '@shared/domain/aiCloud'
import type { AssistantThought } from '@shared/domain/assistant'
import { createHttpChatBrain } from './brainHttp'

const thought: AssistantThought = { utterance: 'hello', history: [] }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A `text/event-stream`, chunked wherever a real one would chunk. */
function streamResponse(chunks: readonly string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

/**
 * 🛑 A cloud streams only when somebody is watching, and the three doors ask for it in three
 * different places: a field of the body for two of them, and the METHOD for Gemini.
 */
describe('a cloud that is being watched', () => {
  const watched = (kind: 'openai' | 'anthropic' | 'gemini', chunks: readonly string[]) => {
    const seen: string[] = []
    const post = vi.fn(async (_url: string, _init?: RequestInit) => streamResponse(chunks))
    const chats: Record<typeof kind, HttpChat> = {
      openai: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      anthropic: { kind: 'anthropic', model: 'a-model' },
      gemini: { kind: 'gemini', model: 'a-model' },
    }

    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: chats[kind],
      model: () => 'a-model',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    return { brain, post, seen, watch: (delta: string) => seen.push(delta) }
  }

  it('assembles an OpenAI stream and reports what it cost', async () => {
    const counts: { promptTokens?: number; replyTokens?: number }[] = []
    const { brain, post, seen, watch } = watched('openai', [
      'data: {"choices":[{"delta":{"content":"{\\"say\\":\\"h"}}]}\n',
      'data: {"choices":[{"delta":{"content":"i\\",\\"calls\\":[]}"}}]}\n',
      'data: {"choices":[],"usage":{"prompt_tokens":2366,"completion_tokens":18}}\ndata: [DONE]\n',
    ])

    const answer = await brain.think(thought, {
      onProgress: progress => {
        watch(progress.delta)
        counts.push(progress)
      },
    })

    expect(answer.say).toBe('hi')
    expect(seen.join('')).toBe('{"say":"hi","calls":[]}')
    expect(counts.at(-1)).toMatchObject({ promptTokens: 2366, replyTokens: 18 })
    expect(String(post.mock.calls[0]?.[1]?.body)).toContain('"include_usage":true')
  })

  /** The counts arrive in TWO frames on this door: the prompt's at the start, the answer's at the end. */
  it('assembles an Anthropic stream, whose counts come in two frames', async () => {
    const counts: { promptTokens?: number; replyTokens?: number }[] = []
    const { brain } = watched('anthropic', [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":2366}}}\n',
      'data: {"type":"content_block_delta","delta":{"text":"{\\"say\\":\\"hi\\",\\"calls\\":[]}"}}\n',
      'data: {"type":"message_delta","usage":{"output_tokens":18}}\n',
    ])

    const answer = await brain.think(thought, { onProgress: progress => counts.push(progress) })

    expect(answer.say).toBe('hi')
    expect(counts.map(one => one.promptTokens).filter(Boolean)).toEqual([2366])
    expect(counts.map(one => one.replyTokens).filter(Boolean)).toEqual([18])
  })

  /**
   * 🛑 The composer shows the count ALONE for these doors, as it does for Scenario's: both
   * figures this file holds are ASSUMPTIONS about a model typed by hand, and reported as a window
   * they read as measured — `2 067 / 4 096` was shown for DeepSeek, whose own window is far
   * larger, off a number that only ever budgeted the briefing.
   */
  it('names no window for a cloud, whose window nothing here knows', async () => {
    const counts: { windowTokens?: number }[] = []
    const { brain } = watched('anthropic', [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":2366}}}\n',
      'data: {"type":"content_block_delta","delta":{"text":"{\\"say\\":\\"hi\\",\\"calls\\":[]}"}}\n',
    ])

    await brain.think(thought, { onProgress: progress => counts.push(progress) })

    expect(counts.filter(one => one.windowTokens !== undefined)).toEqual([])
  })

  /**
   * 🛑 The same refusal, said BEFORE a turn: the composer asks every door for its bound so it can
   * show one with nothing typed, and a figure invented here would be shown for the whole session
   * rather than for one turn.
   */
  it('names no window when asked for one outright', async () => {
    const { brain } = watched('anthropic', [])

    expect(await brain.window()).toBeNull()
  })

  it('asks Gemini by the streaming METHOD, which is not a field of its body', async () => {
    const { brain, post } = watched('gemini', [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"say\\":\\"hi\\",\\"calls\\":[]}"}]}}]}\n',
    ])

    await brain.think(thought, { onProgress: () => {} })

    expect(post.mock.calls[0]?.[0]).toContain(':streamGenerateContent')
    expect(post.mock.calls[0]?.[0]).toContain('alt=sse')
  })

  // 🛑 A gateway is free to ignore `stream: true`: read as a stream, a whole body yields no
  // `data:` line at all, and the turn failed on an answer that parses fine.
  it('reads a whole body from a door that ignored the stream it was asked for', async () => {
    const post = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: '{"say":"hi","calls":[]}' } }] }),
    )
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      model: () => 'gpt-4o-mini',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    const answer = await brain.think(thought, { onProgress: () => {} })

    expect(answer.say).toBe('hi')
  })

  // Watched by nobody, the door answers whole — the path every other case here exercises.
  it('does not ask for a stream when nobody is watching', async () => {
    const post = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: '{"say":"hi","calls":[]}' } }] }),
    )
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      model: () => 'gpt-4o-mini',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    await brain.think(thought)

    expect(String(post.mock.calls[0]?.[1]?.body)).not.toContain('"stream"')
  })
})

describe('createHttpChatBrain', () => {
  it('refuses to think when no key is held', async () => {
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      model: () => 'gpt-4o-mini',
      credentials: () => null,
      fetch: vi.fn(),
    })

    await expect(brain.think(thought)).rejects.toThrow(/no key/)
  })

  it('reads the assistant text out of an OpenAI-shaped answer', async () => {
    const post = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '{"say":"hi","calls":[]}' } }],
      }),
    )
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      model: () => 'gpt-4o-mini',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    const answer = await brain.think(thought)

    expect(answer.say).toBe('hi')
    expect(answer.cost).toBe(0)
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer sk-test' }),
      }),
    )
  })

  /**
   * Defect 1 and defect 3 in one turn, and the reason they were one fix: this door was held to
   * Scenario's ten thousand characters, so a nine-thousand-character paste came out cut to four
   * and the catalogue could never grow past eleven actions.
   */
  it('shows a chat cloud every name, and sends the sentence uncut', async () => {
    let sent = ''
    const post = vi.fn(async (_url: string, init?: RequestInit) => {
      sent = String(init?.body)
      return jsonResponse({ choices: [{ message: { content: '{"say":"ok","calls":[]}' } }] })
    })
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
      model: () => 'deepseek-chat',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    await brain.think({ utterance: 'x'.repeat(9_000), history: [] })

    const body: unknown = JSON.parse(sent)
    const messages = (body as { messages: { content: string }[] }).messages
    expect(messages[0]?.content).toContain('git.checkout')
    expect(messages[1]?.content).toContain('x'.repeat(9_000))
  })

  /**
   * The room a cloud holds is an ASSUMPTION — the model is typed by hand. What degrades is one
   * round trip and the wide rules, never the names: a briefing without them is a blind model.
   */
  it('asks again with fewer rules when the cloud refused the first briefing', async () => {
    const sent: string[] = []
    let first = true
    const post = vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(String(init?.body))
      if (first) {
        first = false
        return jsonResponse({ error: { message: 'context length exceeded' } }, 400)
      }
      return jsonResponse({ choices: [{ message: { content: '{"say":"ok","calls":[]}' } }] })
    })
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'tiny' },
      model: () => 'tiny',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    await expect(brain.think(thought)).resolves.toMatchObject({ say: 'ok' })
    expect(sent[0]).toContain('List the folders YOURSELF')
    expect(sent[1]).not.toContain('List the folders YOURSELF')
    expect(sent[1]).toContain('git.checkout')
  })

  /**
   * 🛑 The half a room-based memory cannot hold: the names fit every door, so a briefing composed
   * on room alone would hand this door the wide rules again on the very next sentence — and it
   * would refuse them again, one billed round trip per turn, for ever.
   */
  it('asks short from the start once it has refused a briefing', async () => {
    const sent: string[] = []
    let first = true
    const post = vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(String(init?.body))
      if (first) {
        first = false
        return jsonResponse({ error: { message: 'context length exceeded' } }, 400)
      }
      return jsonResponse({ choices: [{ message: { content: '{"say":"ok","calls":[]}' } }] })
    })
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'tiny' },
      model: () => 'tiny',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    await brain.think(thought)
    await brain.think(thought)

    expect(sent).toHaveLength(3)
    expect(sent[2]).not.toContain('List the folders YOURSELF')
  })

  /**
   * 🛑 A quota is not a size. Narrowing on any error at all fired a SECOND request straight into
   * a rate limit, and answered from the eleven-action short list on a transient 500 — with
   * nothing on screen to say the assistant's vocabulary had shrunk for that turn.
   */
  it('does not narrow on a refusal that says nothing about the size', async () => {
    const post = vi.fn(async () => jsonResponse({ error: { message: 'rate limited' } }, 429))
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
      model: () => 'deepseek-chat',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    await expect(brain.think(thought)).rejects.toThrow(/rate limited/)
    expect(post).toHaveBeenCalledOnce()
  })

  it('folds prior turns into one user message, which Anthropic requires', async () => {
    let sent = ''
    const post = vi.fn(async (_url: string, init?: RequestInit) => {
      sent = String(init?.body)
      return jsonResponse({
        choices: [{ message: { content: '{"say":"ok","calls":[]}' } }],
      })
    })
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      model: () => 'gpt-4o-mini',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })

    await brain.think({ utterance: 'now', history: ['yesterday'] })

    expect(sent).toContain('yesterday')
    expect(sent).toContain('now')
    expect(sent.split('"role":"user"').length - 1).toBe(1)
  })

  it('reads Anthropic content blocks', async () => {
    const post = vi.fn(async () =>
      jsonResponse({ content: [{ type: 'text', text: '{"say":"ok","calls":[]}' }] }),
    )
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'anthropic', model: 'claude-sonnet-4-5' },
      model: () => 'claude-sonnet-4-5',
      credentials: () => ({ key: 'ant-key', secret: '' }),
      fetch: post,
    })

    expect((await brain.think(thought)).say).toBe('ok')
    expect(post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'ant-key' }),
      }),
    )
  })

  it('reads Gemini candidates', async () => {
    const post = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"say":"yo","calls":[]}' }] } }],
      }),
    )
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'gemini', model: 'gemini-2.0-flash' },
      model: () => 'gemini-2.0-flash',
      credentials: () => ({ key: 'gem-key', secret: '' }),
      fetch: post,
    })

    expect((await brain.think(thought)).say).toBe('yo')
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.0-flash'),
      expect.anything(),
    )
    expect(post).toHaveBeenCalledWith(expect.stringContaining('key=gem-key'), expect.anything())
  })
  it('asks the model the settings name, read again on each turn', async () => {
    const sent: string[] = []
    const post = vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(String(init?.body))
      return jsonResponse({ choices: [{ message: { content: '{"say":"ok","calls":[]}' } }] })
    })
    let chosen = 'deepseek-chat'
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
      model: () => chosen,
      credentials: () => ({ key: 'ds-key', secret: '' }),
      fetch: post,
    })

    await brain.think(thought)
    chosen = 'deepseek-reasoner'
    await brain.think(thought)

    expect(sent[0]).toContain('"model":"deepseek-chat"')
    expect(sent[1]).toContain('"model":"deepseek-reasoner"')
  })
  /** The model is typed by hand now: a `#` in it truncated the URL and took `?key=` with it. */
  it('encodes the model name it puts in the Gemini path', async () => {
    const post = vi.fn(async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: '{"say":"ok","calls":[]}' }] } }] }),
    )
    const brain = createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'gemini', model: 'gemini-2.0-flash' },
      model: () => 'models/one#two',
      credentials: () => ({ key: 'gem-key', secret: '' }),
      fetch: post,
    })

    await brain.think(thought)

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('models%2Fone%23two:generateContent'),
      expect.anything(),
    )
    expect(post).toHaveBeenCalledWith(expect.stringContaining('key=gem-key'), expect.anything())
  })
})

/**
 * A mission on the OpenAI wire is handed its manuals as native tools, and what the cloud CALLS
 * comes back as calls of the catalogue — the name written by hand was the name invented.
 */
describe('a mission on a door that speaks tools', () => {
  const deepseek = () =>
    createHttpChatBrain({
      cloud: 'deepseek',
      chat: { kind: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
      model: () => 'deepseek-chat',
      credentials: () => ({ key: 'sk-test', secret: '' }),
      fetch: post,
    })
  let sent: Record<string, unknown> = {}
  const post = vi.fn(async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>
    return jsonResponse({
      choices: [
        {
          message: {
            content: '{"say":"Adding a cube.","ask":null}',
            tool_calls: [{ function: { name: 'node_add', arguments: '{"kind":"cube"}' } }],
          },
        },
      ],
    })
  })

  it('folds what the cloud called into calls of the catalogue, without a consent field', async () => {
    const answer = await deepseek().think({
      utterance: 'add a cube',
      history: [],
      mission: true,
      candidates: ['node.add', 'generator.submit'],
    })

    expect(answer.say).toBe('Adding a cube.')
    expect(answer.calls).toEqual([{ action: 'node.add', input: { kind: 'cube' } }])
    const tools = sent['tools'] as {
      function: { name: string; parameters: { properties: object } }
    }[]
    expect(tools.map(tool => tool.function.name)).toEqual(['node_add', 'generator_submit'])
    expect(tools[1]?.function.parameters.properties).not.toHaveProperty('consent')
    expect(JSON.stringify(sent['messages'])).not.toContain('a list of actions to run')
  })

  it('sends no tools to a watched turn, whose stream reads text frames alone', async () => {
    post.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>
      return jsonResponse({ choices: [{ message: { content: '{"say":"hi","calls":[]}' } }] })
    })

    await deepseek().think(
      { utterance: 'add a cube', history: [], mission: true, candidates: ['node.add'] },
      { onProgress: () => undefined },
    )

    expect(sent).not.toHaveProperty('tools')
    expect(JSON.stringify(sent['messages'])).toContain('a list of actions to run')
  })
})
