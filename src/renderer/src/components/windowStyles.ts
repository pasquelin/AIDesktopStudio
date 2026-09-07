import { cn } from '@/helpers/cn'

/**
 * Class strings shared by the windows that are NOT docks — Settings and Usage, where the
 * studio becomes an ordinary application and DaisyUI dresses it.
 *
 * Apart from `styles.ts` on purpose: that file says in its first line that it holds what the
 * components of `design/` share, and its strings speak the studio's own tokens. These speak
 * DaisyUI's (`base-content`), and the two vocabularies must not end up in one bag — the
 * boundary between the docks and the app windows is a rule of the project, not a detail.
 */

/** The secondary line of a window: a count, an empty state, a sentence beside a control. */
export const WINDOW_CAPTION = 'text-base-content/70 text-xs'

/**
 * What a control explains about itself, under it. Capped: a help sentence running the whole
 * width of a maximised window is read twice and understood once.
 */
export const WINDOW_HELP = cn(WINDOW_CAPTION, 'max-w-lg')

/**
 * The heading over a run of rows — a scope of shortcuts, a section of results, a family of AI
 * employments. Written out three times before it was named, and a fourth spelling read differently.
 */
export const WINDOW_GROUP_LABEL = 'text-base-content/70 text-tiny mb-1 tracking-wide uppercase'

/** A line of a list here: a setting, a search hit, a chapter. The direction stays at the call. */
export const WINDOW_ROW = 'border-base-300 flex gap-2 border-b py-3 last:border-b-0'

/**
 * The same line when the whole of it is the button. `base-200` since the ground of these windows
 * became the chassis: `base-300` is the divider now, and `elevated` reads 1.086:1 on a light
 * chassis — under the 1.1 of `HOVER_IS_SEEN`. `tokens.test.ts` measures it.
 */
export const WINDOW_ROW_BUTTON = cn(WINDOW_ROW, 'hover:bg-base-200 w-full text-left')

/**
 * A control of one of these windows: a section of the column, a period, a refresh.
 *
 * One look for all of them, and one definition. Usage held this as a local `control()` while
 * Settings wrote the same two lines inline on its navigation entries — the manual then made a
 * third copy, in the studio's tokens, which is what sent this to `design/`.
 *
 * The height comes from the gauge, never from a number: a control is 24 px in compact and 28 in
 * comfort, and a constant would be right at exactly one density.
 */
const WINDOW_CONTROL_BASE = cn(
  'flex h-(--sc-control) cursor-pointer items-center rounded-(--radius-sc-sm) border-none text-xs',
  // Dimmed by INK rather than by opacity, as every quiet line of these windows is: an opacity lets
  // the surface through and reads as a rendering fault rather than a refusal. `/70` is the alpha
  // `WINDOW_CAPTION` carries — a refusal still has to be READ.
  'disabled:cursor-not-allowed disabled:text-base-content/70 disabled:hover:bg-transparent',
)

export function windowControl(active: boolean): string {
  return cn(
    WINDOW_CONTROL_BASE,
    active ? 'bg-primary text-primary-content' : 'hover:bg-base-200 bg-transparent',
  )
}

/**
 * The chosen/rest fill, without the control height — a logo row is taller than `--sc-control`.
 *
 * 🛑 The rest state hovers `base-200`, never the accent: `tokensSurfaces.test.ts` measures a
 * HEXADECIMAL there, and hovering the accent would put a `color-mix()` where it reads one.
 */
export function windowChosenFill(chosen: boolean): string {
  return chosen ? 'bg-accent-soft' : 'hover:bg-base-200 bg-transparent'
}

/**
 * The same control when it is CHOSEN rather than pressed — an entry of a window's column.
 *
 * 🛑 Its own function because the accent says one role: full for what one ACTIONS, `accent-soft`
 * for what is DESIGNATED. Painted alike, a chosen section read as a pressed button beside a folder
 * browser painting its picked row soft. `accent-soft` is declared in `@theme`, in neither
 * vocabulary.
 */
export function windowChoice(chosen: boolean): string {
  return cn(WINDOW_CONTROL_BASE, windowChosenFill(chosen))
}
