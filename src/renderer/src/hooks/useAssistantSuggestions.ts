import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { completionFor, foldForSearch, matchesWords, searchWords } from '@shared/text'
import { ASSISTANT_STARTERS, starterKey } from '@/features/assistant/starters'
import { isComposing } from '@/helpers/composition'
import { useToolSurface } from '@/stores/layouts'

const atEnd = (field: HTMLTextAreaElement): boolean => field.selectionStart === field.value.length

/** The sentences that answer what is typed, in the order they are held, and the tail of each. */
type Matches = { sentences: readonly string[]; tails: ReadonlyMap<string, string> }

/**
 * The sentence the row holds, what is left of it once the draft is written — nothing when the
 * draft does not open it — and whether the key WRITES it.
 *
 * 🛑 The three are not one. A row is previewed from the first keystroke, where it used to show
 * nothing: the highlight walked the list while the field under it stayed blank. But a preview
 * that does not continue the writing REPLACES it, so it is only written once the person has
 * walked onto that row: measured 2026-09-09, `Génère une image` typed in full and Tab pressed to
 * reach Send became `Génère une variante de cette image`, with no way back — the field is
 * controlled, so the native undo has nothing to give.
 */
function previewOf(matches: Matches, sentence: string | undefined, picked: boolean) {
  if (sentence === undefined) return undefined

  const tail = matches.tails.get(sentence)
  return { sentence, tail, accepts: tail !== undefined || picked }
}

/** One instance, so a keystroke that matches nothing does not look like a new list every time. */
const NO_MATCH: Matches = { sentences: [], tails: new Map() }

type Options = {
  draft: string
  busy: boolean
  setDraft: (draft: string) => void
}

export function useAssistantSuggestions({ draft, busy, setDraft }: Options) {
  const { t } = useTranslation()
  const surface = useToolSurface()
  const field = useRef<HTMLTextAreaElement>(null)
  const matches = useMemo<Matches>(() => {
    const words = searchWords(draft)
    if (words.length === 0) return NO_MATCH
    const written = foldForSearch(draft.trim())
    const found = ASSISTANT_STARTERS[surface]
      .map(starter => t(starterKey(starter)))
      .filter(one => matchesWords(one, words) && foldForSearch(one) !== written)
    // What the draft OPENS is held first, so the row against the field is one the caret can spell
    // out inline from the first keystroke: a match found by a word of its middle cannot be.
    //
    // 🛑 The tails are KEPT rather than recomputed where they are painted: `completionFor` folds
    // a slice per character of the sentence, so asking twice for the held row's tail paid that
    // whole walk again on every keystroke.
    const opening: string[] = []
    const rest: string[] = []
    const tails = new Map<string, string>()
    for (const one of found) {
      const tail = completionFor(one, draft)
      if (tail === undefined) rest.push(one)
      else {
        tails.set(one, tail)
        opening.push(one)
      }
    }
    return { sentences: [...opening, ...rest], tails }
  }, [draft, surface, t])
  const [rank, setRank] = useState(0)
  const [given, setGiven] = useState(false)
  /** Whether the arrows have carried the highlight onto this row, rather than it landing there. */
  const [picked, setPicked] = useState(false)
  const [walked, setWalked] = useState(matches)
  const [caretAtEnd, setCaretAtEnd] = useState(true)
  const [writing, setWriting] = useState(false)

  if (walked !== matches) {
    setWalked(matches)
    setRank(0)
    setGiven(false)
    setPicked(false)
  }

  const shown = !given && !busy ? matches.sentences : []
  // The field takes three lines and exists for dictated paragraphs: what the arrows walk and what
  // the mirror paints both stop at the first newline, and they read that from one place.
  const oneLine = !draft.includes('\n')
  const spelled = caretAtEnd && oneLine ? previewOf(matches, shown[rank], picked) : undefined
  const ghost = writing ? spelled : undefined
  const listed = spelled?.tail !== undefined && shown.length === 1 ? [] : shown
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
    // Tab writes what the key printed at the end of the preview promises, and only that — a
    // preview shown but not accepted leaves Tab to the focus it walks, which is what saves a
    // finished draft. The right arrow only CONTINUES: on a sentence offered in place of the
    // writing it would swap the line, where all one asked was to move the caret.
    if (
      ghost !== undefined &&
      bare &&
      atEnd(event.currentTarget) &&
      ((event.key === 'Tab' && ghost.accepts) ||
        (event.key === 'ArrowRight' && ghost.tail !== undefined))
    ) {
      take(ghost.sentence)
      return true
    }
    if (event.key === 'Escape') {
      setGiven(true)
      return true
    }
    const walks = atEnd(event.currentTarget) && oneLine
    if (walks && listed.length > 1 && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      setRank(at => (at + (event.key === 'ArrowUp' ? 1 : -1) + listed.length) % listed.length)
      setPicked(true)
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
