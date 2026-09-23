import { mdiClose, mdiImagePlusOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { assetUrl, PICTURES } from '@shared/domain/asset'
import { CONTEXT_PICTURES_MAX } from '@shared/domain/projectContext'
import { AssetDropTarget } from '@/components/AssetDropTarget'
import { FIELD_THUMBNAIL } from '@/components/styles'
import { Thumbnail } from '@/components/Thumbnail'
import { ToolButton } from '@/components/ToolButton'
import { UiIcon } from '@/components/UiIcon'
import { cn } from '@/helpers/cn'
import { TIP_LEFT } from '@/helpers/tooltip'

export type ContextPicturesProps = {
  pictures: readonly string[]
  onChange: (pictures: string[]) => void
}

/** `AssetDropTarget` and not `AssetDropField`: that one is bound to one asset and to a form. */
export function ContextPictures({ pictures, onChange }: ContextPicturesProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2">
      {pictures.map(id => (
        <span key={id} className="relative">
          <Thumbnail url={assetUrl(id)} className={FIELD_THUMBNAIL} />
          <ToolButton
            icon={mdiClose}
            label={t('context.unpin')}
            tooltip={TIP_LEFT}
            className="absolute -top-1 -right-1 size-4"
            onClick={() => onChange(pictures.filter(other => other !== id))}
          />
        </span>
      ))}

      {pictures.length < CONTEXT_PICTURES_MAX && (
        <AssetDropTarget
          accepts={PICTURES}
          // The project's own context CITES a picture; it does not file one.
          filesAreInternal
          outlined
          className={cn(
            FIELD_THUMBNAIL,
            'border-border text-muted flex items-center justify-center rounded-(--radius-sc-sm) border border-dashed',
          )}
          onDrop={asset => {
            if (!pictures.includes(asset.id)) onChange([...pictures, asset.id])
          }}
        >
          <UiIcon path={mdiImagePlusOutline} className="size-4" />
        </AssetDropTarget>
      )}
    </div>
  )
}
