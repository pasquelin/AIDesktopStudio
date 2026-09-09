// SPDX-License-Identifier: MIT
import { mdiTrashCanOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { InputAction, InputActionKind } from '@shared/domain/inputMap'
import { withItemAt } from '@shared/collections'
import { Button } from '@/components/Button'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { ToolButton } from '@/components/ToolButton'
import { FIELD_HELP, PANEL_GROUP_LABEL } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { TIP_LEFT } from '@/helpers/tooltip'
import { InputMapExpertBinding } from './InputMapExpertBinding'
import { defaultInputBinding, inputActionKey } from './inputMapPresentation'

export type InputMapExpertActionProps = {
  action: InputAction
  /** `null` removes it — the shape a binding row already answers with. */
  onChange: (action: InputAction | null) => void
}

/** One action of the map: the name a script reads, and every control that fires it. */
export function InputMapExpertAction({ action, onChange }: InputMapExpertActionProps) {
  const { t } = useTranslation()
  // Named here rather than handed down, the way a binding row names its own devices.
  const kinds: readonly { value: InputActionKind; label: string }[] = [
    { value: 'button', label: t('game.inputMap.kind.button') },
    { value: 'axis1', label: t('game.inputMap.kind.axis1') },
    { value: 'axis2', label: t('game.inputMap.kind.axis2') },
  ]

  return (
    <PropertySection
      title={action.id || t('game.inputMap.unnamedAction')}
      description={t(inputActionKey(action.id))}
      scId={`input.action.${action.id}`}
      plate
      actions={
        <ToolButton
          icon={mdiTrashCanOutline}
          label={t('game.inputMap.removeAction')}
          tooltip={TIP_LEFT}
          variant="header"
          onClick={() => onChange(null)}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <TextField
          scId={`input.action.${action.id}.id`}
          label={t('game.inputMap.actionId')}
          hint={TIP_LEFT(t('game.inputMap.actionId'), false, t('game.inputMap.help.actionId'))}
          value={action.id}
          onChange={id => onChange({ ...action, id })}
        />
        <SelectField
          scId={`input.action.${action.id}.kind`}
          label={t('game.inputMap.actionKind')}
          hint={TIP_LEFT(t('game.inputMap.actionKind'), false, t('game.inputMap.help.actionKind'))}
          value={action.kind}
          options={kinds}
          onChange={kind => onChange({ ...action, kind, bindings: [defaultInputBinding(kind)] })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={PANEL_GROUP_LABEL}>{t('game.inputMap.bindings')}</span>
        <p className={cn(FIELD_HELP, 'm-0')}>{t('game.inputMap.bindingsDescription')}</p>
      </div>
      {action.bindings.length === 0 && (
        <p className={cn(FIELD_HELP, 'm-0')}>{t('game.inputMap.noBinding')}</p>
      )}
      {action.bindings.map((binding, at) => (
        <InputMapExpertBinding
          key={`${binding.device}:${at}`}
          action={action}
          binding={binding}
          index={at}
          onChange={next =>
            onChange({ ...action, bindings: withItemAt(action.bindings, at, next) })
          }
        />
      ))}
      <Button
        className="w-full"
        onClick={() =>
          onChange({
            ...action,
            bindings: [...action.bindings, defaultInputBinding(action.kind)],
          })
        }
      >
        {t('game.inputMap.addBinding')}
      </Button>
    </PropertySection>
  )
}
