import { mdiImagePlusOutline } from '@mdi/js'
import { useState, type ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { ASSET_TYPES, assetUrl, posterUrl, type Asset } from '@shared/domain/asset'
import { cn } from '@/helpers/cn'
import { AssetDropTarget } from './AssetDropTarget'
import { FIELD_FILL, FIELD_THUMBNAIL } from './styles'
import { fieldHandle } from './scHandle'
import { Thumbnail } from './Thumbnail'
import { UiIcon } from './UiIcon'

export type AssetDropFieldProps = {
  /** Worn by the text input, which is the control the form's label names. */
  id?: string
  registration: UseFormRegisterReturn
  /** What the form starts with, so a preset filled by an edit action shows its picture. */
  initial?: string
  /** A workspace-owned value shown by name while its hidden token satisfies the model contract. */
  implicitLabel?: string
  placeholder: string
  /** The handle the MCP steers this field by. Never a translated word. */
  scId?: string
}

/**
 * A picture, chosen by dropping one on it. The field a model asks for when it edits an image —
 * rendered as a plain text input before this existed, which is unusable for an asset id nobody
 * can type from memory.
 *
 * The input stays, underneath: an id can still be pasted, and a kind this field cannot serve
 * falls back to it rather than making the form disappear (invariant 5).
 */
export function AssetDropField({
  id,
  registration,
  initial,
  implicitLabel,
  placeholder,
  scId,
}: AssetDropFieldProps) {
  const [assetId, setAssetId] = useState(initial ?? '')
  /**
   * The dropped picture's stamped URL, kept beside the id so a ⌘S that overwrote it repaints.
   *
   * Only what was DROPPED, never what the form was reset to: stamping needs the asset, and
   * nothing in `design/` reads a store — no component here does, and this field is not the one
   * to open that door for a preset's thumbnail.
   */
  const [poster, setPoster] = useState<string | null>(null)
  const implicit = implicitLabel && assetId === initial ? implicitLabel : null

  // A model switch resets the form; without this the old thumbnail outlives the value it stood
  // for. Keyed on what the form was reset to, so typing in between is not undone.
  const [seen, setSeen] = useState(initial)
  if (seen !== initial) {
    setSeen(initial)
    setAssetId(initial ?? '')
    setPoster(null)
  }

  const take = (dropped: Asset): void => {
    setAssetId(dropped.id)
    setPoster(posterUrl(dropped))
    // Through the registration, or react-hook-form never hears about a value nobody typed.
    void registration.onChange({ target: { name: registration.name, value: dropped.id } })
  }

  return (
    <AssetDropTarget
      accepts={ASSET_TYPES}
      onDrop={take}
      // Ours alone: an editor behind this field must not also receive the drop.
      exclusive
      className="flex min-w-0 items-center gap-2 rounded"
    >
      {assetId && !implicit ? (
        <Thumbnail url={poster ?? assetUrl(assetId)} className={FIELD_THUMBNAIL} />
      ) : (
        <span className={cn(FIELD_THUMBNAIL, 'text-muted grid shrink-0 place-items-center')}>
          <UiIcon path={mdiImagePlusOutline} size={14} />
        </span>
      )}

      {/* Controlled, so a drop shows in the field as well as in the thumbnail — and so the
          reset a model switch performs empties both together. */}
      {assetInput({ id, registration, assetId, implicit, placeholder, scId, setAssetId })}
    </AssetDropTarget>
  )
}

type AssetInput = Pick<AssetDropFieldProps, 'id' | 'registration' | 'placeholder' | 'scId'> & {
  assetId: string
  implicit: string | null
  setAssetId: (assetId: string) => void
}

function assetInput(input: AssetInput): ReactNode {
  if (input.implicit) {
    return (
      <>
        <input
          type="hidden"
          data-sc="field:generation.canvasSource"
          {...input.registration}
          value={input.assetId}
        />
        <input
          id={input.id}
          type="text"
          data-sc={input.scId && fieldHandle(input.scId)}
          className={FIELD_FILL}
          value={input.implicit}
          readOnly
        />
      </>
    )
  }
  return (
    <input
      id={input.id}
      type="text"
      data-sc={input.scId && fieldHandle(input.scId)}
      placeholder={input.placeholder}
      className={FIELD_FILL}
      {...input.registration}
      value={input.assetId}
      onChange={event => {
        input.setAssetId(event.target.value)
        void input.registration.onChange(event)
      }}
    />
  )
}
