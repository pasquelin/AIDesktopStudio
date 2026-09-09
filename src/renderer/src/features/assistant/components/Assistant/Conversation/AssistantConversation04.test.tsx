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

/** Nothing chosen for the assistant role, which is what a fresh studio looks like. */
const unserved = () =>
  useAiModels.setState({
    overview: aiOverview({ roles: [roleRow({ role: ASSISTANT_ROLE, provider: null })] }),
  })

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
// The list of what one can ask, and the grey preview the field paints of the row it holds — the
// two halves of one mechanism, split off `AssistantConversation02` when that file passed the size
// guard rather than because they answer to anything else.

/**
 * What the live region spells of the tail, which is the only place it is written out in full: the
 * mirror behind the field is `aria-hidden`, so no role query reaches into it.
 */
const completing = (): string => screen.queryByText(/Tab ou →/)?.textContent ?? ''

/** The same region for a sentence the draft does not open: it is WRITTEN over, not continued. */
const offering = (): string => screen.queryByText(/pour l’écrire/)?.textContent ?? ''

/**
 * The grey words painted over the field. The mirror is `aria-hidden` — that is what keeps a
 * reader from hearing the sentence twice — so no role query reaches into it, and it is found by
 * the skin it wears.
 */
const painted = (container: HTMLElement): Element | null =>
  container.querySelector('[aria-hidden] .text-muted')

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
   * A sentence matched by a word of its middle cannot be spelled ahead of the caret — there is no
   * tail to continue. It keeps the row it always had, which is why both mechanics stay.
   */
  it('keeps a row for a match no tail can spell', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'variante')

    expect(completing()).toBe('')
    expect(screen.getByRole('option', { name: /variante/ })).toBeInTheDocument()
  })

  /**
   * 🛑 The row held from the first keystroke must be one the caret can spell out. Left in the
   * order the starters are written in, `c` held « Ouvre un projet récent » — highlighted, with a
   * blank field under it — while « Crée un nouveau projet » sat two rows up, unheld.
   */
  it('holds a sentence the draft opens ahead of the ones it merely matches', async () => {
    useLayouts.setState({ activeWorkspace: 'image', home: true })
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'c')

    expect(nearest()).toHaveTextContent('Crée un nouveau projet')
    expect(completing()).toContain('Crée un nouveau projet')
  })
})

/**
 * What the field paints of the row the list holds, and which key writes it. Its own group: a
 * preview is SHOWN from the first keystroke but written only where the badge says so, and the
 * two halves were read as one rule until a finished draft was overwritten by Tab.
 */
describe('the preview the field paints of the row it holds', () => {
  /**
   * 🛑 The draft is SAFE under Tab. A preview that does not continue the writing replaces it, and
   * the row against the field is one the list landed on, not one the hand chose: measured
   * 2026-09-09, « Génère une image » typed in full and Tab pressed to reach Send became « Génère
   * une variante de cette image », with no way back — the field is controlled, so the native undo
   * has nothing to give.
   */
  it('leaves Tab alone on a preview nobody walked onto, and keeps what is typed', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'Génère une image{Tab}')

    expect(field).toHaveValue('Génère une image')
    expect(field).not.toHaveFocus()
  })

  /** The other half: walked onto deliberately, the row IS what Tab writes. */
  it('writes the preview once the arrows have walked onto it', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'image{ArrowUp}{Tab}')

    expect(field).toHaveValue('Retouche une image du projet')
    expect(field).toHaveFocus()
  })

  // The way out stays: with nothing offered, Tab is the key that leaves the composer.
  it('leaves Tab alone when nothing is offered at all', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'zzzzzz{Tab}')

    expect(field).toHaveValue('zzzzzz')
    expect(field).not.toHaveFocus()
  })

  /** A reader hears the key only where it writes: announced sooner, it named a keystroke that
   * does nothing. */
  it('announces the sentence the key writes, once the hand has walked onto it', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'image')
    expect(offering()).toBe('')

    await userEvent.type(field, '{ArrowUp}')

    expect(offering()).toContain('Retouche une image du projet')
  })

  /**
   * As Warp prints it: the key that writes the sentence sits at the end of the sentence, in the
   * field itself, so the gesture is learnt without hovering anything.
   */
  it('prints the key at the end of the preview it writes, and nowhere else', async () => {
    const { unmount } = render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere une im')
    expect(screen.getByText('Tab')).toBeInTheDocument()

    unmount()
    useAssistant.setState({ draft: '' })
    render(<AssistantConversation />)
    // Shown, but not what Tab writes — the badge would promise a keystroke that walks away.
    await userEvent.type(screen.getByRole('textbox'), 'variante')

    expect(screen.queryByText('Tab')).not.toBeInTheDocument()
  })

  /**
   * A whole sentence laid against the writing reads as its next word. Stood off, it reads as what
   * the key would put in its place — which is what Tab does with it.
   */
  it('stands the preview off the writing when it replaces it rather than continuing it', async () => {
    const { container } = render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'variante')

    expect(painted(container)).toHaveTextContent('Génère une variante de cette image')
    expect(painted(container)).toHaveClass('ms-2')
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
