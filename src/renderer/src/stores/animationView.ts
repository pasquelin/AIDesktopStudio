import { create } from 'zustand'
import { movedWithin } from '@shared/domain/order'
import type { Viewport } from '@/engines/timeline/timelineGeometry'
import { DEFAULT_VIEWPORT } from '@/engines/timeline/viewport'

/**
 * How each scene's animation band is being looked at, and what is picked in it.
 *
 * Outside the document for the same reasons the montage's viewport is: a zoom is not an edit and
 * has no business on the undo stack, and the panel is unmounted whenever the workspace leaves 3D.
 *
 * `autoKey` sits here rather than in the document because it says how one WORKS, not what one
 * made — the same rule that puts a track's armed flag outside the history.
 */
export type AnimationView = {
  viewport: Viewport
  /** Subjects whose channels are unfolded, by `subjectKey`. Absent means folded. */
  expanded: readonly string[]
  /** What the band holds picked: a key as `keyId(rowId, time)`, a shot as its own id. */
  selected: readonly string[]
  /**
   * The block the band shows as chosen, by its own id. Choosing is not editing, so it lives here
   * and never in the document — and it empties the key selection, since Delete must have one
   * answer and the eye one thing to read.
   */
  pickedBlock: string | null
  /** Whether moving an object writes a key rather than its rest pose. */
  autoKey: boolean
  /** Whether the head starts over at the end rather than stopping there. */
  looping: boolean
  /**
   * The motion FILE this band is editing, or `null` for one nothing has filed yet. Here rather
   * than in the document for `autoKey`'s reason, and keyed the same way: two workbenches open at
   * once edit two motions.
   */
  openMotion: string | null
  /**
   * How the lines have been arranged, by `subjectKey`. Empty leaves the scene's own order.
   *
   * A way of working, never the scene: the objects one is animating are brought together at the
   * top of the sheet, and the outliner keeps the hierarchy exactly as it was.
   */
  order: readonly string[]
}

const DEFAULT_ANIMATION_VIEW: AnimationView = {
  viewport: DEFAULT_VIEWPORT,
  expanded: [],
  selected: [],
  pickedBlock: null,
  autoKey: false,
  looping: false,
  openMotion: null,
  order: [],
}

export type AnimationViewState = {
  views: Record<string, AnimationView>
  setViewport: (documentId: string, viewport: Viewport) => void
  toggleExpanded: (documentId: string, subjectId: string) => void
  setSelected: (documentId: string, selected: readonly string[]) => void
  setPickedBlock: (documentId: string, pickedBlock: string | null) => void
  setAutoKey: (documentId: string, autoKey: boolean) => void
  setLooping: (documentId: string, looping: boolean) => void
  openMotion: (documentId: string, openMotion: string | null) => void
  /**
   * Moves one line in the sheet's own arrangement, and answers how many places it ACTUALLY
   * travelled — nothing at the ends of the stack, which is what `RowReorder.move` owes its caller.
   *
   * `shown` only SEEDS the arrangement, on the first drag: it is the order the sheet displays,
   * the whole of it and not the moved id alone, because an order holding one entry would send
   * every other line behind it. Once there IS an arrangement, this reads it rather than what the
   * caller carries — a `shown` captured at render goes stale between two steps of one gesture,
   * and the sheet then banks a place the line never took.
   */
  moveRow: (documentId: string, shown: readonly string[], rowId: string, by: number) => number
  forget: (documentId: string) => void
}

export const useAnimationViews = create<AnimationViewState>()(set => ({
  views: {},

  setViewport: (documentId, viewport) =>
    set(state => write(state, documentId, view => ({ ...view, viewport }))),

  toggleExpanded: (documentId, subjectId) =>
    set(state =>
      write(state, documentId, view => ({
        ...view,
        expanded: view.expanded.includes(subjectId)
          ? view.expanded.filter(held => held !== subjectId)
          : [...view.expanded, subjectId],
      })),
    ),

  // Picking a key drops the picked block, and the other way round: with both held, Delete would
  // have two answers and the eye no way of knowing which.
  setSelected: (documentId, selected) =>
    set(state => write(state, documentId, view => ({ ...view, selected, pickedBlock: null }))),

  setPickedBlock: (documentId, pickedBlock) =>
    set(state =>
      write(state, documentId, view =>
        // Identity is the answer to "the same block, again", for `moveRow`'s reason: a control
        // that rewrites its block on every tick of a slider repaints the whole band with it.
        view.pickedBlock === pickedBlock && view.selected.length === 0
          ? view
          : { ...view, pickedBlock, selected: [] },
      ),
    ),

  setAutoKey: (documentId, autoKey) =>
    set(state => write(state, documentId, view => ({ ...view, autoKey }))),

  setLooping: (documentId, looping) =>
    set(state => write(state, documentId, view => ({ ...view, looping }))),

  openMotion: (documentId, openMotion) =>
    set(state => write(state, documentId, view => ({ ...view, openMotion }))),

  moveRow: (documentId, shown, rowId, by) => {
    let travelled = 0

    set(state =>
      write(state, documentId, view => {
        const current = view.order.length > 0 ? view.order : shown
        const from = current.indexOf(rowId)
        if (from === -1) return view

        const order = movedWithin(current, rowId, by)
        travelled = order.indexOf(rowId) - from
        // Identity is the answer to "nothing moved": rewriting the view would rebuild every row
        // of the sheet, on every step of a drag against the end of the stack.
        return order === current ? view : { ...view, order }
      }),
    )

    return travelled
  },

  forget: documentId =>
    set(state => {
      const { [documentId]: gone, ...views } = state.views
      void gone
      return { views }
    }),
}))

function write(
  state: Pick<AnimationViewState, 'views'>,
  documentId: string,
  change: (view: AnimationView) => AnimationView,
): Pick<AnimationViewState, 'views'> {
  return { views: { ...state.views, [documentId]: change(animationViewOf(state, documentId)) } }
}

/** A document nobody has looked at yet is looked at the default way. */
export function animationViewOf(
  state: Pick<AnimationViewState, 'views'>,
  documentId: string,
): AnimationView {
  return state.views[documentId] ?? DEFAULT_ANIMATION_VIEW
}

/**
 * The picked keys as a set, for the paint and the hit test to ask in one step.
 *
 * NOT a zustand selector, and it must not become one: a fresh Set per call is a new snapshot on
 * every render, and the subscription then never settles — the trap `modelFiles` carries a note
 * about. Callers wrap it in a `useMemo` keyed on the array, whose identity IS stable.
 */
export function keySetOf(keys: readonly string[]): ReadonlySet<string> {
  return new Set(keys)
}
