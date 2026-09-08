// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import type { InputActionKind, InputMap } from '@shared/domain/inputMap'
import { Button } from '@/components/Button'
import { FieldGrid } from '@/components/FieldGrid'
import { NumberField } from '@/components/NumberField'
import { PropertySection } from '@/components/PropertySection'
import { TextField } from '@/components/TextField'
import { ToggleField } from '@/components/ToggleField'
import { TIP_LEFT } from '@/helpers/tooltip'
import { InputMapExpertAction } from './InputMapExpertAction'

type InputMapExpertProps = { map: InputMap; onChange: (map: InputMap) => void }

export function InputMapExpert({ map, onChange }: InputMapExpertProps) {
  const { t } = useTranslation()
  const kinds: readonly { value: InputActionKind; label: string }[] = [
    { value: 'button', label: t('game.inputMap.kind.button') },
    { value: 'axis1', label: t('game.inputMap.kind.axis1') },
    { value: 'axis2', label: t('game.inputMap.kind.axis2') },
  ]
  return (
    <div className="flex flex-col gap-2 p-(--sc-gutter)">
      <PropertySection
        title={t('game.inputMap.context')}
        description={t('game.inputMap.contextDescription')}
        scId="input.context"
        plate
      >
        {/* 🛑 Every one of these carries its own line of help: the six notions of this editor
            were nowhere explained on screen, while each Preferences setting has a paragraph. */}
        <FieldGrid>
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
        </FieldGrid>
      </PropertySection>

      {map.actions.map((action, index) => (
        <InputMapExpertAction
          key={`${action.id}:${index}`}
          action={action}
          kinds={kinds}
          onChange={next =>
            onChange({
              ...map,
              actions: next
                ? map.actions.map((one, at) => (at === index ? next : one))
                : map.actions.filter((_, at) => at !== index),
            })
          }
        />
      ))}

      <div className="flex">
        <Button
          variant="primary"
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
