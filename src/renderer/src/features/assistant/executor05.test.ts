import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import { ACTION_REGISTRY } from '@shared/domain/assistant'
import type { ModelSummary } from '@shared/domain/model'
import { SCENE_TEMPLATE_IDS } from '@shared/domain/sceneTemplate'
import { describe, expect, it } from 'vitest'
import { runAction } from './executor'

const aModel = (id: string, name: string): ModelSummary => ({
  id,
  name,
  family: '3d',
  runsOn: SCENARIO_CLOUD,
  source: 'scenario',
  origin: 'official',
  featured: false,
  capabilities: [],
  tags: [],
})

/** What the batterie of 2026-09-06 (Codex by MCP) found a client could not act on. */
describe('what a client outside the window is told', () => {
  // Measured 2026-09-06, Codex by MCP: with no Scenario account the search THREW and the model
  // read `failed: missing`. What needs no account is still listed; nothing at all is a refusal
  // that names the repair.
  it('refuses with what to do when the cloud catalogue answered nothing for want of an account', async () => {
    installFakeBridge({
      provider: {
        searchModels: () => Promise.resolve({ items: [], cursor: null, refused: 'missing' }),
      },
    })

    const outcome = await runAction('models.search', { query: 'knight', family: '3d' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'notFound' })
    expect(outcome.ok ? '' : outcome.detail).toContain('accounts.list')
  })
  it('lists what needs no account when the cloud half is missing', async () => {
    installFakeBridge({
      provider: {
        searchModels: () =>
          Promise.resolve({
            items: [aModel('ssd-1b', 'SSD-1B')],
            cursor: null,
            refused: 'missing',
          }),
      },
    })

    const outcome = await runAction('models.search', { family: '3d' })

    expect(outcome).toEqual({ ok: true, data: [{ id: 'ssd-1b', name: 'SSD-1B', family: '3d' }] })
  })
  it('says of a local model that its engine cannot serve, rather than listing it as any other', async () => {
    installFakeBridge({
      provider: {
        searchModels: () =>
          Promise.resolve({
            items: [{ ...aModel('ssd-1b', 'SSD-1B'), unavailable: 'engine-missing' }],
            cursor: null,
          }),
      },
    })

    const outcome = await runAction('models.search', { family: '3d' })

    expect(outcome).toEqual({
      ok: true,
      data: [{ id: 'ssd-1b', name: 'SSD-1B', family: '3d', unavailable: 'engine-missing' }],
    })
  })
  // Refused as « no surface » at start-up, a client asking what it was talking to learnt nothing
  // (Codex by MCP, 2026-09-06).
  it('describes the studio itself when no scene is in front', async () => {
    useDocuments.setState({ documents: {}, stored: [], activeId: null })

    const outcome = await runAction('studio.describe', {})

    expect(outcome.ok && outcome.data).toMatchObject({
      workspaces: expect.arrayContaining(['3d', 'image']),
      documents: [],
    })
  })
  // A client not told `empty` existed emptied a new scene by hand, five objects (Codex by MCP,
  // 2026-09-06): the field publishes what it takes, like every other closed field.
  it('publishes the templates a new scene may open on', () => {
    const field = ACTION_REGISTRY.find(one => one.name === 'workspace.open')?.fields.find(
      one => one.key === 'template',
    )

    expect(field?.options).toEqual(SCENE_TEMPLATE_IDS)
  })
})
