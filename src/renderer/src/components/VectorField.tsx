import {
  mdiChevronDown,
  mdiChevronRight,
  mdiLink,
  mdiLinkOff,
  mdiLock,
  mdiLockOpenVariantOutline,
} from '@mdi/js'
import { createElement, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { NumericBounds } from '@shared/numeric'
import { HINT_LEFT, TIP_LEFT } from '@/helpers/tooltip'
import { NumberField } from './NumberField'
import { PropertyLine } from './PropertyLine'
import { ResetButton } from './ResetButton'
import type { GestureProps } from './styles'
import { ToolButton } from './ToolButton'
import { UiIcon } from './UiIcon'
export type AxisValue = {
  x: number
  y: number
  z?: number
}
export type VectorFieldProps<V extends AxisValue> = NumericBounds &
  GestureProps & {
    label: string
    value: V
    onChange: (value: V) => void
    scId?: string
    disabled?: boolean
    hint?: Record<string, string>
    lockable?: boolean
    defaults?: V
    heldAxes?: readonly (keyof AxisValue)[]
    onHoldAxis?: (axis: keyof AxisValue, held: boolean) => void
  }
const XYZ: readonly (keyof AxisValue)[] = ['x', 'y', 'z']

type VectorFieldViewProps = Pick<VectorFieldProps<AxisValue>, 'label' | 'hint'> & {
  stacked: boolean
  setStacked: (update: (current: boolean) => boolean) => void
  lockAction: ReactNode
  resetAll: (() => void) | undefined
  inlineFields: ReactNode
  stackedFields: ReactNode
  count: number
  t: ReturnType<typeof useTranslation>['t']
}

function vectorFieldView({
  label,
  hint,
  stacked,
  setStacked,
  lockAction,
  resetAll,
  inlineFields,
  stackedFields,
  count,
  t,
}: VectorFieldViewProps) {
  return (
    <>
      <PropertyLine
        label={label}
        root="div"
        hint={hint}
        nameProps={{
          as: 'button',
          leading: <UiIcon path={stacked ? mdiChevronDown : mdiChevronRight} size={12} />,
          gesture: {
            type: 'button',
            'aria-expanded': stacked,
            onClick: () => setStacked(current => !current),
            ...HINT_LEFT(t(stacked ? 'inspector.stackFoldHint' : 'inspector.stackUnfoldHint')),
          },
          className: 'cursor-pointer border-y-0 border-l-0 bg-transparent p-0 text-left',
        }}
        actions={
          <>
            {lockAction}
            <ResetButton onReset={resetAll} />
          </>
        }
      >
        {!stacked && (
          <div
            className="grid min-w-0 flex-1 gap-2"
            style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
          >
            {inlineFields}
          </div>
        )}
        {stacked && <div className="min-w-0 flex-1" />}
      </PropertyLine>
      {stackedFields}
    </>
  )
}
export function VectorField<V extends AxisValue>({
  label,
  value,
  onChange,
  onGestureStart,
  onGestureEnd,
  scId,
  disabled,
  hint,
  lockable,
  defaults,
  heldAxes,
  onHoldAxis,
  ...bounds
}: VectorFieldProps<V>) {
  const { t } = useTranslation()
  const [stacked, setStacked] = useState(false)
  const [locked, setLocked] = useState(false)
  const held = useRef<V | null>(null)
  const shown = XYZ.filter(axis => value[axis] !== undefined)
  const lock = (): void => {
    held.current = locked ? null : value
    setLocked(!locked)
  }
  const beginGesture = (): void => {
    if (locked) held.current = value
    onGestureStart?.()
  }
  const move = (axis: keyof AxisValue, next: number): void => {
    const from = held.current
    if (!locked || !from || (from[axis] ?? 0) === 0) return onChange({ ...value, [axis]: next })
    const factor = next / (from[axis] ?? 1)
    const scaled = Object.fromEntries(shown.map(one => [one, (from[one] ?? 0) * factor]))
    onChange({ ...value, ...scaled })
  }
  const moved = (axis: keyof AxisValue): boolean =>
    defaults !== undefined && (value[axis] ?? 0) !== (defaults[axis] ?? 0)
  const resetOf = (axis: keyof AxisValue): (() => void) | undefined =>
    moved(axis) ? () => onChange({ ...value, [axis]: defaults?.[axis] ?? 0 }) : undefined
  const resetAll = defaults && shown.some(moved) ? () => onChange(defaults) : undefined
  const isHeld = (axis: keyof AxisValue): boolean => (heldAxes ?? []).includes(axis)
  const axisAction = (axis: keyof AxisValue, layout: 'row' | 'inline') => {
    if (layout !== 'row' || !onHoldAxis) return undefined
    const heldAxis = isHeld(axis)
    return (
      <ToolButton
        icon={heldAxis ? mdiLock : mdiLockOpenVariantOutline}
        label={t(heldAxis ? 'inspector.releaseAxis' : 'inspector.holdAxis', {
          axis: axis.toUpperCase(),
        })}
        description={t('inspector.holdAxisHint')}
        tooltip={TIP_LEFT}
        variant="header"
        active={heldAxis}
        onClick={() => onHoldAxis(axis, !heldAxis)}
      />
    )
  }
  const axisField = (axis: keyof AxisValue, layout: 'row' | 'inline') => (
    <NumberField
      key={axis}
      layout={layout}
      axis={axis}
      disabled={disabled || isHeld(axis)}
      hint={isHeld(axis) ? HINT_LEFT(t('inspector.axisHeldHint')) : undefined}
      scId={scId && `${scId}.${axis}`}
      label={axis.toUpperCase()}
      value={value[axis] ?? 0}
      onChange={next => move(axis, next)}
      onReset={layout === 'row' ? resetOf(axis) : undefined}
      actions={axisAction(axis, layout)}
      onGestureStart={beginGesture}
      onGestureEnd={onGestureEnd}
      {...bounds}
    />
  )
  const lockAction = lockable && (
    <ToolButton
      icon={locked ? mdiLink : mdiLinkOff}
      label={t(locked ? 'inspector.unlinkAxes' : 'inspector.linkAxes')}
      description={t('inspector.linkAxesHint')}
      tooltip={TIP_LEFT}
      variant="header"
      active={locked}
      onClick={lock}
    />
  )
  return createElement(vectorFieldView, {
    label,
    hint,
    stacked,
    setStacked,
    lockAction,
    resetAll,
    count: shown.length,
    t,
    inlineFields: shown.map(axis => axisField(axis, 'inline')),
    stackedFields: stacked && shown.map(axis => axisField(axis, 'row')),
  })
}
