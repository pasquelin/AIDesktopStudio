import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ActionOutcome, AssistantCall } from '@shared/domain/assistant'
import { mcpUrl } from './endpoint'
import { startMcp, type RunningMcp } from './server'
import { mcpTools } from './tools'

/**
 * The 233 tools, exercised BY A CLIENT rather than read from the module that builds them.
 *
 * The gap this closes, measured on 2026-08-26: `runConfirmedAction` was driven 233 times by the
 * bench and `tools/call` not once. Every action was proven; nothing proved that what carries it
 * is a protocol a client can speak. A tool whose schema a client refuses to parse, a name that no
 * longer finds its action back, a `required` naming a parameter nobody declares — all three leave
 * the typecheck, the lint and the suite green.
 *
 * Driven by the SDK's own `Client`, which is the point: its schemas are what every client on the
 * machine validates the answer against, so this asserts the contract rather than our reading of it.
 */

let running: RunningMcp | null = null
let connected: Client | null = null

afterEach(async () => {
  await connected?.close()
  connected = null
  await running?.close()
  running = null
})

async function clientTalkingTo(
  run: (call: AssistantCall) => Promise<ActionOutcome> = () => Promise.resolve({ ok: true }),
): Promise<Client> {
  running = await startMcp({ run, version: '1.2.3' })

  const client = new Client({ name: 'a client', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(mcpUrl(running)), {
      requestInit: { headers: { authorization: `Bearer ${running.token}` } },
    }),
  )
  connected = client
  return client
}

describe('the wire, spoken by a real client', () => {
  /**
   * The whole catalogue through the SDK's `ListToolsResultSchema`. A tool this repository can
   * build and a client cannot parse is one that never reaches anybody.
   */
  it('lists every tool the studio publishes, and the client parses all of them', async () => {
    const client = await clientTalkingTo()

    const listed = (await client.listTools()).tools

    expect(listed.map(tool => tool.name).sort()).toEqual(
      mcpTools()
        .map(tool => tool.name)
        .sort(),
    )
  })

  /**
   * What a client builds a call FROM. Read off the wire rather than off `mcpTools()`: what
   * crosses is JSON, and a schema that survives serialisation is the only one that counts.
   */
  it('gives every tool a schema a call can be built from', async () => {
    const client = await clientTalkingTo()

    const wrong = (await client.listTools()).tools.flatMap(tool => {
      const properties = tool.inputSchema.properties ?? {}
      const required: unknown = tool.inputSchema.required ?? []
      const undeclared = Array.isArray(required)
        ? required.filter(key => typeof key !== 'string' || !(key in properties))
        : ['required is not a list']

      return [
        ...(tool.inputSchema.type === 'object' ? [] : [`${tool.name}: not an object schema`]),
        ...(tool.description === undefined || tool.description === ''
          ? [`${tool.name}: no description`]
          : []),
        ...undeclared.map(key => `${tool.name}: requires ${String(key)}, which it never declares`),
      ]
    })

    expect(wrong).toEqual([])
  })

  /** A call, end to end: named by a client, run by the window, answered on the wire. */
  it('runs a call the client names, and hands back what the window answered', async () => {
    const run = vi.fn<(call: AssistantCall) => Promise<ActionOutcome>>(() =>
      Promise.resolve({ ok: true, data: { opened: '3d' } }),
    )
    const client = await clientTalkingTo(run)

    const answered = await client.callTool({
      name: 'workspace_open',
      arguments: { workspace: '3d' },
    })

    expect(run).toHaveBeenCalledWith({ action: 'workspace.open', input: { workspace: '3d' } })
    expect(answered.content).toEqual([{ type: 'text', text: '{"opened":"3d"}' }])
  })

  /**
   * 🛑 No `tools/call` of this repo had ever carried an ARRAY: the two that existed passed
   * `{workspace:'3d'}` and `{}`. A `repeated` field emits `{type:'array', items:{type:'string'}}`,
   * a serialisation path the SDK's `Client` had never validated here.
   */
  it('carries a repeated field across as the list the window reads', async () => {
    const run = vi.fn<(call: AssistantCall) => Promise<ActionOutcome>>(() =>
      Promise.resolve({ ok: true }),
    )
    const client = await clientTalkingTo(run)

    await client.callTool({
      name: 'canvas_drawPixels',
      arguments: { shape: 'points', cells: ['3,4', '3,5'], color: '#ff0000' },
    })

    expect(run).toHaveBeenCalledWith({
      action: 'canvas.drawPixels',
      input: { shape: 'points', cells: ['3,4', '3,5'], color: '#ff0000' },
    })
  })

  /**
   * A refusal reaches the client AS an error. Answered `ok` with a sentence in it, a client reads
   * "it ran" and moves on to the next step of a plan that has already gone wrong.
   */
  it('marks a refused call as an error the client can see', async () => {
    const client = await clientTalkingTo(() => Promise.resolve({ ok: false, refusal: 'declined' }))

    const answered = await client.callTool({ name: 'generator_submit', arguments: {} })

    expect(answered.isError).toBe(true)
    expect(answered.content).toEqual([{ type: 'text', text: 'You turned that action down.' }])
  })
})
