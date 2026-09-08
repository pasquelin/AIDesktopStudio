// SPDX-License-Identifier: MIT
import { mdiTrashCanOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { inputBindingFits } from '@shared/domain/inputMap'
import type { InputAction, InputBinding } from '@shared/domain/inputMap'
import { SelectField } from '@/components/SelectField'
import { ToolButton } from '@/components/ToolButton'
import { PANEL_GROUP_LABEL } from '@/components/styles'
import { FIELD_BLOCK } from '@/components/panelStyles'
import { TIP_LEFT } from '@/helpers/tooltip'
import { defaultInputBinding, inputBindingLabel } from './inputMapPresentation'
import { InputMapExpertGamepad } from './InputMapExpertGamepad'
import { InputMapExpertKeyboard } from './InputMapExpertKeyboard'

type InputDevice = InputBinding['device']
type InputMapExpertBindingProps = {
  action: InputAction
  binding: InputBinding
  index: number
  onChange: (binding: InputBinding | null) => void
}

/**
 * One binding of an action, as a band of the section rather than a card inside it.
 *
 * 🛑 FULL-BLEED, and that is the point: a card with a padding of its own started its labels eight
 * pixels to the right of the fields above it, so a section read as two forms poorly stacked. The
 * pull-back cancels the body's inset and gives it back inside, which lands every label of the
 * document on ONE column.
 */
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
    <div className={FIELD_BLOCK}>
      <div className="flex items-center gap-2">
        <span className={PANEL_GROUP_LABEL}>
          {t('game.inputMap.bindingRank', { rank: index + 1 })}
        </span>
        <span className="flex-1" />
        <ToolButton
          icon={mdiTrashCanOutline}
          label={t('game.inputMap.removeBinding')}
          tooltip={TIP_LEFT}
          variant="row"
          onClick={() => onChange(null)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SelectField
          scId={`input.action.${action.id}.binding.${index}.device`}
          label={t('game.inputMap.deviceLabel')}
          hint={TIP_LEFT(t('game.inputMap.deviceLabel'), false, t('game.inputMap.help.device'))}
          value={binding.device}
          options={devices.filter(device =>
            inputBindingFits(action.kind, defaultInputBinding(action.kind, device.value)),
          )}
          onChange={device => onChange(defaultInputBinding(action.kind, device))}
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
      </div>
    </div>
  )
}
