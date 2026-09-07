import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { tipFor } from '@/helpers/tooltip'
import { Separator } from '../Separator'
import { ToolbarTool } from './ToolbarTool'
import { shownTools, type ToolbarItem } from './tools'

export type ToolbarProps = {
  /**
   * Tools rendered, in order. Empty for a bar whose whole content is `extras` — the snap bar,
   * whose controls are each two zones and so cannot be a `ToolbarItem`.
   */
  tools?: ToolbarItem[]
  activeTool?: string
  onTool?: (id: string) => void
  /**
   * Names the bar for a reader. Already translated. Needed the moment a view holds TWO — the 3D
   * viewport does — since `role="toolbar"` twice with nothing to tell them apart is two bars a
   * reader has to enter to identify.
   */
  label?: string
  /** Called when a row of a tool's flyout is chosen. */
  onMode?: (toolId: string, modeId: string) => void
  orientation?: 'vertical' | 'horizontal'
  /** Workspace tools, rendered after the built-in ones and in the same visual language. */
  extras?: ReactNode
  /**
   * Drops a disabled tool instead of greying it — for a RAIL, whose tools the native menu names
   * at all times and whose context menu offers the ones a situation affords. See `shownTools`.
   *
   * 🛑 Off by default, and that is not timidity: a bar that ANSWERS a state — the crop frame's
   * Apply and Cancel — is not in any menu, and hiding those leaves nothing on screen to say what
   * the studio is waiting for.
   */
  hideDisabled?: boolean
  className?: string
  /** What no class can express — an offset read off a runtime measure, such as the rulers'. */
  style?: CSSProperties
}

/**
 * The studio's single toolbar, shared by every workspace: each one provides only its registry.
 *
 * Geometry follows `--sc-control`, so the density setting reaches it without the bar ever
 * knowing its value.
 */
export function Toolbar({
  tools = [],
  activeTool,
  onTool = () => {},
  label,
  onMode,
  orientation = 'vertical',
  extras,
  hideDisabled = false,
  className,
  style,
}: ToolbarProps) {
  const vertical = orientation === 'vertical'
  // A vertical bar hugs the left edge, so its tooltips go right — placed on top they would sit
  // over the button above and cover the tool the eye is comparing against.
  const tip = tipFor(orientation)
  const divider = <Separator orientation={vertical ? 'horizontal' : 'vertical'} />
  const shown = hideDisabled ? shownTools(tools) : tools

  return (
    <div
      role="toolbar"
      aria-label={label}
      style={style}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn(
        'border-border bg-surface flex items-center gap-0.5 rounded-(--radius-sc-lg) border p-1',
        'shadow-(--sc-shadow-furniture)',
        vertical ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      {shown.map((tool, index) => (
        <Fragment key={tool.id}>
          {/* `index > 0`: a registry that opens on a separator is one composed with something in
              front of it, and a rule against the edge of the bar separates nothing. */}
          {tool.separatorBefore && index > 0 && divider}
          <ToolbarTool
            tool={tool}
            // Either, never one overriding the other: `pressed: false` on the armed tool must
            // not draw it released.
            active={tool.pressed === true || tool.id === activeTool}
            tip={tip}
            onTool={onTool}
            onMode={onMode}
          />
        </Fragment>
      ))}

      {extras}
    </div>
  )
}
