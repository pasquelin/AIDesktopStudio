import { useTranslation } from 'react-i18next'
import type { SettingValue } from '@shared/domain/settingsPath'
import { fieldHandle } from '@/components/scHandle'
import {
  boundsOf,
  optionLabel,
  optionsOf,
  type SettingDescriptor,
} from '@shared/domain/settingsRegistry'
import { cn } from '@/helpers/cn'
import { formatDecimal } from '@/helpers/format'
import { Slider } from '@/components/Slider'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import type { Labelled } from './controls'
import { SettingRowColorControl } from './SettingRowColorControl'
import { SettingRowPathControl } from './SettingRowPathControl'
import { SettingRowTextControl } from './SettingRowTextControl'
import { WindowInput } from '@/components/WindowInput'
import { WindowSelect } from '@/components/WindowSelect'
import { WindowToggle } from '@/components/WindowToggle'

/**
 * What a numeric field may hand over. An emptied field is mid-edit, and a value zod would
 * refuse — a decimal where one is not expected, or one outside the declared bounds — must not
 * be sent at all: the write would reject in the main process and leave the field showing a
 * number nothing stored.
 *
 * Sliders are the exception to the integer rule: theirs is a `step` below one, which is the
 * whole reason they are sliders rather than counters.
 */
function writableNumber(descriptor: SettingDescriptor, value: number): boolean {
  if (descriptor.kind !== 'slider' && !Number.isInteger(value)) return false

  const { min, max } = boundsOf(descriptor.path)
  return value >= min && value <= max
}

/** Decimals implied by the step, so `0.05` reads `1.15` and `1` reads `3`. */
function decimalsOf(step: number | undefined): number {
  return step && step < 1 ? (String(step).split('.')[1]?.length ?? 0) : 0
}

export function SettingRowControl({
  descriptor,
  id,
  scId,
  describedBy,
  value,
  onChange,
}: Labelled & {
  descriptor: SettingDescriptor
  value: SettingValue | undefined
  onChange: (value: SettingValue | undefined) => void
}) {
  const { t, i18n } = useTranslation()
  const decimals = decimalsOf(descriptor.step)
  // Empty means "unset": the key is dropped rather than stored blank, which is what lets ffmpeg
  // fall back to the bundled binary and then to the PATH.
  const commitOrUnset = (typed: string) => onChange(typed === '' ? undefined : typed)

  switch (descriptor.kind) {
    case 'choice':
      return (
        <WindowSelect
          id={id}
          data-sc={fieldHandle(scId)}
          aria-describedby={describedBy}
          className="w-full max-w-xs"
          value={String(definedValue(value))}
          // Handed back as the option declared it, not as the string the DOM carries: a
          // numeric choice would otherwise be stored as `'3'` and refused by zod.
          onChange={event =>
            onChange(
              optionsOf(descriptor).find(option => String(option.value) === event.target.value)
                ?.value,
            )
          }
        >
          {optionsOf(descriptor).map(option => (
            <option key={String(option.value)} value={String(option.value)}>
              {optionLabel(option, t)}
            </option>
          ))}
        </WindowSelect>
      )

    case 'number':
      return (
        <WindowInput
          id={id}
          data-sc={fieldHandle(scId)}
          aria-describedby={describedBy}
          className="w-24"
          type="number"
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          value={numberValue(value, '')}
          onChange={event => {
            const next = event.target.valueAsNumber
            if (writableNumber(descriptor, next)) onChange(next)
          }}
        />
      )

    case 'slider':
      return (
        <div className="flex items-center gap-2">
          <Slider
            id={id}
            scId={scId}
            describedBy={describedBy}
            className="w-40"
            min={descriptor.min}
            max={descriptor.max}
            step={descriptor.step}
            value={numberValue(value, 0)}
            onChange={next => {
              if (writableNumber(descriptor, next)) onChange(next)
            }}
          />
          <span className={cn(WINDOW_CAPTION, 'w-10 text-right tabular-nums')}>
            {displayNumber(value, i18n.language, decimals)}
          </span>
        </div>
      )

    case 'boolean':
      return (
        <WindowToggle
          id={id}
          data-sc={fieldHandle(scId)}
          aria-describedby={describedBy}
          checked={value === true}
          onChange={event => onChange(event.target.checked)}
        />
      )

    case 'color':
      return (
        <SettingRowColorControl
          id={id}
          scId={scId}
          describedBy={describedBy}
          value={value}
          onChange={onChange}
        />
      )

    case 'path':
      return (
        <SettingRowPathControl
          descriptor={descriptor}
          id={id}
          scId={scId}
          describedBy={describedBy}
          stored={value}
          onCommit={commitOrUnset}
        />
      )

    default:
      return (
        <SettingRowTextControl
          descriptor={descriptor}
          id={id}
          scId={scId}
          describedBy={describedBy}
          stored={value}
          onCommit={commitOrUnset}
        />
      )
  }
}

function definedValue(value: SettingValue | undefined): SettingValue | '' {
  return value ?? ''
}

function numberValue<T extends number | ''>(
  value: SettingValue | undefined,
  fallback: T,
): number | T {
  return typeof value === 'number' ? value : fallback
}

function displayNumber(
  value: SettingValue | undefined,
  language: string,
  decimals: number,
): string {
  return typeof value === 'number'
    ? formatDecimal(value, language, { digits: decimals, least: decimals })
    : ''
}
