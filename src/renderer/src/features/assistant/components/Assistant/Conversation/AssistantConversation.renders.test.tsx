import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAssistant } from '@/stores/assistant'
import { useMissions } from '@/stores/missions'
import type { StudioEvent } from '@shared/domain/studioEvent'
import type { AssistantTurn } from './conversation'
import type * as ConversationStyles from './conversationStyles'
import { AssistantConversation } from './AssistantConversation'

/**
 * Counted from INSIDE a turn's body, through the class it wears. A probe COMPONENT would sit
 * above the memo boundary and report the same figure before and after — a harness proving nothing.
 */
const painted = vi.hoisted(() => ({ bubbles: 0, panels: 0 }))

vi.mock('./conversationStyles', async importOriginal => {
  const real = await importOriginal<typeof ConversationStyles>()
  return {
    ...real,
    get CONVERSATION_BUBBLE() {
      painted.bubbles += 1
      return real.CONVERSATION_BUBBLE
    },
    /** Read by the panel's own body, and by nothing else: this counts the HOST's renders. */
    get CONVERSATION_CARD() {
      painted.panels += 1
      return real.CONVERSATION_CARD
    },
  }
})

/** A conversation long enough for its cost to be the point. */
const TURNS = 40
/** What a stream writes in a second: `noteProgress` runs once per frame — see `thoughtStream`. */
const FRAMES = 60
const TYPED = 'ouvre le voilier'

const thread = (count: number): AssistantTurn[] =>
  Array.from({ length: count }, (_, at) => ({
    id: at + 1,
    said: `demande ${at + 1}`,
    answered: '',
    steps: [],
    asks: [],
    lost: false,
  }))

beforeEach(() => {
  painted.bubbles = 0
  painted.panels = 0
  installFakeBridge()
  useAssistant.setState({
    turns: thread(TURNS),
    busy: false,
    round: 1,
    stopping: false,
    streamed: '',
    promptTokens: 0,
    replyTokens: 0,
    draft: '',
    asked: null,
    choosing: null,
  })
  useMissions.setState({ missions: [], events: [] })
})

describe('what a long conversation costs while the model writes', () => {
  it('shows mission work before any conversation turn exists', () => {
    const event: StudioEvent = {
      id: 'mission_live',
      at: '2026-09-04T10:00:00.000Z',
      state: 'waiting',
      category: 'mission',
      type: 'mission.waiting_job',
      priority: 'normal',
      missionId: 'mission_1',
      messageKey: 'activity.missionStateChanged',
      params: { label: 'Build a boat' },
    }
    useAssistant.setState({ turns: [] })
    useMissions.setState({ events: [event] })

    render(<AssistantConversation />)

    expect(screen.getByText(/Mission en attente|Mission waiting/)).toBeInTheDocument()
  })
  /** Without this the counts below would pass on a mock whose path no longer resolves. */
  it('paints one bubble per turn on the first render', () => {
    render(<AssistantConversation />)

    expect(painted.bubbles).toBe(TURNS)
  })

  /**
   * `noteProgress` writes the streamed tail and the two counts, never the turns: a thread of
   * forty was rebuilt forty times a frame for a word it does not show.
   */
  it('renders no turn again over a second of streaming', () => {
    useAssistant.setState({ busy: true })
    render(<AssistantConversation />)
    painted.bubbles = 0

    // One `act` per frame rather than one for the batch: a batch is a single commit, and would
    // hide sixty wake-ups behind one.
    for (let frame = 0; frame < FRAMES; frame += 1) {
      act(() => useAssistant.getState().noteProgress({ delta: 'x', replyTokens: frame }))
    }

    expect(painted.bubbles).toBe(0)
  })

  /**
   * The tail of a stream and the counts beside it belong to the line that shows them: read by the
   * panel, they rebuilt the whole thread's host — its list, its composer and its picker — once a
   * frame, for a leaf three lines long.
   */
  it('renders the panel itself no more than once over a second of streaming', () => {
    useAssistant.setState({ busy: true })
    render(<AssistantConversation />)
    painted.panels = 0

    for (let frame = 0; frame < FRAMES; frame += 1) {
      act(() => useAssistant.getState().noteProgress({ delta: 'x', replyTokens: frame }))
    }

    expect(painted.panels).toBe(0)
  })

  it('renders no turn again for a sentence typed into the composer', async () => {
    render(<AssistantConversation />)
    painted.bubbles = 0

    await userEvent.type(screen.getByRole('textbox'), TYPED)

    expect(painted.bubbles).toBe(0)
  })

  /** What the memo must not swallow: the turn an answer lands in is the one that changed. */
  it('renders again the one turn an answer was written into', () => {
    render(<AssistantConversation />)
    painted.bubbles = 0

    act(() =>
      useAssistant.setState(state => ({
        turns: state.turns.map(turn => (turn.id === 1 ? { ...turn, answered: 'Voilà.' } : turn)),
      })),
    )

    expect(painted.bubbles).toBe(1)
  })
})
