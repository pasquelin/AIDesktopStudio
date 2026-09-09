import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MOST_QUESTIONS, type AskedAnswer } from '@shared/domain/assistantAsk'
import { useAssistant } from '@/stores/assistant'
import { AssistantConversationChoice } from './AssistantConversationChoice'

const asked = (): Promise<readonly AskedAnswer[] | null> =>
  useAssistant
    .getState()
    .askChoice([{ question: 'Dans quel espace ?', choices: ['Image', 'Vidéo', 'Audio'] }])

const drawn = (): void => {
  const choosing = useAssistant.getState().choosing
  if (choosing) render(<AssistantConversationChoice {...choosing} />)
}

beforeEach(() => useAssistant.setState({ choosing: null, queued: [], asked: null }))

describe('a question the model asked', () => {
  /**
   * 🛑 The answer settles the PROMISE the action is waiting on: written into the thread instead,
   * it would cost the person another round of typing before anything moved.
   */
  it('answers the action with what was pressed', async () => {
    const answer = asked()
    drawn()

    await userEvent.click(screen.getByRole('radio', { name: 'Vidéo' }))

    await expect(answer).resolves.toEqual([{ answers: ['Vidéo'] }])
    expect(useAssistant.getState().choosing).toBeNull()
  })

  // Dismissing is an answer too, and the only one that picks nothing on the person's behalf.
  it('answers nothing when the question is dismissed', async () => {
    const answer = asked()
    drawn()

    await userEvent.click(screen.getByRole('button', { name: /tomber/ }))

    await expect(answer).resolves.toBeNull()
  })

  it('offers every choice the model named', () => {
    void asked()
    drawn()

    expect(screen.getAllByRole('radio').map(one => one.parentElement?.textContent)).toEqual([
      'Image',
      'Vidéo',
      'Audio',
    ])
    expect(screen.getAllByRole('button').map(one => one.textContent)).toEqual(['Laisser tomber'])
  })

  // 🛑 A question with NO choices is the ordinary case: a card drawing a list alone could not
  // serve the very question the `ask` key was built for.
  it('sends a question with nothing to press to the field below', () => {
    void useAssistant.getState().askChoice([{ question: 'Quel nom ?', choices: [] }])
    drawn()

    expect(screen.getByText(/dans le champ/)).toBeInTheDocument()
    expect(screen.getAllByRole('button').map(one => one.textContent)).toEqual(['Laisser tomber'])
  })

  /**
   * 🛑 One at a time, and QUEUED rather than answered `null`: read as a dismissal, a question
   * that arrived beside another ended its chain as stopped with nobody ever shown a thing.
   */
  it('queues a second question rather than replacing the one on screen', async () => {
    const first = asked()
    const second = useAssistant
      .getState()
      .askChoice([{ question: 'Autre chose ?', choices: ['Oui'] }])

    expect(useAssistant.getState().choosing?.questions[0]?.question).toBe('Dans quel espace ?')

    useAssistant.getState().choose(null)
    await expect(first).resolves.toBeNull()

    // The one that waited takes the screen the moment the first is settled.
    expect(useAssistant.getState().choosing?.questions[0]?.question).toBe('Autre chose ?')
    useAssistant.getState().choose([{ answers: ['Oui'] }])
    await expect(second).resolves.toEqual([{ answers: ['Oui'] }])
  })

  /** 🛑 Six fields all named « Réponse » say nothing about WHICH question they answer: the group
   * carries the question, which is what a reader is told before the field it holds. */
  it('names each field by the question it answers', () => {
    void useAssistant.getState().askChoice([
      { question: 'Lequel ?', choices: [] },
      { question: 'Pourquoi ?', choices: [] },
    ])
    drawn()

    expect(screen.getByRole('group', { name: 'Lequel ?' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Pourquoi ?' })).toBeInTheDocument()
    useAssistant.getState().choose(null)
  })

  /**
   * 🛑 The bound is claimed as "what one card may hold" and enforced in the PARSER: drawn here so
   * the claim is measured where it is made.
   */
  it('draws a full card of questions', () => {
    void useAssistant.getState().askChoice(
      Array.from({ length: MOST_QUESTIONS }, (_unused, at) => ({
        question: `q${at}`,
        choices: ['a'],
      })),
    )
    drawn()

    expect(screen.getAllByRole('radio', { name: 'a' })).toHaveLength(MOST_QUESTIONS)
    useAssistant.getState().choose(null)
  })

  /**
   * 🛑 A row of look-alike buttons said nothing about how many answers were allowed. A BOX says
   * several, a radio says one — and the set comes back in the order it was offered.
   */
  it('ticks boxes and keeps every answer where the question allows several', async () => {
    const answers = useAssistant
      .getState()
      .askChoice([{ question: 'Lesquels ?', choices: ['Image', 'Vidéo', 'Audio'], many: true }])
    drawn()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Audio' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Image' }))
    await userEvent.click(screen.getByRole('button', { name: /Envoyer les réponses/ }))

    await expect(answers).resolves.toEqual([{ answers: ['Image', 'Audio'] }])
  })

  /** 🛑 Several questions in one breath: the composer answers ONE, so a form collects the rest
   * and hands them all back together. */
  it('hands back one answer per question of a questionnaire', async () => {
    const answers = useAssistant.getState().askChoice([
      { question: 'Lequel ?', choices: ['Bateau', 'Avion'] },
      { question: 'Pourquoi ?', choices: [], note: true },
    ])
    drawn()

    await userEvent.click(screen.getByRole('radio', { name: 'Avion' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Réponse' }), 'plus rapide')
    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'pour un test')
    await userEvent.click(screen.getByRole('button', { name: /Envoyer les réponses/ }))

    await expect(answers).resolves.toEqual([
      { answers: ['Avion'] },
      { answers: ['plus rapide'], note: 'pour un test' },
    ])
  })

  /** 🛑 The queue waits on the confirmation door too: a modal held the screen while a question,
   * answered `null` on the spot, ended its chain with nobody shown a thing. */
  it('shows a question that waited behind a confirmation', async () => {
    const granted = useAssistant
      .getState()
      .ask({ action: 'project.create', input: {}, commitment: 'studio' })
    const waited = asked()

    expect(useAssistant.getState().choosing).toBeNull()

    useAssistant.getState().answer(true)
    await expect(granted).resolves.toMatchObject({ granted: true })
    expect(useAssistant.getState().choosing?.questions[0]?.question).toBe('Dans quel espace ?')

    useAssistant.getState().choose(null)
    await expect(waited).resolves.toBeNull()
  })

  it('refuses a confirmation while a question of its own stands', async () => {
    const first = asked()

    await expect(
      useAssistant.getState().ask({ action: 'project.create', input: {}, commitment: 'studio' }),
    ).resolves.toMatchObject({ granted: false })
    useAssistant.getState().choose(null)
    await first
  })
})
