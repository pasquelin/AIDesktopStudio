import { Icon } from '@mdi/react'

export type UiIconProps = {
  /** `@mdi/js` path. */
  path: string
  /**
   * Defaults to a 16 px glyph, the convention across bars. `fill` takes the whole of whatever
   * box it is given, for the one use a glyph has that is not a control: a SHAPE standing for
   * what a tile holds, which has to be read before the name under it.
   */
  size?: number | 'fill'
  className?: string
}

/**
 * The single entry point for icons. No inline SVG in a component: the day the icon library
 * changes, only one file moves.
 */
export function UiIcon({ path, size = 16, className }: UiIconProps) {
  return (
    <Icon
      path={path}
      size={size === 'fill' ? '100%' : `${size}px`}
      className={className}
      aria-hidden="true"
    />
  )
}
