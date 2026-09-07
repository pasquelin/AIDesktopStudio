/**
 * Dragging something of ours between two surfaces, carried on a private MIME type: a file
 * dragged in from the desktop must not look like one of our own rows.
 *
 * One channel per kind of thing, made here rather than written out per surface — the subtle
 * part is `carries`, which a drop target must ask before calling `preventDefault`, and which
 * is the difference between a drop that works and one the browser silently refuses.
 */
/**
 * The one thing every reader of a drag needs, and the least a caller has to hand over. Exported
 * so a surface that only ASKS about a drag — a list deciding whether it would take one — can name
 * it rather than write the shape again; a `React.DragEvent` satisfies it, and so does a test's
 * double.
 */
export type DragLike = { dataTransfer: DataTransfer | null }
export type DropTone = 'accepted' | 'partial' | 'refused' | 'neutral'

/**
 * `neutral` copies like the rest: `none` stops the browser from sending `drop` at all, and
 * Chromium protects the drag store during `dragover` — no name is readable there, so EVERY real
 * desktop drag is neutral until it lands. Only an averred refusal forbids.
 */
export const copiesDropTone = (tone: DropTone | null | undefined): boolean =>
  tone === 'accepted' || tone === 'partial' || tone === 'neutral'

export const warnsDropTone = (tone: DropTone | null | undefined): boolean =>
  tone === 'partial' || tone === 'refused'

export type DragChannel = {
  start: (event: DragLike, id: string) => void
  /** Whether this drag is one of ours. `getData` answers nothing until the drop itself. */
  carries: (event: DragLike) => boolean
  /** What is being dragged, at the drop. Empty before then, by design of the platform. */
  idFrom: (event: DragLike) => string | null
}

/**
 * `effect` is what a target is ALLOWED to ask for, and the default is what most drags mean: a row
 * moved, a tab reordered. A channel whose drop ADDS says `copy` here — that is the effect drawing
 * the `+` under the pointer, and asking for one the source forbade is refused in silence.
 */
export function dragChannel(
  type: string,
  effect: DataTransfer['effectAllowed'] = 'move',
): DragChannel {
  return {
    start: (event, id) => {
      if (!event.dataTransfer) return
      event.dataTransfer.setData(type, id)
      event.dataTransfer.effectAllowed = effect
    },
    carries: event => event.dataTransfer?.types.includes(type) ?? false,
    idFrom: event => event.dataTransfer?.getData(type) || null,
  }
}

export type DragListChannel = {
  start: (event: DragLike, ids: readonly string[]) => void
  carries: (event: DragLike) => boolean
  /** What is being dragged, at the drop. Empty before then, by design of the platform. */
  idsFrom: (event: DragLike) => readonly string[]
}

/**
 * The same, for a HANDFUL of things dragged as one — three files carried into a folder together.
 *
 * A separate channel rather than a comma inside the single one: a payload that is sometimes one
 * id and sometimes a list is a payload every target has to sniff, and an id holding a comma
 * would decide the question the wrong way in silence. Newline-separated, which no path of this
 * studio holds — `parseFolderPath` refuses a name with one.
 *
 * The platform still answers nothing until the drop itself, so a target asked at HOVER cannot
 * read what is coming. Whoever needs to know before then keeps it in state, as `Tree` does.
 */
export function dragListChannel(
  type: string,
  effect: DataTransfer['effectAllowed'] = 'move',
): DragListChannel {
  // Built ON the single channel rather than beside it: what differs is how the payload is
  // written, and nothing about how a `DataTransfer` is armed or read.
  const one = dragChannel(type, effect)

  return {
    start: (event, ids) => one.start(event, ids.join('\n')),
    carries: one.carries,
    idsFrom: event => (one.idFrom(event) ?? '').split('\n').filter(Boolean),
  }
}

/** What a hover may answer: a `DragEvent` satisfies it, and so does a test's double. */
export type DropOffer = { dataTransfer: DataTransfer; preventDefault: () => void }

/**
 * What the BLANK below a list answers a hover: a drag from elsewhere is COPIED into the folder,
 * one of our own rows is MOVED, anything else is left for the browser to refuse.
 *
 * Written once because the tree and the grid read the same folder and have to answer one gesture
 * the same way — they had drifted by a line. Missing the `preventDefault` is the difference
 * between a drop that works and one refused in silence.
 */
export function offerBlankDrop(
  event: DropOffer,
  takes: { copies: boolean; moves: boolean; refuses?: boolean },
): void {
  if (!takes.copies && !takes.moves && !takes.refuses) return

  event.preventDefault()
  event.dataTransfer.dropEffect = takes.refuses ? 'none' : takes.copies ? 'copy' : 'move'
}
