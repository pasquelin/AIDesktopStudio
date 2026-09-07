import { useTranslation } from 'react-i18next'
import type { FieldDescriptor } from '@shared/domain/model'
import { pixelArtWords } from '@shared/domain/pixelArtPrompt'
import { promptKeyOf } from '@shared/domain/projectContext'
import { CHECKBOX } from '@/components/styles'
import { cn } from '@/helpers/cn'

export type GeneratorPixelArtProps = {
  fields: readonly FieldDescriptor[]
  /** The artwork's own measurements, in cells. `null` when the document is not on a grid. */
  grid: { columns: number; rows: number } | null
  applies: boolean
  onApplies: (applies: boolean) => void
}

/**
 * Withdrawn rather than drawn empty when it would do nothing, like the context beside it: off a
 * grid, or on a model with no prompt field, « nothing will be added » is a line nobody can act on.
 *
 * The box exists because a studio in pixel-art mode still wants a photo reference now and then,
 * and leaving the mode to get one would resize the document and drop its pixel history.
 */
export function GeneratorPixelArt({ fields, grid, applies, onApplies }: GeneratorPixelArtProps) {
  const { t } = useTranslation()
  if (!grid || promptKeyOf(fields) === undefined) return null

  return (
    <div className="border-border flex flex-col gap-2 border-t pt-2">
      <label className="text-muted flex items-center gap-2 text-xs">
        <input
          data-sc="field:generation.pixelArt"
          type="checkbox"
          className={cn(CHECKBOX, 'size-3')}
          checked={applies}
          onChange={event => onApplies(event.target.checked)}
        />
        {t('generation.pixelArtApplies')}
      </label>

      {/*
        The WORDS, never `withPixelArtPrompt('')`: that one answers for a blank prompt, which is
        no longer the phrase — and a box that showed what it would not send is worse than none.
      */}
      {applies && (
        <p className="text-muted bg-surface text-tiny rounded-(--radius-sc-sm) p-1.5 whitespace-pre-wrap select-text">
          {pixelArtWords(grid.columns, grid.rows)}
        </p>
      )}
    </div>
  )
}
