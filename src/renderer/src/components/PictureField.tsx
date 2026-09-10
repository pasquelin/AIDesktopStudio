import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { PICTURES, posterUrl, type Asset } from '@shared/domain/asset'
import { mountedAssetPicker } from '@/features/shell/components/assetPicker'
import { LinkField, type LinkFieldProps } from '@/components/LinkField/LinkField'
import { openAssetById } from '@/helpers/openAsset'
import { useProjectPictures } from '@/hooks/useProjectPictures'

export type PictureFieldProps = {
  label: string
  value: string | null
  onChange: (assetId: string | null) => void
  /**
   * What a double-click on the picture opens, when the asset's own space is not it. `null` for a
   * slot with NOTHING to open — told apart from an absent prop, which takes the default below.
   */
  open?: LinkFieldProps['open'] | null
  /** A standing laid over the picture — see `LinkField`. */
  badge?: LinkFieldProps['badge']
  /** What a drop puts here, when the caller needs the asset itself — see `LinkField`. */
  onDropAsset?: LinkFieldProps['onDropAsset']
  /**
   * What the empty row reads. Given only where "empty" does not mean "no picture": a model's slot
   * left empty wears the map its own file carries, and reading « none » over a textured model
   * would be a plain lie. `null` for a slot that CANNOT be empty — see `LinkField`.
   */
  emptyLabel?: string | null
  /** The handle the MCP steers this link by. Never a translated word. */
  scId?: string
  /** Menu rows belonging to the SURFACE rather than to the slot — see `LinkFieldMenu`. */
  menuExtra?: LinkFieldProps['menuExtra']
  /**
   * Rows no browsable list carries, so a value naming one still RESOLVES — a computed channel
   * lives in the durable internal store and is absent from every listing (§6.7). Resolution only:
   * what the picker offers stays the project's own pictures.
   */
  alsoKnown?: readonly Asset[]
}

/**
 * A slot filled from the project's own pictures — the link between what the studio generates and
 * what it dresses. One component rather than one per section, so a mesh's five maps and a
 * sprite's one never disagree on what counts as a picture, or on what the empty row reads.
 */
export function PictureField({
  label,
  value,
  onChange,
  open,
  badge,
  onDropAsset,
  emptyLabel,
  scId,
  menuExtra,
  alsoKnown,
}: PictureFieldProps) {
  const { t } = useTranslation()
  const offered = useProjectPictures(PICTURES)
  const options = useMemo(
    () => [
      ...offered,
      ...(alsoKnown ?? [])
        .filter(asset => !offered.some(one => one.id === asset.id))
        .map(asset => ({ id: asset.id, name: asset.name, url: posterUrl(asset) ?? undefined })),
    ],
    [offered, alsoKnown],
  )
  /**
   * Asked for at press time, never at render: the window is mounted by the shell, and a slot that
   * captured it while drawing would hold whatever was mounted when the panel first opened.
   */
  const browse = (): void => {
    const picker = mountedAssetPicker()
    if (!picker) return

    void picker({ accepts: PICTURES, label }).then(chosen => {
      // `null` is the window being called off, which is not the same as choosing nothing — that
      // is what the empty entry of the list is for.
      if (chosen !== null) onChange(chosen)
    })
  }

  /**
   * One window, two controls — so two NAMES: the picture and the gutter button sit on the same
   * row, and two focus stops answering to one name is what WCAG 2.4.6 refuses.
   */
  const picking = {
    label: t('inspector.pickPicture'),
    hint: t(open === null ? 'inspector.pickPictureAloneHint' : 'inspector.pickPictureHint'),
    run: browse,
  }

  return (
    <LinkField
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      emptyLabel={emptyLabel === null ? undefined : (emptyLabel ?? t('inspector.noTexture'))}
      missingLabel={t('inspector.missingTexture')}
      clearLabel={t('inspector.clearTexture')}
      clearHint={t('inspector.clearTextureHint')}
      // The three kinds that decode as an image, which is exactly what `options` was filtered to:
      // a slot that lit up for a mesh would promise a drop it then refuses.
      accepts={PICTURES}
      badge={badge}
      onDropAsset={onDropAsset}
      // The picker, under the gesture a hand reaches for first — and under the browse button too.
      press={picking}
      open={
        open === null
          ? undefined
          : (open ?? {
              label: t('inspector.openTexture'),
              hint: t('inspector.openTextureHint'),
              run: () => openAssetById(value),
            })
      }
      browse={{
        label: t('inspector.browseTexture'),
        hint: t('inspector.browseTextureHint'),
        run: browse,
      }}
      menuExtra={menuExtra}
      scId={scId}
    />
  )
}
