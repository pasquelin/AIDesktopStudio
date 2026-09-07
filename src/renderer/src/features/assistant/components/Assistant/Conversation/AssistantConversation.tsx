import { useEffect, useId, useRef, useState } from 'react'
import { isComposing } from '@/helpers/composition'
import { answeredByComposer } from '@shared/domain/assistant'
import { AI_SECTION } from '@/helpers/aiSectionLazy'
import { useAssistantDoor } from '@/hooks/useAssistantDoor'
import { useAssistantOffer } from '@/hooks/useAssistantOffer'
import { useAssistantSuggestions } from '@/hooks/useAssistantSuggestions'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { useAssistant, type AssistantChoiceQuestion } from '@/stores/assistant'
import { useDictation } from '@/stores/dictation'
import { useSettings } from '@/stores/settings'
import { useMissions } from '@/stores/missions'
import { registerDictationTarget } from '@/features/dictation/destination'
import { registerChatPanel } from '../../../chatPanel'
import { AssistantConversationView } from './AssistantConversationView'

/** Whether what is typed — or spoken — is the answer to the question standing. */
const typedInto = (choosing: AssistantChoiceQuestion | null): boolean =>
  choosing !== null && answeredByComposer(choosing.questions)

/**
 * The conversation: what has been said, what is asked, and the place one writes. Two hosts — the
 * right column's panel and the empty centre — one store, one thread, never both at once. It
 * claims the caret while mounted, the spoken word only while read; the confirmer is the shell's.
 *
 * 🛑 It FILLS what it is given, at the scale the docks read at: the width of a page and the type
 * of one belonged to the modal, and a column the reader can drag to 140 px does not have either.
 */
export function AssistantConversation() {
  // `useId` and not a module constant: two hosts never mount at once today, and an id that
  // assumed it would be a broken `aria-activedescendant` the day one does.
  const listId = useId()
  const turns = useAssistant(state => state.turns)
  const missionEvents = useMissions(state => state.events)
  const busy = useAssistant(state => state.busy)
  const round = useAssistant(state => state.round)
  const stop = useAssistant(state => state.stop)
  // Two writes per chain, not sixty a second — unlike the tail, which left with the working line.
  const stopping = useAssistant(state => state.stopping)
  const asked = useAssistant(state => state.asked)
  const choosing = useAssistant(state => state.choosing)
  // 🛑 The exception to "a plan is running, the field is shut": ONE question with nothing to press
  // is answered by typing. A questionnaire is answered in its own card, so the field shuts again.
  const typing = typedInto(choosing)
  const micOpen = useDictation(store => store.state === 'listening')
  const draft = useAssistant(state => state.draft)
  const setDraft = useAssistant(state => state.setDraft)
  const offer = useAssistantOffer()
  useAssistantDoor()
  const openSection = useSettings(state => state.openSection)
  const keyLabel = useShortcutLabel()

  // Focus IN the block, not on the field: the microphone button is one of its children, and
  // pressing it must not hand the spoken word back to whatever the caret was in before.
  const [inside, setInside] = useState(false)
  /**
   * A session begun here and still running once the caret has moved on: one dictates with the
   * hands off the keyboard, so looking at the canvas mid-sentence must not hand the rest of the
   * sentence to whatever is under the pointer. It falls on its own when the microphone shuts.
   */
  const [speaking, setSpeaking] = useState(false)

  const thread = useRef<HTMLOListElement>(null)
  /**
   * Whether the thread was at its end when the last turn arrived.
   *
   * Kept so that reading back through the conversation is not undone by the answer that lands
   * while one is reading: the thread follows the newest line only for someone already there.
   */
  const following = useRef(true)
  const suggestions = useAssistantSuggestions({ draft, busy, setDraft })
  const { field: fieldRef } = suggestions

  /**
   * Follows the newest line, but only for someone who was already at it.
   *
   * Unconditional, it yanked the thread back down every time an answer landed — including while
   * one was reading an earlier exchange, which is exactly when an answer lands.
   */
  const rememberScroll = (): void => {
    const list = thread.current
    if (!list) return
    // A few pixels of tolerance: a thread scrolled to its end lands a fraction short of the
    // arithmetic often enough that an exact comparison answers "not at the end" for good.
    following.current = list.scrollHeight - list.scrollTop - list.clientHeight < SCROLL_SLACK
  }

  useEffect(() => useAssistant.getState().stage(), [])

  // ⌘K and the native menu reach the field through this, wherever the conversation stands. The
  // two hosts are never up together, so the last to mount is always the one on screen.
  useEffect(() => registerChatPanel({ focus: () => fieldRef.current?.focus() }), [fieldRef])

  /**
   * The spoken word, and only for a reader who came HERE to speak. 🛑 Not for as long as the
   * panel is mounted: it is what an untouched right column draws, so an unconditional claim
   * would send every dictation of the studio here — the prompt of a generation included.
   */
  const heard = inside || (speaking && micOpen)
  useEffect(() => {
    useAssistant.setState({ hearing: heard })
    if (!heard) return

    return registerDictationTarget(text => {
      const assistant = useAssistant.getState()
      // While a plan is running the assistant takes no new sentence — but the words were spoken,
      // and dropping them left no trace at all. They land in the field instead. A question
      // STANDING is the exception: `say` reads what is spoken as its answer, as it does typing.
      if (assistant.busy && !typedInto(assistant.choosing)) {
        assistant.setDraft(assistant.draft === '' ? text : `${assistant.draft} ${text}`)
        return
      }

      void assistant.say(text)
    })
  }, [heard])

  // Leaving over a live microphone used to leave it running, with the status line quietly
  // changing to "dictating to the field".
  useEffect(
    () => () => {
      useAssistant.setState({ hearing: false })
      if (useDictation.getState().state === 'listening') void useDictation.getState().stop()
    },
    [],
  )

  /**
   * 🛑 `round` and `asked` as well as `turns`: the working line is the LAST child of the thread
   * now, and it appears without a turn changing — a round starting, a confirmation granted. Kept
   * on `turns` alone it was appended below the fold, and the one thing saying "it is still
   * working" was the one thing out of sight.
   */
  useEffect(() => {
    const list = thread.current
    if (list && following.current) list.scrollTop = list.scrollHeight
  }, [turns, missionEvents, busy, round, asked, choosing])

  // 🛑 Never the whole conversation. `registerConfirmer` answers for MCP actions too, which need
  // no assistant model — swallowing the thread here left a question on screen that could not be
  // read, granted, or priced.
  const unserved = offer === 'unserved'

  const send = (): void => {
    // Sending is asking to see the answer. Without this, one trip up the thread to reread an
    // earlier exchange turned the following off for the rest of the session — every later reply
    // then landed out of sight, with nothing on screen saying why.
    following.current = true
    void useAssistant.getState().say(draft)
    // Here rather than in `say`, which also serves dictation: that path sends the SPOKEN words,
    // and emptying the field there destroyed whatever was half-typed beside them.
    setDraft('')
  }

  return (
    <AssistantConversationView
      turns={turns}
      hasMissionEvents={missionEvents.length > 0}
      asked={asked}
      choosing={choosing}
      setThreadElement={element => {
        thread.current = element
      }}
      onThreadScroll={rememberScroll}
      micOpen={micOpen}
      unserved={unserved}
      openSettings={() => openSection(AI_SECTION)}
      listId={listId}
      listed={suggestions.listed}
      rows={suggestions.rows}
      heldRow={suggestions.heldRow}
      take={suggestions.take}
      setFieldElement={element => {
        fieldRef.current = element
      }}
      draft={draft}
      ghost={suggestions.ghost}
      keyLabel={keyLabel}
      busy={busy}
      typing={typing}
      stopping={stopping}
      stop={stop}
      setDraft={setDraft}
      setCaretAtEnd={suggestions.setCaretAtEnd}
      setWriting={suggestions.setWriting}
      onFieldKeyDown={event => {
        if (suggestions.steer(event)) return event.preventDefault()
        if (event.key !== 'Enter' || event.shiftKey || isComposing(event)) return
        event.preventDefault()
        send()
      }}
      send={send}
      onFocus={() => setInside(true)}
      onBlur={event => {
        const stays = event.currentTarget.contains(event.relatedTarget)
        setInside(stays)
        if (!stays) setSpeaking(micOpen)
      }}
    />
  )
}

/**
 * How close to the end still counts as being at it, in pixels.
 *
 * Not a design value: it is the tolerance of an arithmetic comparison, and a thread scrolled all
 * the way down lands a fraction short of `scrollHeight` often enough that an exact test answers
 * "the reader has scrolled away" for the rest of the conversation.
 */
const SCROLL_SLACK = 24
