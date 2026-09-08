// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import { inputBindingFits } from '@shared/domain/inputMap'
import type { GamepadBinding, GamepadControl, InputActionKind } from '@shared/domain/inputMap'
import { NumberField } from '@/components/NumberField'
import { SelectField } from '@/components/SelectField'
import { ToggleField } from '@/components/ToggleField'
import { ROW_ACTION_SPACER } from '@/components/styles'
import { useInputCapture } from '@/hooks/useInputCapture'
import { TIP_LEFT } from '@/helpers/tooltip'
import { useLatest } from '@/hooks/useLatest'
import { DEFAULT_GAMEPAD_DEAD_ZONE, GAMEPAD_AXES, GAMEPAD_BUTTONS } from '@game/runtime/inputMaps'
import { InputMapCaptureButton } from './InputMapCaptureButton'

type InputMapExpertGamepadProps = {
  kind: InputActionKind
  binding: GamepadBinding
  scId: string
  onChange: (binding: GamepadBinding) => void
}

// The two sticks whole, then the runtime's own orders: spelt out here it was a fifth copy of the
// list, and a control added to the union compiled everywhere without ever reaching this picker.
const CONTROLS: readonly GamepadControl[] = [
  'leftStick',
  'rightStick',
  ...GAMEPAD_AXES,
  ...GAMEPAD_BUTTONS,
]

export function InputMapExpertGamepad({
  kind,
  binding,
  scId,
  onChange,
}: InputMapExpertGamepadProps) {
  const { t } = useTranslation()
  const capture = useInputCapture()
  // The row keeps being edited while a push is waited on: without this, binding the stick would
  // put back the dead zone and the scale the author changed in the meantime.
  const latest = useLatest(binding)
  // A control the ACTION cannot take is not one a capture may bind: a stick pushed while a
  // button action is being captured would otherwise write a binding the map refuses.
  const fits = (control: GamepadControl): boolean =>
    inputBindingFits(kind, { device: 'gamepad', control })

  return (
    <>
      <SelectField
        scId={scId}
        label={t('game.inputMap.binding', { device: t('game.inputMap.device.gamepad') })}
        value={binding.control}
        options={CONTROLS.filter(fits).map(control => ({ value: control, label: control }))}
        onChange={control => onChange({ ...binding, control })}
        actions={
          <>
            <InputMapCaptureButton
              capture={capture}
              onArm={() =>
                capture.captureGamepadControl(
                  control => onChange({ ...latest.current, control }),
                  fits,
                )
              }
            />
            {/* 🛑 The place a reset would hold: this line has none, and `justify-end` puts a lone
                button on the LAST place — so the same capture sat one column right of the
                keyboard's, which does carry a reset beside it. `ROW_ACTION_SPACER` exists for
                exactly this, and not using it is what made two rows of one form disagree. */}
            <span aria-hidden className={ROW_ACTION_SPACER} />
          </>
        }
      />
      <NumberField
        label={t('game.inputMap.deadZone')}
        hint={TIP_LEFT(t('game.inputMap.deadZone'), false, t('game.inputMap.help.deadZone'))}
        value={binding.deadZone ?? DEFAULT_GAMEPAD_DEAD_ZONE}
        min={0}
        max={0.99}
        onChange={deadZone => onChange({ ...binding, deadZone })}
      />
      <ToggleField
        label={t('game.inputMap.invert')}
        hint={TIP_LEFT(t('game.inputMap.invert'), false, t('game.inputMap.help.invert'))}
        value={binding.invert ?? false}
        onChange={invert => onChange({ ...binding, invert })}
      />
      <NumberField
        label={t('game.inputMap.scale')}
        hint={TIP_LEFT(t('game.inputMap.scale'), false, t('game.inputMap.help.scale'))}
        value={binding.scale ?? 1}
        onChange={scale => onChange({ ...binding, scale })}
      />
    </>
  )
}
