import { useTranslation } from 'react-i18next'
import { QuietNote } from '@/components/QuietNote'
import type { LinkOption } from '@/components/LinkField/linkOption'
import { NOTHING_WORN, withMaterialAt } from '@shared/domain/scene'
import { useDocumentOptions } from '@/hooks/useDocumentOptions'
import { ModelDressSectionRow } from './ModelDressSectionRow'

export type ModelDressSectionMaterialsProps = {
  worn: readonly string[]
  /** The project's pictures, asked ONCE by the section and handed down — a row would ask per slot. */
  pictures: readonly LinkOption[]
  /** How many materials the model's own file carries. Zero while its file has not landed. */
  slots: number
  names: readonly string[]
  indices?: readonly number[]
  onChange: (documentIds: readonly string[]) => void
  onAssemble: (slot: number) => void
}

/**
 * The material slots of a model, as Blender and Unreal draw them. The list is the USER'S, not the
 * file's — a row past what the file carries is kept and SAID rather than dropped.
 */
export function ModelDressSectionMaterials({
  worn,
  pictures,
  slots,
  names,
  indices,
  onChange,
  onAssemble,
}: ModelDressSectionMaterialsProps) {
  const { t } = useTranslation()
  const options = useDocumentOptions('material')
  const rows =
    slots > worn.length ? [...worn, ...Array<string>(slots - worn.length).fill(NOTHING_WORN)] : worn
  const shownSlots = indices ?? rows.map((_, slot) => slot)

  return (
    <>
      {shownSlots.map(slot => (
        <ModelDressSectionRow
          key={slot}
          slot={slot}
          name={names[slot]}
          documentId={rows[slot] ?? NOTHING_WORN}
          options={options}
          pictures={pictures}
          // Beyond what the file carries — the row is kept, and does nothing until the model has
          // that many materials. Said on the note below rather than on every row.
          inert={slots > 0 && slot >= slots}
          onChange={next =>
            onChange(
              slots > 0 && slot >= slots && next === ''
                ? [...worn.slice(0, slot), ...worn.slice(slot + 1)]
                : withMaterialAt(worn, slot, next),
            )
          }
          onAssemble={() => onAssemble(slot)}
        />
      ))}

      {worn.length > slots && slots > 0 && (
        <QuietNote>
          {t('inspector.modelDressExtraSlots', { count: worn.length - slots, slots })}
        </QuietNote>
      )}
    </>
  )
}
