import { useTranslation } from 'react-i18next'
import {
  ANIMATION_THUMBNAIL,
  bundledAnimationUrl,
  type BundledAnimation,
} from '@shared/domain/animationLibrary'
import { PropertyRow } from '@/components/PropertyRow'
import { WindowNote } from '@/components/WindowNote'
import { useBundledAnimations } from '@/hooks/useBundledAnimations'

/**
 * The clips the app ships with — listed, never placed.
 *
 * 🛑 The one family this window does NOT offer to copy in, and the reason is measured: a shipped
 * clip is already offered wherever a clip is chosen, and the game export files it into the
 * bundle on its own. A copy in the project would be a second copy of the same bytes buying
 * nothing (G-P). The note says it in words rather than leaving a missing button to be read.
 */
export function ShippedWindowAnimations() {
  const { t } = useTranslation()
  const animations = useBundledAnimations()

  if (animations.length === 0) return <WindowNote>{t('shipped.animationsNone')}</WindowNote>

  return (
    <>
      {animations.map(animation => (
        <PropertyRow key={animation.name} label={animation.name}>
          {still(animation)}
        </PropertyRow>
      ))}
      <WindowNote>{t('shipped.animationsReachable')}</WindowNote>
    </>
  )
}

/** The folder's own `thumb.png` when it holds one — the list already says which do. */
function still(animation: BundledAnimation) {
  if (!animation.thumbnail) return null

  return (
    <img
      src={bundledAnimationUrl(`${animation.name}/${ANIMATION_THUMBNAIL}`)}
      alt={animation.name}
      className="size-10 rounded-(--radius-sc-sm) object-cover"
    />
  )
}
