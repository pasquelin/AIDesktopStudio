import { memo } from 'react'
import type { ModelSummary } from '@shared/domain/model'
import type { ModelRefusalWord } from '@/hooks/useModelReach'
import { cn } from '@/helpers/cn'
import { Row } from '../Row'
import { Thumbnail } from '../Thumbnail'
import { rowSkin } from '../styles'

export type ModelPickerRowProps = {
  model: ModelSummary
  selected: boolean
  /** Where it runs, resolved by the picker: translating per row runs i18next per frame. */
  where: string
  /** A word the host puts after `where` — what makes this model worth looking at first. */
  promoted?: string
  /** Its picture, resolved by the host. Absent draws the empty plate every other row wears. */
  picture?: string
  /** Why it cannot be picked right now, with the sentence that explains the word. */
  refusal?: ModelRefusalWord
  /** Takes the id rather than closing over it, so this row's props survive a re-render. */
  onPick: (modelId: string) => void
}

/** One model in the picker: what it is called, where it runs, and what stands in its way. */
export const ModelPickerRow = memo(function ModelPickerRow({
  model,
  selected,
  where,
  promoted,
  picture,
  refusal,
  onPick,
}: ModelPickerRowProps) {
  return (
    <button
      type="button"
      role="menuitem"
      data-selected={selected || undefined}
      // `text-left`: a button centres its text, and `Row` inherits it.
      className={cn(rowSkin(selected), 'w-full cursor-pointer text-left')}
      onClick={() => onPick(model.id)}
    >
      <Row
        media={<Thumbnail url={picture} />}
        title={model.name}
        subtitle={[where, promoted, refusal?.word].filter(Boolean).join(' · ')}
        hint={refusal?.hint}
      />
    </button>
  )
})
