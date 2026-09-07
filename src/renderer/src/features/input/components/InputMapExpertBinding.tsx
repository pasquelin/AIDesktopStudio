// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import { inputBindingFits } from '@shared/domain/inputMap'
import type { InputAction, InputBinding } from '@shared/domain/inputMap'
import { Button } from '@/components/Button'
import { SelectField } from '@/components/SelectField'
import { TIP_LEFT } from '@/helpers/tooltip'
import { inputBindingLabel } from './inputMapPresentation'
import { InputMapExpertGamepad } from './InputMapExpertGamepad'
import { InputMapExpertKeyboard } from './InputMapExpertKeyboard'

type InputDevice = InputBinding['device']
type InputMapExpertBindingProps = {
  action: InputAction
  binding: InputBinding
  index: number
  onChange: (binding: InputBinding | null) => void
}

function bindingForDevice(kind: InputAction['kind'], device: InputDevice): InputBinding {
  if (device === 'mouse') return { device: 'mouse', control: 'primary' }
  if (device === 'gamepad') {
    if (kind === 'button') return { device: 'gamepad', control: 'south' }
    if (kind === 'axis1') return { device: 'gamepad', control: 'leftStickX' }
    return { device: 'gamepad', control: 'leftStick' }
  }
  if (kind === 'button') return { device: 'keyboard', code: 'Space' }
  if (kind === 'axis1') return { device: 'keyboard', code: 'KeyD', scale: 1 }
  return { device: 'keyboard', code: 'KeyD', axis: 'x', scale: 1 }
}

export function InputMapExpertBinding({
  action,
  binding,
  index,
  onChange,
}: InputMapExpertBindingProps) {
  const { t } = useTranslation()
  const devices: readonly { value: InputDevice; label: string }[] = [
    { value: 'keyboard', label: t('game.inputMap.device.keyboard') },
    { value: 'gamepad', label: t('game.inputMap.device.gamepad') },
    { value: 'mouse', label: t('game.inputMap.device.mouse') },
  ]

  return (
    // 🛑 One field per LINE. Side by side, five fields shared one label column and three of
    // them read « Périphér… », « Liaison M… », « Inv… » in a 2 056 px window.
    <div className="border-border grid gap-1.5 rounded-(--radius-sc-sm) border p-2">
      <SelectField
        scId={`input.action.${action.id}.binding.${index}.device`}
        label={t('game.inputMap.deviceLabel')}
        hint={TIP_LEFT(t('game.inputMap.deviceLabel'), false, t('game.inputMap.help.device'))}
        value={binding.device}
        options={devices.filter(device =>
          inputBindingFits(action.kind, bindingForDevice(action.kind, device.value)),
        )}
        onChange={device => onChange(bindingForDevice(action.kind, device))}
      />
      {binding.device === 'gamepad' && (
        <InputMapExpertGamepad
          kind={action.kind}
          binding={binding}
          scId={`input.action.${action.id}.binding.${index}`}
          onChange={onChange}
        />
      )}
      {binding.device === 'keyboard' && (
        <InputMapExpertKeyboard
          kind={action.kind}
          binding={binding}
          scId={`input.action.${action.id}.binding.${index}`}
          onChange={onChange}
        />
      )}
      {binding.device === 'mouse' && (
        <SelectField
          scId={`input.action.${action.id}.binding.${index}.mouse`}
          label={t('game.inputMap.binding', { device: t('game.inputMap.device.mouse') })}
          value={binding.control}
          options={[{ value: 'primary', label: inputBindingLabel(binding) }]}
          onChange={control => onChange({ ...binding, control })}
        />
      )}
      <div className="flex justify-end">
        <Button onClick={() => onChange(null)}>{t('game.inputMap.removeBinding')}</Button>
      </div>
    </div>
  )
}
