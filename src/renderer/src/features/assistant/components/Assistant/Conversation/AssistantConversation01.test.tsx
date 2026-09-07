import { installFakeBridge } from '@/services/fakeBridge'
import { useAiModels } from '@/stores/aiModels'
import { useAssistant } from '@/stores/assistant'
import { useDictation } from '@/stores/dictation'
import { useLayouts } from '@/stores/layouts'
import { useSettings } from '@/stores/settings'
import { aiOverview, roleRow } from '@shared/domain/aiOverview-fixtures'
import { ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
 * What the live region spells of the tail, which is the only place it is written out in full: the
 * mirror behind the field is `aria-hidden`, so no role query reaches into it.
 */
const completing = (): string => screen.queryByText(/Tab ou →/)?.textContent ?? ''

/**
 * 🛑 Scoped to the listbox: the model picker below is a `<select>`, so its own `<option>`s answer
 * `getAllByRole('option')` too — a query over the screen reads the last brain, not the last row.
 */
describe('the assistant conversation', () => {
  it('sends what was typed, and clears the field', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'ouvre un fichier 3D')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(say).toHaveBeenCalledWith('ouvre un fichier 3D')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  /**
   * The field sends on Enter, so a message typed through an input method would leave halfway
   * through its last character — Enter picks the candidate, it does not end the sentence.
   */
  it('leaves Enter to the input method while it is composing a character', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'ouvre un')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true })

    expect(say).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('ouvre un')
  })

  it('draws the thread, refusal and all', () => {
    useAssistant.setState({
      turns: [
        {
          id: 1,
          asks: [],
          said: 'génère un casque',
          answered: 'Je prépare la génération.',
          steps: [{ action: 'generator.submit', refusal: 'declined' }],
          lost: false,
        },
      ],
    })
    render(<AssistantConversation />)

    expect(screen.getByText('génère un casque')).toBeInTheDocument()
    expect(screen.getByText(/Vous avez refusé cette action/)).toBeInTheDocument()
  })

  // Shown as the fields show it — a hypothesis, never something to mistake for what was sent.
  // While it LISTENS, since that is the only time one exists: what is left in the store between
  // two sessions is a leftover, not a sentence anybody is speaking.
  it('shows the sentence still being spoken', () => {
    useDictation.setState({ partial: 'ouvre un fichier', state: 'listening' })
    render(<AssistantConversation />)

    expect(screen.getByText('ouvre un fichier')).toBeInTheDocument()
  })

  /**
   * 🛑 The half that was missing: « Créer un dossier de projet » over « change ce qu'est le
   * studio » named an action and a category, and nothing said WHICH project — approving that is
   * approving a category.
   */
  it('says what the action was called with, field by field', () => {
    useAssistant.setState({
      asked: {
        id: 1,
        request: { action: 'project.create', input: { name: 'Bateaux' }, commitment: 'studio' },
        answer: vi.fn(),
      },
    })
    render(<AssistantConversation />)

    expect(screen.getByText(/Bateaux/)).toBeInTheDocument()
  })

  /**
   * 🛑 Read where the eye already is. Down by the field, it stood a screen below the newest
   * message of a short thread, and a reader watching that line never saw the studio waiting.
   */
  it('stands the confirmation last in the thread, right under the newest message', () => {
    useAssistant.setState({
      turns: [
        {
          id: 1,
          said: 'renomme le projet test1 en test2',
          answered: 'Le projet « test 1 » va être renommé.',
          steps: [],
          asks: [],
          lost: false,
        },
      ],
      asked: {
        id: 1,
        request: { action: 'project.create', input: { name: 'test 2' }, commitment: 'studio' },
        answer: vi.fn(),
      },
    })
    render(<AssistantConversation />)

    const card = screen.getByRole('button', { name: 'Autoriser' }).closest('li')
    expect(card?.parentElement?.tagName).toBe('OL')
    expect(card?.nextElementSibling).toBeNull()
    expect(card?.previousElementSibling?.textContent).toContain('renomme le projet test1 en test2')
  })

  it('quotes what an action will cost before asking, and answers with the buttons', async () => {
    const answered = vi.fn()
    useAssistant.setState({
      asked: {
        id: 1,
        request: {
          action: 'generator.submit',
          input: {},
          commitment: 'credits',
          estimate: 12,
        },
        answer: answered,
      },
    })
    render(<AssistantConversation />)

    expect(screen.getByText(/~12 UC/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Autoriser' }))

    expect(answered).toHaveBeenCalledWith({ granted: true, input: {} })
  })

  /**
   * 🛑 A folder is a place only the PERSON knows, and it is where the project GOES — it never
   * replaces its name. Sharing one field, what they pointed at overwrote « Nouveau projet », and
   * the studio then tried to make a project of a folder that already held some.
   */
  it('lets the person point at where the project goes, and sends that one', async () => {
    const answered = vi.fn()
    installFakeBridge({ dialog: { pickPath: () => Promise.resolve('/Projets/Bateaux') } })
    useAssistant.setState({
      asked: {
        id: 1,
        request: {
          action: 'project.create',
          input: { name: 'Nouveau projet' },
          commitment: 'studio',
        },
        answer: answered,
      },
    })
    render(<AssistantConversation />)

    await userEvent.click(screen.getByRole('button', { name: /Choisir/ }))
    expect(screen.getByText(/\/Projets\/Bateaux/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Autoriser' }))

    expect(answered).toHaveBeenCalledWith({
      granted: true,
      input: { name: 'Nouveau projet', folder: '/Projets/Bateaux' },
    })
  })

  /**
   * 🛑 A `picks` field is shown even EMPTY: the model names no folder for « crée un projet jeu1 »,
   * so the row that says where it lands — and the button that changes it — were both absent from
   * the one card where the person could still say otherwise.
   */
  it('says where a project with no folder named will land, and offers to change it', () => {
    useAssistant.setState({
      asked: {
        id: 1,
        request: { action: 'project.create', input: { name: 'jeu1' }, commitment: 'studio' },
        answer: vi.fn(),
      },
    })
    render(<AssistantConversation />)

    expect(screen.getByText(/là où vous rangez vos projets/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choisir/ })).toBeInTheDocument()
  })

  /** Inventing a figure to fill the sentence would be worse than admitting there is none. */
  it('says the cost is unknown rather than making one up', () => {
    useAssistant.setState({
      asked: {
        id: 1,
        request: {
          action: 'generator.submit',
          input: {},
          commitment: 'credits',
          estimate: null,
        },
        answer: vi.fn(),
      },
    })
    render(<AssistantConversation />)

    expect(screen.getByText(/n’a pas pu en estimer le montant/)).toBeInTheDocument()
  })
})

describe('the assistant conversation completion', () => {
  /**
   * 🛑 It WRITES the sentence. An action of this studio can spend, and a suggestion that sent on
   * its own would start the spending on the person's behalf.
   */
  it('writes a suggestion into the field rather than sending it', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere')
    await userEvent.click(screen.getByRole('option', { name: 'Génère une image' }))

    expect(screen.getByRole('textbox')).toHaveValue('Génère une image')
    expect(say).not.toHaveBeenCalled()
  })

  /**
   * An ANSWER to typing, never an offer standing there: two rows of chips over a blank thread
   * were three sentences one could not add to and could not get rid of.
   */
  it('offers nothing until something is being written', async () => {
    render(<AssistantConversation />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox'), 'image')

    expect(within(screen.getByRole('listbox')).getAllByRole('option').length).toBeGreaterThan(0)
  })

  // Accents and case are how one SPELLS, not what one is looking for — `foldForSearch` is the
  // studio's own answer to that, and this is the reason it is reused rather than a `includes`.
  it('finds a sentence typed without its accents', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere une im')

    expect(screen.getByRole('option', { name: 'Génère une image' })).toBeInTheDocument()
  })

  /**
   * Folded on both sides: compared raw, a sentence typed the way the rest of the feature invites
   * — without its accents — stayed offered underneath itself, over a sentence already finished.
   */
  it('stops offering a sentence once it is written, accents or not', async () => {
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere une image')

    // The others still answer those words — only the one already written stops being offered.
    expect(screen.queryByRole('option', { name: 'Génère une image' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /variante/ })).toBeInTheDocument()
  })

  // A suggestion about pictures, in a timeline, is noise: what is offered is what the space at
  // hand can actually be asked for.
  it('offers the sentences of the space one is in', async () => {
    useLayouts.setState({ activeWorkspace: 'audio' })
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'genere un')

    // The only match here completes what is typed, so it is spelled by the tail and by no row.
    expect(completing()).toContain('Génère un son')
    expect(screen.queryByRole('option', { name: 'Génère une image' })).not.toBeInTheDocument()
  })

  /**
   * 🛑 The home has no space of its own, so it used to read `activeWorkspace` and offer whatever
   * space one had last been in — three sentences about pictures, on a screen holding no document.
   */
  it('offers the project’s own sentences on the home, not the last space visited', async () => {
    useLayouts.setState({ activeWorkspace: 'image', home: true })
    render(<AssistantConversation />)

    await userEvent.type(screen.getByRole('textbox'), 'projet')

    expect(screen.getByRole('option', { name: /Crée un nouveau projet/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Génère une image' })).not.toBeInTheDocument()
  })

  /**
   * 🛑 The whole reason Enter was taken off the tail: a match is held from the first keystroke
   * now, so an Enter that took it would send a sentence the hand never finished writing. Enter
   * sends WHAT IS TYPED, always — and Tab is what turns the grey into one's own words.
   */
  it('takes the tail on Tab, and sends what is typed on Enter', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere une im{Enter}')
    expect(say).toHaveBeenCalledWith('genere une im')

    say.mockClear()
    await userEvent.type(field, 'genere une im{Tab}')
    expect(field).toHaveValue('Génère une image')
    expect(say).not.toHaveBeenCalled()
  })
})

describe('the assistant conversation completion keyboard', () => {
  /**
   * Shift+Tab means « go back », and it took the tail instead — the draft rewritten by a keystroke
   * that asked to leave, with no way out of the composer while a tail was painted.
   */
  it('leaves a Tab held with Shift to the focus it walks', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere une im')
    await userEvent.tab({ shift: true })

    expect(field).toHaveValue('genere une im')
    expect(field).not.toHaveFocus()
  })

  /**
   * 🛑 A focus given by ⌘K fires neither `change` nor `select`, so the state saying where the
   * caret is answered for the last hand that typed. The tail was painted over a draft the caret
   * sat at the START of, and the right arrow could not move at all.
   */
  it('reads where the caret is from the key itself, not from the last thing typed', () => {
    useAssistant.setState({ draft: 'genere une im' })
    render(<AssistantConversation />)
    const field = screen.getByRole<HTMLTextAreaElement>('textbox')

    field.setSelectionRange(0, 0)
    act(() => focusChat())
    expect(field.selectionStart).toBe(0)

    fireEvent.keyDown(field, { key: 'ArrowRight' })

    expect(field).toHaveValue('genere une im')
  })

  /**
   * The tail advertises a key that only takes it while one writes HERE. 🛑 Left by the pointer and
   * not by Tab, which the tail takes for itself and would end this test by accepting.
   */
  it('takes the tail off the screen once the caret leaves the field', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'genere une im')
    expect(completing()).toContain('Génère une image')

    fireEvent.blur(field)

    expect(completing()).toBe('')
  })

  // A field nothing answers announces no completion either: a reader was told of one that was not.
  it('announces no inline completion when nothing completes', async () => {
    render(<AssistantConversation />)
    const field = screen.getByRole('textbox')

    await userEvent.type(field, 'zzzzzz')

    expect(field).not.toHaveAttribute('aria-autocomplete')
  })
})
