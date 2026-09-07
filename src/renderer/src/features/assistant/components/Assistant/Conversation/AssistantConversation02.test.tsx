import { formatCompact } from '@/helpers/format'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAiModels } from '@/stores/aiModels'
import { useAssistant } from '@/stores/assistant'
import { useDictation } from '@/stores/dictation'
import { useLayouts } from '@/stores/layouts'
import { useSettings } from '@/stores/settings'
import { aiOverview, roleRow } from '@shared/domain/aiOverview-fixtures'
import { ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantConversation } from './AssistantConversation'

/**
 * Read through the formatter the gauge uses, so a locale change moves both at once. The spaces
 * are flattened: `Intl` binds the unit with U+202F, which the DOM matcher normalises away.
 */
const short = (value: number): string => formatCompact(value, 'fr').replace(/\s/g, ' ')

const say = vi.hoisted(() => vi.fn<(utterance: string) => Promise<void>>())
const stop = vi.hoisted(() => vi.fn())

/** Nothing chosen for the assistant role, which is what a fresh studio looks like. */
const unserved = () =>
  useAiModels.setState({
    overview: aiOverview({ roles: [roleRow({ role: ASSISTANT_ROLE, provider: null })] }),
  })

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
 * What the live region spells of the tail, which is the only place it is written out in full: the
 * mirror behind the field is `aria-hidden`, so no role query reaches into it.
 */
const completing = (): string => screen.queryByText(/Tab ou →/)?.textContent ?? ''

/**
 * 🛑 Scoped to the listbox: the model picker below is a `<select>`, so its own `<option>`s answer
 * `getAllByRole('option')` too — a query over the screen reads the last brain, not the last row.
 */
const rowsOf = (): Element[] => within(screen.getByRole('listbox')).getAllByRole('option')

/** The row against the field, which is the one held: the list opens upward. */
const nearest = (): Element | undefined => rowsOf().at(-1)

describe('the assistant conversation completion list', () => {
  it('opens above the field, so nothing under the fingers moves', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere une')

    expect(field.compareDocumentPosition(screen.getByRole('listbox'))).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    )
  })

  /**
   * 🛑 `cn` is tailwind-merge: a `bg-transparent` written after `rowSkin` cancelled the very fill
   * it paints, and the walk was invisible while `aria-activedescendant` moved correctly.
   */
  it('paints the row it holds, so the walk can be seen and not only heard', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere une')

    expect(nearest()).toHaveClass('bg-accent-soft')
    expect(rowsOf()[0]).not.toHaveClass('bg-accent-soft')
  })

  /**
   * The list grows upward, so the best match — the one the tail spells out — is the row AGAINST
   * the field. Held at the top it would be the row furthest from the caret, and the first one
   * `max-h-40` pushes out of sight.
   */
  it('holds the row nearest the field, and spells that one ahead of the caret', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere une im')

    expect(nearest()).toHaveTextContent('Génère une image')
    expect(completing()).toContain('Génère une image')
  })

  // The list said what the caret was doing: leaving the field opened one under the hand that left.
  it('opens no list because the caret left the field', async () => {
    useLayouts.setState({ activeWorkspace: 'audio' })
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    // The one match of this space, spelled by the tail — so no rows, before or after.
    await userEvent.type(field, 'genere un')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.blur(field)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  // ArrowUp with something selected means « collapse and move », not « walk the list ».
  it('leaves the arrows to a selection the hand is holding', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole<HTMLTextAreaElement>('textbox')

    await userEvent.type(field, 'genere une')
    const held = field.getAttribute('aria-activedescendant')

    field.setSelectionRange(0, 6)
    fireEvent.keyDown(field, { key: 'ArrowUp' })

    expect(field.getAttribute('aria-activedescendant')).toBe(held)
  })

  /**
   * The other half of Tab. 🛑 Typed with matches ON SCREEN, since a field matching nothing leaves
   * `steer` at its first guard and never reaches the branch this is about.
   */
  it('leaves Tab alone when no match spells forward', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'variante{Tab}')

    expect(screen.getByRole('option', { name: /variante/ })).toBeInTheDocument()
    expect(field).toHaveValue('variante')
    expect(field).not.toHaveFocus()
  })

  /**
   * A sentence matched by a word of its middle cannot be spelled ahead of the caret — there is no
   * tail to paint. It keeps the row it always had, which is why both mechanics stay.
   */
  it('keeps a row for a match no tail can spell', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'variante')

    expect(completing()).toBe('')
    expect(screen.getByRole('option', { name: /variante/ })).toBeInTheDocument()
  })
})

describe('the assistant conversation completion filtering', () => {
  // The tail belongs where the caret is: offered from the middle of a sentence, Tab would write
  // the rest of a phrase onto words the hand had gone back to fix.
  it('offers no tail once the caret has gone back into the sentence', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere une im')
    expect(completing()).toContain('Génère une image')

    fireEvent.select(field, { target: { selectionStart: 2, selectionEnd: 2 } })

    expect(completing()).toBe('')
  })

  it('changes which sentence the tail spells as the arrows walk', async () => {
    useLayouts.setState({ activeWorkspace: 'video' })
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'a')
    const first = completing()

    await userEvent.type(screen.getByRole('textbox'), '{ArrowDown}')

    expect(completing()).not.toBe(first)
  })

  /**
   * The gate belongs to the conversation, not to one of its hosts: ⌘K used to open a field that
   * could only produce a lost turn. A choice, never a fill-in — a key held and a model installed
   * still leave the role unserved until the person ticks one.
   */
  it('asks for a model instead of a field when nothing answers', async () => {
    const openSection = vi.fn()
    unserved()
    useSettings.setState({ openSection })
    render(<AssistantConversation />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Choisir un modèle' }))

    expect(openSection).toHaveBeenCalledWith('ai')
  })

  /**
   * 🛑 The composer alone. `registerConfirmer` answers for MCP actions too, which need no
   * assistant model: swallowing the whole conversation left a question on screen that could not
   * be read, granted, or priced — the only way out being the close button, which declines.
   */
  it('still shows a question, and the thread, when nothing answers', () => {
    unserved()
    useAssistant.setState({
      turns: [{ id: 1, said: 'génère un casque', answered: '', steps: [], asks: [], lost: false }],
      asked: {
        id: 1,
        request: {
          action: 'generator.submit',
          input: {},
          commitment: 'credits',
          estimate: 12,
        },
        answer: vi.fn(),
      },
    })
    render(<AssistantConversation />)

    expect(screen.getByText('génère un casque')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Autoriser' })).toBeInTheDocument()
  })

  /**
   * The microphone goes where the claim is — only the overlay registers a dictation target.
   * Offered without one, a settled sentence falls to the caret, which the button itself just
   * took, and the words are dropped with nothing on screen.
   */
  it('offers the microphone, having claimed the spoken word by being on screen', () => {
    render(<AssistantConversation />)

    expect(screen.getByRole('button', { name: /Dicter/ })).toBeInTheDocument()
  })

  // Beside an exchange they are an interruption: the blank page is the only thing they answer.
  /**
   * They used to be withheld once a thread had begun — beside an exchange, three chips standing
   * there were an interruption. An answer to typing is not: the second sentence of a conversation
   * is written in the same field as the first, and it deserves the same help.
   */
  it('still answers a sentence begun in the middle of a conversation', async () => {
    useAssistant.setState({
      turns: [{ id: 1, said: 'bonjour', answered: 'Bonjour.', steps: [], asks: [], lost: false }],
    })
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere une')

    expect(screen.getByRole('option', { name: 'Génère une image' })).toBeInTheDocument()
  })
})

/**
 * What was missing while it worked: that it IS working, and that one may call it off. A chain
 * runs for as long as it takes, and a screen saying nothing for four rounds is one the person
 * sits in front of, wondering whether to type the sentence again.
 */
describe('what a step shows of what it did', () => {
  const ran = (data: unknown): void =>
    useAssistant.setState({
      turns: [
        {
          id: 1,
          asks: [],
          said: 'ouvre l’image du bateau',
          answered: '',
          steps: [{ action: 'files.search', refusal: null, data }],
          lost: false,
        },
      ],
    })

  it('counts what a list answered', () => {
    ran(['Images/a.png', 'Images/b.png'])
    render(<AssistantConversation />)

    expect(screen.getByText(/2 résultats/)).toBeInTheDocument()
  })

  // « 1 résultat » under an opening says nothing about a file that just opened: what a list
  // answers is how many there were, and what everything else answers is its own business.
  it('counts nothing where counting means nothing', () => {
    ran({ opened: 'asset' })
    render(<AssistantConversation />)

    expect(screen.queryByText(/résultat/)).not.toBeInTheDocument()
  })
})

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

describe('while the assistant is working', () => {
  /**
   * 🛑 A local door answers in minutes and the thread showed a spinner alone: nothing said the
   * model was writing rather than dead, and the only way to know was to watch the machine's fans.
   */
  it('shows what the model is writing, and its tail rather than its head', () => {
    working(1)
    useAssistant.setState({ streamed: `${'x'.repeat(400)}the last words` })
    render(<AssistantConversation />)

    expect(screen.getByText(/the last words/)).toBeInTheDocument()
  })

  // Grouped as the language groups them: a five-figure count read as one run of digits.
  it('says what the round has cost, in the reader’s own digits', () => {
    working(1)
    useAssistant.setState({ promptTokens: 12_366, replyTokens: 18 })
    render(<AssistantConversation />)

    // 🛑 `\s` and not the separator itself: French groups with a narrow no-break space, which
    // testing-library folds to an ordinary one before it compares.
    const grouped = new Intl.NumberFormat('fr').format(12_366).replace(/\s/g, '\\s')
    expect(screen.getByText(new RegExp(`${grouped}.*18`))).toBeInTheDocument()
  })

  /**
   * 🛑 It OUTLIVES the turn, unlike the working line: what one wants to know before typing is how
   * much room the last exchange left, and cleared per round the figure was gone the moment there
   * was time to read it.
   */
  it('shows what the last exchange read, once it is over', () => {
    useAssistant.setState({
      busy: false,
      promptTokens: 2116,
      windowTokens: 8192,
      door: { size: 8192, unit: 'tokens', assumed: false },
    })
    render(<AssistantConversation />)

    expect(screen.getByText(`${short(2116)} / ${short(8192)}`)).toBeInTheDocument()
  })

  /**
   * 🛑 A door that names no window shows the count ALONE. Naming the missing window on the line
   * took more room than the figure it qualified and pushed Send onto a row of its own — what the
   * door will not say is the tooltip's to say, which costs no width.
   */
  it('shows the count alone where the door named no window', () => {
    useAssistant.setState({ busy: false, promptTokens: 2116, windowTokens: 0, door: null })
    render(<AssistantConversation />)

    expect(screen.getByText(short(2116))).toBeInTheDocument()
    expect(screen.queryByText(/fenêtre|jeton/i)).not.toBeInTheDocument()
  })

  /**
   * 🛑 A door that answered `null` names NO window, and the count a PREVIOUS door left must not
   * become its denominator — that is `2 067 / 4 096` all over again.
   */
  it('drops the window of the door before it when the new one names none', () => {
    useAssistant.setState({
      busy: false,
      promptTokens: 2116,
      windowTokens: 8192,
      door: null,
    })
    render(<AssistantConversation />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText(short(2116))).toBeInTheDocument()
  })

  /** 🛑 A declared fallback is not a window: no gauge is painted against a made-up denominator. */
  it('says nothing at all for a bound the door could not read', () => {
    useAssistant.setState({
      busy: false,
      promptTokens: 0,
      promptChars: 4200,
      windowTokens: 0,
      door: { size: 10_000, unit: 'characters', assumed: true },
    })
    render(<AssistantConversation />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d/)).not.toBeInTheDocument()
  })

  /**
   * 🛑 What Alban asked for: the bound is what one wants to know while deciding how much to
   * paste, and before this the zone was empty until a turn had already been paid for.
   */
  it('shows the bound of the door before a single turn has run', () => {
    useAssistant.setState({
      busy: false,
      promptTokens: 0,
      promptChars: 0,
      windowTokens: 0,
      door: { size: 100_000, unit: 'characters', assumed: false },
    })
    render(<AssistantConversation />)

    expect(screen.getByText(`0 / ${short(100_000)}`)).toBeInTheDocument()
  })

  // Characters against characters: the door is bounded by a LENGTH, and tokens here would be an
  // estimate shown beside a measurement.
  it('counts against a character bound in characters, never in tokens', () => {
    useAssistant.setState({
      busy: false,
      promptTokens: 2116,
      promptChars: 7400,
      door: { size: 100_000, unit: 'characters', assumed: false },
    })
    render(<AssistantConversation />)

    expect(screen.getByText(`${short(7400)} / ${short(100_000)}`)).toBeInTheDocument()
  })
})
