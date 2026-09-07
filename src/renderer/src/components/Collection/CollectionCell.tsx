import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import type { Modifiers } from '@/helpers/selection'
import { isTyping } from '@/helpers/typing'
import { rowSkin } from '../styles'
export type CollectionCellProps = {
  index: number
  selected: boolean
  disabled: boolean
  tabbable: boolean
  role?: 'option' | 'listitem'
  expanded?: boolean
  position: number
  total: number
  onSelect?: (modifiers: Modifiers) => void
  onActivate?: () => void
  onContextMenu?: () => void
  onArrow: (event: KeyboardEvent) => void
  className?: string
  children: ReactNode
}
function cellMenu(onContextMenu: CollectionCellProps['onContextMenu']) {
  if (!onContextMenu) return undefined
  return (event: MouseEvent): void => {
    if (isTyping(event.target)) return
    event.preventDefault()
    onContextMenu()
  }
}
function cellKey(props: CollectionCellProps, event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'Enter' && event.key !== ' ') return props.onArrow(event.nativeEvent)
  if (props.disabled || event.target !== event.currentTarget) return
  if (event.key === 'Enter' && props.onActivate) {
    event.preventDefault()
    props.onActivate()
  } else if (props.onSelect) {
    event.preventDefault()
    props.onSelect(event)
  }
}
function cellStateProps({
  selected,
  disabled,
  tabbable,
  role,
  onSelect,
  onActivate,
}: CollectionCellProps) {
  return {
    'aria-disabled': disabled || undefined,
    'data-selected': selected || undefined,
    tabIndex: tabbable ? 0 : -1,
    'aria-selected': role === 'option' ? selected : undefined,
    onClick: disabled ? undefined : onSelect,
    onDoubleClick: disabled ? undefined : onActivate,
  }
}
export function CollectionCell(props: CollectionCellProps) {
  const {
    index,
    selected,
    disabled,
    role,
    expanded,
    position,
    total,
    onSelect,
    onActivate,
    onContextMenu,
    className,
    children,
  } = props
  const skin = cn('min-w-0', rowSkin(selected, { surface: 'row', disabled }), className)
  const raiseMenu = cellMenu(onContextMenu)
  if (!onSelect && !onActivate)
    return (
      <div className={skin} data-selected={selected || undefined} onContextMenu={raiseMenu}>
        {children}
      </div>
    )
  return (
    <div
      role={role}
      aria-expanded={expanded}
      aria-posinset={position}
      aria-setsize={total}
      {...cellStateProps(props)}
      data-cell={index}
      onContextMenu={raiseMenu}
      onKeyDown={event => cellKey(props, event)}
      className={cn(skin, !disabled && 'cursor-pointer')}
    >
      {children}
    </div>
  )
}
