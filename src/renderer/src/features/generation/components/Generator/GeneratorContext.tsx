import { useTranslation } from 'react-i18next'
import type { AiRoleId } from '@shared/domain/aiRole'
import { assetUrl } from '@shared/domain/asset'
import type { FieldDescriptor } from '@shared/domain/model'
import { contextPictures, promptKeyOf, type ContextUse } from '@shared/domain/projectContext'
import { Checkbox } from '@/components/Checkbox'
import { Button } from '@/components/Button'
import { FIELD_THUMBNAIL } from '@/components/styles'
import { Thumbnail } from '@/components/Thumbnail'
import { fillSourceFields } from '@/features/image/components/aiFields'
import { HINT_TOP } from '@/helpers/tooltip'
import { useModels } from '@/stores/models'
import { useProjectContext, projectContextText } from '@/stores/projectContext'

export type GeneratorContextProps = {
  fields: readonly FieldDescriptor[]
  modelId: string
  role: AiRoleId
  use: ContextUse
  onUse: (use: ContextUse) => void
}

/**
 * Withdrawn rather than drawn empty when it would do nothing — no card on, or a model with no
 * prompt field: « nothing will be added » under every upscale is a line nobody can act on.
 */
export function GeneratorContext({ fields, modelId, role, use, onUse }: GeneratorContextProps) {
  const { t } = useTranslation()
  const cards = useProjectContext(state => state.context.cards)
  const context = useProjectContext(projectContextText)
  const prepare = useModels(state => state.prepare)

  const pinned = contextPictures(cards)
  // Placed by KIND, never by name, and only into what this model declares: `fillSourceFields`
  // is what the workspace's own sources already go through.
  const places = fillSourceFields(
    fields,
    pinned.map(assetId => ({ role: 'source', assetId, kind: 'image' })),
  )

  /**
   * 🛑 The two halves are decided SEPARATELY. Gating the references on the text hid the pictures
   * of a card that carries only pictures — a natural way to use one — and hid them from an upscale,
   * which takes an image and no words.
   */
  const says = context.length > 0 && promptKeyOf(fields) !== undefined
  const shows = pinned.length > 0 && Object.keys(places).length > 0
  if (!says && !shows) return null

  return (
    <div className="border-border flex flex-col gap-2 border-t pt-2">
      {says && (
        <label className="text-muted flex items-center gap-2 text-xs">
          <Checkbox
            data-sc="field:generation.context"
            checked={use === 'apply'}
            onChange={event => onUse(event.target.checked ? 'apply' : 'skip')}
          />
          {t('generation.contextApplies')}
        </label>
      )}

      {says && use === 'apply' && (
        <p className="text-muted bg-surface text-tiny max-h-24 overflow-y-auto rounded-(--radius-sc-sm) p-1.5 whitespace-pre-wrap select-text">
          {context}
        </p>
      )}

      {/*
        On a click and never on their own: a reference decides which OPERATION runs and what the
        shot costs, so pinning a picture in the panel beside must not quietly turn a text-to-image
        into an image-to-image. Withdrawn when this model takes no picture at all.
      */}
      {shows && (
        <div className="flex items-center gap-2">
          {pinned.map(id => (
            <Thumbnail key={id} url={assetUrl(id)} className={FIELD_THUMBNAIL} />
          ))}
          <Button
            variant="neutral"
            {...HINT_TOP(t('generation.contextReferencesHint'))}
            onClick={() => prepare(role, modelId, places)}
          >
            {t('generation.contextReferences')}
          </Button>
        </div>
      )}
    </div>
  )
}
