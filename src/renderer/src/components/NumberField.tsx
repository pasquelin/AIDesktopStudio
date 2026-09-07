import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/helpers/cn'
import { formatDecimal, parseDecimal } from '@/helpers/format'
import { usePointerDrag } from '@/hooks/usePointerDrag'
import { bound, type NumericBounds } from '@shared/numeric'
import { PropertyLine } from './PropertyLine'
import { ResetButton } from './ResetButton'
import { fieldHandle } from './scHandle'
import { FIELD_FILL, type GestureProps, type FieldHandle, type FieldReset } from './styles'
export type NumberFieldProps = NumericBounds &
  GestureProps &
  FieldHandle &
  FieldReset & {
    label: string
    value: number
    onChange: (value: number) => void
    layout?: 'row' | 'inline'
    axis?: 'x' | 'y' | 'z'
    disabled?: boolean
    hint?: Record<string, string>
    actions?: ReactNode
  }
const DEFAULT_STEP = 0.1
const SCRUB_SLACK = 4
const PRIMARY_BUTTON = 0
const FAST_MULTIPLIER = 10
type Drag = {
  x: number
  from: number
  last: number
  scrubbing: boolean
  fast: boolean
}

type NumberInputProps = Pick<
  NumberFieldProps,
  'label' | 'value' | 'min' | 'max' | 'disabled' | 'axis' | 'scId'
> & {
  shown: string
  typed: string | null
  setTyped: (value: string | null) => void
  emit: (value: number) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLInputElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLInputElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLInputElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLInputElement>) => void
  onFocus: () => void
  onBlur: () => void
}

function numberInputClass(disabled: boolean | undefined, axis: NumberFieldProps['axis']): string {
  return cn(
    FIELD_FILL,
    'touch-none',
    disabled ? 'text-muted cursor-not-allowed' : 'cursor-ew-resize focus:cursor-text',
    axis && 'border-l-2',
    axis === 'x' && 'border-l-axis-x',
    axis === 'y' && 'border-l-axis-y',
    axis === 'z' && 'border-l-axis-z',
  )
}

function numberInput({ shown, typed, setTyped, emit, axis, scId, ...props }: NumberInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      role="spinbutton"
      aria-label={props.label}
      aria-valuenow={props.value}
      aria-valuetext={shown}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      value={typed ?? shown}
      onChange={event => {
        const text = event.target.value
        setTyped(text)
        if (text.trim() !== '') emit(parseDecimal(text))
      }}
      onKeyDown={props.onKeyDown}
      disabled={props.disabled}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      data-sc={scId && fieldHandle(scId)}
      className={numberInputClass(props.disabled, axis)}
    />
  )
}
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onGestureStart,
  onGestureEnd,
  layout = 'row',
  axis,
  disabled,
  hint,
  scId,
  onReset,
  actions,
}: NumberFieldProps) {
  const drag = usePointerDrag<Drag>()
  const [typed, setTyped] = useState<string | null>(null)
  const { i18n } = useTranslation()
  const shown = formatDecimal(value === 0 ? 0 : value, i18n.language, {
    digits: 20,
    grouped: false,
  })
  const emit = (raw: number): void => {
    if (!Number.isFinite(raw)) return
    const next = bound(raw, { min, max, step })
    if (next !== value) onChange(next)
  }
  const startDrag = (event: ReactPointerEvent<Element>, scrubbing: boolean): void => {
    if (event.button !== PRIMARY_BUTTON) return
    drag.start(event, {
      x: event.clientX,
      from: value,
      last: value,
      scrubbing,
      fast: event.shiftKey,
    })
    if (scrubbing) onGestureStart?.()
  }
  const onPointerMove = (event: ReactPointerEvent<Element>): void => {
    const started = drag.matching(event)
    if (!started) return
    if (!started.scrubbing) {
      if (Math.abs(event.clientX - started.x) < SCRUB_SLACK) return
      started.x = event.clientX
      started.scrubbing = true
      onGestureStart?.()
      return
    }
    if (event.shiftKey !== started.fast) {
      started.from = started.last
      started.x = event.clientX
      started.fast = event.shiftKey
    }
    const travelled = event.clientX - started.x
    const rate = (step ?? DEFAULT_STEP) * (started.fast ? FAST_MULTIPLIER : 1)
    const next = bound(started.from + travelled * rate, { min, max, step })
    if (next === started.last) return
    started.last = next
    onChange(next)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
    if (direction === 0) return
    event.preventDefault()
    setTyped(null)
    emit(value + direction * (step ?? DEFAULT_STEP))
  }
  const endDrag = (event: ReactPointerEvent<Element>): void => {
    if (drag.end(event)?.scrubbing) onGestureEnd?.()
  }
  const endFieldDrag = (event: ReactPointerEvent<HTMLInputElement>): void => {
    if (event.button !== PRIMARY_BUTTON) return
    const scrubbed = drag.held()?.scrubbing === true
    const field = event.currentTarget
    endDrag(event)
    if (!scrubbed) field.focus()
  }
  const scrub = {
    onPointerDown: disabled ? undefined : (event: ReactPointerEvent) => startDrag(event, true),
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  }
  const scrubSkin = cn(
    'touch-none select-none',
    disabled ? 'cursor-not-allowed' : 'cursor-ew-resize',
  )
  return (
    <PropertyLine
      label={label}
      root="div"
      hint={hint}
      name={layout === 'row' ? 'column' : 'none'}
      nameProps={{ hidden: true, gesture: scrub, className: scrubSkin }}
      actions={
        layout === 'row' ? (
          <>
            {actions}
            <ResetButton onReset={onReset} />
          </>
        ) : (
          false
        )
      }
    >
      {layout !== 'row' && (
        <span aria-hidden title={label} {...scrub} className={cn('text-muted shrink-0', scrubSkin)}>
          {label}
        </span>
      )}

      {numberInput({
        label,
        value,
        min,
        max,
        disabled,
        axis,
        scId,
        shown,
        typed,
        setTyped,
        emit,
        onKeyDown,
        onPointerMove,
        onPointerDown: event => {
          if (document.activeElement === event.currentTarget || event.button !== PRIMARY_BUTTON)
            return
          event.preventDefault()
          startDrag(event, false)
        },
        onPointerUp: endFieldDrag,
        onPointerCancel: endDrag,
        onFocus: () => onGestureStart?.(),
        onBlur: () => {
          setTyped(null)
          onGestureEnd?.()
        },
      })}
    </PropertyLine>
  )
}
