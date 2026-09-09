import type { ToolButtonProps } from '../ToolButton'
import type { TooltipFactory } from '@/helpers/tooltip'

/**
 * What a toolbar is handed: one entry per button, and the modes a button may offer.
 *
 * Here rather than in `Toolbar.tsx` because both halves of the bar need it — the bar itself and
 * the `ToolbarTool` that draws one entry — and importing it back from the parent would close an
 * import cycle. Five spaces declare their tools against these types too.
 */
export type ToolMode = {
  id: string
  /** i18n key of the label — never the displayed text. */
  labelKey: string
  /**
   * i18n key of the one-line tooltip. Required: a mode's label is on screen inside its row, so
   * the tooltip is the only thing that can say more than the label already does.
   */
  descriptionKey: string
  icon: string
  shortcut?: string
  /** Greyed rather than hidden — the bar never conceals what is coming, nor what is missing. */
  disabled?: boolean
  /**
   * The model of THIS machine it cannot run without. DECLARED here rather than branched on in the
   * view: two modes ride the same model, and the one the view named was greyed while the other
   * was not. A model id, never an employment — a mode runs what its host loads, and the employment
   * a cloud may serve is the batch edit's business, not the gesture's.
   */
  needsModel?: string
}

export type ToolbarItem = {
  id: string
  /** i18n key of the label — never the displayed text. */
  labelKey: string
  /**
   * What fills the LABEL's `{{…}}` holes — a switch named after the row it acts on. Read through a
   * variable, which `known-keys`' check on filled holes cannot see: a hole left open draws itself.
   */
  labelValues?: Record<string, string>
  /** i18n key of the one-line tooltip. Absent tips the label, which is better than nothing. */
  descriptionKey?: string
  /** What fills its `{{…}}` holes — for a tooltip that has to name what the click will act ON. */
  descriptionValues?: Record<string, string>
  icon: string
  shortcut?: string
  disabled?: boolean
  /**
   * Nothing here can receive it right now — no selection, no frame. DROPPED from the bar, where
   * `disabled` greys: a rail of glyphs waiting on a selection is a rail nobody reads, and the
   * native menu names every tool at all times. Two words because `disabled` already means
   * "declared, not wired yet", which must stay visible.
   */
  unavailable?: boolean
  /** The host's gauge, when it is not the bar's: a panel's title bar draws a 14px glyph, not 16. */
  variant?: ToolButtonProps['variant']
  /**
   * Overrides the placement the bar computed. `tipFor` knows the orientation and never where the
   * bar SITS: hung on a panel's title, a horizontal bar has to tip downwards or cover its neighbour.
   */
  tip?: TooltipFactory
  /** A toggle that is on. Distinct from `activeTool`, the one armed tool, and drawn alike. */
  pressed?: boolean
  /**
   * Acts rather than arms — Duplicate, Add, the model edits. It gets no `aria-pressed`: a button
   * for ever announcing "toggle, not pressed" describes a state it does not have, which is the
   * very reason the montage bar puts its two action buttons in `extras` instead of here.
   */
  acts?: true
  /** Two or more open a flyout on hover; one or none makes the button act directly. */
  modes?: readonly ToolMode[]
  activeMode?: string
  /** Draws a divider before this tool, so the bar reads as groups and not a run of icons. */
  separatorBefore?: boolean
}

/**
 * The bar as it is DRAWN: what nothing can receive is left out, and hands its separator to the
 * next tool shown — a group gone entirely would otherwise fuse the two around it.
 */
export function shownTools(tools: readonly ToolbarItem[]): ToolbarItem[] {
  const shown: ToolbarItem[] = []
  let separator = false
  for (const tool of tools) {
    if (tool.separatorBefore === true) separator = true
    if (tool.unavailable === true) continue
    shown.push(separator ? { ...tool, separatorBefore: true } : tool)
    separator = false
  }
  return shown
}
