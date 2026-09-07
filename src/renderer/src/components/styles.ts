import { cn } from '@/helpers/cn'

/**
 * Class strings shared by more than one component in `design/`. A shape used by a single
 * component stays in that component's file — what lands here is what would otherwise drift
 * apart, and every name here has to be unique across the folder.
 */

/**
 * The chrome every button of the docks shares, whether it carries a glyph or a label. Its own
 * gauge is left to the caller: `ToolButton` is square, `Button` is as wide as its word.
 */
export const BUTTON_BASE = cn(
  'inline-flex cursor-pointer items-center justify-center rounded-(--radius-sc-md)',
  'border-none transition-colors',
  'disabled:cursor-not-allowed disabled:opacity-40',
)

/**
 * What a button of the docks is FILLED with when it is not the one action a surface exists for —
 * the fill, the ink written on it, and what the pointer does to that fill.
 *
 * Apart from `BUTTON_BASE` because the two answer different questions: that one is the shape,
 * this one is the colour. **A site can want the chrome and not the fill, and
 * `ToolButton` is the witness**: it takes `BUTTON_BASE` over `bg-transparent`, because a tool sits
 * on the bar it belongs to rather than on a surface of its own.
 *
 * Worn by `Button`'s neutral variant, and by that alone since `Spark`'s idea card was removed —
 * this paragraph named it as a second site for a good while after it had gone. It stays a shared
 * constant all the same: `Counts` reaches the same PAIR of classes by another road, and the day
 * a second component wants the fill without `Button`'s geometry, the answer must not be a copy.
 *
 * **`Counts` reaches the same pair and is NOT a second site**, which is worth writing because the
 * classes look identical: it gets its hover from `rowSkin` and writes `bg-surface` beside it, so
 * what it is is a ROW that happens to sit on a surface — smaller radius, a `group/row` its
 * subtitle reads, and a refused state. Unifying the two was measured and refused on 2026-08-12.
 */
export const BUTTON_NEUTRAL = 'bg-surface text-text hover:bg-elevated'

/**
 * A button laid OVER what it acts on, rather than around it.
 *
 * The shape four surfaces reached for independently — a shelf tile, a texture channel, a texture
 * slot, a model's material — and always for the same reason: those hosts render a `figure`, a
 * `div` or a `p`, and a `button` takes phrasing content only. Wrapping them is invalid HTML, so
 * the press target is drawn on top instead, invisible and the size of its host.
 *
 * The RADIUS stays with the caller, as `BUTTON_BASE` leaves the gauge: it has to match the host's
 * corner, and the four hosts do not share one. No fill either — a surface that is invisible at
 * rest and lights up under the pointer is a decision for the host to take (`rowSkin`), not one
 * this shape should smuggle in.
 */
export const OVERLAY_BUTTON = 'absolute inset-0 cursor-pointer border-none bg-transparent'

/**
 * The control language shared by the bars: same height token, so the density setting reaches
 * every one of them at once.
 */
export const CONTROL = 'bg-surface text-text h-(--sc-control) rounded-(--radius-sc-md) text-tiny'

/**
 * The OS list, wearing the studio's control language — a blend mode, an animation clip, a bone,
 * a model. Four of them, chosen native each time for the same reason: past a dozen entries the
 * OS list is searchable by keystroke and a flyout is a menu to scroll.
 *
 * The room around the text is the whole of what this adds to `CONTROL`, and it is here because
 * it was the same decision four times. The WIDTH is not: it belongs to the host — a full row in
 * an inspector, a capped one on a toolbar — and stays at the call site.
 */
export const NATIVE_SELECT = cn(CONTROL, 'px-1')

/**
 * A button of the status line. Icon-first, the glyph measured 12 x 12 — half of what WCAG 2.2
 * SC 2.5.8 asks — and only the criterion's spacing exception saved them.
 *
 * The pull-back is what lets the target grow without the line growing under it: the footer has
 * no height of its own, so a control-tall button takes it from 29px to 40 (measured, both ways).
 */
export const STATUS_BUTTON = cn(
  'hover:text-text -my-(--sc-gutter) flex h-(--sc-control) min-w-(--sc-control)',
  'items-center justify-center gap-1.5',
)

/**
 * A read-out laid over a viewport: the counters in one corner, the flight keys along the bottom.
 *
 * Deaf to the pointer — it covers the canvas, and a click meant for the model must not land on a
 * read-out. The translucent panel fill keeps it legible over whatever the scene renders behind.
 */
export const VIEWPORT_READOUT = cn(
  'text-muted bg-panel/80 text-mini pointer-events-none absolute',
  'rounded-(--radius-sc-md) px-2 py-1',
)

/**
 * A control laid over a canvas rather than in a bar: the view name on each 3D pane, which opens
 * that pane's menu.
 *
 * Pointer events are turned back ON here because the grid above the canvas turns them off — a
 * drag has to reach the viewport, and only the words are allowed to catch it. The translucent
 * panel fill is what keeps the word readable over whatever the scene renders behind it.
 */
export const CANVAS_TRIGGER = cn(
  'text-muted hover:text-text bg-panel/80 pointer-events-auto cursor-pointer',
  'text-mini flex items-center gap-1.5 whitespace-nowrap',
  'rounded-(--radius-sc-sm) border-none px-1.5 py-0.5',
)

/**
 * An action worded INSIDE a sentence — the home's "restore them" is the one so far.
 *
 * A `button` rather than an `a`: nothing is navigated to, and a link that goes nowhere is a
 * promise the browser cannot keep. Underlined all the same, because inside running text the
 * colour alone is what a reader is asked not to rely on (WCAG SC 1.4.1). It takes the size of
 * the sentence around it, so no text token is set here.
 */
export const INLINE_LINK = cn(
  'text-accent-ink cursor-pointer rounded-(--radius-sc-sm) border-none bg-transparent',
  'p-0 underline',
)

/**
 * A control of the title bar: the space pills on one end, the account trigger on the other.
 * Nothing until hovered, so the bar reads as a row of destinations rather than as a strip of
 * buttons. Gauge, padding and the active state stay with the caller — a pill is as wide as its
 * word, the account trigger is capped.
 *
 * Its own hover, half-opaque, is what makes it the title bar's and not a toolbar's: `ToolButton`
 * lights up at full `elevated`, and a bar of destinations that answered as loudly as a tool would
 * read as a strip of tools.
 */
export const TITLE_BAR_GHOST = cn(
  'flex cursor-pointer items-center rounded-(--radius-sc-md) border-none',
  'text-muted bg-transparent transition-colors',
  'hover:bg-elevated/60 hover:text-text',
)

/**
 * The two of them that OPEN something rather than switch to it — the assistant's entry, the
 * account trigger. Both carry an icon and a word at the gauge, which is what the pills beside
 * them do not: a pill is as wide as the space it stands for and pads to match.
 */
export const TITLE_BAR_TRIGGER = cn(TITLE_BAR_GHOST, 'text-tiny h-(--sc-control) gap-1.5 px-2')

/**
 * The shape of ONE LINE: how it is laid out, and its inset from whatever paints the fill.
 *
 * **No gutter.** It carried one, and the gutter is what a line of CONTROLS wants — between a
 * glyph and a word that belong together it is dead space, and between two columns that already
 * have a width of their own it is dead space twice over. `Tree` stacks three such columns, and
 * the gutters between them added 12px to every line of every panel in the studio, on top of an
 * inset the columns did not need either. What separates the tree's columns is their own width;
 * `Row` adds the half-step where it really does hold a glyph beside a word.
 *
 * Written here because `Tree` and `Row` must AGREE on it: the tree draws the indent and the
 * chevron, the row draws the icon and the name, and the two meet in the middle of every line.
 */
export const ROW_LINE = 'flex h-full items-center px-1'

/**
 * What a row's own wrapper takes inside a cell — and `min-w-0` is the point: a flex item defaults
 * to `min-width: auto`, so a wrapper carrying only `h-full` is as wide as the longest name in the
 * list and `Row`'s `truncate` never fires.
 */
export const ROW_WRAPPER = 'h-full min-w-0 flex-1'

/**
 * Hover and selection of one line in a list. The same line must not light up differently
 * depending on whether a `Tree` or a `Collection` is holding it — nor on which list it is, which
 * is the whole of why there is one fill here and no second tone to ask for.
 *
 * Everything past `selected` is named rather than positional, and `surface` is why: it arrived as
 * a fourth boolean, and the one call that needed it had to spell out the two defaults in front of
 * it — `rowSkin(picked, false, 'soft', false)`, four values of which three say nothing.
 */
export type RowSkin = {
  /**
   * What is wearing the skin, and the one thing that decides whether the pointer fills anything.
   *
   * A `row` answers no, and both surfaces that draw one agree: rows sit shoulder to shoulder, so
   * a fill following the pointer reads as a block sliding over the list rather than as one line
   * answering — and running past a picked row it briefly wears the same weight as the selection
   * it is meant to sit beside. What says where the pointer is in a list is the pointer.
   *
   * A `tile` answers yes — the home's tools, a texture channel — because there the fill is the
   * whole of what says the tile can be pressed: nothing else about it looks like a control. Its
   * quiet ink goes with it, and has its own constant: `TILE_QUIET`.
   */
  surface?: 'row' | 'tile'
  disabled?: boolean
}

export function rowSkin(
  selected: boolean,
  // `row` by default, which is what the function is called: a surface arriving here without a
  // word on the subject is a list until it says otherwise, and a list that quietly took a hover
  // back is the defect this batch went to remove.
  { surface = 'row', disabled }: RowSkin = {},
): string {
  // `elevated` is the studio's hover token — what a toolbar button lights up with.
  return cn(
    'rounded-(--radius-sc-sm)',
    // Named, and paired with `data-selected` on the SAME element: `Row` reads both to lift its
    // title and its subtitle out of `muted`, which carries 3.25:1 on `accent-soft`.
    //
    // A refused row takes no group, because its background does not answer a pointer either —
    // and a row that is refused WHILE selected therefore keeps the muted subtitle on
    // `accent-soft`. That case is real (`Models.tsx` can hold a pick the plan no longer allows)
    // and it is left alone knowingly: `opacity-40` is already on it, and WCAG 1.4.3 exempts a
    // disabled control. Lifting the ink there would say the row is available.
    !disabled && 'group/row',
    selected && 'bg-accent-soft',
    // Three refusals in one condition rather than a fill written and then undone: a `hover:` that
    // exists only to cancel another `hover:` is one class the day either of them moves.
    surface === 'tile' && !selected && !disabled && 'hover:bg-elevated',
    // A refused line that still lit up under the pointer read as pickable right until the click
    // that does nothing. `MenuRow` reached the same pair on its own — this is where a list row
    // gets it, so `Tree` inherits it too.
    disabled && 'cursor-not-allowed opacity-40',
  )
}

/**
 * The quiet ink of a word that lives INSIDE a row — a subtitle, a kind, the help under a tile.
 *
 * `muted` is quiet enough at rest and not enough once the row is PICKED: it carries 3.25:1 on
 * `accent-soft`, under the 4.5 of WCAG 1.4.3. Raising the token would repaint every dimmed word in
 * the studio, so the word is lifted on that state instead — read from `rowSkin`'s group, which is
 * why no list has to pass its state down.
 *
 * It once carried a hover lift beside it, for `elevated` at 3.51:1. That fill left the lists on
 * 2026-08-14 and the lift went with it: a variant firing on a background that no longer moves is
 * a word brightening under the pointer for no reason a reader could name. What still hovers is a
 * TILE, and it wears `TILE_QUIET` below rather than writing the variant out again.
 *
 * Written once because five sites had reached the same classes, one of them twice. A site whose
 * row has no selection carries the variant harmlessly: the attribute never appears.
 */
export const ROW_QUIET = cn('text-muted transition-colors', 'group-data-selected/row:text-text')

/**
 * The same quiet ink on a surface that still FILLS under the pointer — `rowSkin`'s `tile`, and
 * nothing else. `muted` reads 3.51:1 on `elevated`, under the 4.5 of WCAG 1.4.3, so the word has
 * to leave it exactly where that fill arrives.
 *
 * A constant rather than the variant written at each tile, and the reason is the guard next door:
 * `styles.test.ts` refuses `group-hover/row:text-text` anywhere outside this file. Without this
 * export that rule could only be kept as a list of filenames allowed to break it, which is a rule
 * that stops refusing anything the moment a second name is added to it.
 */
export const TILE_QUIET = cn(ROW_QUIET, 'group-hover/row:text-text')

/** The ink of the NAME in a row — the counterpart of `ROW_QUIET`, which lifts under it. */
export const ROW_INK = 'text-text transition-colors'

/**
 * A file's extension shown beside a name that does not carry it — the naming field's, and any
 * other surface that is not a row. Monospaced because it is a file's spelling, not a word.
 */
export const FILE_EXTENSION = 'text-muted font-mono'

/**
 * The same at the end of a row's title, where the ink has to lift with the row — `ROW_QUIET`.
 * `shrink-0`, so a name too wide for the panel is what gets cut, never the extension.
 */
export const ROW_SUFFIX = cn(ROW_QUIET, 'ml-1 shrink-0 font-mono')

/**
 * What a line NAMES, among metadata left muted beside it: the room the rest leaves, cut short.
 * No transition, unlike `ROW_INK` — these words never change ink, and a row that lifts its name
 * on selection wants the pair above instead.
 */
export const ROW_SUBJECT = 'text-text min-w-0 flex-1 truncate text-xs'

/**
 * A labelled toggle: the shape buttons of a texture, the view modes of a sky, the shelves of the
 * home. Written once because three surfaces had it, and one had already drifted — it lit up in
 * `accent-soft` where the others use `elevated`, the studio's hover token.
 *
 * The journal's filters were a fourth, and are no longer: eleven of these took a third of the
 * panel, and they are a menu now. A chip suits a handful of choices that all fit on one row.
 */
export function chipSkin(active: boolean): string {
  return cn(
    'h-(--sc-control) cursor-pointer rounded-(--radius-sc-sm) border-none px-2 text-xs',
    active ? 'bg-elevated text-text' : 'text-muted hover:text-text bg-transparent',
  )
}

/**
 * `--sc-control` at its tallest, as a number — what `useGauge` falls back on when the gauge
 * cannot be read, and nothing else. No call site passes it any more: three did, each of them
 * right at one density only, and `useRowHeight` now reads the gauge once for both virtualized
 * surfaces.
 *
 * A surface whose rows are sized by the gauge itself must read the gauge, not this: the two part
 * company in compact density, and the difference is reserved space nobody paints.
 */
export const LIST_ROW_HEIGHT = 28

/**
 * `--sc-row-stacked` at its tallest, as a number — the fallback for a list whose rows stack a
 * name over a subtitle, where `LIST_ROW_HEIGHT` leaves no room at all.
 *
 * Like its neighbour, this is the value a gauge that cannot be read falls back to, never the
 * value to write at a call site: `useRowHeight` reads the gauge, and a caller passing a number
 * would go back to being right at one density only.
 */
export const STACKED_ROW_HEIGHT = 36

/**
 * `--sc-row-filled` at its tallest, as a number — two steps of text with the room a fill takes
 * off them. Only the home's projects list asks for it.
 */
export const FILLED_ROW_HEIGHT = 44

/** `--sc-row-media` at its tallest, as a number. Same rule as its neighbours: a fallback only. */
export const MEDIA_ROW_HEIGHT = 48

/**
 * The room a panel keeps between its content and its edges. One value for the studio, so prose,
 * forms and cards all sit on the same line. A list row is the exception: it runs edge to edge for
 * its fill, and takes `ROW_LINE`'s half-step instead.
 */

export * from './panelStyles'
