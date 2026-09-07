import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { completionFor, foldForSearch, matchesWords, searchWords } from '@shared/text'
import { ASSISTANT_STARTERS, starterKey } from '@/features/assistant/starters'
import { isComposing } from '@/helpers/composition'
import { useToolSurface } from '@/stores/layouts'

const atEnd = (field: HTMLTextAreaElement): boolean => field.selectionStart === field.value.length

function tailOf(sentence: string | undefined, draft: string) {
  if (sentence === undefined) return undefined
  const tail = completionFor(sentence, draft)
  return tail === undefined ? undefined : { sentence, tail }
}

type Options = {
  draft: string
  busy: boolean
  setDraft: (draft: string) => void
}

export function useAssistantSuggestions({ draft, busy, setDraft }: Options) {
  const { t } = useTranslation()
  const surface = useToolSurface()
  const field = useRef<HTMLTextAreaElement>(null)
  const matches = useMemo(() => {
    const words = searchWords(draft)
    if (words.length === 0) return []
    const written = foldForSearch(draft.trim())
    return ASSISTANT_STARTERS[surface]
      .map(starter => t(starterKey(starter)))
      .filter(one => matchesWords(one, words) && foldForSearch(one) !== written)
  }, [draft, surface, t])
  const [rank, setRank] = useState(0)
  const [given, setGiven] = useState(false)
  const [walked, setWalked] = useState(matches)
  const [caretAtEnd, setCaretAtEnd] = useState(true)
  const [writing, setWriting] = useState(false)

  if (walked !== matches) {
    setWalked(matches)
    setRank(0)
    setGiven(false)
  }

  const shown = !given && !busy ? matches : []
  const spelled = caretAtEnd ? tailOf(shown[rank], draft) : undefined
  const ghost = writing ? spelled : undefined
  const listed = spelled !== undefined && shown.length === 1 ? [] : shown
  const rows = [...listed].reverse()
  const heldRow = listed.length - 1 - rank

  const take = (sentence: string): void => {
    setDraft(sentence)
    setCaretAtEnd(true)
    field.current?.focus()
  }

  const steer = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (shown.length === 0 || isComposing(event)) return false
    const bare = !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
    if (
      ghost !== undefined &&
      bare &&
      atEnd(event.currentTarget) &&
      (event.key === 'Tab' || event.key === 'ArrowRight')
    ) {
      take(ghost.sentence)
      return true
    }
    if (event.key === 'Escape') {
      setGiven(true)
      return true
    }
    const walks = atEnd(event.currentTarget) && !draft.includes('\n')
    if (walks && listed.length > 1 && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      setRank(at => (at + (event.key === 'ArrowUp' ? 1 : -1) + listed.length) % listed.length)
      return true
    }
    return false
  }

  return {
    field,
    ghost,
    listed,
    rows,
    heldRow,
    take,
    steer,
    setCaretAtEnd,
    setWriting,
  }
}
