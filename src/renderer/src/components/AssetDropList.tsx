import { mdiCloseCircleOutline, mdiImagePlusOutline } from '@mdi/js'
import { useEffect, useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ASSET_TYPES, assetUrl, posterUrl, type Asset } from '@shared/domain/asset'
import { cn } from '@/helpers/cn'
import { useLatest } from '@/hooks/useLatest'
import { TIP_LEFT } from '@/helpers/tooltip'
import { AssetDropTarget } from './AssetDropTarget'
import { fieldHandle } from './scHandle'
import { FIELD_THUMBNAIL } from './styles'
import { Thumbnail } from './Thumbnail'
import { ToolButton } from './ToolButton'
import { UiIcon } from './UiIcon'

export type AssetDropListProps = {
  id?: string
  registration: UseFormRegisterReturn
  /** What the form starts with — a preset an edit action filled, or nothing. */
  initial?: unknown
  placeholder: string
  /** The handle the MCP steers this field by. Never a translated word. */
  scId?: string
}

const EMPTY_SLOT = cn(FIELD_THUMBNAIL, 'text-muted grid shrink-0 place-items-center')
const SLOT_LABEL = 'text-muted min-w-0 flex-1 truncate text-xs'

/** Whatever a preset left here, kept only where it is a list of ids. */
const listed = (initial: unknown): readonly string[] =>
  Array.isArray(initial) ? initial.filter(one => typeof one === 'string') : []

/**
 * Several pictures for one input, in the order they were dropped. 🛑 ONE registration for the
 * whole list: a field per slot hands react-hook-form as many refs under a name, and it keeps one.
 */
export function AssetDropList({
  id,
  registration,
  initial,
  placeholder,
  scId,
}: AssetDropListProps) {
  const { t } = useTranslation()
  const [ids, setIds] = useState<readonly string[]>(() => listed(initial))
  const [posters, setPosters] = useState<Readonly<Record<string, string>>>({})
  // Told through an effect rather than from the handler: a second picture dropped before the
  // first has re-rendered read the closure's stale array, and replaced it instead of joining it.
  const told = useLatest(registration)

  // Compared on the RAW prop, whose identity the form holds: a normalised copy is new every
  // render, and the list would then reset on each one.
  const [seen, setSeen] = useState(initial)
  if (seen !== initial) {
    setSeen(initial)
    setIds(listed(initial))
    setPosters({})
  }

  // Through the registration, or react-hook-form never hears about a value nobody typed. Said on
  // the mount too, which costs nothing: the form is handed what it already reset this field to.
  useEffect(() => {
    void told.current.onChange({ target: { name: told.current.name, value: [...ids] } })
  }, [ids, told])

  const take = (dropped: Asset): void => {
    // Two of the same view is not what the endpoint wants, and two children under one key is
    // not what React wants either.
    setIds(current => (current.includes(dropped.id) ? current : [...current, dropped.id]))
    const poster = posterUrl(dropped)
    if (poster) setPosters(seen => ({ ...seen, [dropped.id]: poster }))
  }

  return (
    <div id={id} data-sc={scId && fieldHandle(scId)} className="flex flex-col gap-2">
      {ids.map((assetId, index) => (
        <div key={assetId} className="flex min-w-0 items-center gap-2">
          {/* The fallback its sibling uses: a preset carries ids this session never dropped. */}
          <Thumbnail url={posters[assetId] ?? assetUrl(assetId)} className={FIELD_THUMBNAIL} />
          <span className={SLOT_LABEL}>{assetId}</span>
          <ToolButton
            icon={mdiCloseCircleOutline}
            label={t('generation.removeView')}
            tooltip={TIP_LEFT}
            onClick={() => setIds(current => current.filter((_, at) => at !== index))}
          />
        </div>
      ))}

      <AssetDropTarget
        accepts={ASSET_TYPES}
        onDrop={take}
        filesAreInternal
        // Ours alone: an editor behind this field must not also receive the drop.
        exclusive
        className="flex min-w-0 items-center gap-2 rounded"
      >
        <span className={EMPTY_SLOT}>
          <UiIcon path={mdiImagePlusOutline} size={14} />
        </span>
        <span className={SLOT_LABEL}>{placeholder}</span>
      </AssetDropTarget>
    </div>
  )
}
