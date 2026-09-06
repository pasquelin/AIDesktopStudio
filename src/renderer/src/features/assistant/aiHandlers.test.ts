import { installFakeBridge } from '@/services/fakeBridge'
import { EMPTY_AI_OVERVIEW } from '@/services/fakeAiOverview'
import { ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction, runConfirmedAction } from './executor'

describe('local AI model assistant actions', () => {
  beforeEach(() => {
    installFakeBridge()
  })

  it('reads the local model overview and routes a named lifecycle operation through the bridge', async () => {
    const overview = { ...EMPTY_AI_OVERVIEW, projectPath: '/projects/demo' }
    const choose = vi.fn(async () => overview)
    const readEngine = vi.fn(async () => overview)
    installFakeBridge({ ai: { overview: async () => overview, choose, readEngine } })

    await expect(runAction('ai.localState', {})).resolves.toEqual({ ok: true, data: overview })
    const choice = {
      operation: 'choose',
      role: ASSISTANT_ROLE,
      localId: 'assistant-local',
      scope: 'project',
    }
    await expect(
      runConfirmedAction('ai.manageLocalRuntime', { operation: 'readEngine' }),
    ).resolves.toEqual({
      ok: true,
      data: overview,
    })
    await expect(runConfirmedAction('ai.manageLocalRuntime', choice)).resolves.toMatchObject({
      ok: false,
      refusal: 'noConfirmer',
    })

    expect(readEngine).toHaveBeenCalledWith(undefined)
    expect(choose).not.toHaveBeenCalled()
  })
})
