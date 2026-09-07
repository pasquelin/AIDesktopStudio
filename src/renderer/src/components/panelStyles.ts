import { cn } from '@/helpers/cn'

export const PANEL_INSET = 'p-2'

/**
 * A panel's scrolling body. The right padding is the point: on macOS the scrollbar is drawn
 * OVER the content rather than beside it, and with no room reserved it lands on the last column
 * of every row — which in an inspector is the value one is trying to read.
 */
export const PANEL_SCROLL = 'flex min-h-0 flex-1 flex-col overflow-y-auto pr-2'

/**
 * What a row of a list opens onto, drawn UNDER it and inside the list. Indented past the column
 * the chevron stands in, so what a row says lines up with its own name rather than with the edge
 * of the panel — the reading a tree gives its children.
 */
export const ROW_DETAIL = 'flex flex-col pb-1 pl-4'

/**
 * The stacked box a panel puts ABOVE what it acts on — a bar of filters, a message being written.
 * Ruled off rather than spaced: the body scrolls under a boundary, and a gap would let the first
 * row of a list read as part of the controls.
 */
export const PANEL_HEAD = 'border-border flex flex-col gap-2 border-b p-2'

/** A block set off from the one above it — the same boundary as `PANEL_HEAD`, drawn on top. */
export const PANEL_SECTION = 'border-border flex flex-col gap-2 border-t pt-2'

/**
 * The same boundary as `PANEL_HEAD`, drawn across ONE line. The room around it stays with the
 * caller: no two that wear it pad alike.
 */
export const PANEL_BAR = 'border-border flex items-center gap-2 border-b'

/**
 * The body of a titled run of properties, under the heading `PropertySection` folds.
 *
 * No zebra fill, and the reason is the PARITY, not the colour: `nth-child` counts DOM children
 * rather than property lines, so a button row takes a band and unfolding a vector flips everything
 * below it. The contrast half is measured in `tokens.test.ts`.
 */
export const PROPERTY_BODY = 'flex flex-col gap-2 px-2 pt-1 pb-2'

/**
 * A picture standing in a property FIELD — the texture a slot holds, the map a model carries.
 * A picture standing in a ROW is not this: `Row` sizes its own, see `ROW_MEDIA_CONTROL`.
 */
export const FIELD_THUMBNAIL = 'size-(--sc-control)'

/**
 * The box a row keeps for its picture, and the height the line itself measures — paired, because
 * one is the other less `--sc-row-pad`. `Row` picks the pair from what it carries; no caller
 * sizes a row's picture, which is how four sizes and four paddings became one of each.
 */
export const ROW_CONTROL = 'min-h-(--sc-control)'
export const ROW_STACKED = 'min-h-(--sc-row-stacked)'
export const ROW_PICTURE = 'min-h-(--sc-row-media)'

const ROW_MEDIA_BOX = 'flex shrink-0 items-center justify-center'

/**
 * The box a row keeps for its picture: the line it stands in, less `--sc-row-pad` top and bottom.
 *
 * 🛑 Written out in FULL three times rather than built by a helper: Tailwind scans the SOURCE for
 * class names, so a string assembled at runtime generates nothing and the picture blows up to its
 * natural width. The `_` around the minus is the space `calc` requires, as Tailwind spells it.
 *
 * The fallback is the line's own shape, for a host that publishes no `--sc-row-height`: getting
 * THAT wrong is what left the model picker at 20px.
 */
export const ROW_MEDIA_CONTROL = `${ROW_MEDIA_BOX} size-[calc(var(--sc-row-height,var(--sc-control))_-_2*var(--sc-row-pad))]`
export const ROW_MEDIA_STACKED = `${ROW_MEDIA_BOX} size-[calc(var(--sc-row-height,var(--sc-row-stacked))_-_2*var(--sc-row-pad))]`
export const ROW_MEDIA_PICTURE = `${ROW_MEDIA_BOX} size-[calc(var(--sc-row-height,var(--sc-row-media))_-_2*var(--sc-row-pad))]`

/**
 * One property row of an inspector: a label of fixed width, then the control it names.
 *
 * The gap is two, never one: at one the label, the track and the number read as a single
 * run-on string rather than as three things. It is the studio's spacing, applied throughout.
 */
export const FIELD_ROW = 'flex min-h-(--sc-control) min-w-0 items-center gap-2 text-tiny'

/**
 * The room every property line keeps at its end — two controls wide, which is the most any of them
 * asks for. It leans into the panel's own padding so the GLYPHS land on the column the fields end
 * on: a button's box already ends there, but its 14px icon sits centred in a wider square.
 */
export const ROW_ACTIONS =
  'flex w-(--sc-row-actions) shrink-0 items-center justify-end -mr-(--sc-row-action-bleed)'

/**
 * One empty place at the END of that room. Only ever needed there: `justify-end` already puts a
 * lone button on the last place, so a spacer BEFORE one moves nothing.
 */
export const ROW_ACTION_SPACER = 'size-(--sc-control) shrink-0'

/** The hexadecimal a colour swatch is read out as. Published so its guard can import it. */
export const COLOR_READOUT = 'text-muted text-mini min-w-0 flex-1 truncate font-mono uppercase'

/**
 * What a form field explains about itself, under its control.
 *
 * 🛑 Its own voice, and that is the whole point: written as `text-muted` like the NAME above it,
 * measured at the same colour and the same weight one pixel apart, a description read as a second
 * label — `SettingLine` separates the two on both axes, and this is the dock's way of saying it.
 */
export const FIELD_HELP = 'text-muted text-tiny'

/**
 * The NAME of a form field, which is not muted: it is what the field IS, where the help under it
 * is an aside. The settings say it with weight and full colour; a dock says it the same way.
 */
export const FIELD_NAME = 'text-text text-xs font-medium'

/**
 * One width for a whole section, shared with `PropertyRow` so both families of line start on one
 * column. A SHARE of the row, capped and NOT floored: a fixed width truncated in a wide panel, and
 * a floor of eighty overflowed a side zone dragged to its 140px minimum by 21px, measured.
 *
 * The edge is what makes it read as a column rather than a word standing before a control;
 * `PropertyLabel` wears it and stretches, so the rule runs the row's whole height.
 */
export const FIELD_LABEL =
  'text-muted border-border w-(--sc-label-share) max-w-(--sc-label-max) shrink-0 border-r pr-2'

/**
 * The number beside a track — "somewhere past the middle" is not a value anyone can write down.
 * Worn by `Readout`, which is what every track uses; this is here only because it is a shape.
 *
 * Tabular figures are the point: without them the row twitches sideways as the digits change.
 * The width belongs to the style rather than to each caller — a readout that reserves more room
 * takes it off the track beside it, and an inspector ends up stacking sliders of two lengths.
 * Fourteen fits the widest of them, a range's `0–1`.
 */
export const FIELD_READOUT = 'text-muted w-14 shrink-0 text-right tabular-nums'

/**
 * A tick, wherever one is drawn. `accent-accent` is the whole of it and the whole of why this is
 * written once: left off, a checkbox comes out in the browser's own blue — the one colour in the
 * studio that answers to nothing in `index.css`, on the control a reader scans a list for.
 *
 * The size is the caller's: a tick in a property row is bigger than one in a list of files.
 */
export const CHECKBOX = 'accent-accent cursor-pointer'

/** The box a slider is drawn in: the rail sits absolute inside it, the input covers it whole. */
export const SLIDER_TRACK = 'relative h-(--sc-control) min-w-0'

/**
 * That input, stripped of the track the browser would draw with it. The thumb comes from
 * `slider-handle` in `index.css`, a pseudo-element being out of reach of a class written here.
 */
export const SLIDER_HANDLE = 'slider-handle absolute inset-0 m-0 size-full'

/**
 * Both ends of one gesture. Everything a field emits between them is one thing the user did,
 * and whoever owns the value is expected to keep exactly one history entry for it.
 */
export type GestureProps = {
  onGestureStart?: () => void
  onGestureEnd?: () => void
}

/**
 * The name a script drives a control by — never a translated word, and never a DOM id. A composed
 * one extends its parent's: `${scId}.min`, `${scId}.x`. `pilotable.test.ts` holds the rule.
 */
export type FieldHandle = {
  scId?: string
}

/**
 * Puts a property back where it started. Absent means it already stands there — the button is
 * still drawn, and inert: drawn only when it acts, it narrowed the field under the pointer.
 */
export type FieldReset = {
  onReset?: () => void
}

/**
 * A value the user types into: the generation form's fields and the inspector's. Its own shape
 * — bordered, tighter corners — because a field is something to fill in, not a bar control.
 */
export const FIELD =
  'bg-surface border-border text-text h-(--sc-control) rounded-(--radius-sc-sm) border px-2'

/**
 * The same field where it takes what the line has left — beside a label, a thumbnail, a dice.
 *
 * `min-w-0` is the half that gets forgotten: a flex child sizes to its content by default, so a
 * long value pushes the row wider than the panel holding it instead of scrolling inside itself.
 *
 * No text size of its own, and that is measured rather than left out: Tailwind's preflight gives
 * a control `font: inherit`, so a field inside a `FIELD_ROW` already reads at the row's size.
 */
export const FIELD_FILL = cn(FIELD, 'min-w-0 flex-1')

/**
 * The surface a menu wears. The SKIN only — never where it sits, and never whether it is raised:
 * a menu that sits IN a form is one of its fields, and a shadow there says it left the page.
 *
 * Its width is left to the caller: a flyout is as wide as its anchor suggests, a menu in a form
 * as wide as the form.
 */
export const MENU_SURFACE = cn(
  'border-border bg-surface flex flex-col gap-0.5',
  'rounded-(--radius-sc-lg) border p-1',
)

/** The same, off the page — for a surface its host places but that reads as floating. */
export const MENU_RAISED = cn(MENU_SURFACE, 'shadow-(--sc-shadow-floating)')

/**
 * The same again, placed by itself, for a menu that HANGS. Above the MODALS (`z-60`), not merely
 * above the panels: measured on the new-document dialog, whose tree came out cut in half behind
 * its own scrim.
 */
export const MENU_FLOATING = cn(MENU_RAISED, 'fixed z-70')

/**
 * Where a workspace's own bar floats over its pane. The image and the 3D space put it in the
 * same corner with the same inset, and a bar that moves has to move in both.
 *
 * The inset only, never the skin: the shared bar wears that.
 */
export const PANE_TOOLBAR = 'absolute top-2 left-2'

/**
 * A surface laid beside that column rather than under it — the snap bar. The offset is a gauge
 * (`--sc-pane-aside`) and not a number here: it follows `--sc-control`, so a change of density
 * cannot leave the two overlapping.
 */
export const PANE_TOOLBAR_ASIDE = 'absolute top-2 left-(--sc-pane-aside)'

/**
 * The word a bar sets beside its buttons: which take is loaded, which half of a pair this
 * monitor is, how far along the playhead sits. It answers a question asked OF the bar, so it
 * takes the muted ink rather than the ink of something to reach for.
 *
 * `Timecode` wears it too, under its own figures. The label and the time sit in the same bar,
 * inches apart, and a shade drifting between them would read as two ranks of information where
 * there is one.
 */
export const TOOLBAR_LABEL = 'text-muted text-tiny px-1'

/**
 * The word that divides a LIST into groups — a git stage, the side of a comparison, a set of
 * parameters. Small caps rather than a heavier weight: `PropertySection` takes the weight instead,
 * and the two are a rank apart on purpose, an inspector titling more often than a list does.
 */
export const PANEL_GROUP_LABEL = 'text-muted text-tiny tracking-wide uppercase'

/** The same word sharing its line with a control, which is what asks for the weight as well. */
export const PANEL_GROUP_LABEL_WIDE = cn(PANEL_GROUP_LABEL, 'min-w-0 flex-1 truncate font-medium')

/**
 * The corners a tile cuts, without the plate behind them — for a tile that draws a SHAPE rather
 * than a picture. A folder is the case: a frame bounds a picture that may be pale or transparent,
 * and a silhouette needs no bounding.
 */
export const MEDIA_SHAPE = 'overflow-hidden rounded-(--radius-sc-sm)'

/** The frame every picture sits in, so a tile and a thumbnail cut their corners the same way. */
export const MEDIA_FRAME = `border-border bg-surface border ${MEDIA_SHAPE}`

/**
 * The plate a block of the HOME stands on, and the heading it wears.
 *
 * The home is a page of blocks rather than a dock, so its surface is its own — and it is a
 * surface the two bands had each written out by hand, down to the padding. A third block is what
 * made that a copy.
 */
export const HOME_BLOCK = 'bg-surface flex flex-col gap-2 rounded-(--radius-sc-lg) p-3'

export const HOME_BLOCK_HEADING = 'text-muted text-mini m-0 font-semibold tracking-wider uppercase'

/**
 * The plate a mark sits on in the corner of a tile — never WHICH corner, which is each mark's
 * own business.
 *
 * Two of them share a tile: what an asset IS on one side, where it LIVES on the other. Written
 * once because a picture can be pale, dark or busy under either of them, and one plate drifting
 * from the other would make two answers to the same tile read as two different kinds of thing.
 */
export const TILE_MARK = 'bg-chassis/75 rounded-(--radius-sc-sm) p-px'

/**
 * A control laid over a shelf's artwork — the carousel's arrows, the button a tile puts in its
 * corner. Hidden until the shelf is hovered: a control permanently over the picture hides part
 * of what the shelf exists to show. Gauge, tone and corner stay with the caller.
 *
 * Written once because the groups it reveals itself on are declared by `Carousel` and by
 * `ShelfTile`, and read from files that never import either: a copy of the class is a copy of
 * those names, going stale in silence.
 *
 * Two groups because the same tile is read in both shapes now: a band scrolled sideways on the
 * home, where hovering anywhere in the shelf brings up every corner at once, and a grid in a
 * panel column, which has no carousel around it to hover.
 */
export const SHELF_OVERLAY = cn(
  'border-border bg-panel/90 absolute z-10 flex cursor-pointer items-center justify-center',
  'rounded-full border opacity-0 transition-opacity group-hover/carousel:opacity-100',
  'group-hover/tile:opacity-100',
)

/**
 * How a status reads. The caller names the MEANING — queued, running, cached, failed — and the
 * colour stays here: the jobs bar and the media import both say "this one went wrong", and they
 * must say it in the same red.
 */
export type StatusTone = 'muted' | 'accent' | 'success' | 'warning' | 'danger'

export const TONE_TEXT: Record<StatusTone, string> = {
  muted: 'text-muted',
  // The ink, never the fill: this map only ever paints words, and the fill misses the contrast
  // threshold on all three surfaces a status is read on.
  accent: 'text-accent-ink',
  success: 'text-success',
  // What is waiting on the user, which is neither in flight nor wrong: an approval painted with
  // `accent` read as "running" beside the nodes that really were.
  warning: 'text-warning',
  danger: 'text-danger',
}
