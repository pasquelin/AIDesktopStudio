import type { ElementType, ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import { FieldActions } from './FieldActions'
import { PropertyLabel, type PropertyLabelProps } from './PropertyLabel'
import { FIELD_ROW } from './styles'

export type PropertyLineProps = {
  label: string
  /**
   * NEVER inferred, and that is the whole point: a bound `<label>` focuses what it names, so a
   * scrubbed field would end every drag in edit mode. Four fields say `div`, each for its own
   * reason — the drag, two inputs under one name, a thumbnail standing between name and control.
   */
  root: 'label' | 'div'
  /** Binds by id rather than by wrapping, where something stands between the name and the control. */
  htmlFor?: string
  /** `column` is the shared gauge; `none` drops it — a vector's axis, a bar select. */
  name?: 'column' | 'none'
  /** What the name carries where it is a fold or a scrub, handed straight to `PropertyLabel`. */
  nameProps?: Omit<PropertyLabelProps, 'label' | 'htmlFor'>
  /** Tooltip attributes already resolved, worn by the ROW — where a disabled line says why. */
  hint?: Record<string, string>
  children: ReactNode
  /** The end column, kept whether it is drawn into or not. `false` for a line that ends none. */
  actions?: ReactNode | false
  compactActions?: boolean
  className?: string
}

/**
 * The shell of one property line: the shared name column, the control, and the room every line
 * keeps at its end.
 *
 * Written once because nine files wrote it out by hand, and a guard had to read their SOURCE to
 * check they all wrote the same thing. It is a shell and never an engine — no value, no change,
 * no handle passes through here: four incompatible ways of owning a value live above it.
 */
export function PropertyLine({
  label,
  root,
  htmlFor,
  name = 'column',
  nameProps,
  hint,
  children,
  actions,
  compactActions,
  className,
}: PropertyLineProps) {
  const Root: ElementType = root

  return (
    <Root className={cn(FIELD_ROW, className)} {...hint}>
      {name === 'column' && <PropertyLabel label={label} htmlFor={htmlFor} {...nameProps} />}
      {children}
      {actions !== false && <FieldActions compact={compactActions}>{actions}</FieldActions>}
    </Root>
  )
}
