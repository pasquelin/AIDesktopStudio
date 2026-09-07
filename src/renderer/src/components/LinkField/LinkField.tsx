import { createElement, useMemo, type MouseEvent, type ReactNode } from 'react'
import type { Asset, AssetType } from '@shared/domain/asset'
import { useContextMenu } from '@/hooks/useContextMenu'
import { SelectField } from '../SelectField'
import { LinkFieldMenu } from './LinkFieldMenu'
import type { LinkOption } from './linkOption'
import type { LinkPress } from './linkPress'
import { LinkFieldActions } from './LinkFieldActions'
import { LinkFieldThumbnail } from './LinkFieldThumbnail'
import { LinkFieldSlot } from './LinkFieldSlot'
export type LinkFieldProps = {
  label: string
  value: string | null
  options: readonly LinkOption[]
  valueUrl?: string
  onChange: (id: string | null) => void
  emptyLabel?: string
  missingLabel: string
  clearLabel: string
  clearHint: string
  clearWhenEmpty?: boolean
  accepts?: readonly AssetType[]
  badge?: ReactNode
  onDropAsset?: (asset: Asset) => void
  open?: LinkPress
  press?: LinkPress
  browse?: LinkPress
  busy?: boolean
  busyLabel?: string
  scId?: string
  menuExtra?: (close: () => void) => ReactNode
}
type LinkFieldViewProps = LinkFieldProps & {
  choices: Array<{ value: string; label: string; disabled?: boolean }>
  chosen?: LinkOption
  clearing?: () => void
  menu: ReturnType<typeof useContextMenu>
  shown?: string
}

function rowOpening(chosen: LinkOption | undefined, open: LinkPress | undefined) {
  if (!chosen || !open) return undefined
  return (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest('button')) return
    open.run()
  }
}

const dropping =
  ({ onDropAsset, onChange }: LinkFieldProps) =>
  (asset: Asset): void =>
    onDropAsset ? onDropAsset(asset) : onChange(asset.id)

const hasLinkMenu = (props: LinkFieldViewProps): boolean =>
  Boolean(props.browse || (props.chosen && props.open) || props.clearing || props.menuExtra)

function linkFieldView(props: LinkFieldViewProps) {
  const {
    label,
    value,
    onChange,
    emptyLabel,
    clearLabel,
    clearWhenEmpty,
    accepts,
    badge,
    open,
    press,
    browse,
    busy,
    busyLabel,
    scId,
    choices,
    chosen,
    menu,
    shown,
  } = props
  return (
    <LinkFieldSlot
      accepts={accepts}
      onDrop={dropping(props)}
      onContextMenu={hasLinkMenu(props) ? menu.open : undefined}
      onDoubleClick={rowOpening(chosen, open)}
    >
      <SelectField
        label={label}
        scId={scId}
        options={choices}
        value={value ?? ''}
        compactActions={!browse}
        onChange={id => onChange(id === '' ? null : id)}
        leading={
          <LinkFieldThumbnail {...{ badge, busy, busyLabel, chosen, label, open, press, shown }} />
        }
        actions={
          <LinkFieldActions
            {...{ browse, clearLabel, clearWhenEmpty, emptyLabel, value }}
            onClear={() => onChange(null)}
          />
        }
      />
      {linkMenu(props)}
    </LinkFieldSlot>
  )
}

function linkMenu(props: LinkFieldViewProps) {
  const { browse, chosen, clearHint, clearLabel, clearing, menu, menuExtra, open } = props
  if (!menu.at) return null
  return (
    <LinkFieldMenu
      at={menu.at}
      onClose={menu.close}
      browse={browse}
      open={chosen && open}
      clear={clearing && { label: clearLabel, hint: clearHint, run: clearing }}
      extra={menuExtra?.(menu.close)}
    />
  )
}

export function LinkField(props: LinkFieldProps) {
  const { value, options, emptyLabel, missingLabel, onChange, valueUrl, clearWhenEmpty } = props
  const chosen = useMemo(() => options.find(option => option.id === value), [options, value])
  const choices = useMemo(
    () => [
      ...(emptyLabel === undefined ? [] : [{ value: '', label: emptyLabel }]),
      ...(value !== null && !chosen ? [{ value, label: missingLabel, disabled: true }] : []),
      ...options.map(option => ({ value: option.id, label: option.name })),
    ],
    [options, value, chosen, emptyLabel, missingLabel],
  )
  const menu = useContextMenu()
  const clearing =
    emptyLabel === undefined || (value === null && !clearWhenEmpty)
      ? undefined
      : () => onChange(null)
  const shown = valueUrl ?? chosen?.url
  return createElement(linkFieldView, { ...props, choices, chosen, clearing, menu, shown })
}
