import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Input } from './Input'
import { isComposing } from '@/helpers/composition'
import { isGoneForGood } from '@/helpers/teardown'

export type InlineRenameProps = {
  value: string
  /** Already translated: the field draws what it is handed and looks nothing up. */
  label: string
  /** Fired with the trimmed name. Never with an empty one — a nameless row cannot be found. */
  onCommit: (name: string) => void
  /**
   * How tall the field stands. `control` fills the row, which is what a row that shows nothing
   * else while the name is edited wants. `inline` is for a row that keeps its own controls on
   * screen beside the field, and has to leave them their gauge.
   */
  gauge?: 'control' | 'inline'
}

const GAUGE = {
  control: '',
  inline: 'text-tiny h-(--sc-control-inline)',
}

/**
 * A name, edited where it is read. Written once for the layer stack and the track headers: what
 * makes it subtle is not the input, it is when the edit ends.
 *
 * Committed on Enter, on blur, and on unmount. The last one is the one that bites: both lists
 * are virtualized and re-key their rows on every change, so a layer added while a name is being
 * typed tears the field out of the tree — and React fires no blur for an input it unmounts.
 */
export function InlineRename({ value, label, onCommit, gauge = 'control' }: InlineRenameProps) {
  const [draft, setDraft] = useState(value)
  // Read by the unmount cleanup, which must not re-run on every keystroke to see the last one.
  // NOT `useLatest`: `done` writes the abandoned draft back into it, so this ref is owned here
  // rather than mirrored — and a hook that overwrote it on the next render would fight for it.
  const latest = useRef({ draft, onCommit, value })
  /**
   * Whether a commit already happened. Without it, Enter commits and then the unmount fires a
   * SECOND commit with the same name: the caller writes asynchronously, so `value` is still the
   * old name when the field is torn down, and the "was it abandoned mid-type" guard reads true.
   */
  const committed = useRef(false)

  const field = useRef<HTMLInputElement>(null)
  /** The row whose drag handle this field borrowed, and whether it had one to lend. */
  const held = useRef<HTMLElement | null>(null)
  const wasDraggable = useRef(false)

  useEffect(() => {
    latest.current = { draft, onCommit, value }
  })

  useEffect(() => {
    /**
     * Held in a variable rather than read back from the ref, and that is the whole of the guard
     * below: React has already cleared `field.current` by the time a cleanup runs, so the cleanup
     * cannot ask the ref whether the field is still on screen.
     */
    const node = field.current

    /**
     * Taken from the effect and not left to `autoFocus` alone, and StrictMode is the reason: it
     * runs mount → cleanup → mount again, and that cleanup hands the focus back to the row. The
     * attribute fires once, at creation, so the field was left OPEN AND UNFOCUSED — a rename that
     * looks like nothing happened, and typing goes to the list instead.
     *
     * Focusing here is idempotent, so the second run puts it back. `autoFocus` stays: it lands a
     * frame earlier, before this effect, and nothing is gained by making the field flash unfocused.
     */
    node?.focus()

    // And the whole name with it: a rename opens on a name that is about to be replaced, not
    // appended to. Typing then writes the new name outright, and whoever wanted to correct one
    // letter still has a click to put the caret where they meant.
    node?.select()

    /**
     * The row stops being a drag handle while the field is typed in: Chromium begins a native
     * drag on the element carrying `draggable`, so selecting a word dragged the row instead, and
     * no `onPointerDown` this side can intercept that. The ancestor is kept in a ref rather than
     * looked up at each mount — StrictMode replays mount → cleanup → mount, and the second mount
     * would find the row this effect has already set to `false`, leaving it undraggable for good.
     */
    held.current ??= node?.closest<HTMLElement>('[draggable]') ?? null
    if (held.current?.draggable) {
      wasDraggable.current = true
      held.current.draggable = false
    }

    // Both caught while the input is still attached: `closest` from a detached node finds
    // nothing, and by the time the cleanup runs the field is out of the tree.
    const row = node?.closest<HTMLElement>('[tabindex]')
    // `tree` among them: the explorer renames inside one, so without it this fallback was dead
    // in the one list whose rows a folder watch can tear out from under the field.
    const list = node?.closest<HTMLElement>('[role="list"], [role="listbox"], [role="tree"]')

    return () => {
      /**
       * StrictMode replays mount → cleanup → mount on a field that never left the screen, and this
       * cleanup used to take the focus off it anyway — which `onBlur` reads as a commit, so the
       * owner closed the field a frame after opening it. Every rename in the studio opened and
       * shut in the same frame, looking from the outside like a gesture that did nothing.
       *
       * `isGoneForGood` is the signal that tells the two apart, and where the measurement behind
       * it is written down — the drag handle of the timeline reads the same one.
       */
      if (!isGoneForGood(node)) return

      // The row picks its drag handle back up — after the guard above, so a StrictMode replay
      // does not hand it back to a field that never left the screen. Only if it had one: the
      // explorer refuses the drag on its own folders, and handing them one would be a gesture
      // this field invented.
      if (held.current && wasDraggable.current) held.current.draggable = true

      // An input torn out of the tree leaves the focus on `document.body`, so the next Tab
      // restarts from the top of the window — whoever renamed at the keyboard is thrown out of
      // the list they were editing. Given back to the row it started on; and when that row went
      // with it — a sibling added mid-type remounts the rows at new indices — to wherever the
      // list holds its tab stop now, which at least keeps the keyboard inside the list.
      const target = row?.isConnected ? row : list?.querySelector<HTMLElement>('[tabindex="0"]')
      target?.focus()

      if (committed.current) return

      const { draft: typed, onCommit: commit, value: original } = latest.current
      const name = typed.trim()
      if (name && name !== original) commit(name)
    }
  }, [])

  const done = (): void => {
    if (committed.current) return
    committed.current = true

    const name = draft.trim()
    onCommit(name || value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Stopped here: the surfaces around these lists bind bare letters, and typing a name must
    // not arm a tool or split a clip.
    event.stopPropagation()
    // Both keys belong to the input method while it composes — see `isComposing`.
    if (isComposing(event)) return
    if (event.key === 'Enter') done()
    if (event.key === 'Escape') {
      // Restored first, so neither the blur nor the unmount writes what was abandoned.
      setDraft(value)
      latest.current = { ...latest.current, draft: value }
      committed.current = true
      onCommit(value)
    }
  }

  return (
    <Input
      ref={field}
      autoFocus
      // One handle for every caller, and it is enough: a rename is a field that replaces the row
      // being renamed, so exactly one of these is ever mounted.
      data-sc="field:rename"
      aria-label={label}
      value={draft}
      className={GAUGE[gauge]}
      onPointerDown={event => event.stopPropagation()}
      onChange={event => setDraft(event.target.value)}
      onBlur={done}
      onKeyDown={onKeyDown}
    />
  )
}
