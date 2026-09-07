import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NUDGE } from '@/features/assistant/components/Assistant/Conversation/conversation'
import type {
  ActionName,
  ActionOutcome,
  AssistantAnswer,
  AssistantCall,
  AssistantThought,
} from '@shared/domain/assistant'
import { installFakeBridge } from '@/services/fakeBridge'
import { useSettings } from './settings'
import { useAssistant } from './assistant'

/** The ceiling a case is about, without waiting for twelve rounds to reach it. */
function chainCeiling(steps: number): void {
  useSettings.setState(state => ({
    settings: { ...state.settings, assistant: { ...state.settings.assistant, steps } },
  }))
}

/**
 * The executor stands in: what each action does to the studio is its own suite's business, and
 * this one is about the order they run in and what the modal is told afterwards.
 */
const runConfirmedAction = vi.hoisted(() =>
  vi.fn<(name: ActionName, input: Record<string, unknown>) => Promise<ActionOutcome>>(),
)
vi.mock('@/features/assistant/executor', () => ({ runConfirmedAction }))

const answer = (fields: Partial<AssistantAnswer> = {}): AssistantAnswer => ({
  say: 'J’ouvre un fichier 3D.',
  calls: [],
  cost: 0.75,
  ...fields,
})

/** The bridge, with the one channel this store speaks on. Returns what the main process saw. */
function brain(...replies: AssistantAnswer[]): { asked: AssistantThought[] } {
  const asked: AssistantThought[] = []
  let turn = 0

  installFakeBridge({
    assistant: {
      think: (request: AssistantThought) => {
        asked.push(request)
        return Promise.resolve(replies[turn++] ?? answer())
      },
    },
  })

  return { asked }
}

beforeEach(() => {
  runConfirmedAction.mockReset()
  runConfirmedAction.mockResolvedValue({ ok: true })
  chainCeiling(12)
  useAssistant.setState({
    turns: [],
    busy: false,
    round: 0,
    stopping: false,
    asked: null,
    spent: 0,
    draft: '',
    staged: 0,
    streamed: '',
    promptTokens: 0,
    replyTokens: 0,
    windowTokens: 0,
  })
})

describe('a call that sets a named state, asked for twice', () => {
  /**
   * The measured loop: `panel.open {panel:'projects'}` on three of four billed rounds, the same
   * sentence under each. Refused on the second round rather than run, and the executor never
   * sees it.
   */
  it('runs it once across the rounds of one turn', async () => {
    const call: AssistantCall = { action: 'panel.open', input: { panel: 'projects' } }
    brain(answer({ calls: [call] }), answer({ calls: [call] }), answer())
    chainCeiling(3)

    await useAssistant.getState().say('ouvre un projet récent')

    expect(runConfirmedAction).toHaveBeenCalledTimes(1)
    expect(useAssistant.getState().turns[0]?.steps.map(one => one.refusal)).toEqual([
      null,
      'badInput',
    ])
  })

  /** Reading is what the refusal must never reach — a plan watches its own generation. */
  it('leaves a reading action callable on every round', async () => {
    const call: AssistantCall = { action: 'jobs.list', input: {} }
    brain(answer({ calls: [call] }), answer({ calls: [call] }), answer())
    chainCeiling(3)

    await useAssistant.getState().say('où en sont mes générations')

    expect(runConfirmedAction).toHaveBeenCalledTimes(2)
  })

  /** The plan a naive guard would have cut: arm one layer, act, arm another, come back. */
  it('lets one turn come back to a state it set before another', async () => {
    const arm = (layerId: string): AssistantCall => ({ action: 'layer.select', input: { layerId } })
    brain(
      answer({
        calls: [
          arm('a'),
          { action: 'layer.setOpacityBlendAndVisibility', input: {} },
          arm('b'),
          arm('a'),
        ],
      }),
      answer(),
    )
    chainCeiling(2)

    await useAssistant.getState().say('stylise le premier calque, puis reviens dessus')

    expect(runConfirmedAction).toHaveBeenCalledTimes(4)
  })

  /** The second turn is a second intention, and the studio may have been left elsewhere since. */
  it('lets the next turn set it again', async () => {
    const call: AssistantCall = { action: 'panel.open', input: { panel: 'projects' } }
    brain(answer({ calls: [call] }), answer(), answer({ calls: [call] }), answer())
    chainCeiling(2)

    await useAssistant.getState().say('ouvre le panneau des projets')
    await useAssistant.getState().say('remets-le devant')

    expect(runConfirmedAction).toHaveBeenCalledTimes(2)
  })
})

describe('an opening answer that neither calls nor asks', () => {
  it('is sent back once with the nudge, and the second answer stands', async () => {
    const { asked } = brain(
      answer({ say: 'La scène a déjà une lumière directionnelle.' }),
      answer({ say: 'Vérifié.' }),
    )

    await useAssistant.getState().say('ajoute une lumière directionnelle')

    expect(asked).toHaveLength(2)
    expect(asked[1]?.history.join('\n')).toContain(NUDGE)
    expect(useAssistant.getState().turns[0]?.lost).toBe(false)
  })
})
