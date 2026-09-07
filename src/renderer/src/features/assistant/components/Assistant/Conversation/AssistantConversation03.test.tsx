import { mountedDictationTarget } from '@/features/dictation/destination'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAiModels } from '@/stores/aiModels'
import { useAssistant } from '@/stores/assistant'
import { useDictation } from '@/stores/dictation'
import { useLayouts } from '@/stores/layouts'
import { useSettings } from '@/stores/settings'
import { aiOverview, roleRow } from '@shared/domain/aiOverview-fixtures'
import { ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { focusChat } from '../../../chatPanel'
import { AssistantConversation } from './AssistantConversation'

const say = vi.hoisted(() => vi.fn<(utterance: string) => Promise<void>>())
const stop = vi.hoisted(() => vi.fn())

beforeEach(() => {
  say.mockReset()
  say.mockResolvedValue(undefined)
  stop.mockReset()
  useAssistant.setState({
    turns: [],
    busy: false,
    round: 0,
    stopping: false,
    asked: null,
    spent: 0,
    draft: '',
    door: undefined,
    say,
    stop,
  })
  useSettings.setState({ settings: DEFAULT_SETTINGS })
  useDictation.setState({ partial: '', state: 'idle' })
  // 🛑 `home` starts TRUE in the store, so a suite that only names the space still reads the
  // home surface — and the suggestions of a screen holding no document.
  useLayouts.setState({ activeWorkspace: 'image', home: false })
  useAiModels.setState({
    overview: aiOverview({
      roles: [
        roleRow({ role: ASSISTANT_ROLE, provider: { kind: 'cloud', providerId: 'scenario' } }),
      ],
    }),
  })
  installFakeBridge()
})

/**
 * 🛑 Scoped to the listbox: the model picker below is a `<select>`, so its own `<option>`s answer
 * `getAllByRole('option')` too — a query over the screen reads the last brain, not the last row.
 */
const rowsOf = (): Element[] => within(screen.getByRole('listbox')).getAllByRole('option')

/** The row against the field, which is the one held: the list opens upward. */
const nearest = (): Element | undefined => rowsOf().at(-1)

const working = (round: number, stopping = false): void =>
  useAssistant.setState({
    busy: true,
    round,
    stopping,
    streamed: '',
    promptTokens: 0,
    replyTokens: 0,
    windowTokens: 0,
    turns: [
      { id: 1, said: 'ouvre le voilier vert', answered: '', steps: [], asks: [], lost: false },
    ],
  })

describe('while the assistant is accepting input', () => {
  // 🛑 The one exception to "a plan is running, the field is shut": a question with nothing to
  // press can only be answered by typing, and a shut field left the chain parked.
  it('keeps the field open under a question, and offers Send rather than Stop', () => {
    working(1)
    void useAssistant.getState().askChoice([{ question: 'Quel nom ?', choices: [] }])
    render(<AssistantConversation />)

    expect(screen.getByRole('textbox')).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Arrêter/ })).not.toBeInTheDocument()
    useAssistant.getState().choose(null)
  })

  /** 🛑 And NOT under a questionnaire, which is answered in its own card: an open field there
   * takes a line that answers no question in particular, and drops it without a word. */
  it('shuts the field again under a questionnaire, and offers Stop', () => {
    working(1)
    void useAssistant.getState().askChoice([
      { question: 'Lequel ?', choices: ['Bateau'] },
      { question: 'Pourquoi ?', choices: ['Pour voir'] },
    ])
    render(<AssistantConversation />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Arrêter/ })).toBeInTheDocument()
    useAssistant.getState().choose(null)
  })

  /**
   * 🛑 The card is KEYED on the ask it draws: unkeyed, the queue rotating reused the instance and
   * the next questionnaire opened on the answers of the one before it.
   */
  it('opens a queued questionnaire blank rather than on the one before it', async () => {
    working(1)
    const first = useAssistant.getState().askChoice([
      { question: 'Lequel ?', choices: ['Bateau', 'Avion'] },
      { question: 'Pourquoi ?', choices: ['Pour voir'] },
    ])
    void useAssistant.getState().askChoice([
      { question: 'Et après ?', choices: ['Avion', 'Autre'] },
      { question: 'Sûr ?', choices: ['Oui'] },
    ])
    render(<AssistantConversation />)

    await userEvent.click(screen.getByRole('button', { name: 'Avion' }))
    expect(screen.getByRole('button', { name: 'Avion' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: /Envoyer les réponses/ }))
    await first

    // Same word offered by the question that waited, and nothing pressed on it.
    expect(screen.getByRole('button', { name: 'Avion' })).toHaveAttribute('aria-pressed', 'false')
    useAssistant.getState().choose(null)
  })

  // In the thread and last of it, where the answer itself will appear: what one watches while
  // waiting is the place the words are going to land, never a line down by the field.
  it('says which round it is on, at the end of the thread', () => {
    working(3)
    render(<AssistantConversation />)

    const waiting = screen.getByText(/3/)
    expect(waiting).toBeInTheDocument()
    expect(screen.getByRole('list')).toContainElement(waiting)
  })

  // Where Send was, and never beside it: a chain one cannot call off is one nobody dares start.
  it('offers to stop instead of to send, and cannot send meanwhile', async () => {
    working(1)
    render(<AssistantConversation />)

    await userEvent.click(screen.getByRole('button', { name: /arrêter/i }))

    expect(stop).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  // Pressed twice, the second press asks nothing more: what is running is what it waits for.
  it('says it is stopping, and takes no second press', () => {
    working(2, true)
    render(<AssistantConversation />)

    expect(screen.getByRole('button', { name: /arrêter/i })).toBeDisabled()
  })
})

/**
 * What the conversation claims WHILE it is on screen, which is not the same as while it is
 * mounted: the right column draws it untouched in every space, so a claim made on mounting would
 * take the caret and the spoken word of the whole studio with it.
 */
describe('what it claims of the studio', () => {
  it('stages the thread, so nothing else speaks for it', () => {
    render(<AssistantConversation />)

    expect(useAssistant.getState().staged).toBe(1)
  })

  /**
   * The caret follows the GESTURE, never the layout: ⌘K asks for it and the host takes it on the
   * frame it mounts. Focused on mount either way, it would swallow every studio shortcut from the
   * first frame of a launch.
   */
  it('leaves the caret alone when it is merely what a column draws', () => {
    render(<AssistantConversation />)

    expect(screen.getByRole('textbox')).not.toHaveFocus()
  })

  it('takes the caret when a gesture asked for the conversation first', () => {
    focusChat()
    render(<AssistantConversation />)

    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  // 🛑 Claimed unconditionally, every dictation of the studio landed here — a generation prompt
  // included, since the panel is up in every space.
  it('leaves the spoken word to the caret until the reader is inside it', async () => {
    render(<AssistantConversation />)
    expect(mountedDictationTarget()).toBeNull()

    await userEvent.click(screen.getByRole('textbox'))

    expect(mountedDictationTarget()).not.toBeNull()
  })

  /**
   * A session begun here outlives the caret: one dictates with the hands off the keyboard, so
   * looking at the canvas mid-sentence must not hand the rest of the sentence to whatever is
   * under the pointer — nor stop the microphone.
   */
  it('keeps the spoken word once a session has begun, caret or not', async () => {
    render(<AssistantConversation />)
    await userEvent.click(screen.getByRole('textbox'))
    act(() => useDictation.setState({ state: 'listening' }))

    act(() => screen.getByRole('textbox').blur())

    expect(mountedDictationTarget()).not.toBeNull()
    expect(useDictation.getState().state).toBe('listening')
  })

  it('gives the spoken word back once the reader has left and the microphone is shut', async () => {
    render(<AssistantConversation />)
    await userEvent.click(screen.getByRole('textbox'))

    act(() => screen.getByRole('textbox').blur())

    expect(mountedDictationTarget()).toBeNull()
  })
})

/**
 * The list is walked with the caret still in the field — `aria-activedescendant`, never a focus
 * that moves. Three things went wrong there and none of them reddened: the rank kept an index
 * the list no longer had, the arrows were confiscated from a paragraph, and every suggestion was
 * a tab stop between the field and the send button.
 */
describe('walking the suggestions', () => {
  beforeEach(() => {
    useLayouts.setState({ activeWorkspace: 'image', home: false })
  })

  /**
   * Typing gives the line back. The rank would otherwise survive a list rebuilt under it — held
   * on a sentence one has since walked away from, and Enter would take that one instead of the
   * words on screen.
   */
  it('lets go of the line it held as soon as one types again', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'une{ArrowUp}')
    expect(field.getAttribute('aria-activedescendant')).not.toBe(nearest()?.getAttribute('id'))

    // A space keeps every match — `searchWords` drops it — so only the RANK can have changed.
    await userEvent.type(field, ' ')

    expect(field.getAttribute('aria-activedescendant')).toBe(nearest()?.getAttribute('id'))
  })

  /**
   * The field takes three lines and exists for dictated paragraphs: confiscating the arrows the
   * moment a suggestion matches would leave one with no way to move the caret between them.
   */
  it('leaves the arrows to the field once the draft has more than one line', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere{Shift>}{Enter}{/Shift}une image{ArrowUp}')

    // The caret has a line above it to reach, so the rank stands where it was rather than walking.
    expect(field.getAttribute('aria-activedescendant')).toBe(nearest()?.getAttribute('id'))
  })

  // Up is INTO the list, which is above: the keys mean what the eye sees.
  it('walks up into the list, and keeps the caret in the field', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere{ArrowUp}')

    expect(field).toHaveFocus()
    expect(field.getAttribute('aria-activedescendant')).toBe(rowsOf().at(-2)?.getAttribute('id'))
  })
})

/**
 * Three ways a list could outlive what asked for it, none of which a keystroke closes.
 */
describe('giving the suggestions back', () => {
  beforeEach(() => {
    useLayouts.setState({ activeWorkspace: 'image', home: false })
  })

  // Escape reclaimed the highlight and left the list standing: there was no gesture short of
  // emptying the field to get the room back.
  it('takes Escape for the list itself, not only for the line held', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'image{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  /**
   * 🛑 While a plan runs the field is disabled but dictation keeps appending to the draft: the
   * list stood over a running plan with clickable options, and choosing one replaced the spoken
   * words while `focus()` went nowhere.
   */
  it('stands down while a plan is running', () => {
    useAssistant.setState({ busy: true, draft: 'genere une im' })
    render(<AssistantConversation />)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  /**
   * 🛑 The rank outlived the list when something OTHER than a keystroke rebuilt it — a change of
   * space, of language, a dictated word. Rank 3 named one sentence and then another, highlighted
   * and silently different, and Enter took the second.
   */
  it('gives the rank back when the space changes under it', async () => {
    const { rerender } = render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere{ArrowDown}')
    expect(field).toHaveAttribute('aria-activedescendant')

    act(() => useLayouts.setState({ activeWorkspace: 'audio' }))
    rerender(<AssistantConversation />)

    expect(field).not.toHaveAttribute('aria-activedescendant')
  })
})
