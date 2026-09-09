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
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantConversation } from './AssistantConversation'

/**
 * Read through the formatter the gauge uses, so a locale change moves both at once. The spaces
 * are flattened: `Intl` binds the unit with U+202F, which the DOM matcher normalises away.
 */
const short = (value: number): string => formatCompact(value, 'fr').replace(/\s/g, ' ')

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
