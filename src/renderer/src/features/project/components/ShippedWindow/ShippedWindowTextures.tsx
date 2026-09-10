import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  bundledTextureUrl,
  CHECKER_TEXTURE_IDS,
  CHECKER_TEXTURE_NAMES,
} from '@shared/domain/checkerTexture'
import { PropertyRow } from '@/components/PropertyRow'
import { WindowButton } from '@/components/WindowButton'
import { WindowNote } from '@/components/WindowNote'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'

/**
 * The four working textures, and the one gesture that puts them in.
 *
 * ONE button for the four, because that is what the primitive does: `installBundledTextures`
 * lands them together and answers what they became. Four buttons would be four surfaces onto
 * one call, and three of them would appear to do nothing.
 */
export function ShippedWindowTextures() {
  const { t } = useTranslation()
  const [placed, setPlaced] = useState(false)
  const [placing, setPlacing] = useState(false)

  /** The reset and the report of `ShippedWindowCharacter`, for the same reason it has them. */
  const place = async (): Promise<void> => {
    setPlacing(true)
    try {
      const installed = (await getBridge()?.assets.installBundledTextures()) ?? []
      setPlaced(installed.length > 0)
    } catch (error) {
      reportFailure('assets.copy', 'shipped-images', error)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <>
      {CHECKER_TEXTURE_IDS.map(id => (
        <PropertyRow key={id} label={CHECKER_TEXTURE_NAMES[id]}>
          <img
            src={bundledTextureUrl(id)}
            alt={CHECKER_TEXTURE_NAMES[id]}
            className="size-10 rounded-(--radius-sc-sm) object-cover"
          />
        </PropertyRow>
      ))}
      <WindowButton
        size="row"
        disabled={placing}
        onClick={() => {
          void place()
        }}
      >
        {t('shipped.placeAll')}
      </WindowButton>
      <WindowNote>{placed ? t('shipped.placed') : t('shipped.texturesWhere')}</WindowNote>
    </>
  )
}
