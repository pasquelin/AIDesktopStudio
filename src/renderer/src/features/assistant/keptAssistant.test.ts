import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiOverview, roleRow } from '@shared/domain/aiOverview-fixtures'
import { ASSISTANT_ROLE, type RoleProvider } from '@shared/domain/aiRole'
import type { AskedQuestion } from '@shared/domain/assistantAsk'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAiModels } from '@/stores/aiModels'
import { askKeptAssistant } from './keptAssistant'
import { registerStudioAsk } from './studioAsk'

const DEEPSEEK: RoleProvider = { kind: 'cloud', providerId: 'deepseek' }

const overviewWith = (chosen: { app: boolean; project: boolean }) =>
  aiOverview({
    projectPath: '/projets/en cours',
    roles: [
      roleRow({
        role: ASSISTANT_ROLE,
        provider: DEEPSEEK,
        clouds: ['deepseek'],
        chosen: { app: chosen.app ? DEEPSEEK : null, project: chosen.project ? DEEPSEEK : null },
      }),
    ],
  })

/** Answers the card with the first entry it was offered, as ticking the top row would. */
const answering = () => {
  const asked = vi.fn(async (questions: readonly AskedQuestion[]) => [
    { answers: [questions[0]?.choices[0] ?? ''] },
  ])
  dropped.push(registerStudioAsk(asked))
  return asked
}

const dropped: (() => void)[] = []

describe('the assistant a new project keeps', () => {
  beforeEach(() => {
    for (const drop of dropped.splice(0)) drop()
    useAiModels.setState({ overview: null })
  })

  /**
   * 🛑 Measured 2026-09-09: created from a project holding its own choice, the next project opened
   * with `provider: null` — the choice belonged to the project left behind.
   */
  it('asks before the switch, and writes the answer at the application', async () => {
    const choose = vi.fn(async () => overviewWith({ app: true, project: false }))
    installFakeBridge({ ai: { choose } })
    useAiModels.setState({ overview: overviewWith({ app: false, project: true }) })
    const asked = answering()

    await (
      await askKeptAssistant()
    )?.()

    expect(asked).toHaveBeenCalledOnce()
    expect(choose).toHaveBeenCalledWith(ASSISTANT_ROLE, DEEPSEEK, 'app')
  })

  // Nothing to lose: a choice written at the application already follows every project.
  it('asks nothing when the choice already follows the application', async () => {
    installFakeBridge({})
    useAiModels.setState({ overview: overviewWith({ app: true, project: false }) })
    const asked = answering()

    await askKeptAssistant()

    expect(asked).not.toHaveBeenCalled()
  })

  // Declining is an answer: the project is made, and the assistant is set later or not at all.
  it('writes nothing when the card is let go', async () => {
    const choose = vi.fn(async () => overviewWith({ app: false, project: true }))
    installFakeBridge({ ai: { choose } })
    useAiModels.setState({ overview: overviewWith({ app: false, project: true }) })
    dropped.push(registerStudioAsk(async () => null))

    expect(await askKeptAssistant()).toBeNull()
    expect(choose).not.toHaveBeenCalled()
  })
})
