// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import type { InputAction, InputActionKind, InputBinding, InputMap } from '@shared/domain/inputMap'
import { Button } from '@/components/Button'
import { NumberField } from '@/components/NumberField'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { ToggleField } from '@/components/ToggleField'
import { TIP_LEFT } from '@/helpers/tooltip'
import { InputMapExpertBinding } from './InputMapExpertBinding'

type InputMapExpertProps = { map: InputMap; onChange: (map: InputMap) => void }

function changedAction(map: InputMap, index: number, action: InputAction): InputMap {
  return { ...map, actions: map.actions.map((current, at) => (at === index ? action : current)) }
}

function newBinding(kind: InputActionKind): InputBinding {
  if (kind === 'button') return { device: 'keyboard', code: 'Space' }
  if (kind === 'axis1') return { device: 'gamepad', control: 'leftStickX' }
  return { device: 'gamepad', control: 'leftStick' }
}

export function InputMapExpert({ map, onChange }: InputMapExpertProps) {
  const { t } = useTranslation()
  const kinds: readonly { value: InputActionKind; label: string }[] = [
    { value: 'button', label: t('game.inputMap.kind.button') },
    { value: 'axis1', label: t('game.inputMap.kind.axis1') },
    { value: 'axis2', label: t('game.inputMap.kind.axis2') },
  ]

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <PropertySection title={t('game.inputMap.context')} scId="input.context">
        {/* 🛑 Every one of these carries its own line of help: the six notions of this editor
            were nowhere explained on screen, while each Preferences setting has a paragraph. */}
        <TextField
          scId="input.context.id"
          label={t('game.inputMap.id')}
          hint={TIP_LEFT(t('game.inputMap.id'), false, t('game.inputMap.help.id'))}
          value={map.id}
          onChange={id => onChange({ ...map, id })}
        />
        <NumberField
          scId="input.context.priority"
          label={t('game.inputMap.priority')}
          hint={TIP_LEFT(t('game.inputMap.priority'), false, t('game.inputMap.help.priority'))}
          value={map.priority}
          step={1}
          onChange={priority => onChange({ ...map, priority })}
        />
        <ToggleField
          scId="input.context.active"
          label={t('game.inputMap.defaultActive')}
          hint={TIP_LEFT(
            t('game.inputMap.defaultActive'),
            false,
            t('game.inputMap.help.defaultActive'),
          )}
          value={map.defaultActive}
          onChange={defaultActive => onChange({ ...map, defaultActive })}
        />
      </PropertySection>
      {map.actions.map((action, index) => (
        <PropertySection
          key={`${action.id}:${index}`}
          title={action.id || t('game.inputMap.unnamedAction')}
          scId={`input.action.${action.id}`}
          actions={
            <Button
              onClick={() =>
                onChange({ ...map, actions: map.actions.filter((_, at) => at !== index) })
              }
            >
              {t('game.inputMap.removeAction')}
            </Button>
          }
        >
          <TextField
            scId={`input.action.${action.id}.id`}
            label={t('game.inputMap.actionId')}
            hint={TIP_LEFT(t('game.inputMap.actionId'), false, t('game.inputMap.help.actionId'))}
            value={action.id}
            onChange={id => onChange(changedAction(map, index, { ...action, id }))}
          />
          <SelectField
            scId={`input.action.${action.id}.kind`}
            label={t('game.inputMap.actionKind')}
            hint={TIP_LEFT(
              t('game.inputMap.actionKind'),
              false,
              t('game.inputMap.help.actionKind'),
            )}
            value={action.kind}
            options={kinds}
            onChange={kind =>
              onChange(changedAction(map, index, { ...action, kind, bindings: [newBinding(kind)] }))
            }
          />
          <div className="grid gap-1.5 px-2 py-1">
            {action.bindings.map((binding, at) => (
              <InputMapExpertBinding
                key={`${binding.device}:${at}`}
                action={action}
                binding={binding}
                index={at}
                onChange={next => {
                  const bindings = next
                    ? action.bindings.map((one, bindingIndex) => (bindingIndex === at ? next : one))
                    : action.bindings.filter((_, bindingIndex) => bindingIndex !== at)
                  onChange(changedAction(map, index, { ...action, bindings }))
                }}
              />
            ))}
            <Button
              onClick={() =>
                onChange(
                  changedAction(map, index, {
                    ...action,
                    bindings: [...action.bindings, newBinding(action.kind)],
                  }),
                )
              }
            >
              {t('game.inputMap.addBinding')}
            </Button>
          </div>
        </PropertySection>
      ))}
      <div className="p-(--sc-gutter)">
        <Button
          onClick={() =>
            onChange({
              ...map,
              actions: [
                ...map.actions,
                { id: `action${map.actions.length + 1}`, kind: 'button', bindings: [] },
              ],
            })
          }
        >
          {t('game.inputMap.addAction')}
        </Button>
      </div>
    </div>
  )
}
