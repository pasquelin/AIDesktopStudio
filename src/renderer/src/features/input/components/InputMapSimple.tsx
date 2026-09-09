// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import type { InputMap } from '@shared/domain/inputMap'
import { INPUT_PRESET_IDS, inputMapPreset } from '@shared/domain/inputPresets'
import { READING_BLOCK } from '@/components/panelStyles'
import { Chip } from '@/components/Chip'
import { PropertySection } from '@/components/PropertySection'
import { Tag } from '@/components/Tag'
import { FIELD_HELP } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { sameValues } from '@/helpers/objects'
import { inputActionKey, inputBindingLabel } from './inputMapPresentation'

type InputMapSimpleProps = {
  map: InputMap
  onChange: (map: InputMap) => void
}

/** What the map DOES, read rather than set — the view someone opening the format lands on. */
export function InputMapSimple({ map, onChange }: InputMapSimpleProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3 p-3">
      <PropertySection
        title={t('game.inputMap.presets')}
        description={t('game.inputMap.presetsDescription')}
        scId="input.presets"
        plate
      >
        <div className="flex flex-wrap gap-1.5">
          {INPUT_PRESET_IDS.map(id => (
            <Chip
              key={id}
              label={t(`game.inputMap.preset.${id}`)}
              hint={t('game.inputMap.applyPresetHint')}
              // 🛑 By the ACTIONS, never the id: the click keeps the map's own id, so testing the
              // id lit a chip for a file merely NAMED `character` and none for one holding that
              // preset under any other name.
              selected={sameValues(map.actions, inputMapPreset(id).actions)}
              // 🛑 The map keeps its OWN id — same reason as `createInputMap`: the FILE names the
              // context, so taking the preset's id gave two files one context, in silence.
              onClick={() => onChange({ ...structuredClone(inputMapPreset(id)), id: map.id })}
            />
          ))}
        </div>
      </PropertySection>

      <PropertySection
        title={t('game.inputMap.actionsTitle')}
        description={t('game.inputMap.actionsDescription')}
        scId="input.actions"
        plate
      >
        {map.actions.length === 0 ? (
          <p className={cn(FIELD_HELP, 'm-0')}>{t('game.inputMap.noAction')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {map.actions.map(action => (
              <article key={action.id} className={READING_BLOCK}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-xs font-medium">{action.id}</strong>
                  <span className="text-muted text-tiny shrink-0">
                    {t(`game.inputMap.kind.${action.kind}`)}
                  </span>
                </div>
                <p className={cn(FIELD_HELP, 'm-0')}>{t(inputActionKey(action.id))}</p>
                <div className="flex flex-wrap gap-1.5">
                  {action.bindings.length === 0 ? (
                    <span className={FIELD_HELP}>{t('game.inputMap.noBinding')}</span>
                  ) : (
                    action.bindings.map((binding, index) => {
                      const control = inputBindingLabel(binding)
                      return (
                        <Tag key={`${binding.device}:${control}:${index}`}>
                          {t(`game.inputMap.device.${binding.device}`)} · {control}
                        </Tag>
                      )
                    })
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </PropertySection>
    </div>
  )
}
