// SPDX-License-Identifier: MIT
import { useTranslation } from 'react-i18next'
import type { InputMap } from '@shared/domain/inputMap'
import { INPUT_PRESET_IDS, inputMapPreset } from '@shared/domain/inputPresets'
import { Chip } from '@/components/Chip'
import { Tag } from '@/components/Tag'
import { sameValues } from '@/helpers/objects'
import { inputBindingLabel } from './inputMapPresentation'

type InputMapSimpleProps = {
  map: InputMap
  onChange: (map: InputMap) => void
}

export function InputMapSimple({ map, onChange }: InputMapSimpleProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-(--sc-gutter)">
      <section aria-label={t('game.inputMap.presets')} className="flex flex-wrap gap-1.5">
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
      </section>
      <div className="grid gap-2">
        {map.actions.map(action => (
          <article
            key={action.id}
            className="border-border bg-panel rounded-(--radius-sc-md) border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs font-medium">{action.id}</strong>
              <span className="text-muted text-tiny">{t(`game.inputMap.kind.${action.kind}`)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {action.bindings.map((binding, index) => (
                <Tag key={`${binding.device}:${inputBindingLabel(binding)}:${index}`}>
                  {t(`game.inputMap.device.${binding.device}`)} · {inputBindingLabel(binding)}
                </Tag>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
